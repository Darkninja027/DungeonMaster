import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '#/lib/api'
import type { LibraryFolder, LibraryInfo } from '#/lib/api'
import {
  collectMonsters,
  collectSpells,
  filterByEdition,
  filterSpells,
  mergeEntries,
} from '#/lib/bestiary'
import type { LibraryEntry } from '#/lib/bestiary'
import { DEFAULT_RULESET } from '#/lib/ruleset'
import type { Ruleset } from '#/lib/ruleset'

/** Shared empties, so "no library" doesn't hand callers a new array each render. */
const EMPTY_ENTRIES: Array<LibraryEntry> = []
const EMPTY_ARTICLES: Array<{ id: string; title: string }> = []

/**
 * The configured global library. `staleTime: Infinity` because it only changes
 * when the user picks or forgets one, and those paths invalidate this key.
 */
export function useLibrary() {
  return useQuery({
    queryKey: libraryKey,
    queryFn: () => api.library.get(),
    staleTime: Infinity,
  })
}

/** The frontmatter `type:` that backs each panel's folder. */
const LIBRARY_TYPE = { Monsters: 'monster', Spells: 'spell' } as const

/**
 * Query keys for the library's content, as functions rather than inline arrays.
 *
 * The startup prefetch has to warm *exactly* these keys or it does the expensive
 * scan twice — once into a slot nothing reads, then again on first use. That
 * failure is silent and looks like the prefetch simply not helping, so the keys
 * live here and both the hook below and the warmer use them.
 */
export const libraryKey = ['library'] as const
export const libraryTreeKey = (worldId: string) =>
  ['library', worldId, 'tree'] as const
export const libraryQueryKey = (worldId: string, type: string) =>
  ['library', worldId, 'query', { type }] as const

/** The frontmatter types the two panels read, for warming both at startup. */
export const LIBRARY_TYPES = Object.values(LIBRARY_TYPE)

/**
 * Library entries for one panel.
 *
 * Keyed under ['library', libraryWorldId, …] rather than ['worlds', …]. The
 * library is a world folder and every handler treats it as one, so the obvious
 * key was the world namespace — but seven other call sites mount the *open*
 * world's tree under the identical ['worlds', worldId, 'tree'] shape, and
 * whichever mounted first won the cache slot for the whole staleTime. The
 * library panel would then render the open world's tree, which has no Spells/
 * folder in it. A separate prefix makes that collision impossible, and it is
 * still outside the watcher's ['worlds', worldId] prefix, so the original
 * property — that world invalidation never touches the library, or vice versa —
 * is preserved. Anything invalidating library content must use this prefix.
 *
 * The library isn't indexed or watched: search.ts falls back to a disk scan
 * when no index is live, so these queries are correct as-is.
 *
 * Both are staleTime: Infinity because that scan is expensive — the library is
 * the biggest folder the app touches, and the scan blocks the main process, so
 * a refetch stalls the whole window rather than just this panel. Nothing can
 * change the library from inside the app except import and restore, and both
 * invalidate ['library'], so an expiry would only buy re-scans nobody asked
 * for. Content edited outside the app is picked up on the next launch, the same
 * bargain the library already makes by not being watched.
 */
