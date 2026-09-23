import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ScrollArea } from '#/components/ui/scroll-area'
import { hydrateMaps, mapActions, useMaps } from '#/lib/useMaps'
import { newMap, sortedMaps } from '#/lib/mapStore'
import { MapEditor } from './MapEditor'

/**
 * The battlemaps tab: a list of this world's maps.
 *
 * The list is all that lives in the session rail. Opening a map hands over to
 * `MapEditor`, which is a full-window overlay — a battlemap in a 340px panel
 * has no room to show a room, and space is the whole point of the surface.
 */
export function MapPanel({ worldId }: { worldId: string }) {
  const file = useMaps()
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    void hydrateMaps(worldId)
  }, [worldId])

  const maps = sortedMaps(file)
  // Read the open map out of the live file rather than holding a copy, so an
  // edit made inside the overlay re-renders it.
  const open = maps.find((m) => m.id === openId) ?? null

  // A map deleted elsewhere (or a world switch) must not leave a dead id open.
  useEffect(() => {
    if (openId && !file.maps.some((m) => m.id === openId)) setOpenId(null)
  }, [file, openId])

  function create() {
    const map = newMap({ name: `Map ${file.maps.length + 1}` })
    mapActions.save(map)
    setOpenId(map.id)
  }

  return (
    <>
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
                    onClick={() => setOpenId(m.id)}
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

      {open ? (
        <MapEditor
          worldId={worldId}
          map={open}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  )
}
