import { cn } from '#/lib/utils'

/**
 * A selectable bordered card — the browse-and-compare control the wizard uses
 * for races, classes, backgrounds and equipment options.
 *
 * Lifted from the template picker in CreateMissingArticleDialog so the two read
 * the same. Deliberately not a shadcn `select`: these are choices you weigh by
 * reading their descriptions, not compact form fields.
 */
export function OptionCard({
  title,
  description,
  detail,
  selected,
  disabled,
  onSelect,
  className,
}: {
  title: string
  description?: string
  /** A short right-aligned annotation — a hit die, a speed, an AC. */
  detail?: string
  selected: boolean
  disabled?: boolean
  onSelect: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'rounded-md border p-2 text-left transition-colors',
        selected ? 'border-primary bg-accent' : 'hover:bg-accent/50',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
        className,
      )}
    >
      {/*
        min-w-0 on both halves, and no shrink-0 on the detail: a long detail
        (the Human's "+1 to every ability") must wrap inside the card rather
        than push its own width out past the border.
      */}
      <span className="flex w-full min-w-0 items-baseline justify-between gap-2">
        <span className="min-w-0 text-sm font-medium wrap-break-word">
          {title}
        </span>
        {detail && (
          <span className="text-muted-foreground min-w-0 text-right text-xs wrap-break-word">
            {detail}
          </span>
        )}
      </span>
      {description && (
        <span className="text-muted-foreground mt-0.5 block text-xs">
          {description}
        </span>
      )}
    </button>
  )
}

/**
 * A small toggle chip. Used wherever 5e asks for "choose N of these" — skills,
 * languages, tools — because a chip cloud reads better than eighteen checkbox
 * rows, and `role="checkbox"` keeps it announced correctly.
 */
export function Chip({
  label,
  selected,
  disabled,
  title,
  onToggle,
}: {
  label: string
  selected: boolean
  disabled?: boolean
  /** Hover text, used to say *why* a chip is disabled. */
  title?: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      title={title}
      onClick={onToggle}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'hover:bg-accent',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
      )}
    >
      {label}
    </button>
  )
}
