import { describe, expect, it } from 'vitest'
import { sheetsForWidth } from './Markdown'

/**
 * Sheet count is derived from a live `scrollWidth`, so the DOM half can't be
 * unit-tested here. The widths below are real measurements taken from Chromium
 * (Electron) against the actual .dnd-page / .dnd-flow CSS, paired with the
 * number of sheets the content genuinely occupied.
 */
describe('sheetsForWidth', () => {
  const CONTENT_W = 712
  const COL_GAP = 40

  it('a single column of content is one sheet', () => {
    expect(sheetsForWidth(CONTENT_W, 1)).toBe(1)
    // Two columns still fit on one two-column sheet.
    expect(sheetsForWidth(CONTENT_W, 2)).toBe(1)
  })

  it('never returns zero for empty content', () => {
    expect(sheetsForWidth(0, 1)).toBe(1)
    expect(sheetsForWidth(0, 2)).toBe(1)
  })

  it.each([
    // [scrollWidth, columns, expectedSheets] — measured in Chromium.
    [2968, 1, 4],
    [2592, 2, 4],
    [7480, 1, 10],
    [6352, 2, 9],
  ])(
    'scrollWidth %i with %i column(s) needs %i sheets',
    (width, columns, expected) => {
      expect(sheetsForWidth(width, columns as 1 | 2)).toBe(expected)
    },
  )

  it('counts single-column sheets one column at a time', () => {
    for (const n of [1, 2, 3, 7]) {
      const width = n * CONTENT_W + (n - 1) * COL_GAP
      expect(sheetsForWidth(width, 1)).toBe(n)
    }
  })

  it('packs two columns onto each two-column sheet', () => {
    const colW = (CONTENT_W - COL_GAP) / 2
    const widthFor = (cols: number) => cols * colW + (cols - 1) * COL_GAP
    expect(sheetsForWidth(widthFor(1), 2)).toBe(1)
    expect(sheetsForWidth(widthFor(2), 2)).toBe(1)
    expect(sheetsForWidth(widthFor(3), 2)).toBe(2)
    expect(sheetsForWidth(widthFor(4), 2)).toBe(2)
    expect(sheetsForWidth(widthFor(5), 2)).toBe(3)
  })

  it('grows monotonically with content width', () => {
    let previous = 0
    for (let width = 0; width < 12000; width += 137) {
      const sheets = sheetsForWidth(width, 2)
      expect(sheets).toBeGreaterThanOrEqual(previous)
      previous = sheets
    }
  })
})
