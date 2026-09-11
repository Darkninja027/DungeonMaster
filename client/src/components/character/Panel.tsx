import { cn } from '#/lib/utils'

/**
 * The house panel: a bordered box with a small uppercase heading. Every tab on
 * the character sheet is built from these, so they live here rather than inside
 * any one tab — importing from `SheetTab` would drag its whole module graph
 * (queries, the api client, the global library) into whatever imported it.
 *
 * `SheetTab` imports this as `Section`, which is what it was called when it was
 * local to that file.
 */
export function Panel({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('tome-panel rounded-md border p-2', className)}>
      <h3 className="tome-label mb-1">{title}</h3>
      {children}
    </section>
  )
}

/**
 * A row of filled/empty circles for a spent-of-total counter — hit dice, class
 * resources, spell slots. Clicking pip N sets the count to N, except clicking
 * the last filled pip clears it, so a full row can be emptied one click at a
 * time from either end.
 *
 * Callers that only want a gauge (attunement, which is toggled per item) pass a
 * no-op `onChange` and wrap this in `pointer-events-none`.
 */
export function Pips({
  count,
  total,
  onChange,
  className,
  gapClassName,
}: {
  count: number
  total: number
  onChange: (next: number) => void
  /** Fill colour for a spent pip. Defaults to `bg-primary`. */
  className?: string
  /** Container gap. The slot ribbon packs nine of these into a narrow cell. */
  gapClassName?: string
}) {
  return (
    <span className={cn('inline-flex', gapClassName ?? 'gap-1')}>
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          className={cn(
            'size-3.5 rounded-full border',
            i < count ? (className ?? 'bg-primary') : 'bg-transparent',
          )}
          onClick={() => onChange(i + 1 === count ? i : i + 1)}
        />
      ))}
    </span>
  )
}
