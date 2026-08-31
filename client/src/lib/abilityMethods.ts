/**
 * The five ways the wizard can produce six ability scores.
 *
 * Every method ends in the same place — six numbers assigned to six abilities —
 * so four of the five share one "pool then assign" model and one assignment UI.
 * Point buy and manual edit scores directly instead, because there is no pool to
 * draw from.
 *
 * All pure, all `rng`-injected. The repo's existing dice helpers close over
 * `Math.random` and can't be seeded, so rolling here takes its randomness as an
 * argument and the tests script it.
 */

import { ABILITIES } from './character'
import type { Ability } from './character'

// --- Standard array ---------------------------------------------------------

/** The 5e standard array, highest first. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const

// --- Point buy --------------------------------------------------------------

export const POINT_BUY_BUDGET = 27
export const POINT_BUY_MIN = 8
export const POINT_BUY_MAX = 15

/** What each score costs in total, not per step — 14 to 15 costs 2, not 1. */
export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
}

/** Total points spent. Scores outside the legal range contribute nothing. */
export function pointBuySpent(scores: Record<Ability, number>): number {
  let total = 0
  for (const ability of ABILITIES) {
    total += POINT_BUY_COSTS[scores[ability]] ?? 0
  }
  return total
}

/** Points left in the budget. */
export function pointBuyRemaining(scores: Record<Ability, number>): number {
  return POINT_BUY_BUDGET - pointBuySpent(scores)
}

/** Whether +1 here is both in range and affordable. */
export function canRaise(scores: Record<Ability, number>, a: Ability): boolean {
  const next = scores[a] + 1
  if (next > POINT_BUY_MAX) return false
  const delta = (POINT_BUY_COSTS[next] ?? 0) - (POINT_BUY_COSTS[scores[a]] ?? 0)
  return delta <= pointBuyRemaining(scores)
}

export function canLower(scores: Record<Ability, number>, a: Ability): boolean {
  return scores[a] - 1 >= POINT_BUY_MIN
}

/** The all-8 floor every point-buy session starts from. */
export function pointBuyFloor(): Record<Ability, number> {
  return { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }
}

// --- Rolling ----------------------------------------------------------------

export interface RollDetail {
  /** All four dice in the order rolled, so the UI can strike the dropped one. */
  dice: [number, number, number, number]
  /**
   * Index into `dice` of the die that was dropped. On a tie this is the
   * *first* lowest — the UI strikes exactly one die through, and picking a
   * stable one keeps that unambiguous.
   */
  droppedIndex: number
  /** Sum of the three kept dice, 3-18. */
  total: number
}

/** One d6 from an injected rng. */
function d6(rng: () => number): number {
  return Math.floor(rng() * 6) + 1
}

/**
 * Roll 4d6 and drop the lowest.
 *
 * Not built on `rollDice('4d6')` from formatMarkdown.ts: that sums all four and
 * returns the individual dice only as a joined string, so the drop would have to
 * be parsed back out of display text.
 */
export function roll4d6DropLowest(rng: () => number = Math.random): RollDetail {
  const dice: [number, number, number, number] = [
    d6(rng),
    d6(rng),
    d6(rng),
    d6(rng),
  ]
  let droppedIndex = 0
  for (let i = 1; i < 4; i++) {
    if (dice[i] < dice[droppedIndex]) droppedIndex = i
  }
  const total = dice.reduce(
    (sum, die, i) => (i === droppedIndex ? sum : sum + die),
    0,
  )
  return { dice, droppedIndex, total }
}

/** `count` independent 4d6-drop-lowest rolls. */
export function rollAbilityPool(
  count: number,
  rng: () => number = Math.random,
): Array<RollDetail> {
  return Array.from({ length: count }, () => roll4d6DropLowest(rng))
}

export interface RolledState {
  /** Six rolls, in generation order. */
  rolls: Array<RollDetail>
}

// --- The grid method --------------------------------------------------------

/**
 * Nine 4d6-drop-lowest rolls, filled left-to-right then top-to-bottom:
 *
 *   0 1 2
 *   3 4 5
 *   6 7 8
 */
