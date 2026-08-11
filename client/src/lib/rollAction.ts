import { rollDice } from './formatMarkdown'
import { logRoll } from './rollLog'
import type { RollSource } from './rollLog'

/**
 * Roll a notation and push the result to the session roll log. Shared by the
 * character sheet editor and the parchment sheet preview, which both offer a
 * few dozen "roll this" chips. Bad notation is a no-op, so callers can pass
 * user-typed damage strings without guarding first.
 */
export function roll(
  label: string,
  notation: string,
  source: RollSource,
): void {
  const result = rollDice(notation)
  if (result) {
    logRoll({
      notation,
      label,
      total: result.total,
      detail: result.detail,
      source,
    })
  }
}
