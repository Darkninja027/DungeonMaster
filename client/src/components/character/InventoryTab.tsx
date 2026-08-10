import { Fragment, useEffect, useState } from 'react'
import { Pencil, Plus, Sparkles, Swords, X } from 'lucide-react'
import {
  ENCUMBRANCE_LABELS,
  EQUIP_SLOTS,
  EQUIP_SLOT_NAMES,
  SLOT_FIT_NAMES,
  attunedCount,
  attunementLimit,
  canAttune,
  carriedWeight,
  carryCapacity,
  coinWeight,
  encumbrancePenalty,
  encumbranceThresholds,
  encumbranceTier,
  fitsSlot,
  inventoryItemName,
  slotFor,
  withQty,
} from '#/lib/character'
import type { Character, EquipSlot, InventoryItem } from '#/lib/character'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { NumField } from './NumField'
import { WikiText } from './WikiText'

/** Legacy rows carry their count in the text ("Rations x5") — don't double up. */
const QTY_IN_TEXT = /\s+x(\d+)\s*$/i

/** Trim trailing zeros so 0.50 reads as 0.5 and 2.00 as 2. */
const lbs = (n: number) => String(Math.round(n * 100) / 100)

/**
 * Weight takes decimals — a potion is half a pound — which NumField can't do,
 * since it truncates to integers. Same draft-commit-on-blur behaviour.
 */
function WeightField({
  value,
  onCommit,
}: {
  value: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(lbs(value))
  useEffect(() => setDraft(lbs(value)), [value])

  const commit = () => {
    const n = Number(draft)
    if (draft.trim() === '' || isNaN(n)) {
      setDraft(lbs(value))
      return
    }
    const next = Math.max(0, Math.round(n * 100) / 100)
    setDraft(lbs(next))
    if (next !== value) onCommit(next)
  }

  return (
    <Input
      value={draft}
      inputMode="decimal"
      title="Weight per unit, in pounds"
      className="h-7 w-14 px-1.5 text-center text-sm"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          e.currentTarget.blur()
        }
      }}
    />
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
          {tier === 'over'
            ? ' — speed 0'
            : penalty > 0
              ? ` — speed −${penalty} ft`
              : ''}
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
      <p className="text-muted-foreground text-xs">
        Encumbered over {encumbered} lb, heavily over {heavy} lb, capacity{' '}
        {capacity} lb (STR ×15).
        {coins > 0 && ` Coins add ${lbs(coins)} lb.`}
      </p>
    </div>
  )
}

/**
 * One row of the table. Column widths come from the parent grid so headers,
 * equipped rows and pack rows all stay in the same columns.
 */
