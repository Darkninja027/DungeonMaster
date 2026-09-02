import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Minus, PictureInPicture2, Play, Plus, Search, X } from 'lucide-react'
import { api } from '#/lib/api'
import type { ArticleRef } from '#/lib/api'
import {
  collectMonsters,
  entryKey,
  filterByEdition,
  filterEntries,
  mergeEntries,
} from '#/lib/bestiary'
import type { LibraryEntry } from '#/lib/bestiary'
import { useWorldRuleset } from '#/lib/useWorldSettings'
import { useLibraryEntries } from '#/lib/useGlobalLibrary'
import { Input } from '#/components/ui/input'
import { VirtualList } from '#/components/VirtualList'
import { initiativeBonus, parseCharacter, signed } from '#/lib/character'
import { rateEncounter } from '#/lib/encounter'
import type { Difficulty } from '#/lib/encounter'
import { rollDice } from '#/lib/formatMarkdown'
import { logRoll } from '#/lib/rollLog'
import { combatActions } from '#/lib/sessionStore'
import { parseStatBlock } from '#/lib/statblock'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { ScrollArea } from '#/components/ui/scroll-area'

const DIFFICULTY_STYLE: Record<Difficulty, string> = {
  trivial: 'text-muted-foreground',
  easy: 'text-emerald-600',
  medium: 'text-amber-600',
  hard: 'text-orange-600',
  deadly: 'text-destructive',
}

/** Roll a d20 with the given modifier, logging it to the shared roll history. */
// Takes only what it reads, so callers can pass any id/title pair — a character
// row here isn't always a full ArticleRef.
function rollInitiative(
  worldId: string,
  ref: Pick<ArticleRef, 'id' | 'title'>,
  mod: number,
): number {
  const notation = mod === 0 ? 'd20' : `d20${signed(mod)}`
  const result = rollDice(notation)
  const total = result?.total ?? 10
  logRoll({
    notation,
    label: `${ref.title} — Initiative`,
    total,
    detail: result?.detail ?? '',
    source: { worldId, articleId: ref.id, title: ref.title },
  })
  return total
}

/**
 * Encounter builder: assemble monsters (type: monster articles) and party
 * members (type: character), see the 5e difficulty rating, and push the whole
 * roster into the initiative tracker with HP/AC read from stat blocks and
 * initiative auto-rolled through the shared dice engine.
 */
