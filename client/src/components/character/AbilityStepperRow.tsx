import { Minus, Plus } from 'lucide-react'
import { ABILITIES, ABILITY_NAMES } from '#/lib/character'
import type { Ability } from '#/lib/character'
import { cn } from '#/lib/utils'

/** What the row shows and allows for one ability. */
export interface AbilityStepperState {
  /** The increase currently placed, or 0 for none. */
  value: number
  /** Greys the whole pill and both buttons, with `title` as the reason. */
  disabled?: boolean
  canRaise?: boolean
  canLower?: boolean
  /** A read-only number shown before the stepper — the level-up step's score. */
  before?: number
  title?: string
}

/**
 * Six ability pills with a −/+ stepper each.
 *
 * There were two hand-rolled copies of this — the level-up ASI step and the
 * homebrew race editor — and the race step's chosen-increase control was about
 * to be a third, so it is one component taking a per-ability `state` function.
 * Purely presentational: every rule about what may be raised, and by how much,
 * belongs to the caller. That keeps the two wizards' logic apart, which is the
 * thing worth not cross-wiring.
 */
export function AbilityStepperRow({
  state,
  onStep,
}: {
  state: (ability: Ability) => AbilityStepperState
  /** Called with +1/-1; the caller decides what a step actually means. */
  onStep: (ability: Ability, delta: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ABILITIES.map((ability) => {
        const {
          value,
          disabled = false,
          canRaise = true,
          canLower = value > 0,
          before,
          title,
        } = state(ability)
        return (
          <div
            key={ability}
            title={title}
            className={cn(
              'flex items-center gap-1 rounded-md border px-1.5 py-1',
              value > 0 && 'border-primary bg-accent',
              disabled && 'opacity-50',
            )}
          >
            <span
              className="text-xs font-medium uppercase"
              title={ABILITY_NAMES[ability]}
            >
              {ability}
            </span>
            {before !== undefined && (
              <span className="text-muted-foreground text-xs tabular-nums">
                {before}
              </span>
            )}
            <button
              type="button"
              aria-label={`Lower ${ABILITY_NAMES[ability]}`}
              disabled={disabled || !canLower}
              onClick={() => onStep(ability, -1)}
              className="hover:bg-accent flex size-5 items-center justify-center rounded border disabled:opacity-30"
            >
              <Minus className="size-3" />
            </button>
            <span className="w-5 text-center text-xs tabular-nums">
              {value > 0 ? `+${value}` : '—'}
            </span>
            <button
              type="button"
              aria-label={`Raise ${ABILITY_NAMES[ability]}`}
              disabled={disabled || !canRaise}
              onClick={() => onStep(ability, 1)}
              className="hover:bg-accent flex size-5 items-center justify-center rounded border disabled:opacity-30"
            >
              <Plus className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
