import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { SheetFrame } from './SheetFrame'

/**
 * The frame is decoration, so the thing worth testing is not how it looks — it
 * is that it cannot reach the sheet's content.
 *
 * `.dnd-page` is 816x1056 with 48px/52px padding, so the content box starts at
 * (52, 48) and the ornament is anchored on the inner rule at 23px: 25px of
 * clear margin above the content, 29px beside it. A corner half runs along the
 * top edge, so its *depth* is its y, and the mirrored half is the same numbers
 * with the axes swapped — one bound covers both as long as it uses the tighter
 * of the two margins.
 *
 * Every control point of a cubic lies on or outside its own curve, so bounding
 * the raw numbers in the path data bounds the drawn curve too: conservative,
 * and no Bezier evaluator in the test.
 */

/** Clear margin between the ornament's anchor (the inner rule) and the text. */
const CLEAR = 48 - 23
/** Half the widest stroke in the ornament, which straddles its own path. */
const STROKE = 1

/** Every number in a `d`, paired up. Safe here: the paths are all coordinate
 *  pairs, and the one relative command (`l`) takes pairs too. */
function pairs(d: string): Array<[number, number]> {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  expect(nums.length % 2).toBe(0)
  const out: Array<[number, number]> = []
  for (let i = 0; i < nums.length; i += 2) out.push([nums[i], nums[i + 1]])
  return out
}

/**
 * Depth (y, in the group's own frame) of every point drawn under `el`.
 *
 * Nested `translate(a,b)` groups are folded in; the mirror group is skipped
 * because it re-draws the same numbers about the other axis, so measuring its
 * y would be measuring the wrong thing — and measuring the original already
 * bounds it.
 */
function depths(el: Element, dy = 0): Array<number> {
  const out: Array<number> = []
  for (const node of Array.from(el.children)) {
    const t = node.getAttribute('transform') ?? ''
    if (node.tagName === 'path') {
      // Only `l` is relative, and it only moves within a closed diamond, so
      // treating its deltas as offsets from the subpath origin is exact enough
      // for a bound.
      for (const [, y] of pairs(node.getAttribute('d') ?? '')) out.push(dy + y)
    } else if (node.tagName === 'circle') {
      const cy = Number(node.getAttribute('cy') ?? 0)
      const r = Number(node.getAttribute('r') ?? 0)
      out.push(dy + cy + r)
    } else if (node.tagName === 'g') {
      const m = /^translate\((-?[\d.]+),\s*(-?[\d.]+)\)$/.exec(t)
      if (m) out.push(...depths(node, dy + Number(m[2])))
      else if (!t.startsWith('matrix')) out.push(...depths(node, dy))
    }
  }
  return out
}

describe('SheetFrame', () => {
  const view = render(<SheetFrame />)
  const svg = view.container.querySelector('svg')!
  const groups = Array.from(svg.children).filter((n) => n.tagName === 'g')
  const at = (transform: string) =>
    groups.find((g) => g.getAttribute('transform') === transform)!

  it('covers the whole fixed sheet', () => {
    expect(svg.getAttribute('viewBox')).toBe('0 0 816 1056')
  })

  it('overlays the page rather than taking part in its layout', () => {
    // Inline, and depending on no stylesheet rule of its own: exportPdf's
    // capture only reliably carries inline styles and attributes, and a frame
    // that fell back to static flow would push the sheet's content down in the
    // PDF rather than merely look wrong. See SheetFrame.tsx.
    expect(svg.style.position).toBe('absolute')
    expect(svg.getAttribute('class')).toBeNull()
  })

  it('draws four corners and four edge fleurons', () => {
    expect(groups).toHaveLength(8)
    expect(at('translate(23,23)')).toBeTruthy()
    expect(at('translate(793,23) scale(-1,1)')).toBeTruthy()
    expect(at('translate(793,1033) scale(-1,-1)')).toBeTruthy()
    expect(at('translate(23,1033) scale(1,-1)')).toBeTruthy()
  })

  it('mirrors each corner instead of hand-drawing the second half', () => {
    const corner = at('translate(23,23)')
    const mirror = Array.from(corner.children).find(
      (n) => n.getAttribute('transform') === 'matrix(0 1 1 0 0 0)',
    )
    expect(mirror).toBeTruthy()
  })

  it('keeps every corner flourish clear of the content box', () => {
    for (const y of depths(at('translate(23,23)'))) {
      expect(y + STROKE).toBeLessThanOrEqual(CLEAR)
    }
  })

  it('keeps the edge fleurons hugging the rule they sit on', () => {
    // They point outward, into the 7px channel between the inner rule and the
    // outer one — never inward, where the banner is.
    for (const y of depths(at('translate(408,23)'))) {
      expect(Math.abs(y)).toBeLessThanOrEqual(7 + STROKE)
    }
  })
})
