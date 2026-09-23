import { createFileRoute } from '@tanstack/react-router'
import { MapWindow } from '#/components/map/MapWindow'

/**
 * The battlemap editor, in its own window.
 *
 * A top-level sibling of `worlds/` so WorldLayout's chrome and watcher never
 * mount here. That matters more than it looks: this is a full-chrome DM-facing
 * window, so nesting it under `/worlds/$worldId` to inherit the sidebar is the
 * obvious move — and it would subscribe a second `worlds:watch`, which is a
 * singleton in main, silently stealing live-reload from the DM window. The bug
 * presents as "my markdown edits stopped appearing" with no visible connection
 * to maps. See ArticleViewer, which documents the same trap.
 */
export const Route = createFileRoute('/map/$worldId/$mapId')({
  component: MapWindowPage,
})

function MapWindowPage() {
  const { worldId, mapId } = Route.useParams()
  return <MapWindow worldId={worldId} mapId={mapId} mode="edit" />
}
