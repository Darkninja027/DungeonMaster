import {
  Eye,
  EyeOff,
  Image as ImageIcon,
  MonitorPlay,
  MonitorX,
  MousePointer2,
  PawPrint,
  Plus,
  Ruler,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import type { BattleMap } from '#/lib/mapStore'
import type { Combatant } from '#/lib/api'
import type { MapTool } from './MapCanvas'
import type { TemplateKind } from '#/lib/mapMeasure'

/**
 * The editor's top bar: the map name, the tools, and what to do with the map.
 *
 * Split out of MapEditor, which was 899 lines. The tools are a `ToggleGroup`
 * rather than the row of hand-toggled buttons they used to be: `tool` is one
 * value, so a segmented control is what it actually is, and Radix gives the
 * roving focus and pressed-state semantics the old row had no way to express.
 *
 * The controls that belong to a tool (the template picker, the "place as"
 * list) render beside it rather than in a second bar, so the toolbar says what
 * is possible right now and nothing more.
 */
export function MapToolbar({
  map,
  tool,
  onTool,
  template,
  onTemplate,
  templateFeet,
  onTemplateFeet,
  placeLinked,
  onPlaceLinked,
  combatants,
  drawer,
  onDrawer,
  showing,
  onToggleShowing,
  onPickBackground,
  onFog,
  onRename,
  onDelete,
  onClose,
}: {
  map: BattleMap
  tool: MapTool
  onTool: (tool: MapTool) => void
  template: TemplateKind | null
  onTemplate: (kind: TemplateKind | null) => void
  templateFeet: number
  onTemplateFeet: (feet: number) => void
  placeLinked: string | null
  onPlaceLinked: (id: string | null) => void
  combatants: Array<Combatant>
  drawer: boolean
  onDrawer: () => void
  showing: boolean
  onToggleShowing: () => void
  onPickBackground: () => void
  onFog: (on: boolean) => void
  onRename: (name: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <div className="flex items-center gap-2 border-b p-2">
      <Input
        value={map.name}
        onChange={(e) => onRename(e.target.value)}
        className="h-8 w-64"
        aria-label="Map name"
      />

      <span className="bg-border mx-1 h-5 w-px" />

      <ToggleGroup
        type="single"
        value={tool}
        // Radix hands back '' when the active item is clicked again. A tool is
        // always active, so that is read as "stay where you are" rather than
        // leaving the map with no tool at all.
        onValueChange={(next) => onTool((next || tool) as MapTool)}
        aria-label="Map tool"
      >
        <ToggleGroupItem value="select" title="Select and move tokens (V)">
          <MousePointer2 />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="place"
          title="Click the map to place a token (P)"
        >
          <Plus />
        </ToggleGroupItem>
        <ToggleGroupItem value="reveal" title="Reveal fog (R)">
          <Eye />
        </ToggleGroupItem>
        <ToggleGroupItem value="hide" title="Hide under fog (H)">
          <EyeOff />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="measure"
          title="Measure distance and aim spells (M)"
        >
          <Ruler />
        </ToggleGroupItem>
      </ToggleGroup>

      {tool === 'measure' ? (
        <>
          <select
            value={template ?? 'distance'}
            onChange={(e) =>
              onTemplate(
                e.target.value === 'distance'
                  ? null
                  : (e.target.value as TemplateKind),
              )
            }
            className="bg-background h-8 rounded border px-2 text-sm"
            aria-label="Template"
          >
            <option value="distance">Distance</option>
            <option value="circle">Circle / burst</option>
            <option value="cone">Cone</option>
            <option value="line">Line</option>
            <option value="square">Square / cube</option>
          </select>
          {template ? (
            <Input
              type="number"
              min={5}
              step={5}
              value={templateFeet}
              onChange={(e) => onTemplateFeet(Number(e.target.value) || 5)}
              className="h-8 w-20"
              aria-label="Template size in feet"
              title="Radius, length or half-width, in feet"
            />
          ) : null}
        </>
      ) : null}

      {tool === 'place' ? (
        <select
          value={placeLinked ?? ''}
          onChange={(e) => onPlaceLinked(e.target.value || null)}
          className="bg-background h-8 rounded border px-2 text-sm"
          aria-label="Place as"
          title="Place a blank token, or one linked to a combatant"
        >
          <option value="">Blank token</option>
          {combatants.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}

      <span className="bg-border mx-1 h-5 w-px" />

      <Button size="sm" variant="ghost" onClick={onPickBackground}>
        <ImageIcon className="size-4" /> Background
      </Button>

      <Button
        size="sm"
        variant={drawer ? 'default' : 'ghost'}
        onClick={onDrawer}
        title="Bestiary, party and the tokens on this map (B)"
      >
        <PawPrint className="size-4" />
      </Button>

      <label
        className="flex items-center gap-1.5 text-xs"
        title="Paint fog over the map"
      >
        <input
          type="checkbox"
          checked={map.fogEnabled}
          onChange={(e) => onFog(e.target.checked)}
        />
        Fog
      </label>

      <Button
        size="sm"
        variant={showing ? 'secondary' : 'ghost'}
        className="ml-auto"
        title={
          showing
            ? 'Stop showing this map to the players'
            : 'Show this map on a second screen, without your hidden tokens'
        }
        onClick={onToggleShowing}
      >
        {showing ? (
          <MonitorX className="size-4" />
        ) : (
          <MonitorPlay className="size-4" />
        )}
        {showing ? 'Showing' : 'Show'}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        title="Delete this map"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={onClose} title="Close (Esc)">
        <X className="size-4" />
      </Button>
    </div>
  )
}
