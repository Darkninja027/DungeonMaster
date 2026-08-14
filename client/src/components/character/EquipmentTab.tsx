import {
  Circle,
  Footprints,
  Gem,
  HardHat,
  Hand,
  Shield,
  Shirt,
  Sparkles,
  Sword,
  Wind,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  EQUIP_SLOTS,
  EQUIP_SLOT_NAMES,
  attunedCount,
  attunementLimit,
  equipItem,
  equippedIn,
  fitsSlot,
  inventoryItemName,
} from '#/lib/character'
import type { Character, EquipSlot, InventoryItem } from '#/lib/character'
import { cn } from '#/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

const lbs = (n: number) => String(Math.round(n * 100) / 100)

/**
 * Where each slot sits around the silhouette, as percentages of the figure
 * box. Left/right pairs mirror so the doll reads symmetrically.
 */
const SLOT_LAYOUT: Record<
  EquipSlot,
  { top: string; left: string; icon: LucideIcon }
> = {
  head: { top: '0%', left: '50%', icon: HardHat },
  cloak: { top: '13%', left: '15%', icon: Wind },
  necklace: { top: '13%', left: '85%', icon: Gem },
  offHand: { top: '35%', left: '15%', icon: Shield },
  armor: { top: '35%', left: '50%', icon: Shirt },
  mainHand: { top: '35%', left: '85%', icon: Sword },
  gloves: { top: '55%', left: '15%', icon: Hand },
  belt: { top: '55%', left: '50%', icon: Circle },
  ring1: { top: '75%', left: '15%', icon: Circle },
  ring2: { top: '75%', left: '85%', icon: Circle },
  boots: { top: '92%', left: '50%', icon: Footprints },
}

/** A neutral humanoid outline; currentColor so it themes for free. */
function Silhouette() {
  return (
    <svg
      viewBox="0 0 100 200"
      aria-hidden="true"
      className="text-muted-foreground/15 absolute inset-0 size-full"
      fill="currentColor"
    >
      <circle cx="50" cy="22" r="15" />
      <path d="M50 40c-13 0-22 7-24 20l-4 34h11l2 76h30l2-76h11l-4-34c-2-13-11-20-24-20z" />
      <path d="M24 62 12 104l9 3 12-38zM76 62l12 42-9 3-12-38z" />
    </svg>
  )
}

/**
 * One slot box: shows what's equipped there, or an empty outline. Clicking
 * opens a picker of everything not already worn somewhere else.
 */