function ItemRow({
  item,
  index,
  character,
  weighing,
  editing,
  setEditing,
  setItem,
  remove,
  addToAttacks,
  worldId,
  articles,
  onCreateMissing,
}: {
  item: InventoryItem
  index: number
  character: Character
  weighing: boolean
  editing: number | null
  setEditing: (i: number | null) => void
  setItem: (i: number, next: InventoryItem) => void
  remove: (i: number) => void
  addToAttacks: (item: InventoryItem) => void
  worldId: string
  articles?: Array<{ id: string; title: string }>
  onCreateMissing?: (title: string) => void
}) {
  const name = inventoryItemName(item.text).toLowerCase()
  const inAttacks = character.attacks.some(
    (a) => a.name.trim().toLowerCase() === name,
  )
  const total = item.qty * item.weight
  const fits = slotFor(item)
  const attuneLimit = attunementLimit(character)
  // Already-attuned items are never blocked, so you can always release one.
  const attuneBlocked = !canAttune(character, item)

  return (
    <div className="hover:bg-muted/40 col-span-full grid grid-cols-subgrid items-center px-3 py-1">
      {/* Name */}
      <div className="min-w-0">
        {editing === index ? (
          <Input
            autoFocus
            value={item.text}
            className="h-7 w-full text-sm"
            onChange={(e) => setItem(index, { ...item, text: e.target.value })}
            onBlur={() => setEditing(null)}
            onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
          />
        ) : (
          <span className="block truncate text-sm">
            <WikiText
              text={item.text}
              worldId={worldId}
              articles={articles}
              onCreateMissing={onCreateMissing}
            />
          </span>
        )}
      </div>

      {/* Slot: what it fits, and whether it's currently worn there. */}
      <div className="flex justify-center">
        <select
          // ring2/offHand collapse onto their canonical twin so a hand-edited
          // file still selects a listed option rather than showing blank.
          value={
            item.fits === undefined
              ? 'auto'
              : item.fits === null
                ? 'none'
                : item.fits === 'ring2'
                  ? 'ring1'
                  : item.fits === 'offHand'
                    ? 'mainHand'
                    : item.fits
          }
          title={
            item.slot
              ? `Worn: ${EQUIP_SLOT_NAMES[item.slot]}`
              : item.fits === undefined
                ? `Guessed from the name${fits ? '' : ' — no match, so not equippable'}. Pick a slot to override.`
                : 'Where this item can be equipped'
          }
          // Explicit bg/text, not bg-transparent: the native popup list
          // inherits these, and transparent renders unreadable in dark mode.
          className={cn(
            'bg-background text-foreground h-7 w-full cursor-pointer rounded-md border px-1 text-xs',
            'hover:bg-muted focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none',
            item.slot
              ? 'border-primary/50 font-medium'
              : 'text-muted-foreground',
            // Italic marks a guess rather than a choice the user made.
            item.fits === undefined && !item.slot && 'italic',
          )}
          onChange={(e) => {
            const v = e.target.value
            const next: InventoryItem = { ...item }
            if (v === 'auto') delete next.fits
            else next.fits = v === 'none' ? null : (v as EquipSlot)
            // Taking away the fit un-equips it; it can't stay worn somewhere
            // it no longer belongs.
            if (next.slot && !fitsSlot(next, next.slot)) next.slot = null
            setItem(index, next)
          }}
        >
          {/* The native popup doesn't inherit the trigger's colours on every
              platform, so each option carries them explicitly. */}
          <option className="bg-background text-foreground" value="auto">
            {fits ? SLOT_FIT_NAMES[fits] : '—'}
          </option>
          <option className="bg-background text-foreground" value="none">
            — (not wearable)
          </option>
          {/* ring2 and offHand are omitted: fitsSlot treats the ring pair and
              the hand pair as interchangeable, so listing both is noise. */}
          {EQUIP_SLOTS.filter((s) => s !== 'ring2' && s !== 'offHand').map(
            (s) => (
              <option
                key={s}
                value={s}
                className="bg-background text-foreground"
              >
                {SLOT_FIT_NAMES[s]}
              </option>
            ),
          )}
        </select>
      </div>

      {weighing ? (
        <>
          {/* Qty — hidden when the text already carries "x5". */}
          <div className="flex justify-center">
            {QTY_IN_TEXT.test(item.text) ? (
              <span className="text-muted-foreground text-xs">{item.qty}</span>
            ) : (
              <NumField
                value={item.qty}
                min={1}
                className="w-12"
                title="Quantity"
                onCommit={(v) => setItem(index, withQty(item, v))}
              />
            )}
          </div>
          <div className="flex justify-center">
            <WeightField
              value={item.weight}
              onCommit={(v) => setItem(index, { ...item, weight: v })}
            />
          </div>
          {/* Total only earns its place when qty multiplies the weight. */}
          <div className="text-muted-foreground text-right text-xs tabular-nums">
            {total > 0 && item.qty > 1 ? `${lbs(total)} lb` : ''}
          </div>
        </>
      ) : (
        <div className="col-span-3" />
      )}

      <div className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          className={cn(
            'rounded p-1',
            item.attuned
              ? 'text-amber-500 hover:text-amber-400'
              : attuneBlocked
                ? 'text-muted-foreground/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
          title={
            item.attuned
              ? 'Attuned — click to release'
              : attuneBlocked
                ? `All ${attuneLimit} attunement slots are in use — release one first, or raise the limit above`
                : 'Attune to this item'
          }
          disabled={attuneBlocked}
          onClick={() => setItem(index, { ...item, attuned: !item.attuned })}
        >
          <Sparkles
            className={cn('size-3.5', item.attuned && 'fill-current')}
          />
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1"
          title="Edit item"
          onClick={() => setEditing(editing === index ? null : index)}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            'rounded p-1',
            inAttacks
              ? 'text-muted-foreground/30'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
          title={
            inAttacks
              ? 'Already in attacks'
              : 'Add to attacks (set bonus and damage on the Sheet tab)'
          }
          disabled={inAttacks}
          onClick={() => addToAttacks(item)}
        >
          <Swords className="size-3.5" />
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive hover:bg-muted rounded p-1"
          title="Remove item"
          onClick={() => remove(index)}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

/**
 * Inventory rows are plain text with [[wiki links]] — a magic item can link
 * to its article ("[[Flametongue]] (attuned)"). Rows render as links and
 * switch to an input when edited; weapons can be promoted to the attacks
 * table on the sheet. Carry weight is opt-in per character: until it is on,
 * the quantity and weight columns stay hidden and rows save as bare strings.
 */
export function InventoryTab({
  character,
  onChange,
  worldId,
  articles,
  onCreateMissing,
}: {
  character: Character
  onChange: (next: Character) => void
  worldId: string
  articles?: Array<{ id: string; title: string }>
  onCreateMissing?: (title: string) => void
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const [newItem, setNewItem] = useState('')
  const weighing = character.encumbrance.enabled
  const attuned = attunedCount(character)
  const attuneLimit = attunementLimit(character)

  const setItem = (i: number, next: InventoryItem) =>
    onChange({
      ...character,
      inventory: character.inventory.map((item, j) => (j === i ? next : item)),
    })

  const setEncumbrance = (patch: Partial<Character['encumbrance']>) =>
    onChange({
      ...character,
      encumbrance: { ...character.encumbrance, ...patch },
    })

  const add = () => {
    const text = newItem.trim()
    if (!text) return
    const m = text.match(QTY_IN_TEXT)
    onChange({
      ...character,
      inventory: [
        ...character.inventory,
        { text, qty: m ? Math.max(1, Number(m[1])) : 1, weight: 0, slot: null },
      ],
    })
    setNewItem('')
  }

  const remove = (i: number) =>
    onChange({
      ...character,
      inventory: character.inventory.filter((_, j) => j !== i),
    })

  // Equipped first, so what you're wearing reads as a unit. Indices are kept
  // alongside because every mutation is index-addressed.
  const indexed = character.inventory.map((item, index) => ({ item, index }))
  const groups = [
    { label: 'Equipped', rows: indexed.filter((r) => r.item.slot !== null) },
    { label: 'Pack', rows: indexed.filter((r) => r.item.slot === null) },
  ].filter((g) => g.rows.length > 0)

  const addToAttacks = (item: InventoryItem) =>
    onChange({
      ...character,
      attacks: [
        ...character.attacks,
        { name: inventoryItemName(item.text), bonus: 0, damage: '' },
      ],
    })

  return (
    <div className="mx-auto max-w-4xl space-y-3 p-4">
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles
            className={cn(
              'size-4',
              attuned > 0
                ? 'fill-current text-amber-500'
                : 'text-muted-foreground',
            )}
          />
          <span>
            <strong>{attuned}</strong>
            <span className="text-muted-foreground"> / {attuneLimit}</span>{' '}
            attuned
          </span>
          {attuned >= attuneLimit && attuneLimit > 0 && (
            <span className="text-muted-foreground text-xs">
              (all slots in use)
            </span>
          )}
        </div>
        <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
          Slots
          <NumField
            value={character.attunementSlots}
            min={0}
            max={20}
            className="w-12"
            title="How many items this character may attune at once (3 by default)"
            onCommit={(v) => onChange({ ...character, attunementSlots: v })}
          />
        </label>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={weighing}
            onChange={(e) => setEncumbrance({ enabled: e.target.checked })}
          />
          Track carry weight
          <span className="text-muted-foreground text-xs">
            5e variant encumbrance
          </span>
        </label>
        {weighing && (
          <>
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={character.encumbrance.countCoins}
                onChange={(e) =>
                  setEncumbrance({ countCoins: e.target.checked })
                }
              />
              Count coins (50 to the pound)
            </label>
            <CarryMeter character={character} />
          </>
        )}
      </div>

      {character.inventory.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
          Empty pockets. Add items below — use [[wiki links]] for magic items so
          they link to their article.
        </p>
      ) : (
        <div
          className="grid overflow-hidden rounded-md border text-sm"
          // Name grows; the rest are fixed so every row lines up. Qty/weight/
          // total collapse to zero-width tracks when carry weight is off.
          style={{
            gridTemplateColumns: weighing
              ? 'minmax(0,1fr) 6.5rem 4rem 4.5rem 4rem 7rem'
              : 'minmax(0,1fr) 6.5rem 0 0 0 7rem',
          }}
        >
          <div className="text-muted-foreground bg-muted/50 col-span-full grid grid-cols-subgrid border-b px-3 py-1.5 text-[10px] font-medium tracking-wide uppercase">
            <span>Item</span>
            <span className="text-center">Slot</span>
            {weighing ? (
              <>
                <span className="text-center">Qty</span>
                <span className="text-center">lb ea</span>
                <span className="text-right">Total</span>
              </>
            ) : (
              <span className="col-span-3" />
            )}
            <span />
          </div>

          {groups.map(({ label, rows }) => (
            <Fragment key={label}>
              {rows.length > 0 && groups.length > 1 && (
                <div className="text-muted-foreground bg-muted/20 col-span-full border-b px-3 py-1 text-[10px] font-medium tracking-wide uppercase">
                  {label} ({rows.length})
                </div>
              )}
              {rows.map(({ item, index }) => (
                <ItemRow
                  key={index}
                  item={item}
                  index={index}
                  character={character}
                  weighing={weighing}
                  editing={editing}
                  setEditing={setEditing}
                  setItem={setItem}
                  remove={remove}
                  addToAttacks={addToAttacks}
                  worldId={worldId}
                  articles={articles}
                  onCreateMissing={onCreateMissing}
                />
              ))}
            </Fragment>
          ))}
        </div>
      )}
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
