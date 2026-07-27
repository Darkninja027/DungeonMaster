import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import type { Character } from '#/lib/character'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { InventoryTab } from './InventoryTab'
import { NotesTab } from './NotesTab'

/**
 * The right-hand companion to the sheet: inventory, notes, and backstory in a
 * collapsible drawer so the DM never has to leave the stat block to reach them.
 * Collapsed, it hands the full width back to the sheet and shows a single
 * re-open button.
 */
export function CharacterSidePanel({
  character,
  onChange,
  worldId,
  body,
  onBodyChange,
  articles,
  onCreateMissing,
  open,
  onOpenChange,
}: {
  character: Character
  onChange: (next: Character) => void
  worldId: string
  body: string
  onBodyChange: (next: string) => void
  articles?: Array<{ id: string; title: string }>
  onCreateMissing?: (title: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!open) {
    return (
      <div className="flex shrink-0 flex-col border-l p-1">
        <Button
          variant="ghost"
          size="icon"
          title="Show inventory, notes & backstory"
          onClick={() => onOpenChange(true)}
        >
          <PanelRightOpen />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l lg:w-96">
      <Tabs defaultValue="inventory" className="min-h-0 flex-1 gap-0">
        <div className="flex items-center gap-1 border-b px-2 py-1.5">
          <TabsList className="h-8">
            <TabsTrigger value="inventory" className="text-xs">
              Inventory ({character.inventory.length})
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-xs">
              Notes ({character.notes.length})
            </TabsTrigger>
            <TabsTrigger value="backstory" className="text-xs">
              Backstory
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            title="Hide panel"
            onClick={() => onOpenChange(false)}
          >
            <PanelRightClose />
          </Button>
        </div>
        <TabsContent value="inventory" className="min-h-0 flex-1 overflow-y-auto">
          <InventoryTab
            character={character}
            onChange={onChange}
            worldId={worldId}
            articles={articles}
            onCreateMissing={onCreateMissing}
          />
        </TabsContent>
        <TabsContent value="notes" className="min-h-0 flex-1 overflow-y-auto">
          <NotesTab
            character={character}
            onChange={onChange}
            worldId={worldId}
            articles={articles}
            onCreateMissing={onCreateMissing}
          />
        </TabsContent>
        <TabsContent
          value="backstory"
          className={cn('flex min-h-0 flex-1 flex-col')}
        >
          <Textarea
            value={body}
            placeholder="Backstory, bonds, ideals, flaws — markdown with [[wiki links]]."
            className="h-full min-h-0 flex-1 resize-none rounded-none border-none font-mono text-sm shadow-none focus-visible:ring-0"
            onChange={(e) => onBodyChange(e.target.value)}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
