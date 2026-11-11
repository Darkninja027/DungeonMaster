import { describe, expect, it } from 'vitest'
import {
  emptyFog,
  hideAll,
  isRevealed,
  parseFog,
  resizeFog,
  revealAll,
  revealedCount,
  setCells,
} from './fog'

/**
 * The bitmask encoding exists to keep a battlemap under `MAX_STATE_BYTES`, so
 * the size test at the bottom is the one that actually justifies the module.
 * The rest pin the bit arithmetic, which is the easy thing to get subtly wrong.
 */

const MAX_STATE_BYTES = 256 * 1024

describe('fog', () => {
  it('starts with nothing revealed and an empty mask', () => {
    const fog = emptyFog(10, 10)
    expect(fog.mask).toBe('')
    expect(revealedCount(fog)).toBe(0)
    expect(isRevealed(fog, 0, 0)).toBe(false)
  })

  it('round-trips a single cell', () => {
    const fog = setCells(emptyFog(10, 10), [{ x: 3, y: 4 }], true)
    expect(isRevealed(fog, 3, 4)).toBe(true)
    expect(revealedCount(fog)).toBe(1)
    // Its neighbours must not come along for the ride — an off-by-one in the
    // bit index shows up here and nowhere else.
    expect(isRevealed(fog, 2, 4)).toBe(false)
    expect(isRevealed(fog, 4, 4)).toBe(false)
    expect(isRevealed(fog, 3, 3)).toBe(false)
    expect(isRevealed(fog, 3, 5)).toBe(false)
  })

  it('distinguishes (x, y) from (y, x) on a non-square grid', () => {
    // A row-major bug is invisible on a square grid, so this one is 8x3.
    const fog = setCells(emptyFog(8, 3), [{ x: 7, y: 0 }], true)
    expect(isRevealed(fog, 7, 0)).toBe(true)
    expect(isRevealed(fog, 0, 7)).toBe(false)
    expect(revealedCount(fog)).toBe(1)
  })

  it('reveals and hides a run in one pass', () => {
    const run = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]
    const shown = setCells(emptyFog(5, 5), run, true)
    expect(revealedCount(shown)).toBe(3)
    const hidden = setCells(shown, [{ x: 1, y: 0 }], false)
    expect(isRevealed(hidden, 1, 0)).toBe(false)
    expect(isRevealed(hidden, 0, 0)).toBe(true)
    expect(revealedCount(hidden)).toBe(2)
  })

  it('packs an all-hidden mask back to the empty string', () => {
    const fog = setCells(emptyFog(4, 4), [{ x: 1, y: 1 }], true)
    expect(fog.mask).not.toBe('')
    expect(setCells(fog, [{ x: 1, y: 1 }], false).mask).toBe('')
  })

  it('reveals and hides everything', () => {
    const all = revealAll(emptyFog(7, 5))
    expect(revealedCount(all)).toBe(35)
    expect(isRevealed(all, 6, 4)).toBe(true)
    expect(revealedCount(hideAll(all))).toBe(0)
  })

  it('ignores cells outside the grid rather than throwing', () => {
    const fog = emptyFog(4, 4)
    expect(isRevealed(fog, -1, 0)).toBe(false)
    expect(isRevealed(fog, 4, 0)).toBe(false)
    const after = setCells(
      fog,
      [
        { x: 99, y: 99 },
        { x: -1, y: -1 },
      ],
      true,
    )
    expect(revealedCount(after)).toBe(0)
  })

  it('keeps overlapping cells when the grid is resized', () => {
    const fog = setCells(
      emptyFog(10, 10),
      [
        { x: 1, y: 1 },
        { x: 9, y: 9 },
      ],
      true,
    )
    const smaller = resizeFog(fog, 5, 5)
    expect(isRevealed(smaller, 1, 1)).toBe(true)
    // (9, 9) is off the new grid and is simply gone.
    expect(revealedCount(smaller)).toBe(1)

    const bigger = resizeFog(fog, 20, 20)
    expect(isRevealed(bigger, 1, 1)).toBe(true)
    expect(isRevealed(bigger, 9, 9)).toBe(true)
    expect(revealedCount(bigger)).toBe(2)
  })

  it('survives a mask left over from a different grid size', () => {
    // Hand-edit or an older save: the mask is for a 10x10, the grid says 4x4.
    const wide = setCells(emptyFog(10, 10), [{ x: 0, y: 0 }], true)
    const fog = { cols: 4, rows: 4, mask: wide.mask }
    expect(() => revealedCount(fog)).not.toThrow()
    expect(isRevealed(fog, 0, 0)).toBe(true)
  })

  it('treats a non-base64 mask as nothing revealed', () => {
    const fog = { cols: 4, rows: 4, mask: 'not base64 !!' }
    expect(revealedCount(fog)).toBe(0)
    expect(isRevealed(fog, 0, 0)).toBe(false)
  })

  describe('parseFog', () => {
    it('reads a well-formed layer', () => {
      expect(parseFog({ cols: 3, rows: 2, mask: 'AA==' })).toEqual({
        cols: 3,
        rows: 2,
        mask: 'AA==',
      })
    })

    it('rejects anything without a real grid', () => {
      expect(parseFog(null)).toBeNull()
      expect(parseFog('nope')).toBeNull()
      expect(parseFog({ cols: 0, rows: 5 })).toBeNull()
      expect(parseFog({ cols: 'lots', rows: 5 })).toBeNull()
    })

    it('defaults a missing mask to nothing revealed', () => {
      expect(parseFog({ cols: 2, rows: 2 })?.mask).toBe('')
    })
  })

  /**
   * The invariant the whole encoding exists for. `writeWorldJson` throws rather
   * than truncating, so a fog layer that outgrows the cap does not degrade — it
   * takes the save down with it. A 500x500 grid is far past any battlemap
   * someone will actually draw, which is the point: the headroom is the margin
   * of safety for the tokens stored beside it.
   */
  it('stays far under MAX_STATE_BYTES at an absurd grid size', () => {
    const cols = 500
    const rows = 500
    const cells: Array<{ x: number; y: number }> = []
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if ((x * 7 + y * 13) % 5 < 2) cells.push({ x, y })
      }
    }
    const fog = setCells(emptyFog(cols, rows), cells, true)
    expect(revealedCount(fog)).toBe(cells.length)

    const json = JSON.stringify(fog, null, 2)
    expect(Buffer.byteLength(json)).toBeLessThan(MAX_STATE_BYTES / 4)
  })
})
