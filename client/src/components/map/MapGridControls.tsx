import { Maximize2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { gridExtent } from '#/lib/mapStore'
import type { BattleMap } from '#/lib/mapStore'

/**
 * The bottom bar when no token is selected: how big the grid is.
 *
 * Split out of MapEditor. The drafts live in the parent because the keyboard
 * shortcuts and the re-sync effect both need them — this renders them and
 * reports blur and Enter, and the parent decides what a typed value means.
 *
 * The two boxes commit independently and that is the whole point: 15 x 30 is a
 * tall grid of square cells, and a control that derived one axis from the
 * other could not say it.
 */
export function MapGridControls({
  map,
  colsDraft,
  rowsDraft,
  onColsDraft,
  onRowsDraft,
  onCommit,
  onFitToImage,
}: {
  map: BattleMap
  colsDraft: string
  rowsDraft: string
  onColsDraft: (value: string) => void
  onRowsDraft: (value: string) => void
  onCommit: (axis: 'cols' | 'rows') => void
  onFitToImage: () => void
}) {
  const extent = gridExtent(map)

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label className="text-xs" htmlFor="map-grid-cols">
          Columns
        </Label>
        <Input
          id="map-grid-cols"
          type="number"
          min={1}
          max={400}
          value={colsDraft}
          onChange={(e) => onColsDraft(e.target.value)}
          onBlur={() => onCommit('cols')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit('cols')
          }}
          className="h-8 w-20"
          title="How many cells across. Set either box — cells are square, so the other follows."
        />
      </div>
      <div>
        <Label className="text-xs" htmlFor="map-grid-rows">
          Rows
        </Label>
        <Input
          id="map-grid-rows"
          type="number"
          min={1}
          max={400}
          value={rowsDraft}
          onChange={(e) => onRowsDraft(e.target.value)}
          onBlur={() => onCommit('rows')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit('rows')
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
          onClick={onFitToImage}
        >
          <Maximize2 className="size-4" /> Fit to image
        </Button>
      ) : null}

      <p className="text-muted-foreground ml-auto flex items-center gap-1.5 text-xs">
        <Maximize2 className="size-3.5" />
        {extent.cols} x {extent.rows} squares &middot; drag to pan, wheel to
        zoom &middot; <kbd>V</kbd> select <kbd>P</kbd> place <kbd>R</kbd>/
        <kbd>H</kbd> fog <kbd>M</kbd> measure <kbd>B</kbd> bestiary
      </p>
    </div>
  )
}
