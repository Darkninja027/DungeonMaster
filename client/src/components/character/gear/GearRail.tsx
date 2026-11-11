import { useState } from 'react'
import {
  Circle,
  Footprints,
  Gem,
  HardHat,
  Hand,
  Shield,
  Shirt,
  Sword,
  Wind,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ENCUMBRANCE_LABELS,
  EQUIP_SLOTS,
  EQUIP_SLOT_NAMES,
  attunedCount,
  attunementLimit,
  carriedWeight,
  carryCapacity,
  coinWeight,
  encumbrancePenalty,
  encumbranceThresholds,
  encumbranceTier,
  equippedIn,
  fitsSlot,
  inventoryItemName,
} from '#/lib/character'
import type { Character, EquipSlot } from '#/lib/character'
import { cn } from '#/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { NumField } from '../NumField'
import { Panel, Pips } from '../Panel'
import { lbs } from './weight'

/**
 * Where each slot sits on the figure, as a percentage of the figure box. These
 * are eyeballed against the artwork in `Silhouette` — a helm hotspot belongs on
 * the helm — so moving a path there means moving the matching number here.
 *
 * Hotspots sit ON the body and the names sit in columns either side, which
 * only works because the rail is sized around this card (24-30rem) rather than
 * the card being squeezed into a sidebar. At the ~17rem rail this started at,
 * every real item name truncated to "Helm of Comp…".
 */
const HOTSPOTS: Record<EquipSlot, { x: number; y: number }> = {
  head: { x: 50, y: 11 }, // on the helm
  necklace: { x: 50, y: 19.5 }, // gorget
  cloak: { x: 27, y: 27 }, // left pauldron
  armor: { x: 50, y: 36 }, // centre of the cuirass
  belt: { x: 50, y: 51 }, // fauld
  offHand: { x: 15, y: 45 }, // beside the left vambrace
  mainHand: { x: 85, y: 45 }, // beside the right vambrace
  gloves: { x: 23, y: 57.5 }, // left gauntlet
  ring1: { x: 8, y: 57.5 }, // outboard of the left gauntlet
  ring2: { x: 92, y: 57.5 }, // outboard of the right gauntlet
  boots: { x: 50, y: 84 }, // sabatons
}

const SLOT_ICONS: Record<EquipSlot, LucideIcon> = {
  head: HardHat,
  necklace: Gem,
  cloak: Wind,
  armor: Shirt,
  gloves: Hand,
  belt: Circle,
  boots: Footprints,
  ring1: Circle,
  ring2: Circle,
  mainHand: Sword,
  offHand: Shield,
}

/**
 * An armoured figure, drawn as overlapping plate rather than one filled
 * outline: helm, gorget, pauldrons, cuirass, fauld, cuisses, sabatons. The
 * earlier version was a circle on a rounded rectangle and read as a smudge at
 * any size, which no amount of layout tuning could rescue.
 *
 * Everything is `currentColor` through two gradients, so the figure takes the
 * theme rather than pinning a grey, and the 120×240 viewBox is exactly 1:2 to
 * match the `aspect-1/2` box the hotspots are positioned in.
 */
