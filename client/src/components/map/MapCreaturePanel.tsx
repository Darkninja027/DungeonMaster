import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { PawPrint, Swords, Users, X } from 'lucide-react'
import { api } from '#/lib/api'
import {
  collectMonsters,
  entryKey,
  filterByEdition,
  filterEntries,
  mergeEntries,
} from '#/lib/bestiary'
import type { LibraryEntry } from '#/lib/bestiary'
import { useLibraryEntries } from '#/lib/useGlobalLibrary'
import { useWorldRuleset } from '#/lib/useWorldSettings'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'
import { VirtualList } from '#/components/VirtualList'
import type { BattleMap, Token } from '#/lib/mapStore'
import type { Combatant } from '#/lib/api'

/**
 * The battlemap's creature drawer: bestiary, party, and what is already placed.
 *
 * A side panel rather than a dropdown because the bestiary is hundreds of
 * entries once the global library is merged in — a `<select>` cannot be
 * searched, scanned or scoped, and the old one could only offer creatures
 * already in the initiative tracker, which meant a creature not yet in the
 * fight could not be linked at all.
 *
 * It lives inside the map overlay because the overlay covers the session rail,
 * so the real bestiary tab is not reachable while a map is open.
 *
 * Monsters come from the same composition the encounter builder uses — world
 * articles plus the global library, filtered by the world's ruleset — so the
 * two lists cannot disagree about what exists.
 */

export type CreatureTab = 'monsters' | 'party' | 'scene'

/**
 * What a scene row is, in three words.
 *
 * The status is the reason the two lists merged: a row says whether it is in
 * the fight, on the map, or both, so one glance answers what used to need two
 * tabs compared against each other.
 */
function sceneHint(row: SceneRow, activeCombatantId: string | null): string {
  if (row.combatant && row.token) {
    return row.combatant.id === activeCombatantId ? 'their turn' : 'on map'
  }
  if (row.combatant) return 'place'
  return 'token only'
}

/** One row of the scene list: a combatant, a token, or the same creature as both. */
interface SceneRow {
  key: string
  name: string
  combatant: Combatant | null
  token: Token | null
}

/** What was picked: enough to roll it into the fight and open its article. */
export interface CreaturePick {
  worldId: string
  articleId: string
  title: string
  /** Party members get a friendly colour and skip the monster stat block path. */
  ally: boolean
}

