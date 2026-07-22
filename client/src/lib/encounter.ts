/**
 * 5e encounter difficulty math (2014 DMG). Given the party's character levels
 * and the XP of each monster in the encounter, compute the adjusted XP (scaled
 * by how many monsters there are) and the difficulty band relative to the
 * party's thresholds. Pure functions — unit-tested without React or Electron.
 */

export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly'

/** XP thresholds per character by level: [easy, medium, hard, deadly]. */
const THRESHOLDS: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100],
  2: [50, 100, 150, 200],
  3: [75, 150, 225, 400],
  4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100],
  6: [300, 600, 900, 1400],
  7: [350, 750, 1100, 1700],
  8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400],
  10: [600, 1200, 1900, 2800],
  11: [800, 1600, 2400, 3600],
  12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100],
  14: [1250, 2500, 3800, 5700],
  15: [1400, 2800, 4300, 6400],
  16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800],
  18: [2100, 4200, 6300, 9500],
  19: [2400, 4900, 7300, 10900],
  20: [2800, 5700, 8500, 12700],
}

/** Encounter multiplier by number of monsters (DMG "Encounter Multipliers"). */
function encounterMultiplier(monsterCount: number): number {
  if (monsterCount <= 1) return 1
  if (monsterCount === 2) return 1.5
  if (monsterCount <= 6) return 2
  if (monsterCount <= 10) return 2.5
  if (monsterCount <= 14) return 3
  return 4
}

export interface PartyThresholds {
  easy: number
  medium: number
  hard: number
  deadly: number
}

/** Sum the party's per-character thresholds. Levels are clamped to 1–20. */
export function partyThresholds(levels: Array<number>): PartyThresholds {
  const totals: [number, number, number, number] = [0, 0, 0, 0]
  for (const raw of levels) {
    const level = Math.max(1, Math.min(20, Math.floor(raw)))
    const row = THRESHOLDS[level]
    for (let i = 0; i < 4; i++) totals[i] += row[i]
  }
  return {
    easy: totals[0],
    medium: totals[1],
    hard: totals[2],
    deadly: totals[3],
  }
}

export interface EncounterResult {
  /** Raw XP summed across all monsters. */
  totalXp: number
  /** Total XP × the count-based multiplier — what you compare to thresholds. */
  adjustedXp: number
  multiplier: number
  difficulty: Difficulty
  thresholds: PartyThresholds
}

/**
 * Rate an encounter. `monsterXps` is one entry per monster (repeat for
 * duplicates); entries that couldn't be parsed should be passed as 0 so they
 * still count toward the multiplier but add no XP.
 */
export function rateEncounter(
  partyLevels: Array<number>,
  monsterXps: Array<number>,
): EncounterResult {
  const thresholds = partyThresholds(partyLevels)
  const totalXp = monsterXps.reduce((a, b) => a + b, 0)
  const multiplier = encounterMultiplier(monsterXps.length)
  const adjustedXp = Math.round(totalXp * multiplier)

  let difficulty: Difficulty = 'trivial'
  if (adjustedXp >= thresholds.deadly) difficulty = 'deadly'
  else if (adjustedXp >= thresholds.hard) difficulty = 'hard'
  else if (adjustedXp >= thresholds.medium) difficulty = 'medium'
  else if (adjustedXp >= thresholds.easy) difficulty = 'easy'

  return { totalXp, adjustedXp, multiplier, difficulty, thresholds }
}
