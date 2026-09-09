import { useEffect, useState } from 'react'
import { ChevronRight, Minus, Plus, Sparkles } from 'lucide-react'
import {
  EQUIP_SLOTS,
  EQUIP_SLOT_NAMES,
  SLOT_FIT_NAMES,
  attunementLimit,
  canAttune,
  fitsSlot,
  slotFor,
  withQty,
} from '#/lib/character'
import type { Character, EquipSlot, InventoryItem } from '#/lib/character'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { NumField } from '../NumField'
import { WikiText } from '../WikiText'
import { lbs } from './weight'

/** Legacy rows carry their count in the text ("Rations x5") — don't double up. */
export const QTY_IN_TEXT = /\s+x(\d+)\s*$/i

/**
 * Weight takes decimals — a potion is half a pound — which NumField can't do,
 * since it truncates to integers. Same draft-commit-on-blur behaviour.
 *
 * The `next !== value` guard is load-bearing: this field now mounts when a
 * drawer opens, and a commit on mount would rewrite an untouched row from a
 * bare YAML string into a mapping.
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
      aria-label="Weight per unit, in pounds"
      title="Weight per unit, in pounds"
      className="h-7 w-16 px-1.5 text-center text-sm"
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

/**
 * Quantity, with steppers either side. Bumping a potion count is the commonest
 * edit on this tab and wants to be one click, not select-type-Enter.
 *
 * Nothing fires unless the value actually changes, so opening a drawer and
 * closing it again can never promote a bare YAML row to a mapping.
 */
function QtyStepper({
  value,
  onCommit,
}: {
  value: number
  onCommit: (next: number) => void
}) {
  const step = (by: number) => {
    const next = Math.max(1, value + by)
    if (next !== value) onCommit(next)
  }

  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="One fewer"
        title="One fewer"
        disabled={value <= 1}
        className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-0.5 disabled:opacity-30 disabled:hover:bg-transparent"
        onClick={() => step(-1)}
      >
        <Minus className="size-3" />
      </button>
      <NumField
        value={value}
        min={1}
        className="w-12"
        aria-label="Quantity"
        onCommit={onCommit}
      />
      <button
        type="button"
        aria-label="One more"
        title="One more"
        className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-0.5"
        onClick={() => step(1)}
      >
        <Plus className="size-3" />
      </button>
    </span>
  )
}

/**
 * Where an item *can* be worn. Separate from `item.slot`, which is where it
 * currently *is* worn: unset means "guess from the name", which is what most
 * rows want.
 */
function SlotSelect({
  item,
  onChange,
}: {
  item: InventoryItem
  onChange: (next: InventoryItem) => void
}) {
  const fits = slotFor(item)

  return (
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
      aria-label="Where this item can be equipped"
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
        'bg-background text-foreground h-7 w-28 cursor-pointer rounded-md border px-1 text-xs',
        'hover:bg-muted focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none',
        item.slot ? 'border-primary/50 font-medium' : 'text-muted-foreground',
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
        onChange(next)
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
      {EQUIP_SLOTS.filter((s) => s !== 'ring2' && s !== 'offHand').map((s) => (
        <option key={s} value={s} className="bg-background text-foreground">
          {SLOT_FIT_NAMES[s]}
        </option>
      ))}
    </select>
  )
}

/**
 * One item: a single scannable line that opens a drawer of controls. The row
 * never learns its own index — the parent binds it into every callback, so a
 * row rendered from a filtered list physically cannot address the wrong item.
 */