export type GridCells = [
  RollDetail,
  RollDetail,
  RollDetail,
  RollDetail,
  RollDetail,
  RollDetail,
  RollDetail,
  RollDetail,
  RollDetail,
]

/** The eight lines a player may draw through the grid. */
export type GridLineId =
  | 'row-0'
  | 'row-1'
  | 'row-2'
  | 'col-0'
  | 'col-1'
  | 'col-2'
  | 'diag-main'
  | 'diag-anti'

export interface GridLine {
  id: GridLineId
  label: string
  /** The three cell indices, in reading order along the line. */
  cells: [number, number, number]
}

export const GRID_LINES: Array<GridLine> = [
  { id: 'row-0', label: 'Row 1', cells: [0, 1, 2] },
  { id: 'row-1', label: 'Row 2', cells: [3, 4, 5] },
  { id: 'row-2', label: 'Row 3', cells: [6, 7, 8] },
  { id: 'col-0', label: 'Column 1', cells: [0, 3, 6] },
  { id: 'col-1', label: 'Column 2', cells: [1, 4, 7] },
  { id: 'col-2', label: 'Column 3', cells: [2, 5, 8] },
  { id: 'diag-main', label: 'Diagonal ↘', cells: [0, 4, 8] },
  { id: 'diag-anti', label: 'Diagonal ↗', cells: [6, 4, 2] },
]

export interface GridState {
  cells: GridCells | null
  /** First line drawn; its three values become pool entries 0-2. */
  lineA: GridLineId | null
  /** Second line; its values become pool entries 3-5. */
  lineB: GridLineId | null
}

export function findGridLine(id: GridLineId): GridLine {
  const line = GRID_LINES.find((l) => l.id === id)
  // Every caller passes a GridLineId, so this is unreachable outside a typo in
  // GRID_LINES itself, which the geometry tests would catch first.
  if (!line) throw new Error(`unknown grid line: ${id}`)
  return line
}

/**
 * The cell index both lines pass through, or null when they are parallel.
 *
 * Two rows never meet; two columns never meet; a row and a column always do.
 * The two diagonals cross at the centre.
 */
export function gridIntersection(a: GridLineId, b: GridLineId): number | null {
  if (a === b) return null
  const cellsB = new Set(findGridLine(b).cells)
  const shared = findGridLine(a).cells.find((c) => cellsB.has(c))
  return shared ?? null
}

/**
 * The six scores a pair of lines yields: line A's three cells in reading order,
 * then line B's three.
 *
 * When the lines cross, the shared cell is read by both lines and its value is
 * therefore used TWICE. That is the intent of the method, not a bug — cross the
 * grid at a 17 and you get two 17s, paying for it with one fewer distinct roll.
 * Choosing two parallel lines (two rows, or two columns) is how you avoid it.
 */
export function gridScores(
  cells: GridCells,
  a: GridLineId,
  b: GridLineId,
): Array<number> {
  return [...findGridLine(a).cells, ...findGridLine(b).cells].map(
    (i) => cells[i].total,
  )
}

/** Roll a fresh grid. */
export function rollGrid(rng: () => number = Math.random): GridCells {
  return rollAbilityPool(9, rng) as GridCells
}

// --- The shared pool/assignment model ---------------------------------------

export type AbilityMethod =
  'standard' | 'pointbuy' | 'manual' | 'rolled' | 'grid'

export interface AbilityDraft {
  method: AbilityMethod
  /**
   * Which pool *index* each ability holds, or null. Indices rather than values:
   * two 13s in a rolled pool are distinct entries, and storing the value would
   * let one of them be assigned twice.
   */
  assignment: Record<Ability, number | null>
  /** Direct scores, used by 'manual' and 'pointbuy'. */
  direct: Record<Ability, number>
  rolled: RolledState | null
  grid: GridState | null
}

export function emptyAssignment(): Record<Ability, number | null> {
  return { str: null, dex: null, con: null, int: null, wis: null, cha: null }
}

export function emptyAbilityDraft(): AbilityDraft {
  return {
    method: 'standard',
    assignment: emptyAssignment(),
    direct: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    rolled: null,
    grid: null,
  }
}

