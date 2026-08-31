import { Minus, Plus } from 'lucide-react'
import { ABILITIES, ABILITY_NAMES, abilityMod } from '#/lib/character'
import type { Ability } from '#/lib/character'
import {
  POINT_BUY_BUDGET,
  POINT_BUY_COSTS,
  canLower,
  canRaise,
  pointBuyRemaining,
} from '#/lib/abilityMethods'
import { cn } from '#/lib/utils'

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/**
 * 27-point buy. Scores run 8-15 before racial increases, and the cost table
 * steps up at 14 and 15 — which is what stops everyone from maxing three stats.
 *
 * Leaving points unspent is allowed: some tables house-rule it, and blocking it
 * would be the app overruling the DM.
 */
export function PointBuyPanel({
  scores,
  asi,
  onChange,
}: {
  scores: Record<Ability, number>
  asi: Partial<Record<Ability, number>>
  onChange: (next: Record<Ability, number>) => void
}) {
  const remaining = pointBuyRemaining(scores)

  const step = (ability: Ability, delta: number) => {
    onChange({ ...scores, [ability]: scores[ability] + delta })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">
          {remaining} of {POINT_BUY_BUDGET} points remaining
        </span>
        {remaining > 0 && (
          <span className="text-muted-foreground text-xs">
            Unspent points are allowed.
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {ABILITIES.map((ability) => {
          const base = scores[ability]
          const bonus = asi[ability] ?? 0
          const final = base + bonus
          return (
            <div key={ability} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-sm font-medium">
                {ABILITY_NAMES[ability]}
              </span>
              <button
                type="button"
                aria-label={`Lower ${ABILITY_NAMES[ability]}`}
                disabled={!canLower(scores, ability)}
                onClick={() => step(ability, -1)}
                className="hover:bg-accent flex size-6 items-center justify-center rounded border disabled:opacity-30"
              >
                <Minus className="size-3" />
              </button>
              <span className="w-6 text-center text-sm tabular-nums">
                {base}
              </span>
              <button
                type="button"
                aria-label={`Raise ${ABILITY_NAMES[ability]}`}
                disabled={!canRaise(scores, ability)}
                onClick={() => step(ability, 1)}
                className="hover:bg-accent flex size-6 items-center justify-center rounded border disabled:opacity-30"
              >
                <Plus className="size-3" />
              </button>
              <span className="text-muted-foreground w-12 text-xs tabular-nums">
                {POINT_BUY_COSTS[base] ?? 0} pts
              </span>
              <span className="ml-auto flex shrink-0 items-baseline gap-1.5 text-sm tabular-nums">
                {bonus > 0 && (
                  <span className="rounded bg-emerald-500/15 px-1 text-xs text-emerald-700 dark:text-emerald-400">
                    +{bonus}
                  </span>
                )}
                <span
                  className={cn(
                    'font-medium',
                    bonus > 0 && 'text-emerald-700 dark:text-emerald-400',
                  )}
                >
                  {final}
                </span>
                <span className="text-muted-foreground w-8 text-right text-xs">
                  {signed(abilityMod(final))}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
