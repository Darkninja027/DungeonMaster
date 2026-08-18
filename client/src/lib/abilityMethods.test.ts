import { describe, expect, it } from 'vitest'
import { ABILITIES } from './character'
import type { Ability } from './character'
import {
  GRID_LINES,
  POINT_BUY_BUDGET,
  POINT_BUY_COSTS,
  STANDARD_ARRAY,
  abilitiesValid,
  assign,
  assignmentComplete,
  autoAssign,
  baseScores,
  canLower,
  canRaise,
  emptyAbilityDraft,
  gridIntersection,
  gridScores,
  poolFor,
  pointBuyFloor,
  pointBuyRemaining,
  pointBuySpent,
  roll4d6DropLowest,
  rollGrid,
} from './abilityMethods'
import type { AbilityDraft, GridCells, RollDetail } from './abilityMethods'

/** An rng that yields a scripted sequence of d6 faces, then repeats the last. */
function scriptedRng(faces: Array<number>): () => number {
  let i = 0
  return () => {
    const face = faces[Math.min(i, faces.length - 1)]
    i++
    // Invert `Math.floor(rng() * 6) + 1` — land mid-band so rounding is safe.
    return (face - 1) / 6 + 0.01
  }
}

/** A RollDetail with a given total, for tests that only care about the value. */
function cell(total: number): RollDetail {
  return { dice: [total, 1, 1, 1], droppedIndex: 1, total }
}

/** A grid whose nine cells total 1..9, so positions are unambiguous. */
function countingGrid(): GridCells {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].map(cell) as GridCells
}

describe('point buy', () => {
  it('costs every legal score correctly', () => {
    expect(POINT_BUY_COSTS[8]).toBe(0)
    expect(POINT_BUY_COSTS[13]).toBe(5)
    // The jump at 14 and 15 is what stops everyone maxing three stats.
    expect(POINT_BUY_COSTS[14]).toBe(7)
    expect(POINT_BUY_COSTS[15]).toBe(9)
  })

  it('spends nothing on the all-8 floor', () => {
    expect(pointBuySpent(pointBuyFloor())).toBe(0)
    expect(pointBuyRemaining(pointBuyFloor())).toBe(POINT_BUY_BUDGET)
  })

  it('a 15/15/15/8/8/8 spread costs exactly 27', () => {
    const scores: Record<Ability, number> = {
      str: 15,
      dex: 15,
      con: 15,
      int: 8,
      wis: 8,
      cha: 8,
    }
    expect(pointBuySpent(scores)).toBe(27)
    expect(pointBuyRemaining(scores)).toBe(0)
  })

  it('cannot raise past 15', () => {
    const scores = { ...pointBuyFloor(), str: 15 }
    expect(canRaise(scores, 'str')).toBe(false)
  })

  it('cannot raise when the step is unaffordable', () => {
    // 15/15/15/8/8/8 spends the whole budget; 8 -> 9 costs 1 more.
    const scores: Record<Ability, number> = {
      str: 15,
      dex: 15,
      con: 15,
      int: 8,
      wis: 8,
      cha: 8,
    }
    expect(canRaise(scores, 'int')).toBe(false)
  })

  it('cannot lower below 8', () => {
    expect(canLower(pointBuyFloor(), 'str')).toBe(false)
    expect(canLower({ ...pointBuyFloor(), str: 9 }, 'str')).toBe(true)
  })

  it('a point-buy draft is valid while the budget holds', () => {
    const draft: AbilityDraft = {
      ...emptyAbilityDraft(),
      method: 'pointbuy',
      direct: pointBuyFloor(),
    }
    expect(abilitiesValid(draft)).toBe(true)
  })
})

