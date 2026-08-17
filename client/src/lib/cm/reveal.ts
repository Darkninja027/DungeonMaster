/**
 * The rule behind live preview: markdown syntax characters are hidden unless
 * the cursor is touching the node they belong to.
 *
 * The document is never transformed — `**bold**` stays `**bold**` on disk and
 * in the editor state. Only the *painting* changes, so undo, autosave and the
 * file on disk are all untouched by any of this.
 *
 * Everything here is offset arithmetic, deliberately free of CodeMirror
 * imports, so it can be tested in the plain node environment the rest of this
 * repo's tests use. See the note at the foot of the file for what that leaves
 * untested.
 */

export interface Range {
  from: number
  to: number
}

/**
 * Whether any cursor or selection range touches [from, to].
 *
 * Inclusive at BOTH edges, and that is the load-bearing decision in the whole
 * feature. A caret at the exact end of `**bold**` must reveal the markers,
 * because that is precisely where the caret sits the instant you finish typing
 * the closing `**` — hiding them at that moment makes the text jump sideways
 * under the cursor, which is the most disorienting way a live-preview editor
 * can fail.
 *
 * A selection reveals every node it overlaps, so Ctrl+A shows raw source.
 */
export function touches(
  ranges: ReadonlyArray<Range>,
  from: number,
  to: number,
): boolean {
  return ranges.some((r) => r.to >= from && r.from <= to)
}

/**
 * Block-level reveal: true when a range touches any line the block spans.
 *
 * Fences and tables reveal as a unit rather than per-character. Revealing only
 * the touched characters would leave a table half-rendered and half-source with
 * its columns jumping between the two, which is unreadable — so putting the
 * caret anywhere inside the block takes the whole thing back to raw text.
 *
 * `lineAt` is injected rather than imported so this stays CodeMirror-free; the
 * plugin passes a thin wrapper over `state.doc.lineAt`.
 */
export function touchesBlock(
  ranges: ReadonlyArray<Range>,
  from: number,
  to: number,
  lineAt: (pos: number) => Range,
): boolean {
  return touches(ranges, lineAt(from).from, lineAt(to).to)
}

/**
 * Decorations must reach CodeMirror sorted by position, and the tree walk and
 * the regex scan each produce their own document-ordered stream — merged, they
 * are not ordered at all. Sorting once at the end is cheaper than trying to
 * interleave the two passes, and avoids the "Ranges must be added sorted"
 * exception that otherwise only shows up once a document happens to contain
 * both a wiki link and an emphasis on the same line.
 *
 * `side` breaks ties: line decorations must land before the mark decorations
 * that sit inside that line, and CodeMirror expresses that as a lower start
 * side.
 */
export interface Positioned {
  from: number
  side: number
}

export function bySortOrder<T extends Positioned>(a: T, b: T): number {
  return a.from - b.from || a.side - b.side
}

/*
 * Not unit-tested, and not testable here: everything that needs a live
 * EditorView. jsdom reports every element as zero-sized, so CodeMirror computes
 * an empty viewport, `visibleRanges` comes back empty and no decoration is ever
 * built. Caret traversal over hidden ranges, atomic ranges, scrolling, IME
 * composition and "does a hidden `**` actually look invisible" are all verified
 * by hand in the running app. Same reasoning as lib/toc.ts.
 */
