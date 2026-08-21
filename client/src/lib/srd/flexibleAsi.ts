/**
 * Rendering player-chosen ability increases as English.
 *
 * Three surfaces say this out loud — the race card's detail line, the wizard's
 * step heading, and the homebrew tab's built-in preview — and they drifted
 * once already when the preview hard-coded `count` and `amount`. One helper, so
 * they can't.
 *
 * Nothing here computes anything: it reads a `FlexibleAsiMode` and describes it.
 */

import type { FlexibleAsiMode } from './types'

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six']

/** "three" for 3, falling back to the digits past six abilities. */
function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n)
}

/**
 * One mode as a phrase: "+2 and +1", "+1 to two abilities", "three +1s".
 *
 * A mode's own `label` wins when it has one — a homebrew author writing three
 * near-identical modes wants to name them, and "+1, +1, +1" reads worse than
 * "Three +1s".
 */
export function describeMode(mode: FlexibleAsiMode): string {
  if (mode.label?.trim()) return mode.label.trim()
  const { increases } = mode
  if (increases.length === 0) return ''
  const [first] = increases
  // All the same size reads better counted than listed: "+1 to two abilities"
  // rather than "+1 and +1".
  if (increases.every((n) => n === first)) {
    if (increases.length === 1) return `+${first} to one ability`
    return `+${first} to ${countWord(increases.length)} abilities`
  }
  const parts = increases.map((n) => `+${n}`)
  const last = parts.pop()
  return `${parts.join(', ')} and ${last}`
}

/**
 * The whole spec for a one-line card or heading, ending in "of your choice".
 *
 * A single mode is stated flat; several are offered as alternatives, which is
 * the Goliath-style case this exists for.
 */
export function describeFlexibleAsi(
  modes: Array<FlexibleAsiMode> | undefined,
): string {
  if (!modes || modes.length === 0) return ''
  const described = modes.map(describeMode).filter((s) => s !== '')
  if (described.length === 0) return ''
  if (described.length === 1) return `${described[0]} of your choice`
  const parts = [...described]
  const last = parts.pop()
  return `${parts.join(', ')} or ${last}, of your choice`
}