describe('roll4d6DropLowest', () => {
  it('all ones gives 3', () => {
    const roll = roll4d6DropLowest(() => 0)
    expect(roll.dice).toEqual([1, 1, 1, 1])
    expect(roll.total).toBe(3)
  })

  it('all sixes gives 18', () => {
    const roll = roll4d6DropLowest(() => 0.999)
    expect(roll.dice).toEqual([6, 6, 6, 6])
    expect(roll.total).toBe(18)
  })

  it('drops the lowest die', () => {
    const roll = roll4d6DropLowest(scriptedRng([6, 5, 4, 1]))
    expect(roll.dice).toEqual([6, 5, 4, 1])
    expect(roll.droppedIndex).toBe(3)
    expect(roll.total).toBe(15)
  })

  it('drops the first of tied lowest dice', () => {
    // Two 2s: exactly one die is struck through in the UI, so which one has to
    // be deterministic or the display flickers between renders.
    const roll = roll4d6DropLowest(scriptedRng([2, 5, 2, 6]))
    expect(roll.droppedIndex).toBe(0)
    expect(roll.total).toBe(13)
  })

  it('always keeps exactly three dice', () => {
    for (let seed = 0; seed < 20; seed++) {
      const roll = roll4d6DropLowest(() => ((seed * 7919) % 1000) / 1000)
      const kept = roll.dice.filter((_, i) => i !== roll.droppedIndex)
      expect(kept).toHaveLength(3)
      expect(roll.total).toBe(kept.reduce((a, b) => a + b, 0))
      expect(roll.total).toBeGreaterThanOrEqual(3)
      expect(roll.total).toBeLessThanOrEqual(18)
    }
  })
})

describe('grid geometry', () => {
  it('has exactly eight lines of three distinct in-range cells', () => {
    expect(GRID_LINES).toHaveLength(8)
    for (const line of GRID_LINES) {
      expect(line.cells).toHaveLength(3)
      expect(new Set(line.cells).size).toBe(3)
      for (const c of line.cells) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(8)
      }
    }
  })

  it('parallel lines never intersect', () => {
    expect(gridIntersection('row-0', 'row-1')).toBeNull()
    expect(gridIntersection('row-1', 'row-2')).toBeNull()
    expect(gridIntersection('col-1', 'col-2')).toBeNull()
    expect(gridIntersection('col-0', 'col-2')).toBeNull()
  })

  it('a row and a column always intersect', () => {
    expect(gridIntersection('row-1', 'col-1')).toBe(4)
    expect(gridIntersection('row-0', 'col-2')).toBe(2)
    expect(gridIntersection('row-2', 'col-0')).toBe(6)
  })

  it('the two diagonals cross at the centre', () => {
    expect(gridIntersection('diag-main', 'diag-anti')).toBe(4)
  })

  it('a diagonal meets a row or column at one cell', () => {
    expect(gridIntersection('diag-main', 'row-2')).toBe(8)
    expect(gridIntersection('diag-anti', 'col-0')).toBe(6)
    expect(gridIntersection('diag-main', 'col-0')).toBe(0)
  })

  it('is symmetric across all 28 unordered pairs', () => {
    const ids = GRID_LINES.map((l) => l.id)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expect(gridIntersection(ids[i], ids[j])).toBe(
          gridIntersection(ids[j], ids[i]),
        )
      }
    }
  })

  it('a line does not intersect itself', () => {
    for (const line of GRID_LINES) {
      expect(gridIntersection(line.id, line.id)).toBeNull()
    }
  })
})

describe('gridScores', () => {
  it('returns six values, line A first then line B', () => {
    const cells = countingGrid()
    expect(gridScores(cells, 'row-0', 'row-2')).toEqual([1, 2, 3, 7, 8, 9])
  })

  /**
   * The rule that reads like a bug and is not. Named explicitly so nobody
   * later "fixes" it — crossing the grid is how the method trades a distinct
   * roll for a doubled one.
   */
  it('an intersecting pair uses the shared cell value twice', () => {
    const cells = countingGrid()
    // Row 2 is [4,5,6]; Column 2 is [2,5,8]. They cross at index 4, value 5.
    expect(gridScores(cells, 'row-1', 'col-1')).toEqual([4, 5, 6, 2, 5, 8])
    expect(gridIntersection('row-1', 'col-1')).toBe(4)
  })

  it('parallel lines draw on six distinct cells', () => {
    const cells = countingGrid()
    const scores = gridScores(cells, 'col-0', 'col-2')
    expect(scores).toEqual([1, 4, 7, 3, 6, 9])
    expect(new Set(scores).size).toBe(6)
  })

  it('rollGrid produces nine cells', () => {
    expect(rollGrid(() => 0.5)).toHaveLength(9)
  })
})

