import { useEffect, useState } from 'react'
import {
  BookOpen,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Maximize2,
  MousePointer2,
  Minus,
  PawPrint,
  Plus,
  Ruler,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { useConfirm } from '#/components/ConfirmProvider'
import { useSuspendShortcuts } from '#/lib/useShortcut'
import { api } from '#/lib/api'
import { setCells } from '#/lib/fog'
import { combatActions, hydrateSession, useCombat } from '#/lib/sessionStore'
import {
  extractStatBlockFence,
  parseStatBlock,
  parseStatBlockCard,
} from '#/lib/statblock'
import { initiativeBonus, parseCharacter } from '#/lib/character'
import { rollInitiative } from '#/components/EncounterBuilder'
import { MapCreaturePanel } from './MapCreaturePanel'
import type { CreaturePick } from './MapCreaturePanel'
import { mapActions } from '#/lib/useMaps'
import {
  ALLY_COLOUR,
  FOE_COLOUR,
  freeCell,
  isOrphaned,
  linkToken,
  placeCombatant,
  tokenArticle,
  sizeFromSubtitle,
  tokenForCombatant,
  unlinkToken,
} from '#/lib/mapTokens'
import {
  TOKEN_SIZES,
  addToken,
  gridExtent,
  moveToken,
  newTokenId,
  removeToken,
  gridFromImage,
  setGridSize,
  updateToken,
} from '#/lib/mapStore'
import type { BattleMap, TokenSize } from '#/lib/mapStore'
import type { Point } from '#/lib/mapCamera'
import { MapBackgroundDialog } from './MapBackgroundDialog'
import { MapCanvas } from './MapCanvas'
import type { MapTool } from './MapCanvas'
import type { TemplateKind } from '#/lib/mapMeasure'

/**
 * The open battlemap, full-window.
 *
 * A map needs the whole window — in the 340px session rail there is no room to
 * see a room, let alone move a goblin across it. So this is a `fixed inset-0`
 * overlay, the same primitive `ImageLightbox` and `GuestTable` already use, and
 * for the same reason `ImageLightbox` gives: a shadcn Dialog's focus trap and
 * close-on-outside-click both fight a pointer drag across the whole surface.
 *
 * The session panel keeps the map *list*; opening one comes here. Escape closes,
 * and shortcuts are suspended while it is up so Ctrl+K cannot open the command
 * palette behind a map the DM is drawing on.
 */
export function MapEditor({
  worldId,
  map,
  onClose,
}: {
  worldId: string
  map: BattleMap
  onClose: () => void
}) {
  const confirm = useConfirm()
  const [tool, setTool] = useState<MapTool>('select')
  const [selected, setSelected] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  /** null measures a plain distance; a kind lays that spell template down. */
  const [template, setTemplate] = useState<TemplateKind | null>(null)
  const [templateFeet, setTemplateFeet] = useState(20)
  /** A combatant queued for the next placement, or null for a blank token. */
  const [placeLinked, setPlaceLinked] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(false)
  /**
   * The squares-across box, held as text while you type it.
   *
   * Committed on blur or Enter rather than per keystroke: typing "30" over "8"
   * passes through "3", and re-gridding the map on that intermediate value
   * would resize the fog twice and fight the cursor.
   */
  const [colsDraft, setColsDraft] = useState(String(gridExtent(map).cols))
  const [rowsDraft, setRowsDraft] = useState(String(gridExtent(map).rows))
  const combat = useCombat()

  // Re-sync the box when a different map opens, or the background changes the
  // grid under it. Keyed on the derived value so typing is never interrupted.
  const derived = gridExtent(map)
  useEffect(() => {
    setColsDraft(String(derived.cols))
    setRowsDraft(String(derived.rows))
  }, [map.id, derived.cols, derived.rows])

  useEffect(() => {
    // A no-op for the world already loaded, so this is safe beside the
    // initiative tracker's own hydrate.
    void hydrateSession(worldId)
  }, [worldId])

  // A modal surface that is not a Radix dialog, so nothing else suspends the
  // app's shortcuts for it — otherwise Ctrl+K opens the command palette behind
  // a map being drawn on.
  useSuspendShortcuts(true)

  const token = map.tokens.find((t) => t.id === selected) ?? null
  const orphaned = token ? isOrphaned(token, combat.combatants) : false
  /** The selected token's combatant, when it has a live one. */
  const linked =
    token?.combatantId && !orphaned
      ? (combat.combatants.find((c) => c.id === token.combatantId) ?? null)
      : null

  /**
   * Open the selected token's stat block in its own window.
   *
   * A popout rather than the bestiary panel: this editor covers the whole
   * window, so switching the session rail's tab behind it would change
   * something nobody can see. `api.player.show(..., 'popout')` is what the
   * initiative tracker already offers for the same job.
   */
  function openStatBlock() {
    if (!token) return
    const ref = tokenArticle(token, combat.combatants, worldId)
    if (!ref) return
    void api.player.show(ref.worldId, ref.articleId, 'popout')
  }

  // Every shortcut here is a **local** listener, not `useShortcut`: this
  // surface suspends the global shortcuts, which suppresses our own
  // registrations too, so a `useShortcut` here could never fire. The command
  // palette closes itself the same way, for the same reason.
  //
  // Because they are local to a full-window overlay they need no Ctrl, and
  // cannot collide with the app's Ctrl+K / Ctrl+S / Ctrl+N. The text-entry
  // guard is ours to do — the map name input is right there in the toolbar.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key.toLowerCase()) {
        case 'v':
          setTool('select')
          break
        case 'b':
          setDrawer((v) => !v)
          break
        case 'p':
          setTool('place')
          break
        case 'r':
          setTool('reveal')
          break
        case 'h':
          setTool('hide')
          break
        case 'm':
          setTool('measure')
          break
        case 's':
          // The one the DM reaches for mid-fight: the selected token's stat
          // block, in its own window so the map stays put.
          openStatBlock()
          break
        // Damage and heal the selected token without leaving the map. The
        // bracket keys because they sit together and need no modifier.
        case '[':
        case '-':
          if (linked) combatActions.update(linked.id, { hp: linked.hp - 1 })
          break
        case ']':
        case '=':
        case '+':
          if (linked) combatActions.update(linked.id, { hp: linked.hp + 1 })
          break
        case 'delete':
        case 'backspace':
          if (selected) {
            const id = selected
            mapActions.update(map.id, (m) => removeToken(m, id))
            setSelected(null)
          }
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // No dependency array on purpose: the listener closes over `selected`,
    // `map` and `combat`, and rebinding it each render is cheaper and far less
    // error-prone than tracking those in refs.
  })

  function edit(change: (m: BattleMap) => BattleMap) {
    mapActions.update(map.id, change)
  }

  /**
   * Apply a typed column or row count, or snap the box back if it was nonsense.
   *
   * The two axes commit independently, so setting the width does not disturb a
   * height the DM has already dialled in — which is the whole point of letting
   * them differ.
   */
  function commitAxis(axis: 'cols' | 'rows') {
    const draft = axis === 'cols' ? colsDraft : rowsDraft
    const setDraft = axis === 'cols' ? setColsDraft : setRowsDraft
    const current = gridExtent(map)[axis]

    const wanted = Number(draft)
    if (!Number.isFinite(wanted) || wanted < 1) {
      setDraft(String(current))
      return
    }
    const capped = Math.min(400, Math.floor(wanted))
    edit((m) => setGridSize(m, { [axis]: capped }))
    setDraft(String(capped))
    // Locked, the OTHER axis just changed too. The effect below re-syncs both
    // boxes from the map, so this only needs to fix the one being typed in.
  }

  /**
   * Drop a token where the DM clicked.
   *
   * If a combatant is queued up in the picker it is placed already linked and
   * named; otherwise it is a blank token. Either way it lands **where you
   * clicked** rather than at 0,0, which was the whole complaint about the old
   * Add button.
   */
  function placeAt(cell: Point) {
    const { cols, rows } = gridExtent(map)
    const combatant = combat.combatants.find((c) => c.id === placeLinked)
    edit((m) => {
      const at = freeCell(m, cell, cols, rows)
      if (combatant) {
        return addToken(
          m,
          tokenForCombatant(combatant, at, {
            ally: !!combatant.articleId?.startsWith('Characters/'),
          }),
        )
      }
      return addToken(m, {
        id: newTokenId(),
        label: '',
        x: at.x,
        y: at.y,
        size: 'medium',
        colour: FOE_COLOUR,
      })
    })
    // One click, one token: a queued combatant is consumed so the next click
    // does not silently place a duplicate of the same creature.
    if (combatant) setPlaceLinked(null)
  }

  /**
   * A creature was picked from the drawer.
   *
   * Rolls it into initiative — pulling HP and AC off its stat block, or its
   * sheet for a party member — and then either links the selected token to the
   * new row, or places a fresh token if nothing was selected. One action does
   * the whole job, because "on the map" and "in the fight" are the same
   * creature and wiring them separately is how they drift apart.
   *
   * The article is fetched here rather than held in the drawer: a stat block is
   * only needed at the moment of picking, and the list would otherwise have to
   * load hundreds of articles nobody asked for.
   */
  async function pickCreature(pick: CreaturePick) {
    let hp = 0
    let maxHp: number | null = null
    let ac: number | null = null
    let mod = 0
    let size: TokenSize = 'medium'
    let image: string | undefined
    try {
      const content = (await api.articles.get(pick.worldId, pick.articleId))
        .content
      if (pick.ally) {
        const character = parseCharacter(content).character
        hp = character.hp.current
        maxHp = character.hp.max
        ac = character.ac
        mod = initiativeBonus(character)
      } else {
        const sb = parseStatBlock(content)
        hp = sb.hp ?? 0
        maxHp = sb.hp
        ac = sb.ac
        mod = sb.dexMod ?? 0
        // The stat block already says how big it is ("Large giant, chaotic
        // evil") and may carry a portrait, so neither should need typing in.
        const fence = extractStatBlockFence(content)
        if (fence) {
          const card = parseStatBlockCard(fence)
          size = sizeFromSubtitle(card.subtitle) ?? 'medium'
          if (card.image) image = card.image
        }
      }
    } catch {
      // A missing or unparseable article still gives a usable row: the DM can
      // type the numbers in. Refusing to place it would be worse.
    }

    const combatantId = combatActions.addReturningId({
      name: pick.title,
      initiative: rollInitiative(
        pick.worldId,
        { id: pick.articleId, title: pick.title },
        mod,
      ),
      hp,
      maxHp,
      ac,
      note: '',
      articleId: pick.articleId,
      // Carried so the tracker opens the right article: a library monster's id
      // resolves against the library world, not this one.
      worldId: pick.worldId,
    })

    if (selected) {
      // Linking an existing token adopts the creature's size too, since the
      // token now claims to be that creature.
      edit((m) =>
        updateToken(linkToken(m, selected, combatantId), selected, {
          size,
          ...(image ? { image } : {}),
        }),
      )
      return
    }
    // Nothing selected: drop a new token in the first free cell.
    const { cols, rows } = gridExtent(map)
    edit((m) => {
      const at = freeCell(m, { x: 0, y: 0 }, cols, rows)
      return addToken(m, {
        id: newTokenId(),
        label: pick.title,
        x: at.x,
        y: at.y,
        size,
        colour: pick.ally ? ALLY_COLOUR : FOE_COLOUR,
        ...(image ? { image } : {}),
        combatantId,
      })
    })
  }

  /**
   * A row in the Fight tab was clicked.
   *
   * Already on the map: select its token, so the list doubles as a way to find
   * a creature in a crowded fight. Not yet placed: put it in the first free
   * cell, sized from its stat block if it has one.
   */
  function placeCombatantById(combatantId: string) {
    const existing = map.tokens.find((t) => t.combatantId === combatantId)
    if (existing) {
      setSelected(existing.id)
      return
    }
    const combatant = combat.combatants.find((c) => c.id === combatantId)
    if (!combatant) return
    const { cols, rows } = gridExtent(map)
    edit((m) =>
      placeCombatant(m, combatant, { x: 0, y: 0 }, cols, rows, {
        ally: !!combatant.articleId?.startsWith('Characters/'),
      }),
    )
  }

  /**
   * Take a combatant out of the fight.
   *
   * Its token stays on the map, unlinked — deleting a row from initiative
   * should not sweep the miniature off the table, and the DM may well want the
   * body lying there. `unlinkToken` rather than leaving it dangling, so the
   * token reads as an ordinary unlinked one rather than as "gone from the
   * fight".
   */
  function removeCombatantById(combatantId: string) {
    const stranded = map.tokens.find((t) => t.combatantId === combatantId)
    if (stranded) edit((m) => unlinkToken(m, stranded.id))
    combatActions.remove(combatantId)
  }

  function paintFog(cells: Array<Point>, revealed: boolean) {
    edit((m) => ({ ...m, fog: setCells(m.fog, cells, revealed) }))
  }

  const extent = gridExtent(map)

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="flex items-center gap-2 border-b p-2">
        <Input
          value={map.name}
          onChange={(e) => edit((m) => ({ ...m, name: e.target.value }))}
          className="h-8 w-64"
          aria-label="Map name"
        />

        <span className="mx-1 h-5 w-px bg-border" />

        <ToolButton
          active={tool === 'select'}
          onClick={() => setTool('select')}
          title="Select and move tokens (V)"
        >
          <MousePointer2 className="size-4" />
        </ToolButton>
        <ToolButton
          active={tool === 'reveal'}
          onClick={() => setTool('reveal')}
          title="Reveal fog (R)"
        >
          <Eye className="size-4" />
        </ToolButton>
        <ToolButton
          active={tool === 'hide'}
          onClick={() => setTool('hide')}
          title="Hide under fog (H)"
        >
          <EyeOff className="size-4" />
        </ToolButton>
        <ToolButton
          active={tool === 'measure'}
          onClick={() => setTool('measure')}
          title="Measure distance and aim spells (M)"
        >
          <Ruler className="size-4" />
        </ToolButton>

        {tool === 'measure' ? (
          <>
            <select
              value={template ?? 'distance'}
              onChange={(e) =>
                setTemplate(
                  e.target.value === 'distance'
                    ? null
                    : (e.target.value as TemplateKind),
                )
              }
              className="bg-background h-8 rounded border px-2 text-sm"
              aria-label="Template"
            >
              <option value="distance">Distance</option>
              <option value="circle">Circle / burst</option>
              <option value="cone">Cone</option>
              <option value="line">Line</option>
              <option value="square">Square / cube</option>
            </select>
            {template ? (
              <Input
                type="number"
                min={5}
                step={5}
                value={templateFeet}
                onChange={(e) => setTemplateFeet(Number(e.target.value) || 5)}
                className="h-8 w-20"
                aria-label="Template size in feet"
                title="Radius, length or half-width, in feet"
              />
            ) : null}
          </>
        ) : null}

        <span className="mx-1 h-5 w-px bg-border" />

        <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
          <ImageIcon className="size-4" /> Background
        </Button>
        <ToolButton
          active={tool === 'place'}
          onClick={() => setTool('place')}
          title="Click the map to place a token (P)"
        >
          <Plus className="size-4" />
        </ToolButton>

        {tool === 'place' ? (
          <select
            value={placeLinked ?? ''}
            onChange={(e) => setPlaceLinked(e.target.value || null)}
            className="bg-background h-8 rounded border px-2 text-sm"
            aria-label="Place as"
            title="Place a blank token, or one linked to a combatant"
          >
            <option value="">Blank token</option>
            {combat.combatants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}

        <ToolButton
          active={drawer}
          onClick={() => setDrawer((v) => !v)}
          title="Bestiary, party and the tokens on this map (B)"
        >
          <PawPrint className="size-4" />
        </ToolButton>

        <label
          className="flex items-center gap-1.5 text-xs"
          title="Paint fog over the map"
        >
          <input
            type="checkbox"
            checked={map.fogEnabled}
            onChange={(e) =>
              edit((m) => ({ ...m, fogEnabled: e.target.checked }))
            }
          />
          Fog
        </label>

        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          title="Delete this map"
          onClick={() => {
            void confirm({
              title: `Delete "${map.name}"?`,
              description:
                'The map, its tokens and its fog go. The background image itself is untouched.',
              confirmLabel: 'Delete map',
            }).then((ok) => {
              if (ok) {
                mapActions.remove(map.id)
                onClose()
              }
            })
          }}
        >
          <Trash2 className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} title="Close (Esc)">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <MapCanvas
          worldId={worldId}
          map={map}
          tool={tool}
          selectedTokenId={selected}
          combatants={combat.combatants}
          activeCombatantId={combat.activeId}
          onSelectToken={setSelected}
          onMoveToken={(id, x, y) => edit((m) => moveToken(m, id, x, y))}
          onPaintFog={paintFog}
          onPlaceAt={placeAt}
          template={template}
          templateFeet={templateFeet}
          className="min-h-0 flex-1"
        />
        {drawer ? (
          <MapCreaturePanel
            worldId={worldId}
            map={map}
            selectedTokenId={selected}
            combatants={combat.combatants}
            activeCombatantId={combat.activeId}
            onPick={(pick) => void pickCreature(pick)}
            onPlaceCombatant={placeCombatantById}
            onRemoveCombatant={removeCombatantById}
            onSelectToken={setSelected}
            onRemoveToken={(id) => {
              edit((m) => removeToken(m, id))
              if (selected === id) setSelected(null)
            }}
            onClose={() => setDrawer(false)}
          />
        ) : null}
      </div>

      <div className="border-t p-2">
        {token ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-56">
              <Label className="text-xs">Label</Label>
              <Input
                value={token.label}
                onChange={(e) =>
                  edit((m) =>
                    updateToken(m, token.id, { label: e.target.value }),
                  )
                }
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Size</Label>
              <select
                value={token.size}
                onChange={(e) =>
                  edit((m) =>
                    updateToken(m, token.id, {
                      size: e.target.value as TokenSize,
                    }),
                  )
                }
                className="h-8 rounded border bg-background px-2 text-sm"
              >
                {TOKEN_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Colour</Label>
              <input
                type="color"
                value={token.colour}
                onChange={(e) =>
                  edit((m) =>
                    updateToken(m, token.id, { colour: e.target.value }),
                  )
                }
                className="h-8 w-12 rounded border bg-background"
              />
            </div>
            <label
              className="flex items-center gap-1.5 text-xs"
              title="Hidden tokens are removed before the map reaches a player"
            >
              <input
                type="checkbox"
                checked={token.hidden ?? false}
                onChange={(e) =>
                  edit((m) =>
                    updateToken(m, token.id, {
                      hidden: e.target.checked || undefined,
                    }),
                  )
                }
              />
              Hidden
            </label>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                edit((m) => removeToken(m, token.id))
                setSelected(null)
              }}
            >
              <Trash2 className="size-4" /> Remove
            </Button>

            <div className="flex items-end gap-1.5">
              <div>
                <Label className="text-xs">Linked to</Label>
                <p className="flex h-8 items-center text-sm">
                  {orphaned
                    ? 'Gone from the fight'
                    : (combat.combatants.find((c) => c.id === token.combatantId)
                        ?.name ?? 'Nothing')}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                title="Pick a creature to link this token to"
                onClick={() => setDrawer(true)}
              >
                <PawPrint className="size-4" />{' '}
                {token.combatantId ? 'Change' : 'Link'}
              </Button>
              {token.combatantId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Leave the token on the map but unlink it"
                  onClick={() => edit((m) => unlinkToken(m, token.id))}
                >
                  Unlink
                </Button>
              ) : null}
            </div>

            {linked ? (
              <div>
                <Label className="text-xs">Hit points</Label>
                <div className="flex h-8 items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-7"
                    title="Damage 1"
                    onClick={() =>
                      combatActions.update(linked.id, { hp: linked.hp - 1 })
                    }
                  >
                    <Minus className="size-3" />
                  </Button>
                  <Input
                    value={String(linked.hp)}
                    inputMode="numeric"
                    aria-label="Hit points"
                    className="h-7 w-14 px-1 text-center text-xs"
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      // The pure layer clamps at zero, so no guard here.
                      if (!isNaN(v)) combatActions.update(linked.id, { hp: v })
                    }}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-7"
                    title="Heal 1"
                    onClick={() =>
                      combatActions.update(linked.id, { hp: linked.hp + 1 })
                    }
                  >
                    <Plus className="size-3" />
                  </Button>
                  <span className="text-muted-foreground text-xs">
                    {linked.maxHp != null ? `/ ${linked.maxHp}` : ''}
                    {linked.hp <= 0 ? ' — down' : ''}
                  </span>
                </div>
              </div>
            ) : null}

            {token.combatantId && !orphaned ? (
              <Button
                size="sm"
                variant="ghost"
                title="Open this creature's stat block in its own window (S)"
                onClick={openStatBlock}
                disabled={!tokenArticle(token, combat.combatants, worldId)}
              >
                <BookOpen className="size-4" /> Stat block
              </Button>
            ) : null}

            {orphaned ? (
              // The combatant was removed while the miniature stayed on the
              // table. Say so rather than silently pruning the token — and
              // rather than leaving the DM wondering why it has no HP bar.
              <span className="text-muted-foreground text-xs">
                Not in the fight any more.
              </span>
            ) : null}

            <p className="text-muted-foreground ml-auto text-xs">
              Drag to move &middot; <kbd>S</kbd> stat block &middot;{' '}
              <kbd>Del</kbd> remove
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Columns</Label>
              <Input
                type="number"
                min={1}
                max={400}
                value={colsDraft}
                onChange={(e) => setColsDraft(e.target.value)}
                onBlur={() => commitAxis('cols')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitAxis('cols')
                }}
                className="h-8 w-20"
                title="How many cells across. Set either box — cells are square, so the other follows."
              />
            </div>
            <div>
              <Label className="text-xs">Rows</Label>
              <Input
                type="number"
                min={1}
                max={400}
                value={rowsDraft}
                onChange={(e) => setRowsDraft(e.target.value)}
                onBlur={() => commitAxis('rows')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitAxis('rows')
                }}
                className="h-8 w-20"
                title="How many cells down. Set either box — cells are square, so the other follows."
              />
            </div>
            {map.image ? (
              <Button
                size="sm"
                variant="ghost"
                title="Set the counts so the grid matches the background art"
                onClick={() => {
                  // The art's own cell size is unknown, so assume the usual 70px
                  // a VTT export uses and round to whole cells.
                  const fit = gridFromImage(map.imageWidth, map.imageHeight, 70)
                  edit((m) => setGridSize(m, fit))
                }}
              >
                <Maximize2 className="size-4" /> Fit to image
              </Button>
            ) : null}
            <p className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Maximize2 className="size-3.5" />
              {extent.cols} x {extent.rows} squares &middot; drag to pan, wheel
              to zoom &middot; <kbd>V</kbd> select <kbd>P</kbd> place{' '}
              <kbd>R</kbd>/<kbd>H</kbd> fog <kbd>M</kbd> measure <kbd>B</kbd>{' '}
              bestiary
            </p>
          </div>
        )}
      </div>

      {picking ? (
        <MapBackgroundDialog
          worldId={worldId}
          onClose={() => setPicking(false)}
          onPick={(image) => {
            // The image is a backdrop: it does not set the grid, and the grid
            // does not resize to it. Its natural size is kept only so "Fit grid
            // to image" can offer a cell count that lines up with the art.
            const probe = new Image()
            probe.onload = () => {
              edit((m) => ({
                ...m,
                image: image.id,
                imageWidth: probe.naturalWidth,
                imageHeight: probe.naturalHeight,
              }))
            }
            probe.src = image.url
            setPicking(false)
          }}
        />
      ) : null}
    </div>
  )
}

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'ghost'}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  )
}
