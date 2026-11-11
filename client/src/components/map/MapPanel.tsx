import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ScrollArea } from '#/components/ui/scroll-area'
import { api } from '#/lib/api'
import { hydrateMaps, mapActions, useMaps } from '#/lib/useMaps'
import { newMap, sortedMaps } from '#/lib/mapStore'

/**
 * The battlemaps tab: a list of this world's maps.
 *
 * The list is all that lives in the session rail. Opening a map opens a
 * WINDOW — a battlemap in a 340px panel has no room to show a room, and it
 * used to be a full-window overlay for that reason. A window goes one better:
 * the map gets a monitor and the notebook stays usable on the other, which is
 * how the thing is actually used at a table.
 *
 * The list stays live while that window edits, because both processes follow
 * the same authoritative copy in main (see lib/useMaps.ts). There is no
 * dead-id guard here any more — nothing is held open to go stale.
 */
export function MapPanel({ worldId }: { worldId: string }) {
  const file = useMaps()

  useEffect(() => {
    void hydrateMaps(worldId)
  }, [worldId])

  const maps = sortedMaps(file)

  function open(mapId: string) {
    void api.mapView.show(worldId, mapId)
  }

  function create() {
    const map = newMap({ name: `Map ${file.maps.length + 1}` })
    mapActions.save(map)
    open(map.id)
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Battlemaps</h2>
        <Button size="sm" onClick={create}>
          <Plus className="size-4" /> New map
        </Button>
      </div>

      {maps.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-center text-sm">
          No maps yet. A map is a background image from this world&rsquo;s
          images, a grid over it, and tokens you move around.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul className="space-y-1 pr-2">
            {maps.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => open(m.id)}
                  className="hover:bg-accent flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm"
                >
                  <span className="truncate">{m.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {m.tokens.length} token{m.tokens.length === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}
