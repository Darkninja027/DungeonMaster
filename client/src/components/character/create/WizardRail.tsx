import { Check } from 'lucide-react'
import { cn } from '#/lib/utils'

/**
 * The step rail every wizard shares.
 *
 * Generic over the step id because there are three wizards now — character
 * creation, level-up, and authoring a homebrew subclass — and they agreed on
 * this shape long before they shared any code. The reachability rule below was
 * duplicated character-for-character in `LevelUpDialog`, which is what made the
 * third copy worth avoiding.
 *
 * The one thing that used to weld this to characters was a module-level
 * `import { canAdvance } from '#/lib/characterDraft'`. It is a prop now, so the
 * rail knows nothing about drafts at all: a caller closes over whatever its own
 * gate function is. Each wizard keeps its own `Record<StepId, string>` label map
 * rather than passing one in, because that map's exhaustiveness check is what
 * errors when a step is added — a `Record<string, string>` here would lose it.
 */
export function WizardRail<T extends string>({
  steps,
  current,
  onGo,
  isComplete,
  label,
  summary,
}: {
  steps: Array<T>
  current: T
  onGo: (step: T) => void
  /** Whether a step's requirements are met — the caller's own gate, curried. */
  isComplete: (step: T) => boolean
  /** The short rail label for a step. */
  label: (step: T) => string
  /**
   * The one-line answer a completed step gives, shown under its title.
   *
   * Optional: omitting it renders the compact single-line row, which is exactly
   * what level-up's hand-rolled rail did. One conditional rather than a fork.
   */
  summary?: (step: T) => string | null
}) {
  const currentIndex = steps.indexOf(current)

  return (
    <nav className="flex h-full min-h-0 flex-col gap-0.5 overflow-y-auto border-r p-2">
      {steps.map((step, i) => {
        const done = isComplete(step) && i < currentIndex
        const active = step === current
        // Steps ahead of the furthest satisfied point stay unreachable, so the
        // rail can't be used to skip a gate the Next button enforces.
        const reachable =
          i <= currentIndex || steps.slice(0, i).every((s) => isComplete(s))
        const line = summary?.(step) ?? null
        return (
          <button
            key={step}
            type="button"
            disabled={!reachable}
            onClick={() => onGo(step)}
            className={cn(
              'flex gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
              summary ? 'items-start' : 'items-center',
              active && 'bg-accent',
              !active && reachable && 'hover:bg-accent/50',
              !reachable && 'cursor-not-allowed opacity-40',
            )}
          >
            {summary ? (
              <span
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] tabular-nums',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && !done && 'border-primary',
                )}
              >
                {done ? <Check className="size-2.5" /> : i + 1}
              </span>
            ) : (
              <span className="text-muted-foreground text-[10px] tabular-nums">
                {i + 1}
              </span>
            )}
            <span className="min-w-0">
              <span
                className={cn(
                  'block truncate text-sm',
                  active && 'font-medium',
                )}
              >
                {label(step)}
              </span>
              {line && (
                <span className="text-muted-foreground block truncate text-xs">
                  {line}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
