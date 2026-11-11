import { Crop, Grid3x3, Maximize2, Scaling } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { gridExtent, imageFit } from '#/lib/mapStore'
import type { BattleMap, ImageFit } from '#/lib/mapStore'

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
  onImageFit,
}: {
  map: BattleMap
  colsDraft: string
  rowsDraft: string
  onColsDraft: (value: string) => void
  onRowsDraft: (value: string) => void
  onCommit: (axis: 'cols' | 'rows') => void
  onFitToImage: () => void
  onImageFit: (fit: ImageFit) => void
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
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Background</p>

            {/*
              Two ways to reconcile a mismatch, and they pull opposite ways:
              change the grid to suit the art, or change how the art is drawn
              to suit the grid. Which is right depends on where the image came
              from, so both are offered rather than one being guessed at.
            */}
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                size="sm"
                variant={imageFit(map) === 'cover' ? 'secondary' : 'outline'}
                title="Fill the grid, cropping anything that does not fit"
                aria-pressed={imageFit(map) === 'cover'}
                onClick={() => onImageFit('cover')}
              >
                <Crop className="size-4" /> Fill
              </Button>
              <Button
                size="sm"
                variant={imageFit(map) === 'contain' ? 'secondary' : 'outline'}
                title="Show the whole image inside the grid, with bars around it"
                aria-pressed={imageFit(map) === 'contain'}
                onClick={() => onImageFit('contain')}
              >
                <Scaling className="size-4" /> Fit whole
              </Button>
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              title="Set the counts so the grid matches the background art"
              onClick={onFitToImage}
            >
              <Maximize2 className="size-4" /> Match grid to image
            </Button>
            <p className="text-muted-foreground text-xs">
              Fill crops art that does not match the grid&rsquo;s shape. Fit
              whole never cuts anything off.
            </p>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