export function EncounterBuilder({
  worldId,
  onRun,
}: {
  worldId: string
  onRun: () => void
}) {
  // How many of each monster is in the encounter, keyed by entryKey
  // (worldId:articleId) rather than a bare article id: a global-library Goblin
  // and this world's own Goblin are different monsters that share an id.
  const [counts, setCounts] = useState<Record<string, number>>({})
  // Which party members are selected (by article id — characters are always
  // the open world's).
  const [party, setParty] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')

  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })
  const typed = useQuery({
    queryKey: ['worlds', worldId, 'query', { type: 'monster' }],
    queryFn: () => api.worlds.query(worldId, { type: 'monster' }),
  })
  // The global bestiary, the same source the Bestiary tab reads.
  const library = useLibraryEntries('Monsters')
  const ruleset = useWorldRuleset(worldId)
  const characters = useQuery({
    queryKey: ['worlds', worldId, 'characters'],
    queryFn: () => api.characters.list(worldId),
  })

  // World entries first, then global — mergeEntries deliberately does not
  // dedupe across worlds, because they really are different articles.
  const monsterList: Array<LibraryEntry> = useMemo(
    () =>
      filterByEdition(
        mergeEntries(
          collectMonsters(worldId, tree.data, typed.data),
          library.entries,
        ),
        ruleset,
      ),
    [worldId, tree.data, typed.data, library.entries, ruleset],
  )
  const visible = useMemo(
    () => filterEntries(monsterList, filter),
    [monsterList, filter],
  )
  const characterList = characters.data ?? []

  // Content for every monster and character, so stats can be parsed. Keyed by
  // world as well as article, or a library entry and a world entry sharing an
  // id would serve each other's content.
  const articleContents = useQueries({
    queries: [
      ...monsterList.map((m) => ({
        queryKey: ['worlds', m.worldId, 'articles', m.articleId],
        queryFn: () => api.articles.get(m.worldId, m.articleId),
      })),
      ...characterList.map((c) => ({
        queryKey: ['worlds', worldId, 'articles', c.id],
        queryFn: () => api.articles.get(worldId, c.id),
      })),
    ],
  })
  const contentByKey = useMemo(() => {
    const map = new Map<string, string>()
    const all = [
      ...monsterList.map((m) => entryKey(m)),
      ...characterList.map((c) => `${worldId}:${c.id}`),
    ]
    articleContents.forEach((q, i) => {
      if (q.data) map.set(all[i], q.data.content)
    })
    return map
  }, [articleContents, monsterList, characterList, worldId])

  const setCount = (key: string, next: number) =>
    setCounts((prev) => {
      const clamped = Math.max(0, next)
      const copy = { ...prev }
      if (clamped === 0) delete copy[key]
      else copy[key] = clamped
      return copy
    })

  const toggleParty = (id: string) =>
    setParty((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Difficulty rating from selected party levels + monster XP (one entry per
  // monster instance; unparseable XP counts as 0 but still bumps the multiplier).
  const rating = useMemo(() => {
    const levels: Array<number> = []
    for (const c of characterList) {
      if (!party.has(c.id)) continue
      const content = contentByKey.get(`${worldId}:${c.id}`)
      levels.push(content ? parseCharacter(content).character.level : 1)
    }
    const xps: Array<number> = []
    for (const m of monsterList) {
      const key = entryKey(m)
      const n = counts[key] ?? 0
      if (n === 0) continue
      const content = contentByKey.get(key)
      const xp = content ? (parseStatBlock(content).xp ?? 0) : 0
      for (let i = 0; i < n; i++) xps.push(xp)
    }
    if (levels.length === 0 || xps.length === 0) return null
    return rateEncounter(levels, xps)
  }, [party, counts, characterList, monsterList, contentByKey, worldId])

  const totalMonsters = Object.values(counts).reduce((a, b) => a + b, 0)
  const canRun = totalMonsters > 0 || party.size > 0

  const run = () => {
    // Monsters: one combatant per instance, initiative rolled from DEX.
    for (const m of monsterList) {
      const key = entryKey(m)
      const n = counts[key] ?? 0
      if (n === 0) continue
      const content = contentByKey.get(key)
      const sb = content ? parseStatBlock(content) : null
      const dexMod = sb?.dexMod ?? 0
      for (let i = 0; i < n; i++) {
        combatActions.add({
          name: m.title,
          initiative: rollInitiative(
            m.worldId,
            { id: m.articleId, title: m.title },
            dexMod,
          ),
          hp: sb?.hp ?? 0,
          maxHp: sb?.hp ?? null,
          ac: sb?.ac ?? null,
          note: '',
          articleId: m.articleId,
          // Carried so the tracker can open the right article: a library
          // monster's id resolves against the library world, not this one.
          worldId: m.worldId,
        })
      }
    }
    // Party: initiative from the sheet's DEX + misc bonus.
    for (const c of characterList) {
      if (!party.has(c.id)) continue
      const content = contentByKey.get(`${worldId}:${c.id}`)
      const character = content ? parseCharacter(content).character : null
      const mod = character ? initiativeBonus(character) : 0
      combatActions.add({
        name: c.title,
        initiative: rollInitiative(worldId, c, mod),
        hp: character?.hp.current ?? 0,
        maxHp: character?.hp.max ?? null,
        ac: character?.ac ?? null,
        note: '',
        articleId: c.id,
      })
    }
    setCounts({})
    setParty(new Set())
    onRun()
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-2">
          {/* Monsters */}
          <section>
            <h4 className="text-muted-foreground mb-1 px-1 text-xs font-semibold uppercase tracking-wide">
              Monsters
            </h4>
            {/* Searchable, and it has to be: merging the global bestiary in
                puts ~330 entries here, which a flat list cannot serve. Same
                shape as the Bestiary tab next door. */}
            <div className="relative mb-1 px-1">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search monsters…"
                className="h-7 pl-7 pr-7 text-sm"
              />
              {filter && (
                <button
                  type="button"
                  title="Clear"
                  className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={() => setFilter('')}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            {(tree.isLoading || typed.isLoading) && (
              <p className="text-muted-foreground px-1 text-sm">Loading…</p>
            )}
            <VirtualList
              className="h-64"
              items={visible}
              estimateHeight={32}
              getKey={entryKey}
              empty={
                <p className="text-muted-foreground p-4 text-sm">
                  {filter
                    ? 'No monsters match.'
                    : 'No monsters yet. Create an article from the Monster template.'}
                </p>
              }
              renderRow={(m) => {
                const key = entryKey(m)
                const content = contentByKey.get(key)
                const sb = content ? parseStatBlock(content) : null
                const n = counts[key] ?? 0
                return (
                  <div className="hover:bg-accent flex items-center gap-1.5 rounded px-1 py-1 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {m.title}
                      {m.global && (
                        <span
                          className="bg-muted text-muted-foreground ml-1.5 shrink-0 rounded px-1 text-[10px]"
                          title="From your global library — shared by every world."
                        >
                          Global
                        </span>
                      )}
                      {(sb?.cr ?? m.cr) != null && (
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          CR {sb?.cr ?? m.cr}
                          {(sb?.xp ?? m.xp) != null &&
                            ` · ${sb?.xp ?? m.xp} XP`}
                        </span>
                      )}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-6"
                      disabled={n === 0}
                      title="Fewer"
                      onClick={() => setCount(key, n - 1)}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-5 text-center font-mono text-xs">
                      {n}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-6"
                      title="More"
                      onClick={() => setCount(key, n + 1)}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                )
              }}
            />
          </section>

          {/* Party */}
          <section>
            <h4 className="text-muted-foreground mb-1 px-1 text-xs font-semibold uppercase tracking-wide">
              Party
            </h4>
            {characterList.length === 0 && (
              <p className="text-muted-foreground px-1 text-sm">
                No characters yet.
              </p>
            )}
            <ul className="space-y-0.5">
              {characterList.map((c) => {
                const content = contentByKey.get(`${worldId}:${c.id}`)
                const character = content
                  ? parseCharacter(content).character
                  : null
                const selected = party.has(c.id)
                return (
                  // The toggle and the pop-out are siblings rather than
                  // nested: a button inside a button is invalid HTML, and the
                  // whole row used to be one big toggle.
                  <li
                    key={c.id}
                    className={cn(
                      'group hover:bg-accent flex items-center rounded pr-1',
                      selected && 'bg-accent',
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm"
                      onClick={() => toggleParty(c.id)}
                    >
                      <span
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded border',
                          selected &&
                            'bg-primary border-primary text-primary-foreground',
                        )}
                      >
                        {selected && '✓'}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      {character && (
                        <span className="text-muted-foreground shrink-0 text-xs">
                          Lv {character.level} · Init{' '}
                          {signed(initiativeBonus(character))}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      title="Open in new window"
                      className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={() =>
                        void api.player.show(worldId, c.id, 'popout')
                      }
                    >
                      <PictureInPicture2 className="size-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      </ScrollArea>

      {/* Difficulty + run */}
      <div className="space-y-2 border-t p-2">
        {rating ? (
          <div className="flex items-baseline justify-between text-sm">
            <span
              className={cn(
                'font-semibold capitalize',
                DIFFICULTY_STYLE[rating.difficulty],
              )}
            >
              {rating.difficulty}
            </span>
            <span className="text-muted-foreground text-xs">
              {rating.adjustedXp.toLocaleString()} adj. XP
              {rating.multiplier !== 1 && ` (×${rating.multiplier})`}
            </span>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            Pick monsters and party members to rate the encounter.
          </p>
        )}
        <Button className="w-full" disabled={!canRun} onClick={run}>
          <Play className="size-4" /> Run encounter
          {totalMonsters + party.size > 0 && (
            <span className="text-xs opacity-80">
              ({totalMonsters + party.size})
            </span>
          )}
        </Button>
      </div>
    </div>
  )
}
