import { useMemo, useRef } from 'react'
import { useQueries } from '@tanstack/react-query'
import { api } from './api'
import { sortedSpells } from './character'
import type { Spell } from './character'
import {
  isEmptySpellCard,
  parseSpellCard,
  resolveSpellArticle,
} from './spellCard'
import type { SpellCard } from './spellCard'
import { useLibraryEntries } from './useGlobalLibrary'

/**
 * Reads the articles behind a character's spells so the printed sheet can carry
 * their rules text. The parsing is in lib/spellCard.ts; this is only the fetch.
 *
 * Deliberately `useQueries` over per-article keys rather than one batch IPC
 * channel. The key `['worlds', worldId, 'articles', articleId]` is exactly what
 * SpellReference's panel already uses, so the two share one cache: a spell the
 * user has read on screen is already loaded here, and every card warms the
 * panel in return. A batch channel would be a second, unshared copy of the same
 * bytes that could disagree with the panel after an external edit — and it would
 * need a new entry in the preload allowlist plus a per-id resolveInWorld loop in
 * the file that guards path traversal. The volume doesn't justify it: this is
 * bounded by one character's spell list (a level-20 wizard is ~25), not by the
 * library, which is what MonsterReference's "several hundred round-trips"
 * warning is about.
 */

export interface SpellCardsResult {
  /**
   * One card per spell whose article resolved and held something printable,
   * ordered like the sheet's spell list. Spells with no article are absent
   * rather than stubbed.
   */
  cards: Array<SpellCard>
  /**
   * True once every article has either loaded or failed.
   *
   * The sheet must not render card pages before this, and the PDF export must
   * not run: exportPdf captures whatever `.dnd-page` elements are in the DOM and
   * silently skips one that measures zero, so exporting mid-load produces a PDF
   * with pages missing and no error at all — discovered at the table, on paper.
   */
  settled: boolean
}

const NO_CARDS: Array<SpellCard> = []

/**
 * Spell articles don't change during a session, and without a stale window
 * every remount of the preview tab re-reads two dozen files off disk. Not
 * Infinity: the world watcher invalidates the ['worlds', worldId] prefix when a
 * file changes outside the app, and that should still land.
 */
const CARD_STALE_TIME = 5 * 60_000

export function useSpellCards(
  spells: Array<Spell>,
  worldId: string,
  articles: Array<{ id: string; title: string }> | undefined,
  enabled: boolean,
): SpellCardsResult {
  const librarySpells = useLibraryEntries('Spells')

  // Ordered like the spell list two pages earlier — cantrips first, then by
  // level and name. Flipping between the list and the cards is the whole point,
  // so the two orders have to agree.
  const refs = useMemo(() => {
    if (!enabled) return []
    return sortedSpells(spells)
      .map((s) =>
        resolveSpellArticle(s.name, worldId, articles, librarySpells.entries),
      )
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [enabled, spells, worldId, articles, librarySpells.entries])

  const results = useQueries({
    queries: refs.map((r) => ({
      queryKey: ['worlds', r.worldId, 'articles', r.articleId],
      queryFn: () => api.articles.get(r.worldId, r.articleId),
      staleTime: CARD_STALE_TIME,
    })),
  })

  // The library scan is slow and cached forever, and until it lands every
  // library-only spell resolves to null — which reads as "skipped", not
  // "pending". Without folding it in here, a first-open export of a caster whose
  // spells all live in the library produces zero card pages and looks like a
  // feature that works.
  const settled =
    !enabled || (!librarySpells.isPending && results.every((q) => !q.isPending))

  // The parse inputs. An article that failed to load — deleted between the tree
  // scan and now — carries no content and drops out here, exactly like a name
  // that resolved to no article at all.
  //
  // Rebuilt every render, which is cheap (it only copies references), because
  // useQueries hands back a fresh array anyway and a memo over it could never
  // help: the array would be its own dependency. The parse below is the part
  // worth memoising, so it hangs off a digest of this instead — without that,
  // every render re-parses two dozen articles and remounts every card page.
  const sources = results.flatMap((q, i) =>
    q.data ? [{ title: refs[i].title, content: q.data.content }] : [],
  )
  const digest = sources.map((s) => `${s.title}:${s.content.length}`).join('|')
  const sourcesRef = useRef(sources)
  sourcesRef.current = sources

  const cards = useMemo(() => {
    if (!enabled || !settled) return NO_CARDS
    return sourcesRef.current
      .map((s) => parseSpellCard(s.title, s.content))
      .filter((card) => !isEmptySpellCard(card))
  }, [enabled, settled, digest])

  return { cards, settled }
}
