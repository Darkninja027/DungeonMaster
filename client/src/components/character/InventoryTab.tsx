import { useState } from 'react'
import { Pencil, Plus, Swords, X } from 'lucide-react'
import { inventoryItemName } from '#/lib/character'
import type { Character } from '#/lib/character'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { WikiText } from './WikiText'

/**
 * Inventory rows are plain text with [[wiki links]] — a magic item can link
 * to its article ("[[Flametongue]] (attuned)"). Rows render as links and
 * switch to an input when edited; weapons can be promoted to the attacks
 * table on the sheet.
 */
export function InventoryTab({
  character,
  onChange,
  worldId,
  articles,
}: {
  character: Character
  onChange: (next: Character) => void
  worldId: string
  articles?: Array<{ id: string; title: string }>
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const [newItem, setNewItem] = useState('')

  const setRow = (i: number, text: string) =>
    onChange({
      ...character,
      inventory: character.inventory.map((row, j) => (j === i ? text : row)),
    })

  const add = () => {
    const text = newItem.trim()
    if (!text) return
    onChange({ ...character, inventory: [...character.inventory, text] })
    setNewItem('')
  }

  const inAttacks = (row: string) => {
    const name = inventoryItemName(row).toLowerCase()
    return character.attacks.some((a) => a.name.trim().toLowerCase() === name)
  }

  const addToAttacks = (row: string) =>
    onChange({
      ...character,
      attacks: [
        ...character.attacks,
        { name: inventoryItemName(row), bonus: 0, damage: '' },
      ],
    })

  return (
    <div className="mx-auto max-w-2xl space-y-2 p-4">
      {character.inventory.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Empty pockets. Add items below — use [[wiki links]] for magic items so
          they link to their article.
        </p>
      )}
      <ul className="divide-y rounded-md border">
        {character.inventory.map((row, i) => (
          <li key={i} className="group flex items-center gap-1.5 px-3 py-1.5">
            {editing === i ? (
              <Input
                autoFocus
                value={row}
                className="h-7 flex-1 text-sm"
                onChange={(e) => setRow(i, e.target.value)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm">
                <WikiText text={row} worldId={worldId} articles={articles} />
              </span>
            )}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
              title="Edit item"
              onClick={() => setEditing(editing === i ? null : i)}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              className={cn(
                'text-muted-foreground shrink-0 opacity-0',
                inAttacks(row)
                  ? 'group-hover:opacity-30'
                  : 'hover:text-foreground group-hover:opacity-100',
              )}
              title={
                inAttacks(row)
                  ? 'Already in attacks'
                  : 'Add to attacks (set bonus and damage on the Sheet tab)'
              }
              disabled={inAttacks(row)}
              onClick={() => addToAttacks(row)}
            >
              <Swords className="size-3.5" />
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100"
              title="Remove item"
              onClick={() =>
                onChange({
                  ...character,
                  inventory: character.inventory.filter((_, j) => j !== i),
                })
              }
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <Input
          value={newItem}
          placeholder="Add item — e.g. [[Flametongue]] (attuned)"
          className="h-8 text-sm"
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Button
          size="sm"
          className="h-8"
          disabled={!newItem.trim()}
          onClick={add}
        >
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
    </div>
  )
}
