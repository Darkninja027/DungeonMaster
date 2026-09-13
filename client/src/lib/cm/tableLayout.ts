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
 * Pure and DOM-free. The only measuring is one `defaultCharacterWidth` read in
 * decorations.ts; the arithmetic below is testable in plain node.
 */

/** Gap after each column, in characters. `.cm-dm-cell` pads by the same. */
export const CELL_GUTTER = 2

/** Floor for a squeezed column — narrower than this and prose is unreadable. */
export const MIN_COLUMN = 6

const PIPED_WIKI_LINK = /\[\[[^[\]|\n]*\|([^[\]\n]*)\]\]/g
const WIKI_LINK = /\[\[([^[\]\n]*)\]\]/g
const HIDDEN_MARKS = /\*\*|~~|[*`]/g

/**
 * How wide a cell READS once the live preview has hidden its syntax:
 * `**Chit**` occupies four columns on screen, not eight, and
 * `[[Strahd|the count]]` occupies nine.
 *
 * Deliberately approximate — a dice chip is a button and measures wider than
 * its notation, and nothing here knows that. Being a little off costs a column
 * some slack, not a broken layout.
 */
export function visibleWidth(cell: string): number {
  return cell
    .trim()
    .replace(PIPED_WIKI_LINK, '$1')
    .replace(WIKI_LINK, '$1')
    .replace(HIDDEN_MARKS, '').length
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
