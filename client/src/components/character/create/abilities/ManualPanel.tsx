import { ABILITIES, ABILITY_NAMES, abilityMod } from '#/lib/character'
import type { Ability } from '#/lib/character'
import { NumField } from '#/components/character/NumField'

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/**
 * Type the six numbers in directly. The escape hatch for any house rule the
 * other four methods don't cover — and there are always more house rules than
 * methods.
 *
 * Bounded 1-30 to match the sheet parser's own clamp.
 */
export function ManualPanel({
  scores,
  asi,
  onChange,
}: {
  scores: Record<Ability, number>
  asi: Partial<Record<Ability, number>>
  onChange: (next: Record<Ability, number>) => void
}) {
  return (
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
            <NumField
              value={base}
              min={1}
              max={30}
              onCommit={(value) => onChange({ ...scores, [ability]: value })}
              className="h-7 w-16"
            />
            <span className="ml-auto flex shrink-0 items-baseline gap-1.5 text-sm tabular-nums">
              {bonus > 0 && (
                <span className="rounded bg-emerald-500/15 px-1 text-xs text-emerald-700 dark:text-emerald-400">
                  +{bonus}
                </span>
              )}
              <span className="font-medium">{final}</span>
              <span className="text-muted-foreground w-8 text-right text-xs">
                {signed(abilityMod(final))}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