function SlotBox({
  slot,
  character,
  onChange,
  className,
  style,
}: {
  slot: EquipSlot
  character: Character
  onChange: (next: Character) => void
  className?: string
  style?: React.CSSProperties
}) {
  const worn = equippedIn(character.inventory, slot)
  const Icon = SLOT_LAYOUT[slot].icon
  // Only things that actually fit — no rations in the main hand. An item held
  // in another slot is still offered; picking it moves it here.
  const choices = character.inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.slot !== slot && fitsSlot(item, slot))

  const setSlot = (index: number, next: EquipSlot | null) =>
    onChange({
      ...character,
      inventory: equipItem(character.inventory, index, next),
    })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          style={style}
          title={`${EQUIP_SLOT_NAMES[slot]}${worn ? ` — ${inventoryItemName(worn.text)}` : ' — empty'}`}
          className={cn(
            'bg-background/90 flex w-28 flex-col items-start gap-0.5 rounded-md border px-1.5 py-1 text-left backdrop-blur-[1px] transition-colors',
            worn
              ? 'border-primary/50 hover:border-primary'
              : 'border-dashed hover:border-solid',
            className,
          )}
        >
          <span className="text-muted-foreground flex items-center gap-1 text-[10px] leading-none">
            <Icon className="size-2.5 shrink-0" />
            <span className="truncate">{EQUIP_SLOT_NAMES[slot]}</span>
          </span>
          <span
            className={cn(
              'w-full truncate text-[11px] leading-tight',
              worn ? 'font-medium' : 'text-muted-foreground/60 italic',
            )}
          >
            {worn ? inventoryItemName(worn.text) : 'empty'}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>{EQUIP_SLOT_NAMES[slot]}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {worn && (
          <>
            <DropdownMenuItem
              onSelect={() => setSlot(character.inventory.indexOf(worn), null)}
            >
              Unequip {inventoryItemName(worn.text)}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {choices.length === 0 ? (
          <DropdownMenuItem disabled>
            Nothing fits — set an item&rsquo;s slot on the Inventory tab
          </DropdownMenuItem>
        ) : (
          choices.map(({ item, index }) => (
            <DropdownMenuItem key={index} onSelect={() => setSlot(index, slot)}>
              <span className="truncate">{inventoryItemName(item.text)}</span>
              {item.slot && (
                <span className="text-muted-foreground ml-auto pl-2 text-xs">
                  {EQUIP_SLOT_NAMES[item.slot].toLowerCase()}
                </span>
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A paper doll of what's worn where. Slots live on the inventory items
 * themselves (`item.slot`), so equipping is a single field write and deleting
 * an item can never orphan a slot. Assigning an occupied slot evicts the
 * incumbent back into the pack rather than losing it.
 *
 * The silhouette needs room, so below `sm` the whole thing falls back to a
 * plain stacked grid of the same slot boxes.
 */
export function EquipmentTab({
  character,
  onChange,
}: {
  character: Character
  onChange: (next: Character) => void
}) {
  const worn: Array<InventoryItem> = character.inventory.filter(
    (i) => i.slot !== null,
  )
  const wornWeight = worn.reduce((sum, i) => sum + i.qty * i.weight, 0)

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      {character.inventory.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing to equip yet — add items on the Inventory tab first.
        </p>
      )}

      {/* Paper doll: absolute slot boxes around a centred silhouette. */}
      <div className="hidden justify-center sm:flex">
        <div className="relative h-110 w-115">
          {/* The figure occupies the middle third; slot boxes flank it. */}
          <div className="absolute inset-y-2 left-1/2 w-32.5 -translate-x-1/2">
            <Silhouette />
          </div>
          {EQUIP_SLOTS.map((slot) => (
            <SlotBox
              key={slot}
              slot={slot}
              character={character}
              onChange={onChange}
              className="absolute -translate-x-1/2"
              style={{
                top: SLOT_LAYOUT[slot].top,
                left: SLOT_LAYOUT[slot].left,
              }}
            />
          ))}
        </div>
      </div>

      {/* Narrow-window fallback — same boxes, no figure. */}
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        {EQUIP_SLOTS.map((slot) => (
          <SlotBox
            key={slot}
            slot={slot}
            character={character}
            onChange={onChange}
            className="w-full"
          />
        ))}
      </div>

      <div className="rounded-md border">
        <div className="flex items-baseline justify-between border-b px-3 py-1.5">
          <span className="text-sm font-medium">Equipped ({worn.length})</span>
          <span className="text-muted-foreground flex items-baseline gap-3 text-xs">
            <span>
              {attunedCount(character)} / {attunementLimit(character)} attuned
            </span>
            {character.encumbrance.enabled && wornWeight > 0 && (
              <span>{lbs(wornWeight)} lb worn</span>
            )}
          </span>
        </div>
        {worn.length === 0 ? (
          <p className="text-muted-foreground px-3 py-2 text-sm">
            Nothing equipped. Click a slot to put something on.
          </p>
        ) : (
          <ul className="divide-y">
            {worn.map((item) => (
              <li
                key={item.slot}
                className="flex items-center gap-2 px-3 py-1.5 text-sm"
              >
                <span className="text-muted-foreground w-24 shrink-0 text-xs">
                  {EQUIP_SLOT_NAMES[item.slot!]}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
                  {inventoryItemName(item.text)}
                  {item.attuned && (
                    <Sparkles
                      className="size-3 shrink-0 fill-current text-amber-500"
                      aria-label="Attuned"
                    />
                  )}
                </span>
                {character.encumbrance.enabled && item.weight > 0 && (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {lbs(item.qty * item.weight)} lb
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
