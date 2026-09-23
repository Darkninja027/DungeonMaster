import { createFileRoute } from '@tanstack/react-router'
import { MapWindow } from '#/components/map/MapWindow'

/**
 * The battlemap as the players see it — the second screen or the TV.
 *
 * Same component as the editor route with `mode="table"`, which inverts every
 * content rule: no toolbar, no inspector, fog drawn opaque, and hidden tokens
 * that were already stripped from the payload before it left the editor's
 * process (see `pushLive` in lib/useMaps.ts). The two modes share plumbing and
 * share nothing else, exactly as the player/popout pair do.
 *
 * Also a top-level sibling of `worlds/`, for the `worlds:watch` singleton
 * reason the editor route explains.
 */
export const Route = createFileRoute('/mapview/$worldId/$mapId')({
  component: MapViewPage,
})

function MapViewPage() {
  const { worldId, mapId } = Route.useParams()
  return <MapWindow worldId={worldId} mapId={mapId} mode="table" />
}
