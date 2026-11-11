import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { equipItem, inventoryItemName } from '#/lib/character'
import type { Character, EquipSlot, InventoryItem } from '#/lib/character'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { GearItemRow } from './GearItemRow'
import { GearRail } from './GearRail'

type Filter = 'all' | 'worn' | 'pack' | 'attuned'

/**
 * A trailing count as a person types it in the add box: "x3", "x 3", "×3",
 * and the bare "3" of "Torches 3". Looser than `QTY_IN_TEXT` in `lib/character`
 * on purpose — that one decides what serializes as an implied quantity and
 * must stay strict, while this one only has to read what someone just typed.
 *
 * Requires a space before a bare number so "10 Foot Pole" and "Potion of
 * Healing" survive; a name that genuinely ends in a number ("Wand of Wonder 2")
 * is the rare cost, and the Rename field is right there.
 */
const TYPED_QTY = /\s+(?:[x×]\s*)?(\d+)\s*$/i

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'worn', label: 'Worn' },
  { id: 'pack', label: 'Pack' },
  { id: 'attuned', label: 'Attuned' },
]

/**
 * An item paired with where it lives in `character.inventory`.
 *
 * Every mutation on this tab is index-addressed, so the index has to survive
 * searching and filtering. It is built once, straight off `character.inventory`,
 * and carried through every transform — never re-derived from a filtered array,
 * which would address the wrong row the moment a search narrowed the list.
 */
interface IndexedItem {
  item: InventoryItem
  index: number
}

/**
 * Everything a character carries, in one tab: the list on the left, and on the
 * right the facts that are true about the character rather than about any one
 * row — the paper doll, attunement, carry weight and the purse.
 *
 * Inventory rows are plain text with [[wiki links]], so a magic item can link
 * to its article ("[[Flametongue]] (attuned)"). Rows collapse to a single line
 * and open a drawer of controls. Quantity is always editable; carry weight is
 * opt-in per character, and until it is on the weight fields stay hidden and an
 * untouched row still saves as a bare string.
 */
