import { afterEach, describe, expect, it, vi } from 'vitest'
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
  return renderTable(doc).rows
}

/** Column rows and card rows both, for the tests that switch between them. */
function renderTable(doc: string) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  // Left unfocused on purpose: a caret anywhere in the table reveals the whole
  // thing as raw source, which is the behaviour the other tests cover.
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [liveMarkdown({})] }),
    parent,
  })
  // The first build runs before any line is drawn and so cannot measure; in
  // the app a geometry change rebuilds. jsdom has no geometry, so a selection
  // change stands in for it (still unfocused, so nothing is revealed).
  view.dispatch({ selection: { anchor: 0 } })
  const rows = [
    ...parent.querySelectorAll('.cm-dm-table-head, .cm-dm-table-row'),
  ]
  const result = rows.map((row) => ({
    text: row.textContent,
    widths: [...row.querySelectorAll('.cm-dm-cell')].map(
      (cell) => (cell as HTMLElement).style.width,
    ),
  }))
  const cards = [...parent.querySelectorAll('.cm-dm-table-card')].map(
    (card) => ({
      style: (card as HTMLElement).style.getPropertyValue('--dm-card-label'),
      cells: [...card.querySelectorAll('.cm-dm-card-cell')].map((cell) => [
        cell.getAttribute('data-label'),
        cell.textContent,
      ]),
    }),
  )
  view.destroy()
  parent.remove()
  return { rows: result, cards }
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

/**
 * A pane `px` wide with an 8px `ch`. jsdom lays nothing out, so both of the
 * numbers measureColumns reads are faked: the content's width, and the 100ch
 * probe it measures a character with.
 */
function narrowPane(px: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(px)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800,
  } as DOMRect)
}

describe('live tables in a narrow pane', () => {
  afterEach(() => vi.restoreAllMocks())

  const GUILD = [
    '| Rank | Held by | Notes |',
    '| --- | --- | --- |',
    '| Grand Apothecary | The highest governing entity of the guild | Breaks all ties from the Council |',
    '| Chanceller | --- | |',
  ].join('\n')

  it('shares only the inside of the line between the columns', () => {
    // 520px is 65 characters, but .cm-content pads 1rem a side and .cm-line
    // 6px + 2px, which leaves 59. The bug this pins: the budget took only four
    // characters off for both, so the last cell came out wider than the line
    // and dropped onto a line of its own under the wrong header.
    narrowPane(520)
    // jsdom applies no stylesheet, so the theme's padding is supplied by hand.
    const real = window.getComputedStyle.bind(window)
    const padding: Record<string, [string, string]> = {
      'cm-content': ['16px', '16px'],
      'cm-line': ['6px', '2px'],
    }
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((el) => {
      const pad = Object.entries(padding).find(([cls]) =>
        el.classList.contains(cls),
      )?.[1]
      const style = real(el)
      if (!pad) return style
      return new Proxy(style, {
        get: (target, key) =>
          key === 'paddingLeft'
            ? pad[0]
            : key === 'paddingRight'
              ? pad[1]
              : Reflect.get(target, key),
      })
    })
    const { rows } = renderTable(GUILD)
    const total = rows[0].widths.reduce((n, w) => n + parseInt(w), 0)
    expect(total).toBeLessThanOrEqual(59)
  })

  it('turns rows into labelled cards when the columns would be cramped', () => {
    narrowPane(300)
    const { rows, cards } = renderTable(GUILD)
    // The header is hidden — each card repeats it — and nothing is sized as a
    // column.
    expect(rows).toEqual([])
    const label = `${'Held by'.length + 2}ch`
    expect(cards).toEqual([
      {
        style: label,
        cells: [
          ['Rank', 'Grand Apothecary'],
          ['Held by', 'The highest governing entity of the guild'],
          ['Notes', 'Breaks all ties from the Council'],
        ],
      },
      {
        style: label,
        // An empty cell has nothing to show, so it has no line in the card.
        cells: [
          ['Rank', 'Chanceller'],
          ['Held by', '---'],
        ],
      },
    ])
  })

  it('keeps a table of short columns as columns, however narrow', () => {
    narrowPane(300)
    const { rows, cards } = renderTable(
      ['| Item | Cost |', '|---|---|', '| Rope | 1 gp |'].join('\n'),
    )
    expect(cards).toEqual([])
    expect(rows).toHaveLength(2)
  })
})
