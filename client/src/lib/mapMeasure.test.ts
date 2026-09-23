import { describe, expect, it } from 'vitest'
import {
  FEET_PER_CELL,
  cellDistance,
  clipToGrid,
  feetBetween,
  formatDistance,
  templateCells,
  tokensInArea,
} from './mapMeasure'
import type { Template } from './mapMeasure'
import type { Point } from './mapCamera'

/**
 * The distance rule is a *choice* (Chebyshev — 5e's "a diagonal is 5 feet"),
 * so the tests pin the choice rather than just the arithmetic. If someone ever
 * swaps in Euclidean, the diagonal cases below are what should stop them.
 */

const key = (p: Point) => `${p.x},${p.y}`
const has = (cells: Array<Point>, x: number, y: number) =>
  cells.some((c) => c.x === x && c.y === y)

describe('cellDistance', () => {
  it('counts a straight run in squares', () => {
    expect(cellDistance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3)
    expect(cellDistance({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(4)
  })

  it('counts a diagonal as one square, not 1.41', () => {
    // The whole diagonal rule in one assertion: 3 diagonal steps is 3 squares
    // (15 ft), which is what a table plays. Euclidean would give ~4.24.
    expect(cellDistance({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(3)
    expect(feetBetween({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(15)
  })

  it('is symmetric and zero at the same square', () => {
    expect(cellDistance({ x: 2, y: 5 }, { x: 2, y: 5 })).toBe(0)
    expect(cellDistance({ x: 1, y: 2 }, { x: 4, y: 9 })).toBe(
      cellDistance({ x: 4, y: 9 }, { x: 1, y: 2 }),
    )
  })

  it('converts to feet at 5 per square', () => {
    expect(FEET_PER_CELL).toBe(5)
    expect(feetBetween({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(30)
  })
})

describe('formatDistance', () => {
  it('reads as feet up to a mile', () => {
    expect(formatDistance(30)).toBe('30 ft.')
    expect(formatDistance(0)).toBe('0 ft.')
  })

  it('switches to miles past 5280', () => {
    expect(formatDistance(5280)).toBe('1 mi.')
    expect(formatDistance(7920)).toBe('1.5 mi.')
  })
})

describe('templateCells', () => {
  function tpl(over: Partial<Template>): Template {
    return {
      kind: 'circle',
      origin: { x: 10, y: 10 },
      toward: { x: 15, y: 10 },
      feet: 20,
      ...over,
    }
  }

  describe('circle', () => {
    it('covers every cell within the radius', () => {
      // 20 ft = 4 squares, Chebyshev, so a 9x9 block centred on the origin.
      const cells = templateCells(tpl({ kind: 'circle', feet: 20 }))
      expect(cells).toHaveLength(9 * 9)
      expect(has(cells, 10, 10)).toBe(true)
      expect(has(cells, 14, 14)).toBe(true) // the diagonal corner IS in range
      expect(has(cells, 15, 10)).toBe(false)
    })

    it('never produces an empty area for a tiny radius', () => {
      expect(
        templateCells(tpl({ kind: 'circle', feet: 1 })).length,
      ).toBeGreaterThan(0)
    })

    it('ignores the aim point', () => {
      const a = templateCells(tpl({ kind: 'circle', toward: { x: 99, y: 99 } }))
      const b = templateCells(tpl({ kind: 'circle', toward: { x: 0, y: 0 } }))
      expect(a.map(key).sort()).toEqual(b.map(key).sort())
    })
  })

  describe('cone', () => {
    it('opens away from the origin, in the aimed direction', () => {
      const cells = templateCells(
        tpl({ kind: 'cone', feet: 15, toward: { x: 20, y: 10 } }),
      )
      // Ahead is in; behind is not.
      expect(has(cells, 13, 10)).toBe(true)
      expect(has(cells, 7, 10)).toBe(false)
    })

    it('widens with distance', () => {
      const cells = templateCells(
        tpl({ kind: 'cone', feet: 30, toward: { x: 20, y: 10 } }),
      )
      const spreadNear = cells.filter((c) => c.x === 11).length
      const spreadFar = cells.filter((c) => c.x === 15).length
      expect(spreadFar).toBeGreaterThan(spreadNear)
    })

    it('works at a diagonal, not just the compass points', () => {
      const cells = templateCells(
        tpl({ kind: 'cone', feet: 20, toward: { x: 14, y: 14 } }),
      )
      expect(has(cells, 12, 12)).toBe(true)
      expect(has(cells, 8, 8)).toBe(false)
    })

    it('degenerates to the origin when aimed at itself', () => {
      expect(
        templateCells(
          tpl({ kind: 'cone', origin: { x: 5, y: 5 }, toward: { x: 5, y: 5 } }),
        ),
      ).toEqual([{ x: 5, y: 5 }])
    })
  })

  describe('line', () => {
    it('runs from the origin toward the aim, at its length', () => {
      const cells = templateCells(
        tpl({
          kind: 'line',
          origin: { x: 0, y: 0 },
          toward: { x: 1, y: 0 },
          feet: 30,
        }),
      )
      expect(has(cells, 0, 0)).toBe(true)
      expect(has(cells, 6, 0)).toBe(true) // 30 ft = 6 squares
      expect(has(cells, 7, 0)).toBe(false)
    })

    it('leaves no gap on a diagonal run', () => {
      const cells = templateCells(
        tpl({
          kind: 'line',
          origin: { x: 0, y: 0 },
          toward: { x: 1, y: 1 },
          feet: 25,
        }),
      )
      for (let i = 0; i <= 5; i += 1) expect(has(cells, i, i)).toBe(true)
    })

    it('returns each cell once', () => {
      const cells = templateCells(
        tpl({
          kind: 'line',
          origin: { x: 0, y: 0 },
          toward: { x: 3, y: 1 },
          feet: 50,
        }),
      )
      expect(new Set(cells.map(key)).size).toBe(cells.length)
    })

    it('degenerates to the origin when aimed at itself', () => {
      expect(
        templateCells(
          tpl({ kind: 'line', origin: { x: 2, y: 2 }, toward: { x: 2, y: 2 } }),
        ),
      ).toEqual([{ x: 2, y: 2 }])
    })
  })

  describe('square', () => {
    it('covers a block around the origin', () => {
      // 10 ft = 2 squares each way, so 5x5.
      const cells = templateCells(tpl({ kind: 'square', feet: 10 }))
      expect(cells).toHaveLength(25)
      expect(has(cells, 8, 8)).toBe(true)
      expect(has(cells, 7, 10)).toBe(false)
    })
  })
})

describe('clipToGrid', () => {
  it('drops everything off the map', () => {
    const cells = [
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 0 },
      { x: 9, y: 9 },
      { x: 10, y: 5 },
    ]
    expect(clipToGrid(cells, 10, 10).map(key)).toEqual(['0,0', '9,9'])
  })
})

describe('tokensInArea', () => {
  const span = (t: { size: number }) => t.size

  it('catches a token standing in the area', () => {
    const tokens = [
      { id: 'a', x: 1, y: 1, size: 1 },
      { id: 'b', x: 8, y: 8, size: 1 },
    ]
    const area = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]
    expect(tokensInArea(tokens, area, span).map((t) => t.id)).toEqual(['a'])
  })

  it('catches a big token by any part of its footprint', () => {
    // The dragon's origin is outside the blast; its tail is not.
    const dragon = { id: 'dragon', x: 4, y: 4, size: 3 }
    const area = [{ x: 6, y: 6 }]
    expect(tokensInArea([dragon], area, span).map((t) => t.id)).toEqual([
      'dragon',
    ])
  })

  it('catches nothing when the area is empty', () => {
    expect(tokensInArea([{ id: 'a', x: 0, y: 0, size: 1 }], [], span)).toEqual(
      [],
    )
  })
})
