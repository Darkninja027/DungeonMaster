import { ABILITIES, ABILITY_NAMES, abilityMod } from '#/lib/character'
import type { Ability } from '#/lib/character'
import type { AbilityDraft } from '#/lib/abilityMethods'
import { assign, poolFor } from '#/lib/abilityMethods'
import { cn } from '#/lib/utils'

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/**
 * The shared "put these six numbers on these six abilities" control, used by
 * the standard array, rolled and grid methods.
 *
 * Racial increases show as a `+N` chip beside the base score rather than being
 * folded into it, so the player can always see what they rolled versus what
 * their race gave them. They are applied for real only at commit.
 */
export function AssignGrid({
  draft,
  asi,
  onChange,
}: {
  draft: AbilityDraft
  asi: Partial<Record<Ability, number>>
  onChange: (next: AbilityDraft) => void
}) {
  const pool = poolFor(draft)
  const taken = new Map<number, Ability>()
  for (const ability of ABILITIES) {
    const index = draft.assignment[ability]
    if (index !== null) taken.set(index, ability)
  }

  if (pool.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Roll first, then assign the results to your abilities.
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      {ABILITIES.map((ability) => {
        const index = draft.assignment[ability]
        const base = index === null ? null : pool[index]
        const bonus = asi[ability] ?? 0
        const final = base === null ? null : base + bonus
        return (
          <div key={ability} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-sm font-medium">
              {ABILITY_NAMES[ability]}
            </span>
            <div className="flex flex-wrap gap-1">
              {pool.map((value, i) => {
                const owner = taken.get(i)
                const mine = owner === ability
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={mine}
                    aria-label={`${value} to ${ABILITY_NAMES[ability]}`}
                    onClick={() =>
                      onChange(assign(draft, ability, mine ? null : i))
                    }
                    className={cn(
                      'h-7 w-8 rounded border text-sm tabular-nums transition-colors',
                      mine
                        ? 'border-primary bg-primary text-primary-foreground'
                        : owner
                          ? 'text-muted-foreground/40 border-dashed'
                          : 'hover:bg-accent',
                    )}
                  >
                    {value}
                  </button>
                )
              })}
            </div>
            <span className="ml-auto flex shrink-0 items-baseline gap-1.5 text-sm tabular-nums">
              {bonus > 0 && (
                <span className="rounded bg-emerald-500/15 px-1 text-xs text-emerald-700 dark:text-emerald-400">
                  +{bonus}
                </span>
              )}
              {final === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <>
                  <span className="font-medium">{final}</span>
                  <span className="text-muted-foreground w-8 text-right text-xs">
                    {signed(abilityMod(final))}
                  </span>
                </>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
