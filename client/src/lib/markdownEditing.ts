/**
 * Pure text transforms behind the editor's formatting shortcuts.
 *
 * Every function takes the document text plus a selection and returns what the
 * new text and selection should be — no DOM, no React, so the fiddly cases
 * (toggling off, growing a table, outdenting to column zero) are unit-testable
 * on their own. The hook that calls these owns the actual insertion.
 */

export interface Selection {
  start: number
  end: number
}

export interface EditResult {
  /** Text to insert in place of [start, end). */
  text: string
  /** Selection to apply afterwards, as offsets into the FULL new document. */
  selection: Selection
  /** The span of the original document this replaces. */
  replace: Selection
}

/** Markers whose opening and closing text differ (e.g. `[[` … `]]`). */
export interface Wrapper {
  before: string
  after: string
}

export const WRAPPERS = {
  bold: { before: '**', after: '**' },
  italic: { before: '*', after: '*' },
  code: { before: '`', after: '`' },
  wikiLink: { before: '[[', after: ']]' },
  strikethrough: { before: '~~', after: '~~' },
} satisfies Record<string, Wrapper>

/**
 * Wraps the selection, or unwraps it when the markers are already there —
 * so Ctrl+B on **bold** text turns it back into plain text.
 *
 * With an empty selection this inserts the pair and puts the caret between the
 * markers, which is what you want when you hit Ctrl+B before typing.
 *
 * Markers immediately OUTSIDE the selection count as wrapped too: selecting
 * just `bold` inside `**bold**` and hitting Ctrl+B removes them, because
 * double-clicking a word selects the word without its markers.
 */
export function toggleWrap(
  text: string,
  selection: Selection,
  wrapper: Wrapper,
): EditResult {
  const { before, after } = wrapper
  const { start, end } = selection
  const selected = text.slice(start, end)

  // Case 1: the markers are inside the selection — "**bold**" is selected.
  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length)
    return {
      text: inner,
      replace: { start, end },
      selection: { start, end: start + inner.length },
    }
  }

  // Case 2: the markers sit just outside the selection — "bold" is selected
  // but the document reads "**bold**". Requires a real selection: an empty
  // caret between the markers of "****" means "start bold here", not "unwrap".
  const outerStart = start - before.length
  if (
    start !== end &&
    outerStart >= 0 &&
    text.slice(outerStart, start) === before &&
    text.slice(end, end + after.length) === after
  ) {
    return {
      text: selected,
      replace: { start: outerStart, end: end + after.length },
      selection: { start: outerStart, end: outerStart + selected.length },
    }
  }

  // Case 3: not wrapped yet — add the markers.
  const wrapped = before + selected + after
  return {
    text: wrapped,
    replace: { start, end },
    selection:
      start === end
        ? // Empty selection: caret goes between the markers, ready to type.
          { start: start + before.length, end: start + before.length }
        : // Keep the original text selected so the shortcut can be toggled off.
          {
            start: start + before.length,
            end: start + before.length + selected.length,
          },
  }
}

/**
 * Wraps the selection in a markdown link, `[text](url)`. The caret lands in
 * the empty url slot; with no selection it lands in the text slot instead.
 */
export function insertLink(text: string, selection: Selection): EditResult {
  const { start, end } = selection
  const selected = text.slice(start, end)
  if (start === end) {
    // Nothing selected: "[]()" with the caret inside the brackets.
    return {
      text: '[]()',
      replace: { start, end },
      selection: { start: start + 1, end: start + 1 },
    }
  }
  const inserted = `[${selected}]()`
  const urlAt = start + selected.length + 3 // past "[selected]("
  return {
    text: inserted,
    replace: { start, end },
    selection: { start: urlAt, end: urlAt },
  }
}

/** The blank table the Insert menu and Ctrl+T both drop in. */
export const TABLE_SNIPPET = [
  '| Column | Column | Column |',
  '| ------ | ------ | ------ |',
  '| Cell   | Cell   | Cell   |',
  '| Cell   | Cell   | Cell   |',
].join('\n')

/** True for a line that looks like a markdown table row. */
function isTableRow(line: string): boolean {
  return line.trim().startsWith('|')
}

/**
 * Counts the cells in a table row. A row is `| a | b |`, so splitting on the
 * pipes leaves an empty string at each end that isn't a cell.
 */
export function countTableColumns(line: string): number {
  const trimmed = line.trim()
  if (!isTableRow(trimmed)) return 0
  const parts = trimmed.split('|')
  // Drop the leading empty part, and the trailing one when the row ends in '|'.
  return parts.length - (trimmed.endsWith('|') ? 2 : 1)
}

