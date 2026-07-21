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
  min,
  max,
  className,
  title,
}: {
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  className?: string
  title?: string
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
      value={draft}
      inputMode="numeric"
      title={title}
      className={cn('h-7 px-1.5 text-center text-sm', className)}
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