export function GearTab({
  character,
  onChange,
  worldId,
  articles,
  onCreateMissing,
  noteTitles,
  onOpenNote,
}: {
  character: Character
  onChange: (next: Character) => void
  worldId: string
  articles?: Array<{ id: string; title: string }>
  onCreateMissing?: (title: string) => void
  noteTitles?: Array<string>
  onOpenNote?: (title: string) => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  // An inventory index, not a position in the rendered list. Single-open: the
  // drawer is an editing surface, and ten open at once would undo the whole
  // point of collapsing rows to one line.
  const [open, setOpen] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [newItem, setNewItem] = useState('')

  const weighing = character.encumbrance.enabled

  const indexed: Array<IndexedItem> = useMemo(
    () => character.inventory.map((item, index) => ({ item, index })),
    [character.inventory],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    // Match the raw text, not the cleaned name: typing "flame" should find
    // "[[Flametongue]] (attuned)".
    const matching = q
      ? indexed.filter(({ item }) => item.text.toLowerCase().includes(q))
      : indexed
    if (filter === 'worn') return matching.filter((r) => r.item.slot !== null)
    if (filter === 'pack') return matching.filter((r) => r.item.slot === null)
    if (filter === 'attuned') return matching.filter((r) => r.item.attuned)
    return matching
  }, [indexed, query, filter])

  // Counts come off the unfiltered list so they don't jitter as you type.
  const counts: Record<Filter, number> = {
    all: indexed.length,
    worn: indexed.filter((r) => r.item.slot !== null).length,
    pack: indexed.filter((r) => r.item.slot === null).length,
    attuned: indexed.filter((r) => r.item.attuned).length,
  }

  const setItem = (i: number, next: InventoryItem) =>
    onChange({
      ...character,
      inventory: character.inventory.map((item, j) => (j === i ? next : item)),
    })

  const remove = (i: number) => {
    // Not "if open === i": every index above `i` shifts down by one, so any
    // open drawer is now pointing at a different item.
    setOpen(null)
    setRenaming(null)
    onChange({
      ...character,
      inventory: character.inventory.filter((_, j) => j !== i),
    })
  }

  const equip = (i: number, slot: EquipSlot | null) =>
    onChange({
      ...character,
      inventory: equipItem(character.inventory, i, slot),
    })

  const add = () => {
    const typed = newItem.trim()
    if (!typed) return
    // Deliberately looser than the canonical QTY_IN_TEXT: someone typing into
    // this box writes "Healing Potion x 3" or "×3" as readily as "x3". The
    // count is lifted into `qty` and stripped from the name, so the row ends
    // up clean rather than carrying a suffix it has to keep in sync forever.
    // QTY_IN_TEXT itself must stay strict — serialization decides what counts
    // as an *implied* quantity by it.
    const m = typed.match(TYPED_QTY)
    const text = m ? typed.slice(0, m.index).trimEnd() : typed
    const qty = m ? Math.max(1, Number(m[1])) : 1
    if (!text) return
    // The new row lands at the end, so open it ready for a weight.
    setOpen(character.inventory.length)
    onChange({
      ...character,
      inventory: [...character.inventory, { text, qty, weight: 0, slot: null }],
    })
    setNewItem('')
  }

  const addToAttacks = (item: InventoryItem) =>
    onChange({
      ...character,
      attacks: [
        ...character.attacks,
        { name: inventoryItemName(item.text), bonus: 0, damage: '' },
      ],
    })

  // Deliberately not `mx-auto max-w-*` like the reading tabs: this is a
  // two-pane workspace, so it takes the width it is given rather than floating
  // in the middle with the rail squeezed.
  return (
    <div className="@container/gear p-4">
      {/* The rail steps up with the available width rather than staying a
          fixed sliver on a wide window. `max-w-450` only stops the list
          becoming an unreadably long line on an ultrawide. */}
      <div
        className={cn(
          'mx-auto grid max-w-450 grid-cols-1 gap-4',
          // The rail is wider than a sidebar normally wants because the Worn
          // card carries slot names either side of the figure; below ~22rem
          // those labels truncate to nothing, which is what the earlier
          // narrow rail did.
          '@[58rem]/gear:grid-cols-[minmax(0,1fr)_24rem]',
          '@[75rem]/gear:grid-cols-[minmax(0,1fr)_27rem]',
          '@[100rem]/gear:grid-cols-[minmax(0,1fr)_30rem]',
        )}
      >
        {/* Capped so a row's name and its weight stay near each other on an
            ultrawide; the rail takes the space this gives back. */}
        <div className="max-w-6xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                placeholder="Search gear…"
                aria-label="Search gear"
                className="h-8 pl-7 text-sm"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={cn(
                    'rounded px-2 py-1 text-xs',
                    filter === f.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label} ({counts[f.id]})
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1.5">
            <Input
              value={newItem}
              placeholder="Add item — e.g. Healing Potion x3, or [[Flametongue]] (attuned)"
              aria-label="Add item"
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

          {character.inventory.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
              Empty pockets. Add items above — use [[wiki links]] for magic
              items so they link to their article.
            </p>
          ) : shown.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
              Nothing matches.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-md border">
              {shown.map(({ item, index }) => (
                <GearItemRow
                  // Keyed by index *and* text: a delete shifts every later
                  // index down, and a bare index key would let the row below
                  // inherit a stale rename or weight draft.
                  key={`${index}:${item.text}`}
                  rowId={`gear-item-${index}`}
                  item={item}
                  character={character}
                  weighing={weighing}
                  expanded={open === index}
                  renaming={renaming === index}
                  inAttacks={character.attacks.some(
                    (a) =>
                      a.name.trim().toLowerCase() ===
                      inventoryItemName(item.text).toLowerCase(),
                  )}
                  onToggle={() => {
                    setOpen(open === index ? null : index)
                    setRenaming(null)
                  }}
                  onStartRename={() => setRenaming(index)}
                  onEndRename={() => setRenaming(null)}
                  // The index is bound here, so the row can never address
                  // another item even when the list is filtered.
                  onSetItem={(next) => setItem(index, next)}
                  onRemove={() => remove(index)}
                  onAddToAttacks={() => addToAttacks(item)}
                  onUnequip={() => equip(index, null)}
                  worldId={worldId}
                  articles={articles}
                  onCreateMissing={onCreateMissing}
                  noteTitles={noteTitles}
                  onOpenNote={onOpenNote}
                />
              ))}
            </ul>
          )}
        </div>

        <GearRail
          character={character}
          onEquip={equip}
          onSetSlots={(v) => onChange({ ...character, attunementSlots: v })}
          onSetEncumbrance={(patch) =>
            onChange({
              ...character,
              encumbrance: { ...character.encumbrance, ...patch },
            })
          }
          onSetCoin={(coin, v) =>
            onChange({
              ...character,
              currency: { ...character.currency, [coin]: v },
            })
          }
        />
      </div>
    </div>
  )
}