/** The [start, end) offsets of the line containing `pos`. */
export function lineBounds(text: string, pos: number): Selection {
  const start = text.lastIndexOf('\n', pos - 1) + 1
  const nl = text.indexOf('\n', pos)
  return { start, end: nl < 0 ? text.length : nl }
}

/**
 * Adds an empty row below the table row the caret is in, matching that row's
 * column count. Returns null when the caret isn't in a table, so the caller can
 * fall back to inserting a whole new table.
 */
export function addTableRow(text: string, pos: number): EditResult | null {
  const { start, end } = lineBounds(text, pos)
  const columns = countTableColumns(text.slice(start, end))
  if (columns < 1) return null

  // "|   |   |   |" — one empty, evenly-spaced cell per column.
  const row = '\n|' + Array(columns).fill('   ').join('|') + '|'
  const caret = end + 2 // just inside the first cell of the new row
  return {
    text: row,
    replace: { start: end, end },
    selection: { start: caret, end: caret },
  }
}

/**
 * Indents or outdents every line the selection touches. Used for list items,
 * but deliberately indifferent to whether the lines are actually list markers —
 * indenting a plain paragraph under a bullet is a legitimate thing to want.
 */
export function indentLines(
  text: string,
  selection: Selection,
  outdent: boolean,
  unit = '  ',
): EditResult {
  const first = lineBounds(text, selection.start)
  // A selection ending exactly at a line start shouldn't drag in the next line.
  const lastPos =
    selection.end > selection.start && text[selection.end - 1] === '\n'
      ? selection.end - 1
      : selection.end
  const last = lineBounds(text, lastPos)

  const block = text.slice(first.start, last.end)
  const lines = block.split('\n')

  let firstDelta = 0
  let totalDelta = 0
  const changed = lines.map((line, i) => {
    if (outdent) {
      // Remove one unit, or any partial leading whitespace that's shorter.
      const match = /^[ \t]+/.exec(line)
      if (!match) return line
      const removed = Math.min(match[0].length, unit.length)
      if (i === 0) firstDelta = -removed
      totalDelta -= removed
      return line.slice(removed)
    }
    if (i === 0) firstDelta = unit.length
    totalDelta += unit.length
    return unit + line
  })

  return {
    text: changed.join('\n'),
    replace: { start: first.start, end: last.end },
    selection: {
      start: Math.max(first.start, selection.start + firstDelta),
      end: Math.max(first.start, selection.end + totalDelta),
    },
  }
}

/**
 * Block snippets (tables, boxes) need blank lines around them to parse as
 * markdown — but only where there isn't already blank space.
 */
export function padBlock(
  text: string,
  selection: Selection,
  snippet: string,
): EditResult {
  const before = text.slice(0, selection.start)
  const after = text.slice(selection.end)
  const lead =
    before === '' || before.endsWith('\n\n')
      ? ''
      : before.endsWith('\n')
        ? '\n'
        : '\n\n'
  const trail =
    after === '' || after.startsWith('\n\n')
      ? ''
      : after.startsWith('\n')
        ? '\n'
        : '\n\n'
  const body = lead + snippet + trail
  return {
    text: body,
    replace: selection,
    selection: {
      start: selection.start + lead.length,
      end: selection.start + lead.length + snippet.length,
    },
  }
}

/**
 * The `[[wiki link]]` containing `pos`, or null when the caret isn't in one.
 * Powers Ctrl+Click / Ctrl+Enter in the editor, where the text is raw and there
 * is no anchor element to click.
 *
 * `title` is the target article; `label` is the shown text of a piped
 * `[[Title|shown]]` link, which is display-only and never the link target.
 *
 * A position anywhere from the opening `[[` through the closing `]]` counts —
 * clicking the brackets themselves is still clicking the link. Scans from the
 * nearest `[[` at or before `pos` so an unclosed `[[` earlier in the document
 * can't swallow a later, well-formed link.
 */
export function wikiLinkAt(
  text: string,
  pos: number,
): { title: string; label: string; start: number; end: number } | null {
  const open = text.lastIndexOf('[[', pos)
  if (open < 0) return null
  const close = text.indexOf(']]', open)
  if (close < 0 || pos > close + 2) return null

  const inner = text.slice(open + 2, close)
  // A newline or a nested `[[` means the brackets never actually paired up.
  if (inner.includes('\n') || inner.includes('[[')) return null

  const pipe = inner.indexOf('|')
  const title = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim()
  if (!title) return null
  const label = pipe >= 0 ? inner.slice(pipe + 1).trim() : title
  return { title, label, start: open, end: close + 2 }
}
