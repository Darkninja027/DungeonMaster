import { Dices } from 'lucide-react'
import type { RolledState } from '#/lib/abilityMethods'
import { roll4d6DropLowest, rollAbilityPool } from '#/lib/abilityMethods'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

/**
 * Six 4d6-drop-lowest rolls, assigned freely afterwards.
 *
 * Individual rerolls are behind a toggle and off by default: most tables forbid
 * them, and making the honest path the default one is the polite choice.
 */
export function RolledPanel({
  state,
  allowSingleRerolls,
  onToggleRerolls,
  onChange,
}: {
  state: RolledState | null
  allowSingleRerolls: boolean
  onToggleRerolls: (next: boolean) => void
  onChange: (next: RolledState) => void
}) {
  const rollAll = () => onChange({ rolls: rollAbilityPool(6) })

  const rerollOne = (index: number) => {
    if (!state) return
    const rolls = state.rolls.map((roll, i) =>
      i === index ? roll4d6DropLowest() : roll,
    )
    onChange({ rolls })
  }

  if (!state) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Roll 4d6 six times, dropping the lowest die each time, then assign the
          results to whichever abilities you like.
        </p>
        <Button onClick={rollAll}>
          <Dices /> Roll six times
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {state.rolls.map((roll, i) => (
          <div
            key={i}
            className="flex w-16 flex-col items-center rounded-md border p-1.5"
          >
            <span className="text-lg leading-none font-semibold tabular-nums">
              {roll.total}
            </span>
            <span className="text-muted-foreground mt-1 text-[10px] leading-none">
              {roll.dice.map((die, d) => (
                <span
                  key={d}
                  className={
                    d === roll.droppedIndex ? 'line-through opacity-50' : ''
                  }
                >
                  {die}
                  {d < 3 ? ' ' : ''}
                </span>
              ))}
            </span>
            {allowSingleRerolls && (
              <button
                type="button"
                onClick={() => rerollOne(i)}
                className="text-muted-foreground hover:text-foreground mt-1 text-[10px] underline"
              >
                reroll
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={rollAll}>
          <Dices /> Reroll all
        </Button>
        <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={allowSingleRerolls}
            onChange={(e) => onToggleRerolls(e.target.checked)}
            className={cn('size-3.5 accent-primary')}
          />
          Allow individual rerolls
        </label>
      </div>
    </div>
  )
}
