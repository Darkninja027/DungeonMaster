import { Check } from 'lucide-react'
import type { CharacterDraft, StepId } from '#/lib/characterDraft'
import { canAdvance } from '#/lib/characterDraft'
import { cn } from '#/lib/utils'

const STEP_TITLES: Record<StepId, string> = {
  name: 'Name',
  race: 'Race',
  class: 'Class',
  abilities: 'Ability scores',
  background: 'Background',
  skills: 'Skills',
  spells: 'Spells',
  equipment: 'Equipment',
  review: 'Review',
}

/** The one-line answer a completed step gives, shown under its title. */
function summaryFor(draft: CharacterDraft, step: StepId): string | null {
  switch (step) {
    case 'name':
      return draft.name.trim() || null
    case 'race':
      return draft.subraceName || draft.raceName || null
    case 'class':
      return (
        [draft.className, draft.subclassName].filter(Boolean).join(' · ') ||
        null
      )
    case 'abilities':
      return canAdvance(draft, 'abilities') ? 'Set' : null
    case 'background':
      return draft.backgroundName || null
    case 'skills':
      return canAdvance(draft, 'skills') ? 'Chosen' : null
    case 'spells':
      return draft.cantrips.length + draft.spells.length > 0
        ? `${draft.cantrips.length + draft.spells.length} picked`
        : null
    case 'equipment':
      return canAdvance(draft, 'equipment') ? 'Packed' : null
    case 'review':
      return null
  }
}

export function WizardRail({
  draft,
  steps,
  current,
  onGo,
}: {
  draft: CharacterDraft
  steps: Array<StepId>
  current: StepId
  onGo: (step: StepId) => void
}) {
  const currentIndex = steps.indexOf(current)

  return (
    <nav className="flex h-full min-h-0 flex-col gap-0.5 overflow-y-auto border-r p-2">
      {steps.map((step, i) => {
        const done = canAdvance(draft, step) && i < currentIndex
        const active = step === current
        // Steps ahead of the furthest satisfied point stay unreachable, so the
        // rail can't be used to skip a gate the Next button enforces.
        const reachable =
          i <= currentIndex ||
          steps.slice(0, i).every((s) => canAdvance(draft, s))
        return (
          <button
            key={step}
            type="button"
            disabled={!reachable}
            onClick={() => onGo(step)}
            className={cn(
              'flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
              active && 'bg-accent',
              !active && reachable && 'hover:bg-accent/50',
              !reachable && 'cursor-not-allowed opacity-40',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] tabular-nums',
                done && 'border-primary bg-primary text-primary-foreground',
                active && !done && 'border-primary',
              )}
            >
              {done ? <Check className="size-2.5" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block truncate text-sm',
                  active && 'font-medium',
                )}
              >
                {STEP_TITLES[step]}
              </span>
              {summaryFor(draft, step) && (
                <span className="text-muted-foreground block truncate text-xs">
                  {summaryFor(draft, step)}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