/** Whether this method assigns from a pool rather than editing scores directly. */
export function usesPool(method: AbilityMethod): boolean {
  return method === 'standard' || method === 'rolled' || method === 'grid'
}

/**
 * The pool a method draws from, derived from its own scratch state so the pool
 * and the state can never disagree. Deriving rather than storing is what keeps
 * a re-roll from leaving a stale pool behind.
 */
export function poolFor(draft: AbilityDraft): Array<number> {
  switch (draft.method) {
    case 'standard':
      return [...STANDARD_ARRAY]
    case 'rolled':
      return draft.rolled?.rolls.map((r) => r.total) ?? []
    case 'grid': {
      const grid = draft.grid
      if (!grid?.cells || !grid.lineA || !grid.lineB) return []
      if (grid.lineA === grid.lineB) return []
      return gridScores(grid.cells, grid.lineA, grid.lineB)
    }
    default:
      return []
  }
}

/**
 * Base scores before racial increases. Unassigned pool entries read as 10, so a
 * half-finished draft still produces a whole character — the live summary panel
 * depends on this never being partial.
 */
export function baseScores(draft: AbilityDraft): Record<Ability, number> {
  if (!usesPool(draft.method)) return { ...draft.direct }
  const pool = poolFor(draft)
  const out = {} as Record<Ability, number>
  for (const ability of ABILITIES) {
    const index = draft.assignment[ability]
    const value = index === null ? undefined : pool[index]
    out[ability] = value ?? 10
  }
  return out
}

/** Whether every ability has been given a distinct pool entry. */
export function assignmentComplete(draft: AbilityDraft): boolean {
  if (!usesPool(draft.method)) return true
  const pool = poolFor(draft)
  if (pool.length < ABILITIES.length) return false
  const used = new Set<number>()
  for (const ability of ABILITIES) {
    const index = draft.assignment[ability]
    // Bounds-checked on the index rather than the value: a stale assignment
    // left over from a longer pool would otherwise index past the end.
    if (index === null || index < 0 || index >= pool.length) return false
    if (used.has(index)) return false
    used.add(index)
  }
  return true
}

/** Whether the current method has everything it needs to produce six scores. */
export function abilitiesValid(draft: AbilityDraft): boolean {
  switch (draft.method) {
    case 'pointbuy':
      return pointBuyRemaining(draft.direct) >= 0
    case 'manual':
      return true
    case 'rolled':
      return draft.rolled !== null && assignmentComplete(draft)
    case 'grid': {
      const grid = draft.grid
      if (!grid?.cells || !grid.lineA || !grid.lineB) return false
      // The same line twice would duplicate all three values — degenerate. The
      // UI prevents it, but this predicate is the real gate.
      if (grid.lineA === grid.lineB) return false
      return assignmentComplete(draft)
    }
    default:
      return assignmentComplete(draft)
  }
}

/**
 * Assign a pool entry to an ability, clearing whatever ability previously held
 * that entry so one roll can never occupy two slots.
 */
export function assign(
  draft: AbilityDraft,
  ability: Ability,
  poolIndex: number | null,
): AbilityDraft {
  const assignment = { ...draft.assignment }
  if (poolIndex !== null) {
    for (const other of ABILITIES) {
      if (assignment[other] === poolIndex) assignment[other] = null
    }
  }
  assignment[ability] = poolIndex
  return { ...draft, assignment }
}

/**
 * Drop the pool onto the abilities in a class's preferred order — highest value
 * to highest priority. The player swaps afterwards; this is the one-click start,
 * not a decision made for them.
 */
export function autoAssign(
  draft: AbilityDraft,
  priority: Array<Ability>,
): AbilityDraft {
  const pool = poolFor(draft)
  const order = pool
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value)
  const assignment = emptyAssignment()
  const abilities =
    priority.length === ABILITIES.length ? priority : [...ABILITIES]
  abilities.forEach((ability, i) => {
    // A pool shorter than six abilities leaves the rest unassigned.
    if (i >= order.length) return
    assignment[ability] = order[i].index
  })
  return { ...draft, assignment }
}
