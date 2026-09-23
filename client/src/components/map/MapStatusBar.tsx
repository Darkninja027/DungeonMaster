import { Maximize2, Minus, Plus } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ZOOM_STEP } from '#/lib/mapCamera'
import { gridExtent } from '#/lib/mapStore'
import type { BattleMap } from '#/lib/mapStore'

/**
 * The map's size and its zoom, floating in a corner.
 *
 * What is left of the old bottom bar once the grid inputs moved into a popover
 * and the token controls became a card: a readout and the zoom buttons. It
 * floats over the map rather than taking a strip of it, because it is glanced
 * at rather than worked in.
 *
 * The shortcut list that used to live here is gone. Every tool button already
 * carries its key in a tooltip and the Guide has the full table, so a run-on
 * of `V select P place R/H fog` was repeating itself in the one place with no
 * room for it — and it rendered through bare `<kbd>`, which this app has never
 * styled.
 */
export function MapStatusBar({
  map,
  scale,
  onZoom,
  onFit,
}: {
  map: BattleMap
  scale: number
  onZoom: (factor: number) => void
  onFit: () => void
}) {
  const { cols, rows } = gridExtent(map)

  return (
    <div className="bg-background/85 text-muted-foreground pointer-events-auto absolute right-3 bottom-3 flex items-center gap-2 rounded-lg border px-2 py-1 text-xs shadow-sm backdrop-blur">
      <span className="font-mono">
        {cols} &times; {rows}
      </span>
      <span className="opacity-40">&middot;</span>
      <span>
        {cols * 5} &times; {rows * 5} ft
      </span>

      <span className="bg-border mx-0.5 h-4 w-px" />

      <Button
        size="icon"
        variant="ghost"
        className="size-6"
        title="Zoom out"
        onClick={() => onZoom(1 / ZOOM_STEP)}
      >
        <Minus className="size-3.5" />
      </Button>
      <button
        type="button"
        onClick={onFit}
        title="Fit the whole map in the window"
        aria-label="Zoom"
        className="hover:text-foreground min-w-11 cursor-pointer text-center font-mono tabular-nums"
      >
        {Math.round(scale * 100)}%
      </button>
      <Button
        size="icon"
        variant="ghost"
        className="size-6"
        title="Zoom in"
        onClick={() => onZoom(ZOOM_STEP)}
      >
        <Plus className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-6"
        title="Fit the whole map in the window"
        onClick={onFit}
      >
        <Maximize2 className="size-3.5" />
      </Button>
    </div>
  )
}
