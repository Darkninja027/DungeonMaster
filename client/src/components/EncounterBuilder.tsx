import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Minus, Play, Plus } from 'lucide-react'
import { api } from '#/lib/api'
import type { ArticleRef } from '#/lib/api'
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
function rollInitiative(worldId: string, ref: ArticleRef, mod: number): number {
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
  // How many of each monster (by article id) are in the encounter.
  const [counts, setCounts] = useState<Record<string, number>>({})
  // Which party members are selected (by article id).
  const [party, setParty] = useState<Set<string>>(new Set())

  const monsters = useQuery({
    queryKey: ['worlds', worldId, 'query', { type: 'monster' }],
    queryFn: () => api.worlds.query(worldId, { type: 'monster' }),
  })
  const characters = useQuery({
    queryKey: ['worlds', worldId, 'characters'],
    queryFn: () => api.characters.list(worldId),
  })

  const monsterList = monsters.data ?? []
  const characterList = characters.data ?? []

  // Fetch content for every monster and character so we can parse stats. Cached
  // by React Query, so re-renders don't re-read disk.
  const articleContents = useQueries({
    queries: [...monsterList, ...characterList].map((ref) => ({
      queryKey: ['worlds', worldId, 'articles', ref.id],
      queryFn: () => api.articles.get(worldId, ref.id),
    })),
  })
  const contentById = useMemo(() => {
    const map = new Map<string, string>()
    for (const q of articleContents) {
      if (q.data) map.set(q.data.id, q.data.content)
    }
    return map
  }, [articleContents])

  const setCount = (id: string, next: number) =>
    setCounts((prev) => {
      const clamped = Math.max(0, next)
      const copy = { ...prev }
      if (clamped === 0) delete copy[id]
      else copy[id] = clamped
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
      const content = contentById.get(c.id)
      levels.push(content ? parseCharacter(content).character.level : 1)
    }
    const xps: Array<number> = []
    for (const m of monsterList) {
      const n = counts[m.id] ?? 0
      if (n === 0) continue
      const content = contentById.get(m.id)
      const xp = content ? (parseStatBlock(content).xp ?? 0) : 0
      for (let i = 0; i < n; i++) xps.push(xp)
    }
    if (levels.length === 0 || xps.length === 0) return null
    return rateEncounter(levels, xps)
  }, [party, counts, characterList, monsterList, contentById])

  const totalMonsters = Object.values(counts).reduce((a, b) => a + b, 0)
  const canRun = totalMonsters > 0 || party.size > 0

  const run = () => {
    // Monsters: one combatant per instance, initiative rolled from DEX.
    for (const m of monsterList) {
      const n = counts[m.id] ?? 0
      if (n === 0) continue
      const sb = contentById.get(m.id)
        ? parseStatBlock(contentById.get(m.id)!)
        : null
      const dexMod = sb?.dexMod ?? 0
      for (let i = 0; i < n; i++) {
        combatActions.add({
          name: m.title,
          initiative: rollInitiative(worldId, m, dexMod),
          hp: sb?.hp ?? 0,
          maxHp: sb?.hp ?? null,
          ac: sb?.ac ?? null,
          note: '',
          articleId: m.id,
        })
      }
    }
    // Party: initiative from the sheet's DEX + misc bonus.
    for (const c of characterList) {
      if (!party.has(c.id)) continue
      const content = contentById.get(c.id)
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
            {monsters.isLoading && (
              <p className="text-muted-foreground px-1 text-sm">Loading…</p>
            )}
            {monsters.isSuccess && monsterList.length === 0 && (
              <p className="text-muted-foreground px-1 text-sm">
                No monsters yet. Create an article from the Monster template.
              </p>
            )}
            <ul className="space-y-0.5">
              {monsterList.map((m) => {
                const content = contentById.get(m.id)
                const sb = content ? parseStatBlock(content) : null
                const n = counts[m.id] ?? 0
                return (
                  <li
                    key={m.id}
                    className="hover:bg-accent flex items-center gap-1.5 rounded px-1 py-1 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {m.title}
                      {sb?.cr != null && (
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          CR {sb.cr}
                          {sb.xp != null && ` · ${sb.xp} XP`}
                        </span>
                      )}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-6"
                      disabled={n === 0}
                      title="Fewer"
                      onClick={() => setCount(m.id, n - 1)}
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
                      onClick={() => setCount(m.id, n + 1)}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </li>
                )
              })}
            </ul>
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
                const content = contentById.get(c.id)
                const character = content
                  ? parseCharacter(content).character
                  : null
                const selected = party.has(c.id)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={cn(
                        'hover:bg-accent flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm',
                        selected && 'bg-accent',
                      )}
                      onClick={() => toggleParty(c.id)}
                    >
                      <span
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded border',
                          selected && 'bg-primary border-primary text-primary-foreground',
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
            <span className={cn('font-semibold capitalize', DIFFICULTY_STYLE[rating.difficulty])}>
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
