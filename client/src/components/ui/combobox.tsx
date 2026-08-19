import * as React from 'react'

import { cn } from '#/lib/utils'
import { Input } from '#/components/ui/input'

/**
 * How many suggestion lists are open right now.
 *
 * Escape has to mean "close the list" when a list is up and "close the dialog"
 * otherwise, and the two handlers can't negotiate through the event. Radix's
 * `DismissableLayer` binds Escape on the *document* with `{ capture: true }`
 * when the dialog mounts — long before any list opens — and DOM capture runs
 * document-inwards in registration order, so it always sees the key first and
 * reads `defaultPrevented` before anything nearer the input could set it. No
 * listener the Combobox adds, at any node or phase, can get in front of it.
 *
 * So the answer is out-of-band: the Combobox records that it is open, and
 * `DialogContent` asks before dismissing. A counter rather than a boolean
 * because a step can hold several comboboxes, and a module global rather than
 * context because the check happens inside a Radix callback that no provider of
 * ours wraps.
 */
let openListCount = 0

/** Whether any `Combobox` currently has its suggestion list open. */
export function isComboboxListOpen() {
  return openListCount > 0
}

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
 *
 * Deliberately **not** a Radix `Popover` either, though it was one until this
 * started flashing open-and-shut in the character wizard. Every Combobox here
 * lives inside a *modal* `Dialog`, whose `FocusScope` installs a document-level
 * `focusin` listener and drags focus back the moment it lands outside the
 * dialog's own DOM node. A portalled popup is outside that node, so pointing at
 * a suggestion bounced focus straight back to the input, the input blurred, and
 * the list unmounted before `mousedown` could pick anything — committing the
 * half-typed query on the way out. Radix offers no escape from that:
 * `onInteractOutside` and friends silence the *popover's* dismissal, not the
 * *dialog's* focus trap.
 *
 * Rendering the list as an absolutely-positioned sibling of the input, in the
 * same subtree, makes all of it go away — the dialog's focus trap sees the list
 * as inside itself, `relatedTarget` containment checks actually work, and the
 * list follows the input on scroll for free. The only thing given up is
 * escaping `overflow`, which the wizard's `ScrollArea` imposes: horizontally
 * there is no problem, since every call site sits in a column far wider than
 * the popup, and vertically `flipUp` below handles it.
 */
export function Combobox({
  options,
  onCommit,
  value,
  placeholder,
  className,
  /** Shown in place of the list when nothing matches what was typed. */
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
  // Whether the list should open upwards. Measured when the list is revealed
  // rather than on every render: the wizard's `ScrollArea` clips, so a box near
  // the bottom of the pane has to open into the space above it instead.
  const [flipUp, setFlipUp] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)
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

  // One flag for "is there a list of suggestions on screen", so nothing can
  // believe the list is open while it isn't. The popover version derived this
  // for rendering but kept `open` as the thing every handler wrote to, which
  // let Escape leave the two disagreeing.
  const showing = open && matches.length > 0
  const listId = `${id ?? 'combobox'}-listbox`

  const reveal = () => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) {
      const below = window.innerHeight - rect.bottom
      setFlipUp(below < POPUP_MAX_HEIGHT && rect.top > below)
    }
    setOpen(true)
  }

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

  // Publish "a list is open" for the enclosing dialog's Escape guard, and be
  // certain to withdraw it on unmount — a step that navigates away mid-type
  // would otherwise leave Escape permanently swallowed.
  React.useEffect(() => {
    if (!open) return
    openListCount += 1
    return () => {
      openListCount -= 1
    }
  }, [open])

  // Keep the highlighted row in view when arrowing past the fold.
  React.useEffect(() => {
    if (active < 0 || !listRef.current) return
    const row = listRef.current.children[active] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      reveal()
      setActive((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(active >= 0 ? (matches[active] ?? query) : query)
    } else if (e.key === 'Escape') {
      // Just close the list. Stopping the key from also closing the dialog is
      // `DialogContent`'s job, via `isComboboxListOpen` — see the note on
      // `openListCount` above for why it can't be done from here.
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-expanded={showing}
        aria-autocomplete="list"
        aria-controls={showing ? listId : undefined}
        aria-activedescendant={
          active >= 0 ? `${id ?? 'combobox'}-option-${active}` : undefined
        }
        value={query}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(-1)
          reveal()
        }}
        onFocus={reveal}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          // A click on a suggestion blurs the input before the row's own
          // handler runs, so ignore a blur landing anywhere inside this
          // combobox. Checking the whole wrapper rather than just the list is
          // deliberate: the focus target can be a wrapper element rather than
          // the row itself, which is precisely what the portalled version got
          // wrong.
          if (e.relatedTarget && wrapRef.current?.contains(e.relatedTarget)) {
            return
          }
          setOpen(false)
          setActive(-1)
          // A controlled field has already reported every keystroke; blurring
          // it is not a commit, it is just leaving.
          if (!controlled) commit(e.currentTarget.value)
        }}
      />
      {open && (
        <div
          className={cn(
            'bg-popover text-popover-foreground absolute z-50 w-full min-w-48 overflow-hidden rounded-md border shadow-md',
            flipUp ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
          // The popup is not a focus stop — it is a hint attached to the input.
          // Without this, pointing at its padding or scrollbar gutter moves
          // focus out of the input, and the input's own blur closes the very
          // thing being pointed at.
          onMouseDown={(e) => e.preventDefault()}
        >
          {matches.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1.5 text-xs">
              {emptyLabel}
            </p>
          ) : (
            <div
              id={listId}
              role="listbox"
              ref={listRef}
              className="max-h-64 overflow-y-auto py-1"
            >
              {matches.map((option, i) => (
                <button
                  key={option}
                  id={`${id ?? 'combobox'}-option-${i}`}
                  role="option"
                  aria-selected={i === active}
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
        </div>
      )}
    </div>
  )
}

/**
 * Cap on rendered rows. The full spell list is ~600 entries and the popup only
 * shows a handful at a time; rendering every match to scroll through is a lot
 * of DOM for rows nobody reads. Typing narrows it long before the cap bites,
 * which is why this is a plain slice rather than virtualisation.
 */
const MAX_VISIBLE = 100

/** `max-h-64` in pixels, for deciding which way the list opens. */
const POPUP_MAX_HEIGHT = 256
