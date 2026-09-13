import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { liveMarkdown } from './liveMarkdown'

/**
 * Table columns in the live editor.
 *
 * There is no <table> in a decorated table — every row is its own `.cm-line` —
 * so nothing lines the columns up for free. These pin the part that does: the
 * width handed to each cell, and the padding hidden either side of the pipes
 * so a Tidy-aligned source doesn't drift a character per row.
 *
 * jsdom reports a zero-width editor, so decorations.ts falls back to its
 * 80-column default. That is the point here: the numbers are stable, and what
 * is being checked is that they AGREE down each column.
 */
function render(doc: string) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  // Left unfocused on purpose: a caret anywhere in the table reveals the whole
  // thing as raw source, which is the behaviour the other tests cover.
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [liveMarkdown({})] }),
    parent,
  })
  const rows = [
    ...parent.querySelectorAll('.cm-dm-table-head, .cm-dm-table-row'),
  ]
  const result = rows.map((row) => ({
    text: row.textContent,
    widths: [...row.querySelectorAll('.cm-dm-cell')].map(
      (cell) => (cell as HTMLElement).style.width,
    ),
  }))
  view.destroy()
  parent.remove()
  return result
}

describe('live table columns', () => {
  it('gives a column the same width in every row', () => {
    const rows = render(
      [
        '| Rank | Rings | Standing |',
        '|---|---|---|',
        '| **Chit** | none | Applicant. Carries a wooden tally. |',
        '| **Guild Master** | bell-and-sword chain | Signs the charter. |',
      ].join('\n'),
    )
    expect(rows).toHaveLength(3)
    expect(rows[0].widths).toHaveLength(3)
    expect(rows[1].widths).toEqual(rows[0].widths)
    expect(rows[2].widths).toEqual(rows[0].widths)
  })

  it('hides the pipes and the padding around them', () => {
    // A Tidy-formatted table pads every cell out to the column width. Left
    // visible, that padding is a different number of spaces on every row and
    // no amount of column sizing can straighten it out.
    const rows = render(
      [
        '| Rank  | Rings |',
        '| ----- | ----- |',
        '| Chit  | none  |',
        '| Sworn | 1     |',
      ].join('\n'),
    )
    for (const row of rows) {
      expect(row.text).not.toContain('|')
      expect(row.text).not.toMatch(/\s{2}/)
    }
    expect(rows.map((r) => r.text)).toEqual(['RankRings', 'Chitnone', 'Sworn1'])
  })

  it('holds the column when a row leaves a cell empty', () => {
    // `| Sworn || 1 |` parses with no cell at all in the middle column, so
    // without a spacer the pay column would slide left on that row alone.
    const rows = render(
      ['| Rank | Rings | Pay |', '|---|---|---|', '| Sworn || 1 gp |'].join(
        '\n',
      ),
    )
    const [head, body] = rows
    expect(head.widths).toHaveLength(3)
    // Two real cells plus a spacer standing in for the hole, so the row still
    // measures three columns wide and `1 gp` still sits under `Pay`.
    expect(body.widths).toEqual(head.widths)
  })

  it('sizes the separator row away rather than laying it out', () => {
    const rows = render(
      ['| Rank | Rings |', '|---|---|', '| Chit | none |'].join('\n'),
    )
    expect(rows.map((r) => r.text)).toEqual(['RankRings', 'Chitnone'])
  })
})
