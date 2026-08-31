import { useEffect, useState } from 'react'
import { Input } from '#/components/ui/input'
import { cn } from '#/lib/utils'

/**
 * Numeric input with a local draft so intermediate states ("-", "") don't
 * fight the controlled value; commits on blur or Enter.
 */
export function NumField({
  value,
  onCommit,
  onBlur,
  min,
  max,
  className,
  title,
  id,
  autoFocus,
  'aria-label': ariaLabel,
}: {
  value: number
  onCommit: (value: number) => void
  /**
   * Fired after the value commits, on blur or Enter. For a caller that shows
   * this field only while it is being edited — the spellcasting slot ribbon
   * swaps a count for one — so it knows when to put the read-only view back.
   */
  onBlur?: () => void
  min?: number
  max?: number
  className?: string
  title?: string
  /** So a <Label htmlFor> can point at it. */
  id?: string
  /** For a field mounted in response to a click, so the caret lands in it. */
  autoFocus?: boolean
  'aria-label'?: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = () => {
    const n = Number(draft)
    if (draft.trim() === '' || isNaN(n)) {
      setDraft(String(value))
      return
    }
    let next = Math.trunc(n)
    if (min != null) next = Math.max(min, next)
    if (max != null) next = Math.min(max, next)
    setDraft(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      value={draft}
      inputMode="numeric"
      title={title}
      // Only ever set by a caller that mounts this field in response to a
      // click on the value it replaces, where moving the caret there is the
      // whole point of the click.
      autoFocus={autoFocus}
      className={cn('h-7 px-1.5 text-center text-sm', className)}
      onChange={(e) => setDraft(e.target.value)}
      // Enter commits and then blurs, so this covers both paths and `onBlur`
      // fires exactly once either way.
      onBlur={() => {
        commit()
        onBlur?.()
      }}
      onKeyDown={(e) => {
        // Blur alone: it fires the handler above, which commits. Committing
        // here too would call onCommit twice, because `value` is still the
        // pre-commit prop until the parent re-renders.
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
