import { describe, expect, it } from 'vitest'
import { bySortOrder, touches, touchesBlock } from './reveal'
import type { Range } from './reveal'

/** A caret is a zero-width range, which is the common case in these tests. */
const caret = (at: number): Array<Range> => [{ from: at, to: at }]

describe('touches', () => {
  // "**bold**" occupies [0, 8): markers at 0-2 and 6-8, the word at 2-6.
  const NODE = { from: 0, to: 8 }

  it('reveals when the caret is inside the node', () => {
    expect(touches(caret(4), NODE.from, NODE.to)).toBe(true)
  })

  it('reveals when the caret is at the exact start', () => {
    expect(touches(caret(0), NODE.from, NODE.to)).toBe(true)
  })

  it('reveals when the caret is at the exact end', () => {
    // The moment you finish typing the closing `**` the caret lands here. If
    // this returned false the markers would collapse under the cursor and the
    // line would visibly jump — the single worst feel-bug in live preview.
    expect(touches(caret(8), NODE.from, NODE.to)).toBe(true)
  })

  it('does not reveal a node the caret has moved past', () => {
    expect(touches(caret(9), NODE.from, NODE.to)).toBe(false)
  })

  it('does not reveal a node the caret sits before', () => {
    expect(touches(caret(4), 10, 18)).toBe(false)
  })

  it('reveals every node a selection overlaps', () => {
    // A selection spanning two emphasised words reveals both.
    const selection = [{ from: 4, to: 14 }]
    expect(touches(selection, 0, 8)).toBe(true)
    expect(touches(selection, 10, 18)).toBe(true)
  })

  it('reveals a node wholly contained in the selection', () => {
    expect(touches([{ from: 0, to: 40 }], 10, 18)).toBe(true)
  })

  it('reveals for any one of several cursors', () => {
    const multi = [
      { from: 0, to: 0 },
      { from: 12, to: 12 },
    ]
    expect(touches(multi, 10, 18)).toBe(true)
  })

  it('does not reveal when no cursor is near', () => {
    const multi = [
      { from: 0, to: 0 },
      { from: 30, to: 30 },
    ]
    expect(touches(multi, 10, 18)).toBe(false)
  })

  it('handles an empty selection list', () => {
    expect(touches([], 0, 8)).toBe(false)
  })
})

describe('touchesBlock', () => {
  // A three-line fence. Lines: [0,10) [11,20) [21,24)
  const LINES: Array<Range> = [
    { from: 0, to: 10 },
    { from: 11, to: 20 },
    { from: 21, to: 24 },
  ]
  const lineAt = (pos: number) =>
    LINES.find((l) => pos >= l.from && pos <= l.to) ?? LINES[LINES.length - 1]

  it('reveals the whole block from a caret on any of its lines', () => {
    // Caret on the middle line reveals the opening and closing fence too —
    // a half-raw table or fence is unreadable.
    expect(touchesBlock(caret(15), 0, 24, lineAt)).toBe(true)
  })

  it('reveals when the caret is on the block opening line', () => {
    expect(touchesBlock(caret(3), 0, 24, lineAt)).toBe(true)
  })

  it('does not reveal when the caret is outside the block', () => {
    expect(touchesBlock(caret(30), 0, 10, lineAt)).toBe(false)
  })

  it('widens to line bounds, so a caret past the node end still reveals', () => {
    // Node ends at 5 but its line runs to 10; a caret at 8 is still "in" it.
    expect(touchesBlock(caret(8), 0, 5, lineAt)).toBe(true)
    expect(touches(caret(8), 0, 5)).toBe(false) // the inline rule disagrees
  })
})

describe('bySortOrder', () => {
  it('orders by position', () => {
    const sorted = [
      { from: 10, side: 0 },
      { from: 2, side: 0 },
      { from: 6, side: 0 },
    ].sort(bySortOrder)
    expect(sorted.map((d) => d.from)).toEqual([2, 6, 10])
  })

  it('puts line decorations before marks at the same position', () => {
    // A heading contributes a line decoration at the line start and a hide
    // decoration for its `#` at the same offset; the line one must come first.
    const sorted = [
      { from: 4, side: 1 },
      { from: 4, side: -1 },
    ].sort(bySortOrder)
    expect(sorted.map((d) => d.side)).toEqual([-1, 1])
  })
})