export function MapCreaturePanel({
  worldId,
  map,
  selectedTokenId,
  combatants,
  activeCombatantId,
  onPick,
  onPlaceCombatant,
  onRemoveCombatant,
  onSelectToken,
  onRemoveToken,
  onClose,
}: {
  worldId: string
  map: BattleMap
  selectedTokenId: string | null
  /** The initiative tracker's rows, so the Fight tab can show who is waiting. */
  combatants: Array<Combatant>
  activeCombatantId: string | null
  onPick: (pick: CreaturePick) => void
  /** Put an existing combatant on the map, or select the token it already has. */
  onPlaceCombatant: (combatantId: string) => void
  /** Take a combatant out of the fight entirely. */
  onRemoveCombatant: (combatantId: string) => void
  onSelectToken: (id: string) => void
  /** Take a token off the map. Does not touch the fight. */
  onRemoveToken: (id: string) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<CreatureTab>('monsters')
  const [filter, setFilter] = useState('')

  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })
  const typed = useQuery({
    queryKey: ['worlds', worldId, 'query', { type: 'monster' }],
    queryFn: () => api.worlds.query(worldId, { type: 'monster' }),
  })
  const characters = useQuery({
    queryKey: ['worlds', worldId, 'characters'],
    queryFn: () => api.characters.list(worldId),
  })
  const library = useLibraryEntries('Monsters')
  const ruleset = useWorldRuleset(worldId)

  const monsters = useMemo(
    () =>
      filterEntries(
        filterByEdition(
          mergeEntries(
            collectMonsters(worldId, tree.data, typed.data, {
              folder: 'Monsters',
            }),
            library.entries,
          ),
          ruleset,
        ),
        filter,
      ),
    [worldId, tree.data, typed.data, library.entries, ruleset, filter],
  )

  const party = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return (characters.data ?? []).filter(
      (c) => !needle || c.title.toLowerCase().includes(needle),
    )
  }, [characters.data, filter])

  /**
   * The scene: everything in the fight **and** everything on the map, as one
   * list.
   *
   * These were two tabs and they were nearly the same list — a combatant is
   * usually on the map and a token is usually in the fight, so the split made
   * you check both to answer one question. Merged, each row says which it is.
   * The only rows unique to either side are a creature rolled but not yet
   * placed, and an unlinked token (scenery, a marker, a body).
   */
  const scene = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const byCombatant = new Map(
      map.tokens
        .filter((t) => t.combatantId)
        .map((t) => [t.combatantId as string, t]),
    )

    const rows: Array<SceneRow> = combatants.map((c) => ({
      key: `c:${c.id}`,
      name: c.name,
      combatant: c,
      token: byCombatant.get(c.id) ?? null,
    }))

    // Tokens with no combatant: scenery and markers, which belong to the map
    // alone and would have had no home in a fight-only list.
    for (const t of map.tokens) {
      if (t.combatantId && byCombatant.has(t.combatantId)) continue
      rows.push({
        key: `t:${t.id}`,
        name: t.label || 'Unnamed token',
        combatant: null,
        token: t,
      })
    }

    return rows.filter((r) => !needle || r.name.toLowerCase().includes(needle))
  }, [combatants, map.tokens, filter])

  /**
   * How many are in the fight but not yet on this map.
   *
   * Counted over every combatant rather than the filtered list, so typing in
   * the search box does not change what the badge claims is waiting.
   */
  const waiting = useMemo(() => {
    const placed = new Set(
      map.tokens.map((t) => t.combatantId).filter(Boolean) as Array<string>,
    )
    return combatants.filter((c) => !placed.has(c.id)).length
  }, [combatants, map.tokens])

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l">
      <div className="flex items-center justify-between border-b px-2 py-1.5">
        <h2 className="text-sm font-semibold">Creatures</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          title="Close this panel (B)"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/*
        Wraps rather than overflowing: four labelled tabs and a close button do
        not fit one 320px row, and a clipped tab is a tab nobody can press.
      */}
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        <TabButton
          active={tab === 'monsters'}
          onClick={() => setTab('monsters')}
        >
          <PawPrint className="size-3.5" /> Bestiary
        </TabButton>
        <TabButton active={tab === 'party'} onClick={() => setTab('party')}>
          <Users className="size-3.5" /> Party
        </TabButton>
        <TabButton active={tab === 'scene'} onClick={() => setTab('scene')}>
          <Swords className="size-3.5" /> Scene
          {waiting > 0 ? (
            // How many are in the fight but not on the map yet — the one thing
            // you would otherwise have to compare two lists to notice.
            <span className="bg-primary text-primary-foreground ml-0.5 rounded-full px-1.5 text-[10px]">
              {waiting}
            </span>
          ) : null}
        </TabButton>
      </div>

      <div className="border-b p-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={tab === 'scene' ? 'Find a creature…' : 'Search…'}
          className="h-8"
        />
      </div>

      {tab === 'monsters' ? (
        // Virtualised: the merged bestiary runs to hundreds of rows, and the
        // sidebar's own lists hit the same wall.
        <VirtualList
          items={monsters}
          estimateHeight={34}
          getKey={entryKey}
          className="min-h-0 flex-1"
          empty={
            <Empty>
              {library.isPending || tree.isPending
                ? 'Loading…'
                : filter
                  ? 'Nothing matches that.'
                  : 'No monsters in this world or your library yet.'}
            </Empty>
          }
          renderRow={(m: LibraryEntry) => (
            <Row
              title={m.title}
              hint={m.cr ? `CR ${m.cr}` : m.global ? 'Library' : undefined}
              onClick={() =>
                onPick({
                  worldId: m.worldId,
                  articleId: m.articleId,
                  title: m.title,
                  ally: false,
                })
              }
            />
          )}
        />
      ) : tab === 'party' ? (
        <ScrollArea className="min-h-0 flex-1">
          {party.length === 0 ? (
            <Empty>
              {characters.isPending ? 'Loading…' : 'No characters here.'}
            </Empty>
          ) : (
            <ul className="p-1">
              {party.map((c) => (
                <li key={c.id}>
                  <Row
                    title={c.title}
                    hint={
                      c.level
                        ? `Lv ${c.level}${c.class ? ` ${c.class}` : ''}`
                        : (c.class ?? undefined)
                    }
                    onClick={() =>
                      onPick({
                        worldId,
                        articleId: c.id,
                        title: c.title,
                        ally: true,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {scene.length === 0 ? (
            <Empty>
              Nothing here yet. Pick a creature from the Bestiary or Party to
              roll one in, or place a token with the place tool.
            </Empty>
          ) : (
            <ul className="p-1">
              {scene.map((row) => (
                <li key={row.key}>
                  <Row
                    title={row.name}
                    hint={sceneHint(row, activeCombatantId)}
                    muted={!!row.token}
                    selected={!!row.token && row.token.id === selectedTokenId}
                    swatch={row.token?.colour}
                    onClick={() => {
                      // On the map: select it. In the fight but not placed:
                      // place it. The row does the obvious next thing.
                      if (row.token) onSelectToken(row.token.id)
                      else if (row.combatant) onPlaceCombatant(row.combatant.id)
                    }}
                    onRemove={() => {
                      if (row.combatant) onRemoveCombatant(row.combatant.id)
                      else if (row.token) onRemoveToken(row.token.id)
                    }}
                    removeTitle={
                      row.combatant
                        ? `Take ${row.name} out of the fight`
                        : `Remove ${row.name} from the map`
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      )}

      {tab !== 'scene' ? (
        <p className="text-muted-foreground border-t p-2 text-xs">
          Picking one rolls it into initiative and links the selected token — or
          places a new one if nothing is selected.
        </p>
      ) : null}
    </div>
  )
}

function Row({
  title,
  hint,
  selected,
  muted,
  swatch,
  onClick,
  onRemove,
  removeTitle,
}: {
  title: string
  hint?: string
  selected?: boolean
  /** Already on the map: still clickable, to jump to its token. */
  muted?: boolean
  swatch?: string
  onClick: () => void
  onRemove?: () => void
  removeTitle?: string
}) {
  return (
    // The remove button is a SIBLING of the row, not nested inside it: a button
    // within a button is invalid HTML and swallows the inner click.
    <div className="group/row flex items-center">
      <button
        type="button"
        onClick={onClick}
        className={`hover:bg-accent flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
          selected ? 'bg-accent' : ''
        }`}
      >
        {swatch ? (
          <span
            className="size-3 shrink-0 rounded-full border border-black/40"
            style={{ background: swatch }}
          />
        ) : null}
        <span
          className={`min-w-0 flex-1 truncate ${muted ? 'text-muted-foreground' : ''}`}
        >
          {title}
        </span>
        {hint ? (
          <span className="text-muted-foreground shrink-0 text-xs">{hint}</span>
        ) : null}
      </button>
      {onRemove ? (
        <button
          type="button"
          title={removeTitle}
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive shrink-0 px-1.5 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground min-h-0 flex-1 p-6 text-center text-sm">
      {children}
    </p>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'ghost'}
      onClick={onClick}
      className="gap-1 px-2 text-xs"
    >
      {children}
    </Button>
  )
}
