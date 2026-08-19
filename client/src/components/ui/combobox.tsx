import * as React from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils'
import { Input } from '#/components/ui/input'

/**
 * A text input with a scrollable suggestion list.
 *
 * This exists because `<datalist>` doesn't work at our sizes. Its popup is a
 * native Chromium widget rendered outside the page, so it takes no CSS, and
 * past a few dozen options it stops scrolling usably — with ~600 spells it is
 * effectively unusable. Nothing about that is fixable from our side, so the
 * list has to be ours.
 *
 * **Free text is never blocked.** Everything the wizard writes is free text on
 * disk — a homebrew spell, a `[[wiki link]]`, something invented at the table —
 * so this suggests and never constrains. `onCommit` fires on Enter and on blur
 * with whatever was typed, matched or not, which is exactly what the `<Input>`
 * plus `<datalist>` it replaces did.
 *
 * Deliberately not a shadcn `Command`: that needs the `cmdk` dependency, and
 * the filtering here is one `includes` over a string array.
 */
export function Combobox({
  options,
  onCommit,
  value,
  placeholder,
  className,
  /** Shown above the list when nothing matches what was typed. */
  emptyLabel = 'No match — press Enter to use what you typed',
  id,
}: {
  options: Array<string>
  onCommit: (value: string) => void
  /**
   * Controlled mode. When given, the input shows this and `onCommit` fires on
   * every keystroke — the field *is* the stored value, as for "which feat did
   * you take". Omit it for the add-to-a-list shape, where the box clears itself
   * after each commit and `onCommit` only fires on Enter, blur or a click.
   */
  value?: string
  placeholder?: string
  className?: string
  emptyLabel?: string
  id?: string
}) {
  const controlled = value !== undefined
  const [draft, setDraft] = React.useState('')
  const query = controlled ? value : draft
  const setQuery = (next: string) => {
    if (controlled) onCommit(next)
    else setDraft(next)
  }
  const [open, setOpen] = React.useState(false)
  // Which row the arrow keys are on. -1 means "none", so Enter commits the
  // typed text rather than a suggestion the user never moved to.
  const [active, setActive] = React.useState(-1)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return options.slice(0, MAX_VISIBLE)
    // Prefix matches first — typing "fire" should reach Fire Bolt before
    // Wall of Fire, which is what makes the list feel like it is answering.
    const prefix: Array<string> = []
    const rest: Array<string> = []
    for (const option of options) {
      const lower = option.toLowerCase()
      if (lower.startsWith(q)) prefix.push(option)
      else if (lower.includes(q)) rest.push(option)
    }
    return [...prefix, ...rest].slice(0, MAX_VISIBLE)
  }, [options, query])

  const commit = (raw: string) => {
    const text = raw.trim()
    // Controlled fields keep what was typed — the value *is* the answer, so
    // clearing it would throw away the thing the caller is storing. Uncontrolled
    // ones are an add-to-a-list box and clear ready for the next entry.
    if (controlled) {
      if (text !== '') onCommit(text)
    } else {
      if (text !== '') onCommit(text)
      setDraft('')
    }
    setActive(-1)
    setOpen(false)
  }

  // Keep the highlighted row in view when arrowing past the fold.
  React.useEffect(() => {
    if (active < 0 || !listRef.current) return
    const row = listRef.current.children[active] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(active >= 0 ? (matches[active] ?? query) : query)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <PopoverPrimitive.Root
      open={open && matches.length > 0}
      onOpenChange={setOpen}
    >
      <PopoverPrimitive.Anchor asChild>
        <Input
          id={id}
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          className={className}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            // A click on a suggestion blurs the input before the row's own
            // handler runs, so ignore a blur landing inside the popup.
            if (e.relatedTarget && listRef.current?.contains(e.relatedTarget)) {
              return
            }
            setOpen(false)
            setActive(-1)
            // A controlled field has already reported every keystroke; blurring
            // it is not a commit, it is just leaving.
            if (!controlled) commit(e.currentTarget.value)
          }}
        />
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="bg-popover text-popover-foreground z-50 w-(--radix-popover-trigger-width) min-w-48 overflow-hidden rounded-md border shadow-md"
          // Focus must stay in the input: this is a text field with hints, not
          // a menu. Without this the popup steals focus and typing stops.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {matches.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1.5 text-xs">
              {emptyLabel}
            </p>
          ) : (
            <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
              {matches.map((option, i) => (
                <button
                  key={option}
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    'block w-full px-2 py-1 text-left text-sm',
                    i === active
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/60',
                  )}
                  // mousedown, not click: click fires after blur, which would
                  // already have committed the half-typed query instead.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    commit(option)
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * Cap on rendered rows. The full spell list is ~600 entries and the popup only
 * shows a handful at a time; rendering every match to scroll through is a lot
 * of DOM for rows nobody reads. Typing narrows it long before the cap bites,
 * which is why this is a plain slice rather than virtualisation.
 */
const MAX_VISIBLE = 100