function Silhouette() {
  return (
    <svg
      viewBox="0 0 120 240"
      aria-hidden="true"
      className="text-foreground block size-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Depth comes from a light-to-dark ramp down the body, not from a
            second flat fill. Both stops are currentColor at low alpha, so the
            figure inherits the theme instead of hard-coding a grey. */}
        <linearGradient id="dm-plate" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.15" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.09" />
        </linearGradient>
        <linearGradient id="dm-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.30" />
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.30" />
        </linearGradient>
      </defs>

      <g fill="url(#dm-plate)">
        {/* Helm: a rounded great-helm rather than a ball — the flat brow and
            tapered jaw are what make it read as armour at 20px tall. */}
        <path d="M60 8c-9 0-15 6-15 15v9c0 6 4 11 9 13l6 2 6-2c5-2 9-7 9-13v-9c0-9-6-15-15-15z" />
        {/* Gorget */}
        <path d="M52 46h16l2 7H50z" />
        {/* Pauldrons: the widest point, which gives the figure its shoulders */}
        <path d="M36 54c-7 2-11 7-12 14l-1 8 15 3 4-21z" />
        <path d="M84 54c7 2 11 7 12 14l1 8-15 3-4-21z" />
        {/* Cuirass: chest tapering to a waist, then flaring at the fauld */}
        <path d="M60 51c-10 0-17 4-20 11l-3 26 5 3 2 26h32l2-26 5-3-3-26c-3-7-10-11-20-11z" />
        {/* Upper arms */}
        <path d="M28 74 22 108l11 3 6-32z" />
        <path d="M92 74l6 34-11 3-6-32z" />
        {/* Vambraces */}
        <path d="M22 110h12l-2 20H23z" />
        <path d="M98 110H86l2 20h9z" />
        {/* Gauntlets */}
        <path d="M23 132h10l1 9-6 3-6-3z" />
        <path d="M97 132H87l-1 9 6 3 6-3z" />
        {/* Fauld / tassets over the hips */}
        <path d="M42 117h36l-2 12H44z" />
        {/* Cuisses and greaves — tapered, not rectangles */}
        <path d="M45 130h13l-2 38-1 30h-11l-1-30z" />
        <path d="M75 130H62l2 38 1 30h11l1-30z" />
        {/* Knee cops */}
        <path d="M44 166h13l-1 7H45z" />
        <path d="M76 166H63l1 7h11z" />
        {/* Sabatons */}
        <path d="M43 198h12l1 8H38z" />
        <path d="M77 198H65l-1 8h18z" />
      </g>

      {/* A few brighter edges catch the "light" and stop the figure reading
          as one flat mass. */}
      <g fill="url(#dm-edge)">
        <path d="M45 23c0-9 6-15 15-15v6c-6 0-9 4-9 9v7h-6z" />
        <path d="M40 62c3-7 10-11 20-11v5c-8 0-13 3-15 8z" />
        <path d="M45 130h13l-1 8h-11z" />
        <path d="M75 130H62l1 8h11z" />
      </g>

      {/* Visor slit and a centre ridge: two small marks that do more for
          "this is a knight" than any amount of extra outline. */}
      <g fill="currentColor" opacity="0.28">
        <rect x="50" y="26" width="20" height="3" rx="1.5" />
        <rect x="58.5" y="60" width="3" height="52" rx="1.5" />
      </g>
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
  onEquip,
  onHover,
}: {
  slot: EquipSlot
  character: Character
  onEquip: (index: number, slot: EquipSlot | null) => void
  /** Lets the panel caption name whatever the pointer is over. */
  onHover: (slot: EquipSlot | null) => void
}) {
  const worn = equippedIn(character.inventory, slot)
  const Icon = SLOT_ICONS[slot]
  const { x, y } = HOTSPOTS[slot]
  // Only things that actually fit — no rations in the main hand. An item held
  // in another slot is still offered; picking it moves it here.
  const choices = character.inventory
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.slot !== slot && fitsSlot(item, slot))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`${EQUIP_SLOT_NAMES[slot]}${worn ? ` — ${inventoryItemName(worn.text)}` : ' — empty'}`}
          aria-label={`${EQUIP_SLOT_NAMES[slot]}: ${worn ? inventoryItemName(worn.text) : 'empty'}`}
          style={{ left: `${x}%`, top: `${y}%` }}
          onMouseEnter={() => onHover(slot)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(slot)}
          onBlur={() => onHover(null)}
          className={cn(
            'absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border transition-all',
            'focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none',
            worn
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-border/80 bg-background/70 text-muted-foreground/60 border-dashed hover:border-solid hover:text-foreground',
            'hover:scale-110',
          )}
        >
          <Icon className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>{EQUIP_SLOT_NAMES[slot]}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {worn && (
          <>
            <DropdownMenuItem
              onSelect={() =>
                // findIndex, not indexOf: identity happens to work because
                // `worn` came off this same array, but the slot is the fact
                // we actually mean.
                onEquip(
                  character.inventory.findIndex((i) => i.slot === slot),
                  null,
                )
              }
            >
              Unequip {inventoryItemName(worn.text)}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {choices.length === 0 ? (
          <DropdownMenuItem disabled>
            Nothing fits — set an item&rsquo;s slot in the list
          </DropdownMenuItem>
        ) : (
          choices.map(({ item, index }) => (
            <DropdownMenuItem key={index} onSelect={() => onEquip(index, slot)}>
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
 * The two label columns beside the figure, split by which side of the body the
 * hotspot is on and ordered top to bottom, so a column runs down the figure in
 * step with it. Centre-line slots (head, necklace, armor, belt, boots) are
 * dealt out between the columns to keep the two roughly the same length.
 */
const LABELS_LEFT: Array<EquipSlot> = [
  'head',
  'cloak',
  'armor',
  'offHand',
  'gloves',
  'ring1',
]
const LABELS_RIGHT: Array<EquipSlot> = [
  'necklace',
  'mainHand',
  'belt',
  'ring2',
  'boots',
]

/**
 * One column of slot names beside the figure. Purely a label — the hotspot
 * on the figure is the control — but it highlights with its slot so hovering
 * either one lights both.
 */
function SlotLabels({
  slots,
  character,
  align,
  hovered,
  onHover,
}: {
  slots: Array<EquipSlot>
  character: Character
  align: 'left' | 'right'
  hovered: EquipSlot | null
  onHover: (slot: EquipSlot | null) => void
}) {
  return (
    <div className="flex flex-col justify-around py-1">
      {slots.map((slot) => {
        const worn = equippedIn(character.inventory, slot)
        return (
          <div
            key={slot}
            onMouseEnter={() => onHover(slot)}
            onMouseLeave={() => onHover(null)}
            className={cn(
              'min-w-0 rounded px-1 py-0.5 leading-tight transition-colors',
              align === 'right' ? 'text-right' : 'text-left',
              hovered === slot && 'bg-muted',
            )}
          >
            <div className="text-muted-foreground truncate text-[9px] tracking-wide uppercase">
              {EQUIP_SLOT_NAMES[slot]}
            </div>
            <div
              className={cn(
                'truncate text-[11px]',
                worn ? 'font-medium' : 'text-muted-foreground/50',
              )}
            >
              {worn ? inventoryItemName(worn.text) : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * A paper doll of what's worn where. Slots live on the inventory items
 * themselves (`item.slot`), so equipping is a single field write and deleting
 * an item can never orphan a slot. Assigning an occupied slot evicts the
 * incumbent back into the pack rather than losing it.
 */
function WornPanel({
  character,
  onEquip,
}: {
  character: Character
  onEquip: (index: number, slot: EquipSlot | null) => void
}) {
  // Whatever the pointer or keyboard focus is on, so the caption can name it
  // without a tooltip. Falls back to a count, so the line never goes blank and
  // the panel never changes height.
  const [hovered, setHovered] = useState<EquipSlot | null>(null)
  const worn = EQUIP_SLOTS.filter((s) => equippedIn(character.inventory, s))
  const hoveredItem = hovered
    ? equippedIn(character.inventory, hovered)
    : undefined

  const figure = (
    <div className="relative mx-auto aspect-1/2 w-full">
      <Silhouette />
      {EQUIP_SLOTS.map((slot) => (
        <SlotBox
          key={slot}
          slot={slot}
          character={character}
          onEquip={onEquip}
          onHover={setHovered}
        />
      ))}
    </div>
  )

  return (
    <Panel title="Worn">
      {/* Names either side of the figure, each column spaced to sit level with
          the plate it belongs to. The rail is sized around this — the labels
          are the whole point of the card, and a narrower rail truncates them
          to nothing. */}
      <div className="grid grid-cols-[minmax(6rem,1fr)_minmax(7rem,10rem)_minmax(6rem,1fr)] items-stretch gap-x-2">
        <SlotLabels
          slots={LABELS_LEFT}
          character={character}
          align="right"
          onHover={setHovered}
          hovered={hovered}
        />
        {figure}
        <SlotLabels
          slots={LABELS_RIGHT}
          character={character}
          align="left"
          onHover={setHovered}
          hovered={hovered}
        />
      </div>

      <div className="mt-1 flex items-baseline gap-2 border-t pt-1 text-xs">
        {hovered ? (
          <>
            <span className="text-muted-foreground shrink-0 text-[10px] tracking-wide uppercase">
              {EQUIP_SLOT_NAMES[hovered]}
            </span>
            <span
              className={cn(
                'ml-auto min-w-0 truncate',
                hoveredItem ? 'font-medium' : 'text-muted-foreground/60',
              )}
            >
              {hoveredItem ? inventoryItemName(hoveredItem.text) : 'empty'}
            </span>
          </>
        ) : (
          <>
            <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
              Equipped
            </span>
            <span className="text-muted-foreground ml-auto tabular-nums">
              {worn.length} / {EQUIP_SLOTS.length}
            </span>
          </>
        )}
      </div>
    </Panel>
  )
}

/**
 * A gauge, not a control — attunement is toggled per item, from the row. The
 * pips are wrapped so a stray click can't look like a broken button.
 */
function AttunementPanel({
  character,
  onSetSlots,
}: {
  character: Character
  onSetSlots: (v: number) => void
}) {
  const attuned = attunedCount(character)
  const limit = attunementLimit(character)

  return (
    <Panel title="Attunement">
      <div className="flex items-center gap-2">
        <span className="pointer-events-none">
          <Pips
            count={attuned}
            // A character with twenty slots would otherwise blow out the rail.
            total={Math.min(limit, 10)}
            onChange={() => {}}
            className="border-amber-500 bg-amber-500"

            gapClassName="gap-0.5"
          />
        </span>
        <span className="text-muted-foreground text-xs">
          <strong className="text-foreground">{attuned}</strong> of {limit}
        </span>
        <label className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
          Limit
          <NumField
            value={character.attunementSlots}
            min={0}
            max={20}
            className="w-12"
            title="How many items this character may attune at once (3 by default)"
            onCommit={onSetSlots}
          />
        </label>
      </div>
    </Panel>
  )
}

/** Capacity bar, tier badge and speed penalty. Only rendered when opted in. */
function CarryMeter({ character }: { character: Character }) {
  const carried = carriedWeight(character)
  const capacity = carryCapacity(character)
  const tier = encumbranceTier(character)
  const { encumbered, heavy } = encumbranceThresholds(character)
  const penalty = encumbrancePenalty(tier)
  const coins = coinWeight(character)
  const pct = capacity > 0 ? Math.min(100, (carried / capacity) * 100) : 0

  const barColor =
    tier === 'over'
      ? 'bg-destructive'
      : tier === 'heavily-encumbered'
        ? 'bg-orange-500'
        : tier === 'encumbered'
          ? 'bg-yellow-500'
          : 'bg-primary'

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>
          <strong>{lbs(carried)}</strong>
          <span className="text-muted-foreground"> / {capacity} lb</span>
        </span>
        <span
          className={cn(
            'text-xs',
            tier === 'none' ? 'text-muted-foreground' : 'font-medium',
            tier === 'over' && 'text-destructive',
          )}
        >
          {ENCUMBRANCE_LABELS[tier]}
        </span>
      </div>
      {/* Ticks mark the STR×5 and STR×10 thresholds along the fill. */}
      <div className="bg-muted relative h-2 overflow-hidden rounded-full">
        <div
          className={cn('h-full transition-all', barColor)}
          style={{ width: `${pct}%` }}
        />
        {capacity > 0 &&
          [encumbered, heavy].map((t) => (
            <span
              key={t}
              className="bg-background/70 absolute inset-y-0 w-px"
              style={{ left: `${(t / capacity) * 100}%` }}
            />
          ))}
      </div>
      <p
        className="text-muted-foreground text-xs"
        title={`Encumbered over ${encumbered} lb, heavily over ${heavy} lb, capacity ${capacity} lb (STR ×15).`}
      >
        {tier === 'over'
          ? 'Speed 0'
          : penalty > 0
            ? `Speed −${penalty} ft`
            : `Over ${encumbered} lb to encumber`}
        {coins > 0 && ` · coins ${lbs(coins)} lb`}
      </p>
    </div>
  )
}

function CarryPanel({
  character,
  onSetEncumbrance,
}: {
  character: Character
  onSetEncumbrance: (patch: Partial<Character['encumbrance']>) => void
}) {
  const weighing = character.encumbrance.enabled

  return (
    <Panel title="Carry">
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={weighing}
            onChange={(e) => onSetEncumbrance({ enabled: e.target.checked })}
          />
          Track carry weight
        </label>
        {weighing && (
          <>
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={character.encumbrance.countCoins}
                onChange={(e) =>
                  onSetEncumbrance({ countCoins: e.target.checked })
                }
              />
              Count coins (50/lb)
            </label>
            <CarryMeter character={character} />
          </>
        )}
      </div>
    </Panel>
  )
}

const COINS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const

/** Rough metal colours, so the purse reads without having to parse the labels. */
const COIN_DOT: Record<(typeof COINS)[number], string> = {
  pp: 'bg-slate-300',
  gp: 'bg-amber-400',
  ep: 'bg-zinc-400',
  sp: 'bg-gray-300',
  cp: 'bg-orange-700',
}

function PursePanel({
  character,
  onSetCoin,
}: {
  character: Character
  onSetCoin: (coin: (typeof COINS)[number], v: number) => void
}) {
  const total = COINS.reduce((sum, c) => sum + character.currency[c], 0)

  return (
    <Panel title="Purse">
      <div className="space-y-1">
        {COINS.map((coin) => (
          <div key={coin} className="flex items-center gap-1.5">
            <span
              className={cn('size-2 shrink-0 rounded-full', COIN_DOT[coin])}
            />
            <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
              {coin}
            </span>
            <NumField
              value={character.currency[coin]}
              min={0}
              className="ml-auto w-16"
              aria-label={`${coin} coins`}
              onCommit={(v) => onSetCoin(coin, v)}
            />
          </div>
        ))}
        <div className="text-muted-foreground flex items-baseline gap-2 border-t pt-1 text-xs">
          <span>{total} coins</span>
          {character.encumbrance.enabled &&
            character.encumbrance.countCoins && (
              <span className="ml-auto tabular-nums">
                {lbs(coinWeight(character))} lb
              </span>
            )}
        </div>
      </div>
    </Panel>
  )
}

/**
 * The right-hand rail: facts about the character rather than about any one
 * row — what's worn, what's attuned, what it all weighs, and the purse.
 */
export function GearRail({
  character,
  onEquip,
  onSetSlots,
  onSetEncumbrance,
  onSetCoin,
}: {
  character: Character
  onEquip: (index: number, slot: EquipSlot | null) => void
  onSetSlots: (v: number) => void
  onSetEncumbrance: (patch: Partial<Character['encumbrance']>) => void
  onSetCoin: (coin: (typeof COINS)[number], v: number) => void
}) {
  return (
    <aside className="@container/rail space-y-3">
      <WornPanel character={character} onEquip={onEquip} />
      <AttunementPanel character={character} onSetSlots={onSetSlots} />
      <CarryPanel character={character} onSetEncumbrance={onSetEncumbrance} />
      <PursePanel character={character} onSetCoin={onSetCoin} />
    </aside>
  )
}
