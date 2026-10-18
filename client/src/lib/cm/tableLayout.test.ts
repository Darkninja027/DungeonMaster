import { describe, expect, it } from 'vitest'
import {
  CELL_GUTTER,
  MIN_COLUMN,
  columnWidths,
  tableLayout,
  visibleText,
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

  it('budgets a dice chip wider than its notation', () => {
    // The chip is padded and bordered; measured as six letters, `1d4 gp`
    // wrapped its `gp` onto a second line.
    expect(visibleWidth('1d4 gp')).toBe('1d4 gp'.length + 2)
    expect(visibleWidth('2d6+3 and 1d8')).toBe('2d6+3 and 1d8'.length + 4)
    expect(visibleWidth('add 6')).toBe(5)
  })
})

describe('visibleText', () => {
  it('is the cell as the preview shows it', () => {
    expect(visibleText(' **Rank** ')).toBe('Rank')
    expect(visibleText('[[Strahd|the count]]')).toBe('the count')
  })
})

describe('tableLayout', () => {
  const header = ['Rank', 'Held by', 'Notes']
  const body = [
    [
      'Grand Apothecary',
      'The highest governing entity of the guild, voted in by the Gathering',
      'Has the final say and breaks all ties from the Council votes',
    ],
  ]

  it('keeps columns while every squeezed column stays readable', () => {
    const layout = tableLayout(header, body, 63)
    expect(layout.mode).toBe('columns')
    if (layout.mode === 'columns')
      expect(sum(layout.widths)).toBeLessThanOrEqual(63)
  })

  it('switches to cards once a squeezed column drops below CARD_BELOW', () => {
    const layout = tableLayout(header, body, 36)
    expect(layout).toEqual({
      mode: 'cards',
      labels: ['Rank', 'Held by', 'Notes'],
      labelWidth: 'Held by'.length + CELL_GUTTER,
    })
  })

  it('does not count a column that is narrow only because it is short', () => {
    // Every column here fits at its natural width — nothing was squeezed, so
    // nothing is cramped, however narrow `Rings` is.
    const layout = tableLayout(['Item', 'Rings'], [['Rope', '5']], 30)
    expect(layout.mode).toBe('columns')
  })

  it('never makes cards of a table with no body', () => {
    const layout = tableLayout(header, [], 20)
    expect(layout.mode).toBe('columns')
  })

  it('caps the label at a third of the line', () => {
    const layout = tableLayout(
      ['An extremely long header that goes on', 'B'],
      [['x', 'y'.repeat(80)]],
      21,
    )
    expect(layout.mode).toBe('cards')
    if (layout.mode === 'cards') expect(layout.labelWidth).toBe(7)
  })

  it('shows a header as plain text, syntax hidden', () => {
    const layout = tableLayout(
      ['**Rank**', 'Notes'],
      [['a', 'b'.repeat(90)]],
      16,
    )
    expect(layout.mode === 'cards' && layout.labels[0]).toBe('Rank')
  })

  it('leaves a missing header cell as an empty label', () => {
    const layout = tableLayout(['Rank'], [['a', 'b'.repeat(90)]], 16)
    expect(layout.mode === 'cards' && layout.labels).toEqual(['Rank', ''])
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