export function useLibraryEntries(folder: LibraryFolder): {
  entries: Array<LibraryEntry>
  /** The library's article list, for resolving [[links]] within the library. */
  articles: Array<{ id: string; title: string }>
  /** The configured library, or null if there isn't one. Check `.available`. */
  info: LibraryInfo | null
  isPending: boolean
} {
  const library = useLibrary()
  const info = library.data ?? null
  const enabled = info?.available === true
  const worldId = info?.worldId ?? ''

  const tree = useQuery({
    queryKey: libraryTreeKey(worldId),
    queryFn: () => api.worlds.tree(worldId),
    enabled,
    staleTime: Infinity,
  })

  // Both panels union in their frontmatter type, so neither depends on the tree
  // read alone. The seeded content carries `type: monster` / `type: spell`, and
  // queryArticles reads the folder straight off disk, so this is a genuinely
  // independent source rather than a second view of the same fetch.
  const type = LIBRARY_TYPE[folder]
  const typed = useQuery({
    queryKey: libraryQueryKey(worldId, type),
    queryFn: () => api.worlds.query(worldId, { type }),
    enabled,
    staleTime: Infinity,
  })

  // Memoized because callers feed `entries` into their own useMemo deps — a
  // fresh array every render would defeat theirs as well as this one.
  const entries = useMemo(() => {
    if (!enabled) return EMPTY_ENTRIES
    return folder === 'Monsters'
      ? collectMonsters(worldId, tree.data, typed.data, { global: true })
      : collectSpells(worldId, tree.data, typed.data, { global: true })
  }, [enabled, folder, worldId, tree.data, typed.data])

  return {
    entries,
    articles: enabled
      ? (tree.data?.articles ?? EMPTY_ARTICLES)
      : EMPTY_ARTICLES,
    info,
    isPending: enabled ? tree.isPending || typed.isPending : false,
  }
}

/**
 * Spell names to suggest, drawn from the world's own `Spells/` folder and the
 * shared library, narrowed to a spell level and a class.
 *
 * Lifted out of the creation wizard's spells step when the level-up one needed
 * the same three queries — the fourth caller of this `collectSpells` +
 * `mergeEntries` trio in the codebase, and the point at which copying it again
 * stopped being reasonable.
 *
 * `className` is deliberately allowed to be undefined: a homebrew class no
 * spell's frontmatter mentions would otherwise filter every suggestion away,
 * and `filterSpells` is permissive by the same logic — an article that declares
 * no level or classes still shows, so homebrew is never silently hidden.
 *
 * Names are de-duplicated because `mergeEntries` deliberately does not: a world
 * spell and a library spell can share a title, and the `Combobox` keys its rows
 * by the string.
 *
 * `ruleset` narrows the suggestions to one edition of the rules. It is a
 * parameter rather than a `useWorldRuleset` call inside, so this stays a
 * function of its inputs and the two wizards that share it — creation and
 * level-up — can't drift on where the answer comes from. Both pass the open
 * world's setting, which is what makes a character inherit its world's edition
 * without the wizard growing a step of its own. It defaults to showing
 * everything, so a caller that hasn't been taught about editions is unchanged.
 */
export function useSpellSuggestions(
  worldId: string,
  className: string | undefined,
  ruleset: Ruleset = DEFAULT_RULESET,
): (level: number, upTo?: boolean) => Array<string> {
  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })
  // The folder walk alone knows only titles. This query is what carries the
  // level/school/classes frontmatter.
  const typed = useQuery({
    queryKey: ['worlds', worldId, 'query', { type: 'spell' }],
    queryFn: () => api.worlds.query(worldId, { type: 'spell' }),
  })
  const library = useLibraryEntries('Spells')

  const entries = useMemo(
    () =>
      filterByEdition(
        mergeEntries(
          collectSpells(worldId, tree.data, typed.data, { folder: 'Spells' }),
          library.entries,
        ),
        ruleset,
      ),
    [worldId, tree.data, typed.data, library.entries, ruleset],
  )

  return useMemo(() => {
    const cache = new Map<string, Array<string>>()
    // `upTo` asks for every levelled spell at or below a level, for "a spell of
    // a level for which you have slots"; the default is an exact match, which
    // is what creation wants and what cantrips always want.
    return (level: number, upTo = false) => {
      const key = `${level}:${upTo}`
      const hit = cache.get(key)
      if (hit) return hit
      const names = [
        ...new Set(
          filterSpells(
            entries,
            upTo ? { maxLevel: level, className } : { level, className },
          ).map((e) => e.title),
        ),
      ]
      cache.set(key, names)
      return names
    }
  }, [entries, className])
}