describe('pool and assignment', () => {
  it('the standard array pool is the standard array', () => {
    expect(poolFor(emptyAbilityDraft())).toEqual([...STANDARD_ARRAY])
  })

  it('a grid pool is empty until both lines are drawn', () => {
    const base = emptyAbilityDraft()
    const noLines: AbilityDraft = {
      ...base,
      method: 'grid',
      grid: { cells: countingGrid(), lineA: null, lineB: null },
    }
    expect(poolFor(noLines)).toEqual([])

    const oneLine: AbilityDraft = {
      ...base,
      method: 'grid',
      grid: { cells: countingGrid(), lineA: 'row-0', lineB: null },
    }
    expect(poolFor(oneLine)).toEqual([])
  })

  it('the same line twice yields no pool and is invalid', () => {
    const draft: AbilityDraft = {
      ...emptyAbilityDraft(),
      method: 'grid',
      grid: { cells: countingGrid(), lineA: 'row-0', lineB: 'row-0' },
    }
    expect(poolFor(draft)).toEqual([])
    expect(abilitiesValid(draft)).toBe(false)
  })

  it('assigning a pool entry steals it from whoever held it', () => {
    let draft = emptyAbilityDraft()
    draft = assign(draft, 'str', 0)
    draft = assign(draft, 'dex', 0)
    expect(draft.assignment.str).toBeNull()
    expect(draft.assignment.dex).toBe(0)
  })

  it('assign does not mutate its input', () => {
    const draft = emptyAbilityDraft()
    const next = assign(draft, 'str', 2)
    expect(draft.assignment.str).toBeNull()
    expect(next.assignment.str).toBe(2)
  })

  it('is incomplete until all six are assigned', () => {
    let draft = emptyAbilityDraft()
    expect(assignmentComplete(draft)).toBe(false)
    ABILITIES.forEach((ability, i) => {
      draft = assign(draft, ability, i)
    })
    expect(assignmentComplete(draft)).toBe(true)
    expect(abilitiesValid(draft)).toBe(true)
  })

  it('unassigned abilities read as 10 rather than undefined', () => {
    // The live summary calls this on a half-filled draft every keystroke.
    const scores = baseScores(emptyAbilityDraft())
    for (const ability of ABILITIES) expect(scores[ability]).toBe(10)
  })

  it('manual and point buy read their direct scores', () => {
    const draft: AbilityDraft = {
      ...emptyAbilityDraft(),
      method: 'manual',
      direct: { str: 17, dex: 9, con: 14, int: 11, wis: 12, cha: 8 },
    }
    expect(baseScores(draft)).toEqual(draft.direct)
    expect(abilitiesValid(draft)).toBe(true)
  })
})

describe('autoAssign', () => {
  it('drops the highest values on the highest priorities', () => {
    const draft = autoAssign(emptyAbilityDraft(), [
      'str',
      'con',
      'dex',
      'wis',
      'cha',
      'int',
    ])
    const scores = baseScores(draft)
    // STANDARD_ARRAY is [15,14,13,12,10,8] against that priority order.
    expect(scores.str).toBe(15)
    expect(scores.con).toBe(14)
    expect(scores.dex).toBe(13)
    expect(scores.wis).toBe(12)
    expect(scores.cha).toBe(10)
    expect(scores.int).toBe(8)
    expect(assignmentComplete(draft)).toBe(true)
  })

  it('falls back to the canonical order given a malformed priority', () => {
    const draft = autoAssign(emptyAbilityDraft(), ['str'])
    expect(assignmentComplete(draft)).toBe(true)
  })

  it('assigns each pool entry exactly once', () => {
    const draft = autoAssign(emptyAbilityDraft(), [
      'cha',
      'dex',
      'con',
      'int',
      'wis',
      'str',
    ])
    const used = ABILITIES.map((a) => draft.assignment[a])
    expect(new Set(used).size).toBe(6)
  })
})
