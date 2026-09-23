import { useCallback, useEffect, useRef, useState } from 'react'
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
import { mapActions, setLiveMap } from '#/lib/useMaps'
import {
  ALLY_COLOUR,
  FOE_COLOUR,
  freeCell,
  isOrphaned,
  linkToken,
  placeCombatant,
  tokenArticle,
  sizeFromSubtitle,
  unlinkToken,
} from '#/lib/mapTokens'
import {
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
import { placeCard } from '#/lib/mapCardPlacement'
import { MapBackgroundDialog } from './MapBackgroundDialog'
import { MapGridControls } from './MapGridControls'
import { MapStatusBar } from './MapStatusBar'
import { MapTokenCard } from './MapTokenCard'
import { MapToolbar } from './MapToolbar'
import { MapCanvas } from './MapCanvas'
import type { MapCameraHandle, MapTool } from './MapCanvas'
import type { TemplateKind } from '#/lib/mapMeasure'

/**
 * The open battlemap: toolbar, canvas and inspector.
 *
 * Fills its window. It used to be a `fixed inset-0` overlay inside the DM
 * window, because a map in the 340px session rail has no room to show a room;
 * it is now mounted by `MapWindow` in a BrowserWindow of its own, which is the
 * same argument taken one step further. The `fixed inset-0` is kept because the
 * layout still wants the whole viewport, not because anything is beneath it.
 *
 * The session panel keeps the map *list*. Escape closes the window, and
 * shortcuts are suspended while it is up — that costs nothing now the window is
 * its own process, and it keeps the surface honest if it is ever embedded again.
 *
 * "Show" puts the map on a second screen through a `table` window, stripped of
 * hidden tokens by `forPlayers` before the payload ever leaves this process.
 */
/**
 * The token card's size, for placing it before it renders.
 *
 * A constant rather than a measurement: measuring would put the card in the
 * wrong place for one frame, which on a map reads as a flicker beside the
 * token. Kept in step with MapTokenCard's own `w-64`.
 */
const CARD_SIZE = { width: 256, height: 220 }

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
  const [drawer, setDrawer] = useState(false)
  /** Whether a table window is up for this map. */
  const [showing, setShowing] = useState(false)
  /** The canvas's zoom, for the status readout. */
  const [scale, setScale] = useState(1)
  const camera = useRef<MapCameraHandle>(null)
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

  // Stable: MapCanvas reports the scale from an effect keyed on this, so a
  // fresh function each render would re-run it forever.
  const onScale = useCallback((next: number) => setScale(next), [])

  function edit(change: (m: BattleMap) => BattleMap) {
    mapActions.update(map.id, change)
  }

  /** Delete the map, after asking. Closes the window on the way out. */
  function deleteMap() {
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
  }

  /**
   * Put this map on the players' screen, or take it down.
   *
   * `setLiveMap` is what arms the live push, so only the window actually
   * showing a map ever sends one — a rename in the DM window's list must not
   * conjure a player window nobody asked for. Closing the window and disarming
   * the push are deliberately the same action: a table view that stays open
   * but stops updating is worse than one that is gone, because it keeps
   * showing token positions that have since moved.
   */
  function toggleShowing() {
    if (showing) {
      setLiveMap(null)
      setShowing(false)
      void api.mapView.close(worldId, map.id, 'table')
      return
    }
    setShowing(true)
    void api.mapView.show(worldId, map.id, 'table').then(() => {
      // Armed after the window exists, so its first frame is the current map
      // rather than whatever the cold read happens to find.
      setLiveMap(map.id)
    })
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
   * Drop a blank token where the DM clicked.
   *
   * It lands **where you clicked** rather than at 0,0, which was the whole
   * complaint about the old Add button.
   *
   * Deliberately blank, always. There was once a "place as" dropdown here for
   * choosing a combatant to link on the way down, and it earned its keep for
   * about as long as it took the creature drawer (`B`) to exist: the drawer
   * searches hundreds of monsters, shows who is already on the map, and rolls
   * a new creature into initiative as it places it. A second, worse picker
   * sitting in the toolbar was just somewhere for the answer to be wrong.
   */
  function placeAt(cell: Point) {
    const { cols, rows } = gridExtent(map)
    edit((m) => {
      const at = freeCell(m, cell, cols, rows)
      return addToken(m, {
        id: newTokenId(),
        label: '',
        x: at.x,
        y: at.y,
        size: 'medium',
        colour: FOE_COLOUR,
      })
    })
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

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <MapToolbar
        map={map}
        grid={
          <MapGridControls
            map={map}
            colsDraft={colsDraft}
            rowsDraft={rowsDraft}
            onColsDraft={setColsDraft}
            onRowsDraft={setRowsDraft}
            onCommit={commitAxis}
            onFitToImage={() => {
              // The art's own cell size is unknown, so assume the usual 70px
              // a VTT export uses and round to whole cells.
              const fit = gridFromImage(map.imageWidth, map.imageHeight, 70)
              edit((m) => setGridSize(m, fit))
            }}
            onImageFit={(fit) =>
              // Stored only when it is not the default, so a map left on Fill
              // does not grow a key in a file people hand-edit.
              edit((m) => ({
                ...m,
                ...(fit === 'contain'
                  ? { imageFit: 'contain' as const }
                  : { imageFit: undefined }),
              }))
            }
          />
        }
        tool={tool}
        onTool={setTool}
        template={template}
        onTemplate={setTemplate}
        templateFeet={templateFeet}
        onTemplateFeet={setTemplateFeet}
        drawer={drawer}
        onDrawer={() => setDrawer((v) => !v)}
        showing={showing}
        onToggleShowing={toggleShowing}
        onPickBackground={() => setPicking(true)}
        onFog={(on) => edit((m) => ({ ...m, fogEnabled: on }))}
        onRename={(name) => edit((m) => ({ ...m, name }))}
        onDelete={deleteMap}
        onClose={onClose}
      />

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
          cameraRef={camera}
          onScale={onScale}
          overlay={(anchor) => (
            <>
              {token && anchor ? (
                <MapTokenCard
                  token={token}
                  linked={linked}
                  orphaned={orphaned}
                  combatants={combat.combatants}
                  canOpenStatBlock={
                    !!tokenArticle(token, combat.combatants, worldId)
                  }
                  style={{
                    position: 'absolute',
                    ...placeCard(anchor, CARD_SIZE),
                  }}
                  onPatch={(patch) =>
                    edit((m) => updateToken(m, token.id, patch))
                  }
                  onRemove={() => {
                    edit((m) => removeToken(m, token.id))
                    setSelected(null)
                  }}
                  onUnlink={() => edit((m) => unlinkToken(m, token.id))}
                  onLink={() => setDrawer(true)}
                  onHp={(hp) => {
                    if (linked) combatActions.update(linked.id, { hp })
                  }}
                  onStatBlock={openStatBlock}
                  onClose={() => setSelected(null)}
                />
              ) : null}
              <MapStatusBar
                map={map}
                scale={scale}
                onZoom={(factor) => camera.current?.zoomBy(factor)}
                onFit={() => camera.current?.fit()}
              />
            </>
          )}
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
