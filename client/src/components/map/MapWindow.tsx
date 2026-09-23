import { useEffect, useState } from 'react'
import { api } from '#/lib/api'
import { hydrateMaps, useMap } from '#/lib/useMaps'
import { hydrateSession, useCombat } from '#/lib/sessionStore'
import { parseMaps } from '#/lib/mapStore'
import type { BattleMap } from '#/lib/mapStore'
import { MapCanvas } from './MapCanvas'
import { MapEditor } from './MapEditor'

/**
 * A battlemap in a window of its own, in one of two modes.
 *
 * `edit` is the DM's editor, which used to be a `fixed inset-0` overlay inside
 * the DM window. It moved out for the reason the overlay existed in the first
 * place — a map wants the whole screen — except now it wants a whole *monitor*,
 * and the notebook stays usable on the other one.
 *
 * `table` is what the players look at. It renders the canvas and nothing else:
 * no toolbar, no inspector, no keyboard. Its map arrives over `map:live`,
 * already stripped by `forPlayers` in the editor's process, so a hidden token
 * never reaches this window at all — that is a secrecy rule and not a
 * rendering preference. It also reads the saved copy on open, so the window
 * paints immediately instead of waiting for the DM's next edit; the same cold
 * start / live override bargain `ArticleViewer` makes.
 */
export function MapWindow({
  worldId,
  mapId,
  mode,
}: {
  worldId: string
  mapId: string
  mode: 'edit' | 'table'
}) {
  return mode === 'table' ? (
    <TableView worldId={worldId} mapId={mapId} />
  ) : (
    <EditorView worldId={worldId} mapId={mapId} />
  )
}

function EditorView({ worldId, mapId }: { worldId: string; mapId: string }) {
  const map = useMap(mapId)
  const [loading, setLoading] = useState(true)

  // This window hydrates its own stores: `hydrateMaps` is otherwise called only
  // by MapPanel, and the session store only by the panels in the DM window —
  // neither of which exists in this process. The flag is what separates "still
  // loading" from "genuinely gone", which are the same empty state otherwise.
  useEffect(() => {
    let live = true
    void hydrateSession(worldId)
    void hydrateMaps(worldId).then(() => {
      if (live) setLoading(false)
    })
    return () => {
      live = false
    }
  }, [worldId])

  if (!map) {
    return loading ? (
      <Splash>Opening…</Splash>
    ) : (
      // Deleted in the DM window's list while it was open here. Said rather
      // than acted on: a window that vanishes the instant you click delete
      // somewhere else reads as a crash.
      <Splash>
        This map was deleted.
        <button
          type="button"
          onClick={() => window.close()}
          className="bg-secondary mt-4 block rounded px-3 py-1.5 text-sm"
        >
          Close window
        </button>
      </Splash>
    )
  }

  return (
    <MapEditor worldId={worldId} map={map} onClose={() => window.close()} />
  )
}

function TableView({ worldId, mapId }: { worldId: string; mapId: string }) {
  const [map, setMap] = useState<BattleMap | null>(null)
  const combat = useCombat()

  // The live feed from whichever window is driving this map. Wins over the
  // saved copy the moment it arrives.
  useEffect(
    () =>
      api.mapView.onLive((p) => {
        if (p.worldId !== worldId || p.mapId !== mapId) return
        // .at(), not [0]: parseMaps drops a row it cannot use, so a malformed
        // push must leave the last good map on screen rather than blanking it.
        const one = parseMaps({ version: 1, maps: [p.map] }).maps.at(0)
        if (one) setMap(one)
      }),
    [worldId, mapId],
  )

  // Cold start: the saved map, so the screen is not blank until the DM moves
  // something. Read directly rather than through the store — this window is a
  // display and must never patch anything back.
  useEffect(() => {
    let live = true
    void api.maps
      .get(worldId)
      .then((snapshot) => {
        if (!live || !snapshot) return
        const found = parseMaps(snapshot.file).maps.find((m) => m.id === mapId)
        // Only if nothing has been pushed yet: a live frame is newer than disk
        // by definition, and this read can land after one.
        if (found) setMap((current) => current ?? found)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [worldId, mapId])

  useEffect(() => {
    if (map) document.title = `${map.name} — Players`
  }, [map])

  if (!map) return <Splash>Waiting for the map…</Splash>

  return (
    <div className="fixed inset-0 bg-stone-950">
      <MapCanvas
        worldId={worldId}
        map={map}
        audience="player"
        combatants={combat.combatants}
        activeCombatantId={combat.activeId}
        className="size-full"
      />
    </div>
  )
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-stone-950 text-sm text-stone-400">
      {children}
    </div>
  )
}
