import { describe, expect, it } from 'vitest'
import {
  CELL_GUTTER,
  MIN_COLUMN,
  columnWidths,
  visibleWidth,
} from './tableLayout'

/** Wide enough that nothing has to be squeezed. */
const ROOMY = 500

const sum = (ns: Array<number>) => ns.reduce((a, b) => a + b, 0)

describe('visibleWidth', () => {
  it('measures plain text', () => {
    expect(visibleWidth('none')).toBe(4)
  })

  it('ignores the padding a formatted table adds around a cell', () => {
    expect(visibleWidth('  Rank   ')).toBe(4)
  })

  it('discounts syntax the preview hides', () => {
    expect(visibleWidth('**Chit**')).toBe(4)
    expect(visibleWidth('*lance*')).toBe(5)
    expect(visibleWidth('~~gone~~')).toBe(4)
    expect(visibleWidth('`code`')).toBe(4)
  })

  it('measures a wiki link by what is shown, not what is written', () => {
    expect(visibleWidth('[[Strahd]]')).toBe(6)
    expect(visibleWidth('[[Strahd|the count]]')).toBe(9)
  })
})

describe('columnWidths', () => {
  it('gives every column its longest cell plus a gutter', () => {
    const widths = columnWidths(
      [
        ['Rank', 'Rings'],
        ['Guild Master', '5'],
      ],
      ROOMY,
    )
    expect(widths).toEqual([12 + CELL_GUTTER, 5 + CELL_GUTTER])
  })

  it('never returns a column narrower than the floor', () => {
    expect(columnWidths([['d', 'x']], ROOMY)).toEqual([MIN_COLUMN, MIN_COLUMN])
  })

  it('keeps a hole in a sparse row from shifting the columns', () => {
    // `| Sworn || 1 |` parses with no cell at all in the middle column.
    const rows: Array<Array<string | undefined>> = [
      ['Rank', 'Rings', 'Pay'],
      ['Sworn', undefined, '1 gp/day'],
    ]
    const widths = columnWidths(rows, ROOMY)
    expect(widths).toHaveLength(3)
    expect(widths[2]).toBe('1 gp/day'.length + CELL_GUTTER)
  })

  it('stays inside the budget when the table is too wide for the pane', () => {
    const widths = columnWidths(
      [
        ['Rank', 'Standing'],
        ['Chit', 'Applicant. '.repeat(20)],
      ],
      60,
    )
    expect(sum(widths)).toBeLessThanOrEqual(60)
  })

  it('squeezes the long column rather than the short one', () => {
    // The point of the share-and-hand-back pass: `Rings` asks for almost
    // nothing, so it should get what it asked for even though the table as a
    // whole is over budget.
    const widths = columnWidths(
      [
        ['Rank', 'Rings', 'Standing'],
        ['Guild Master', '5', 'Signs the charter. '.repeat(10)],
      ],
      60,
    )
    expect(widths[0]).toBe('Guild Master'.length + CELL_GUTTER)
    expect(widths[1]).toBe('Rings'.length + CELL_GUTTER)
    expect(sum(widths)).toBeLessThanOrEqual(60)
  })

  it('falls back to the floor when even that does not fit', () => {
    const widths = columnWidths([['aaaa', 'bbbb', 'cccc', 'dddd']], 10)
    expect(widths.every((w) => w >= MIN_COLUMN)).toBe(true)
  })

  it('has nothing to say about a table with no cells', () => {
    expect(columnWidths([], ROOMY)).toEqual([])
  })
})
