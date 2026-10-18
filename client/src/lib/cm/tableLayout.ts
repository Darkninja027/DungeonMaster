/**
 * Column widths for the editor's live-preview tables.
 *
 * A decorated table contains no <table>: every row is its own `.cm-line`, so
 * the browser has nothing to share a column width across and packs each row
 * independently. One long cell in row three and every column after it goes
 * ragged — losing the one thing a table is for.
 *
 * So the widths are worked out here and handed to each cell as an explicit `ch`
 * width. The editor body is monospace, which makes `ch` exact: the same number
 * is the same pixel and the same column edge on every row.
 *
 * Pure and DOM-free. The only measuring is `measureColumns` in decorations.ts;
 * the arithmetic below is testable in plain node.
 */
import { DICE_NOTATION } from '#/lib/formatMarkdown'

/** Gap after each column, in characters. `.cm-dm-cell` pads by the same. */
export const CELL_GUTTER = 2

/** Floor for a squeezed column — narrower than this and prose is unreadable. */
export const MIN_COLUMN = 6

const PIPED_WIKI_LINK = /\[\[[^[\]|\n]*\|([^[\]\n]*)\]\]/g
const WIKI_LINK = /\[\[([^[\]\n]*)\]\]/g
const HIDDEN_MARKS = /\*\*|~~|[*`]/g
const DICE = new RegExp(String.raw`\b${DICE_NOTATION}\b`, 'g')

/**
 * The extra a dice chip takes over its bare notation: `.cm-dm-dice` pads 0.35em
 * a side and adds a hairline border, about a character and a half all told.
 * Uncounted, `1d4 gp` measured exactly its six letters and the `gp` wrapped.
 */
const DICE_CHIP_EXTRA = 2

/**
 * How wide a cell READS once the live preview has hidden its syntax:
 * `**Chit**` occupies four columns on screen, not eight, and
 * `[[Strahd|the count]]` occupies nine.
 *
 * Still approximate — the dice match is looser than the scanner's, so it may
 * budget for a chip that never renders. Being a little off costs a column some
 * slack, not a broken layout.
 */
export function visibleWidth(cell: string): number {
  const text = visibleText(cell)
  return text.length + (text.match(DICE)?.length ?? 0) * DICE_CHIP_EXTRA
}

/** A cell's text as the live preview shows it — see {@link visibleWidth}. */
export function visibleText(cell: string): string {
  return cell
    .trim()
    .replace(PIPED_WIKI_LINK, '$1')
    .replace(WIKI_LINK, '$1')
    .replace(HIDDEN_MARKS, '')
}

/**
 * Width in characters for each column of `rows`, gutter included.
 *
 * `rows` is indexed by column and may be sparse: a row written `| a || b |`
 * has no cell at all in the middle column, and the hole has to keep its place
 * or everything after it shifts left.
 */
export function columnWidths(
  rows: ReadonlyArray<ReadonlyArray<string | undefined>>,
  available: number,
): Array<number> {
  const count = rows.reduce((n, row) => Math.max(n, row.length), 0)
  if (count === 0) return []

  // What each column would take if nothing else wanted the room.
  const natural = Array.from({ length: count }, (_, i) =>
    Math.max(
      MIN_COLUMN,
      rows.reduce((w, row) => Math.max(w, visibleWidth(row[i] ?? '')), 0) +
        CELL_GUTTER,
    ),
  )
  if (natural.reduce((a, b) => a + b, 0) <= available) return natural

  // Over budget. Dividing evenly would be wrong: `Rings` holds one digit and
  // would sit in a fifth of the line while the prose column that needs the
  // room wraps every three words. So offer every column an equal share, let
  // the ones asking for less take only what they need, and re-offer what they
  // handed back to the rest. Whoever is still over at the end splits the
  // remainder — which is the fair reading of "these columns are the long ones".
  const width = natural.slice()
  const hungry = new Set(natural.keys())
  let remaining = available
  for (;;) {
    const share = remaining / hungry.size
    const content = [...hungry].filter((i) => natural[i] <= share)
    if (content.length === 0) break
    for (const i of content) {
      remaining -= natural[i]
      hungry.delete(i)
    }
    // Unreachable while the totals are over budget (the columns left always
    // want more than what is left), but a zero-size Set would divide by zero.
    if (hungry.size === 0) return width
  }
  const share = Math.max(MIN_COLUMN, Math.floor(remaining / hungry.size))
  for (const i of hungry) width[i] = share
  return width
}

/**
 * Below this many characters of text, a squeezed column stops being worth
 * keeping as a column: three words a line, every row six lines tall, and the
 * header itself wrapping. The table is shown as stacked cards instead.
 */
export const CARD_BELOW = 12

/** Columns, as {@link columnWidths} sizes them. */
export interface ColumnLayout {
  mode: 'columns'
  widths: Array<number>
}

/**
 * One card per body row: each cell on its own line, prefixed with its header.
 * `labels` is the header text per column, `labelWidth` the `ch` box they share
 * so the values beside them line up.
 */
export interface CardLayout {
  mode: 'cards'
  labels: Array<string>
  labelWidth: number
}

/**
 * Columns while they stay readable, cards once they don't.
 *
 * Only a column that was actually squeezed can tip a table into cards: `Rings`
 * holding one digit is narrow because that is all it needs, and a table of
 * short columns reads perfectly well. Nor can a table that is only a header —
 * it has no body row to make a card from.
 *
 * Cards are also what keeps the row on its line. Once the floor in
 * {@link columnWidths} kicks in the widths can add up to more than the pane,
 * and the last cell drops to a line of its own under the wrong header; that is
 * below CARD_BELOW by construction, so columns mode never sees it.
 */
export function tableLayout(
  header: ReadonlyArray<string | undefined>,
  body: ReadonlyArray<ReadonlyArray<string | undefined>>,
  available: number,
): ColumnLayout | CardLayout {
  const rows = [header, ...body]
  const widths = columnWidths(rows, available)
  const natural = columnWidths(rows, Infinity)
  const cramped = widths.some(
    (w, i) => w < natural[i] && w - CELL_GUTTER < CARD_BELOW,
  )
  if (!cramped || body.length === 0) return { mode: 'columns', widths }

  // Shown through CSS `content`, so as plain text: `**Rank**` would print its
  // asterisks, there being no decorator in a pseudo-element to hide them.
  const labels = widths.map((_, i) => visibleText(header[i] ?? ''))
  // Wide enough for the longest header, but never more than a third of the
  // line: a long header wraps inside its own box rather than starving the
  // value of the room this layout exists to give it.
  const longest = labels.reduce((w, l) => Math.max(w, l.length), 0)
  const labelWidth = Math.min(
    longest + CELL_GUTTER,
    Math.max(MIN_COLUMN, Math.floor(available / 3)),
  )
  return { mode: 'cards', labels, labelWidth }
}
