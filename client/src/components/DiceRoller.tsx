import { useState } from 'react'
import { Dices } from 'lucide-react'
import { rollDice } from '#/lib/formatMarkdown'
import { logRoll } from '#/lib/rollLog'
import type { RollSource } from '#/lib/rollLog'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'

/**
 * Roll a die that is not attached to anything — the "just roll a d20" case that
 * every table needs and that dice chips, which live inside articles and sheets,
 * cannot cover.
 *
 * Goes through the ordinary logRoll, so a roll here reaches every window and,
 * at a LAN table, every seat. That is the whole reason this is nine lines of
 * logic rather than its own mechanism.
 *
 * Notation is whatever rollDice accepts — one NdM±k term, nothing fancier —
 * and a string it refuses is left in the box rather than cleared, since the
 * person typing it is mid-thought.
 */

/** The dice people actually reach for, in the order a sheet lists them. */
const QUICK = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const

export function DiceRoller({
  source,
  className,
}: {
  /** Labels the roll in the shared history. Absent for a bare roll. */
  source?: RollSource
  className?: string
}) {
  const [notation, setNotation] = useState('')
  const [bad, setBad] = useState(false)

  const roll = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    const result = rollDice(text)
    if (!result) {
      setBad(true)
      return
    }
    setBad(false)
    logRoll({
      notation: text,
      total: result.total,
      detail: result.detail,
      source,
    })
  }

  return (
    <div className={cn('space-y-2 p-2', className)}>
      <div className="flex flex-wrap gap-1">
        {QUICK.map((die) => (
          <Button
            key={die}
            variant="outline"
            size="sm"
            className="h-7 flex-1 px-1 font-mono text-xs"
            onClick={() => roll(die)}
          >
            {die}
          </Button>
        ))}
      </div>
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          roll(notation)
        }}
      >
        <Input
          value={notation}
          onChange={(e) => {
            setNotation(e.target.value)
            setBad(false)
          }}
          placeholder="2d6+3"
          aria-label="Dice notation"
          aria-invalid={bad}
          className={cn('h-7 font-mono text-xs', bad && 'border-destructive')}
        />
        <Button
          type="submit"
          size="sm"
          className="h-7 shrink-0 px-2"
          disabled={!notation.trim()}
          title="Roll this"
        >
          <Dices className="size-3.5" />
        </Button>
      </form>
      {bad && (
        <p className="text-destructive text-xs">
          Try something like 2d6+3 — one set of dice, with an optional bonus.
        </p>
      )}
    </div>
  )
}
