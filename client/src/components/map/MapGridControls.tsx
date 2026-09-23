import { Grid3x3, Maximize2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { gridExtent } from '#/lib/mapStore'
import type { BattleMap } from '#/lib/mapStore'

/**
 * How big the grid is — a popover on the toolbar.
 *
 * It used to be half of a bottom bar that swapped between grid settings and
 * token controls depending on the selection, which meant the chrome changed
 * height as you clicked around and the map jumped. Grid size is something you
 * set when you make a map and then hardly touch, so it does not deserve
 * permanent screen furniture; the current counts ride on the trigger.
 *
 * The drafts live in the parent because the re-sync effect needs them: this
 * renders them and reports blur and Enter, and the parent decides what a typed
 * value means.
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
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" title="How many squares the grid has">
          <Grid3x3 className="size-4" />
          <span className="text-muted-foreground font-mono text-xs">
            {extent.cols}&times;{extent.rows}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <div>
          <p className="text-sm font-medium">Grid</p>
          <p className="text-muted-foreground text-xs">
            The counts are the map. Cells are always square, so a tall grid is
            just more rows than columns.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
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
              className="h-8"
            />
          </div>
          <span className="text-muted-foreground pb-2 text-sm">&times;</span>
          <div className="flex-1">
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
              className="h-8"
            />
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          {extent.cols * 5} &times; {extent.rows * 5} feet
        </p>

        {map.image ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            title="Set the counts so the grid matches the background art"
            onClick={onFitToImage}
          >
            <Maximize2 className="size-4" /> Fit to image
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