export function GearItemRow({
  item,
  rowId,
  character,
  weighing,
  expanded,
  renaming,
  inAttacks,
  onToggle,
  onStartRename,
  onEndRename,
  onSetItem,
  onRemove,
  onAddToAttacks,
  onUnequip,
  worldId,
  articles,
  onCreateMissing,
  noteTitles,
  onOpenNote,
}: {
  item: InventoryItem
  /** For aria-controls, so the chevron points at the drawer it opens. */
  rowId: string
  character: Character
  weighing: boolean
  expanded: boolean
  renaming: boolean
  inAttacks: boolean
  onToggle: () => void
  onStartRename: () => void
  onEndRename: () => void
  onSetItem: (next: InventoryItem) => void
  onRemove: () => void
  onAddToAttacks: () => void
  onUnequip: () => void
  worldId: string
  articles?: Array<{ id: string; title: string }>
  onCreateMissing?: (title: string) => void
  noteTitles?: Array<string>
  onOpenNote?: (title: string) => void
}) {
  const total = item.qty * item.weight
  const attuneLimit = attunementLimit(character)
  // Already-attuned items are never blocked, so you can always release one.
  const attuneBlocked = !canAttune(character, item)

  return (
    <li className="border-b last:border-b-0">
      <div className="hover:bg-muted/40 @[75rem]/gear:px-3 @[75rem]/gear:py-1.5 flex items-center gap-2 px-2 py-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={rowId}
          aria-label={expanded ? 'Collapse item' : 'Expand item'}
          className="text-muted-foreground hover:text-foreground -m-1 shrink-0 rounded p-1"
          onClick={onToggle}
        >
          <ChevronRight
            className={cn(
              'size-3.5 transition-transform',
              expanded && 'rotate-90',
            )}
          />
        </button>

        {/* Name and its attunement mark travel together — a sparkle pushed to
            the far edge by the flex row reads as belonging to the weight. */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="@[75rem]/gear:text-[0.9375rem] min-w-0 truncate text-sm">
            <WikiText
              text={item.text}
              worldId={worldId}
              articles={articles}
              onCreateMissing={onCreateMissing}
              noteTitles={noteTitles}
              onOpenNote={onOpenNote}
            />
          </span>
          {item.attuned && (
            <Sparkles
              className="size-3 shrink-0 fill-current text-amber-500"
              aria-label="Attuned"
            />
          )}
        </span>

        {/* Only when it is more than one, and only when the name is not
            already saying it — otherwise the row reads "Rations x5  x5". */}
        {item.qty > 1 && !QTY_IN_TEXT.test(item.text) && (
          <span className="text-muted-foreground bg-muted shrink-0 rounded px-1.5 py-0.5 text-[11px] tabular-nums">
            &times;{item.qty}
          </span>
        )}

        {item.slot && (
          <span className="bg-primary/15 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            {SLOT_FIT_NAMES[item.slot]}
          </span>
        )}

        {weighing && total > 0 && (
          <span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
            {lbs(total)} lb
          </span>
        )}
      </div>

      {expanded && (
        <div id={rowId} className="bg-muted/20 space-y-2 border-t px-2 py-2">
          {renaming && (
            <Input
              autoFocus
              value={item.text}
              aria-label="Item name"
              className="h-7 w-full text-sm"
              onChange={(e) => onSetItem({ ...item, text: e.target.value })}
              onBlur={onEndRename}
              onKeyDown={(e) => e.key === 'Enter' && onEndRename()}
            />
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            {/* Quantity is not part of carry weight — you want to count
                potions whether or not you track pounds. */}
            <span className="text-muted-foreground flex items-center gap-1.5">
              Qty
              <QtyStepper
                value={item.qty}
                onCommit={(v) => onSetItem(withQty(item, v))}
              />
            </span>
            {weighing && (
              <label className="text-muted-foreground flex items-center gap-1.5">
                lb ea
                <WeightField
                  value={item.weight}
                  onCommit={(v) => onSetItem({ ...item, weight: v })}
                />
              </label>
            )}
            <label className="text-muted-foreground flex items-center gap-1.5">
              Fits
              <SlotSelect item={item} onChange={onSetItem} />
            </label>
          </div>

          {/* A legacy "x5" row keeps its suffix in the text — `withQty` syncs
              the two, so they can never disagree. Offered, never automatic:
              rewriting somebody's row on load is what this codebase doesn't
              do. */}
          {QTY_IN_TEXT.test(item.text) && (
            <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
              <span>Count is written into the name.</span>
              <button
                type="button"
                className="text-foreground underline underline-offset-2"
                title={`Remove the “x${item.qty}” from the name and keep the count in the quantity field`}
                onClick={() =>
                  onSetItem({
                    ...item,
                    text: item.text.replace(QTY_IN_TEXT, ''),
                    qty: item.qty,
                  })
                }
              >
                Move it into Qty
              </button>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onStartRename}
            >
              Rename
            </Button>
            {item.slot && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onUnequip}
              >
                Unequip
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={attuneBlocked}
              title={
                item.attuned
                  ? 'Attuned — click to release'
                  : attuneBlocked
                    ? `All ${attuneLimit} attunement slots are in use — release one first, or raise the limit in the rail`
                    : 'Attune to this item'
              }
              onClick={() => onSetItem({ ...item, attuned: !item.attuned })}
            >
              {item.attuned ? 'Release' : 'Attune'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={inAttacks}
              title={
                inAttacks
                  ? 'Already in attacks'
                  : 'Add to attacks (set bonus and damage on the Sheet tab)'
              }
              onClick={onAddToAttacks}
            >
              To attacks
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive ml-auto h-7 text-xs"
              onClick={onRemove}
            >
              Remove
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
