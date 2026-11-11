import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { PAGE_MARKER, COLUMNS_MARKER } from '#/lib/formatMarkdown'
import { bySortOrder, touches, touchesBlock } from './reveal'
import { scanLine } from './customSyntax'
import { MIN_COLUMN, tableLayout } from './tableLayout'
import type { CardLayout } from './tableLayout'
import {
  DiceWidget,
  PageRuleWidget,
  TableSpacerWidget,
  ThematicBreakWidget,
} from './widgets'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import type { EditorState } from '@codemirror/state'
import type { SyntaxNode, Tree } from '@lezer/common'

/**
 * The live-preview decorator: hides markdown syntax characters, styles what
 * they marked up, and swaps dice notation for clickable chips — unless the
 * cursor is touching the construct, in which case it goes back to raw text.
 *
 * The document is never modified. See lib/cm/reveal.ts for the rule itself.
 */

/** Collapses a range to nothing. One shared instance; CodeMirror dedupes by identity. */
const HIDE = Decoration.replace({})

/**
 * Inline constructs, mapped to the child node that IS their delimiter.
 *
 * Driving this from the parse tree rather than counting characters is not
 * fussiness: `*` is one char and `~~` is two, and `***x***` nests Emphasis
 * inside StrongEmphasis, so any fixed ±n offset is wrong somewhere. Node names
 * verified against the installed @lezer/markdown.
 */
const INLINE_MARKS: Record<string, string> = {
  Emphasis: 'EmphasisMark',
  StrongEmphasis: 'EmphasisMark',
  InlineCode: 'CodeMark',
  Strikethrough: 'StrikethroughMark',
}

const INLINE_CLASS: Record<string, string> = {
  Emphasis: 'cm-dm-em',
  StrongEmphasis: 'cm-dm-strong',
  InlineCode: 'cm-dm-code',
  Strikethrough: 'cm-dm-strike',
}

const HEADING = /^ATXHeading(\d)$/

/** A decoration plus the sort key CodeMirror needs it delivered in. */
interface Pending {
  from: number
  to: number
  side: number
  deco: Decoration
}

/** True when `pos` sits in a table's header row. */
function inTableHeader(tree: Tree, pos: number): boolean {
  for (let n: SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === 'TableHeader') return true
  }
  return false
}

/** True when `pos` sits inside a code span or fence. */
function inCode(tree: Tree, pos: number): boolean {
  for (let n: SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (
      n.name === 'InlineCode' ||
      n.name === 'FencedCode' ||
      n.name === 'CodeBlock'
    )
      return true
  }
  return false
}

/** A table cell: where it is, what it says, and which column it belongs to. */
interface Cell {
  from: number
  to: number
  text: string
  col: number
}

/**
 * Lays a table out in aligned columns, `available` characters wide.
 *
 * Every row is its own `.cm-line`, so there is no <table> for the browser to
 * share a column width across — left alone it packs each row on its own and
 * the columns go ragged as soon as one cell is longer than the cell above it.
 * So the table is measured here (see tableLayout.ts) and every cell in a column
 * is given the same explicit width. The cells stay real text with only their
 * box imposed, so the caret still moves through them normally.
 *
 * Column index comes from counting delimiters rather than cells, because a row
 * written `| Sworn || 1 |` parses with no cell at all in the middle: counting
 * cells would put `1` in column two and shift the rest of the row left.
 */
function tableDecorations(
  state: EditorState,
  table: SyntaxNode,
  available: number,
  out: Array<Pending>,
): void {
  const lineAt = (pos: number) => state.doc.lineAt(pos)
  const rows: Array<{ header: boolean; from: number; cells: Array<Cell> }> = []

  for (let row = table.firstChild; row; row = row.nextSibling) {
    const header = row.name === 'TableHeader'
    // The `| --- | --- |` alignment row carries no content, so it is hidden
    // outright rather than laid out as an empty table row.
    const separator =
      row.name === 'TableDelimiter' ||
      /^[\s|:-]+$/.test(state.doc.sliceString(row.from, row.to))
    if (separator) {
      out.push({
        from: lineAt(row.from).from,
        to: lineAt(row.from).from,
        side: -1,
        deco: Decoration.line({ class: 'cm-dm-table-sep' }),
      })
      continue
    }
    if (row.name !== 'TableRow' && !header) continue

    const line = lineAt(row.from)
    const cells: Array<Cell> = []
    let col = 0
    let hiddenTo = line.from

    for (let cell = row.firstChild; cell; cell = cell.nextSibling) {
      if (cell.name === 'TableDelimiter') {
        if (cells.length > 0) col++
        // Swallow the spaces either side of the pipe along with it. A cell node
        // is trimmed, so that padding is undecorated text sitting between two
        // cells — and `| Chit     | none |` out of Tidy pads by a different
        // amount on every row, which is exactly the drift the widths are here
        // to remove. `hiddenTo` stops two adjacent pipes hiding the same run.
        let from = cell.from
        let to = cell.to
        while (
          from > hiddenTo &&
          /[ \t]/.test(state.doc.sliceString(from - 1, from))
        )
          from--
        while (to < line.to && /[ \t]/.test(state.doc.sliceString(to, to + 1)))
          to++
        hiddenTo = to
        out.push({ from, to, side: 1, deco: HIDE })
      } else if (cell.name === 'TableCell' && cell.to > cell.from) {
        cells.push({
          from: cell.from,
          to: cell.to,
          text: state.doc.sliceString(cell.from, cell.to),
          col,
        })
      }
    }
    rows.push({ header, from: row.from, cells })
  }

  const texts = (row: (typeof rows)[number]) => {
    const byCol: Array<string | undefined> = []
    for (const cell of row.cells) byCol[cell.col] = cell.text
    return byCol
  }
  const head = rows.find((row) => row.header)
  const layout = tableLayout(
    head ? texts(head) : [],
    rows.filter((row) => !row.header).map(texts),
    available,
  )

  if (layout.mode === 'cards') {
    cardDecorations(rows, layout, lineAt, out)
    return
  }
  const { widths } = layout

  for (const row of rows) {
    out.push({
      from: lineAt(row.from).from,
      to: lineAt(row.from).from,
      side: -1,
      deco: Decoration.line({
        class: row.header ? 'cm-dm-table-head' : 'cm-dm-table-row',
      }),
    })
    let next = 0
    for (const cell of row.cells) {
      // Empty columns the row skipped over still owe their width, or the
      // cells after them sit under the wrong header.
      for (; next < cell.col; next++) {
        out.push({
          from: cell.from,
          to: cell.from,
          side: -1,
          deco: Decoration.widget({
            widget: new TableSpacerWidget(widths[next]),
          }),
        })
      }
      next = cell.col + 1
      out.push({
        from: cell.from,
        to: cell.to,
        side: 0,
        // Inclusive, or a dice chip opening the cell renders before its box
        // instead of in it, and pushes the rest of the row a chip-width right.
        deco: Decoration.mark({
          inclusive: true,
          class: 'cm-dm-cell',
          attributes: { style: `width:${widths[cell.col]}ch` },
        }),
      })
    }
  }
}

/**
 * A table too narrow for its columns, as one card per body row: every cell on
 * a line of its own, led by its column's header.
 *
 * The header row is hidden, since each card repeats it. The labels are CSS
 * `content` rather than widgets, so they are not in the document and the caret
 * never lands in one — the cells are still the real text, only reflowed, and
 * touching the table still reveals the raw pipes like any other.
 *
 * An empty cell has no node and so no line in the card: "Notes:" with nothing
 * after it says no more than leaving it out.
 */
function cardDecorations(
  rows: ReadonlyArray<{ header: boolean; from: number; cells: Array<Cell> }>,
  layout: CardLayout,
  lineAt: (pos: number) => { from: number },
  out: Array<Pending>,
): void {
  for (const row of rows) {
    const from = lineAt(row.from).from
    out.push({
      from,
      to: from,
      side: -1,
      deco: Decoration.line({
        class: row.header ? 'cm-dm-table-sep' : 'cm-dm-table-card',
        attributes: row.header
          ? undefined
          : { style: `--dm-card-label:${layout.labelWidth}ch` },
      }),
    })
    if (row.header) continue
    for (const cell of row.cells) {
      out.push({
        from: cell.from,
        to: cell.to,
        side: 0,
        // Inclusive so a widget at the cell's edge — a dice chip opening it —
        // renders inside the block rather than as a stray before it.
        deco: Decoration.mark({
          inclusive: true,
          class: 'cm-dm-card-cell',
          attributes: { 'data-label': layout.labels[cell.col] ?? '' },
        }),
      })
    }
  }
}

/**
 * Markdown constructs Lezer knows about. Walks the tree over the visible range
 * only — decorating a whole 30-page article on every keystroke is the
 * difference between smooth and janky.
 */
function treeDecorations(
  state: EditorState,
  ranges: ReadonlyArray<{ from: number; to: number }>,
  from: number,
  to: number,
  out: Array<Pending>,
  columns: () => number,
): void {
  const lineAt = (pos: number) => state.doc.lineAt(pos)

  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      const name = node.name

      const heading = HEADING.exec(name)
      if (heading) {
        // Style the line whether or not the marker is showing, so a heading
        // stays a heading while you edit it — the reveal is additive.
        out.push({
          from: lineAt(node.from).from,
          to: lineAt(node.from).from,
          side: -1,
          deco: Decoration.line({ class: `cm-dm-h${heading[1]}` }),
        })
        if (touches(ranges, node.from, node.to)) return
        // `## Title ##` emits a SECOND HeaderMark, so iterate the children
        // rather than assuming one. Eat the space after a leading marker so
        // the text starts at the margin.
        for (let c = node.node.firstChild; c; c = c.nextSibling) {
          if (c.name !== 'HeaderMark') continue
          const leading = c.from === node.from
          out.push({
            from: leading ? c.from : Math.max(c.from - 1, node.from),
            to: leading ? Math.min(c.to + 1, node.to) : c.to,
            side: 1,
            deco: HIDE,
          })
        }
        return
      }

      const markName = INLINE_MARKS[name]
      if (markName) {
        out.push({
          from: node.from,
          to: node.to,
          side: 0,
          deco: Decoration.mark({ class: INLINE_CLASS[name] }),
        })
        if (touches(ranges, node.from, node.to)) return
        for (let c = node.node.firstChild; c; c = c.nextSibling) {
          if (c.name === markName)
            out.push({ from: c.from, to: c.to, side: 1, deco: HIDE })
        }
        return
      }

      // Blockquote `>` markers hide like any other syntax, with the quote
      // styled as a bar down the line instead — the renderer's read-aloud box
      // is a blockquote, so these are common in real articles.
      if (name === 'QuoteMark') {
        const line = lineAt(node.from)
        out.push({
          from: line.from,
          to: line.from,
          side: -1,
          deco: Decoration.line({ class: 'cm-dm-quote' }),
        })
        if (touches(ranges, line.from, line.to)) return
        // Eat the space after the marker so the text sits at the bar.
        out.push({
          from: node.from,
          to: Math.min(node.to + 1, line.to),
          side: 1,
          deco: HIDE,
        })
        return
      }

      // Bullets get restyled, never hidden: hiding one leaves an indented
      // orphan line with no cue that it's a list at all, and CodeMirror can't
      // draw a real ::marker on a text line.
      if (name === 'ListMark') {
        out.push({
          from: node.from,
          to: node.to,
          side: 0,
          deco: Decoration.mark({ class: 'cm-dm-bullet' }),
        })
        return
      }

      // `---` is a divider, not three hyphens of literal text. Whole-line
      // replace, like the page rule, so it reveals back to `---` under the
      // caret. Frontmatter fences never reach here — see frontmatterEnd.
      if (name === 'HorizontalRule') {
        const line = lineAt(node.from)
        if (touches(ranges, line.from, line.to)) return
        out.push({
          from: line.from,
          to: line.to,
          side: 1,
          deco: Decoration.replace({ widget: new ThematicBreakWidget() }),
        })
        return
      }

      // Fences reveal as a unit — a half-raw fence is unreadable.
      if (name === 'FencedCode') {
        if (touchesBlock(ranges, node.from, node.to, lineAt)) return
        out.push({
          from: lineAt(node.from).from,
          to: lineAt(node.from).from,
          side: -1,
          deco: Decoration.line({ class: 'cm-dm-fence' }),
        })
        return
      }

      if (name === 'Table') {
        // Whole-table reveal, for the same reason: showing raw pipes for only
        // the touched row makes the columns jump between two widths.
        if (touchesBlock(ranges, node.from, node.to, lineAt)) return
        tableDecorations(state, node.node, columns(), out)
        return
      }
    },
  })
}

/**
 * Wiki links, dice and \page — none of which markdown knows about, so they come
 * from a regex scan rather than the tree. The tree still answers "is this
 * inside code", which is exact where a regex would have to guess.
 */
function customDecorations(
  state: EditorState,
  ranges: ReadonlyArray<{ from: number; to: number }>,
  from: number,
  to: number,
  out: Array<Pending>,
): void {
  const tree = syntaxTree(state)
  // Table headers are excluded alongside code: a rollable table's first header
  // cell is bare `d100`, which is a column label, not a roll — the renderer
  // reads it to decide whether to show a Roll button (see RollableTable in
  // Markdown.tsx). Chipping it here would both look wrong and imply the header
  // itself is clickable.
  const isCode = (pos: number) => inCode(tree, pos) || inTableHeader(tree, pos)

  const first = state.doc.lineAt(from).number
  const last = state.doc.lineAt(to).number

  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n)
    const trimmed = line.text.trim()

    // \page and \columns are line-level, so they never reach the scanner.
    if (PAGE_MARKER.test(trimmed) || COLUMNS_MARKER.test(trimmed)) {
      if (touches(ranges, line.from, line.to)) continue
      const columns = COLUMNS_MARKER.exec(trimmed)
      out.push({
        from: line.from,
        to: line.to,
        side: 1,
        deco: Decoration.replace({
          widget: new PageRuleWidget(
            columns ? `${columns[1]}-column page` : 'Page break',
          ),
        }),
      })
      continue
    }

    for (const match of scanLine(line.text, line.from, isCode)) {
      const revealed = touches(ranges, match.from, match.to)

      if (match.kind === 'dice') {
        // A widget under the caret can't be edited, so drop it entirely and
        // show the raw notation instead.
        if (revealed) continue
        out.push({
          from: match.from,
          to: match.to,
          side: 1,
          deco: Decoration.replace({
            widget: new DiceWidget(match.value, match.label),
          }),
        })
        continue
      }

      // Wiki link: style it either way, so it still reads as a link while you
      // edit it; hide the brackets (and `Title|`) only when untouched.
      out.push({
        from: match.labelFrom ?? match.from,
        to: match.labelTo ?? match.to,
        side: 0,
        deco: Decoration.mark({ class: 'cm-dm-wikilink' }),
      })
      if (revealed) continue
      out.push({
        from: match.from,
        to: match.labelFrom ?? match.from,
        side: 1,
        deco: HIDE,
      })
      out.push({
        from: match.labelTo ?? match.to,
        to: match.to,
        side: 1,
        deco: HIDE,
      })
    }
  }
}

/**
 * Styles a leading YAML frontmatter block, and reports where it ends.
 *
 * Dimmed rather than hidden: unlike a `**` marker, frontmatter is real data the
 * author sometimes needs to edit (it is a character sheet's entire content),
 * so it stays legible — just visually demoted so it reads as metadata rather
 * than as the article's opening paragraph. Markdown has no frontmatter concept,
 * so Lezer parses the `---` fences as horizontal rules and the body as
 * paragraphs; decorating it here also stops those bogus nodes being styled.
 */
function frontmatterEnd(state: EditorState, out: Array<Pending>): number {
  const doc = state.doc
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---') return 0
  for (let n = 2; n <= doc.lines; n++) {
    if (doc.line(n).text.trim() !== '---') continue
    for (let i = 1; i <= n; i++) {
      const line = doc.line(i)
      out.push({
        from: line.from,
        to: line.from,
        side: -1,
        deco: Decoration.line({ class: 'cm-dm-frontmatter' }),
      })
    }
    return doc.line(n).to
  }
  return 0
}

/**
 * How many monospace characters fit across the text area — the budget the table
 * layout shares between columns. Measured rather than assumed, because a notes
 * pane and a maximised article window differ by a factor of three.
 */
/** CodeMirror's base theme pads `.cm-line` `0 2px 0 6px`; our theme leaves it. */
const CM_LINE_PADDING = 8

function measureColumns(view: EditorView): number {
  const content = view.contentDOM
  const char = measureCh(view)
  // No layout yet (constructed but not shown): guess a console width rather
  // than divide by zero. The next geometry change rebuilds with a real number.
  if (!(char > 0) || !(content.clientWidth > 0)) return 80
  const line = content.querySelector('.cm-line')
  // What a row's cells actually get is the inside of a `.cm-line`, so both
  // paddings come off: .cm-content's (1rem a side in our theme) and the line's
  // own (CodeMirror's 6px + 2px). A flat "minus four characters" covered the
  // first and not the second, and the last cell of a row came out a pixel too
  // wide and dropped onto a line of its own, under the wrong header. The 1px
  // is for sub-pixel layout rounding a sum of `ch` boxes up.
  //
  // The first build runs before CodeMirror has drawn a single line, so there
  // is none to read and its default stands in. Waiting for a line instead
  // meant opening an article showed the 80-column guess for over a second,
  // until some unrelated geometry change got round to rebuilding.
  const px =
    content.clientWidth -
    horizontalPadding(content) -
    (line ? horizontalPadding(line) : CM_LINE_PADDING) -
    1
  return Math.max(MIN_COLUMN * 2, Math.floor(px / char))
}

/**
 * The pixel width of one `ch` — the unit every cell is sized in — measured
 * rather than taken from `view.defaultCharacterWidth`. That one is an average
 * over whichever line CodeMirror happened to sample, and was seen reading 7px
 * on one build and 7.7px on the next in the same editor; at sixty characters
 * the difference is a whole column.
 *
 * The probe goes in the scroller, not .cm-content: it inherits the same font,
 * but CodeMirror only watches .cm-content for mutations, so measuring there
 * would schedule a pointless re-sync of the document.
 */
function measureCh(view: EditorView): number {
  const probe = document.createElement('span')
  probe.style.cssText =
    'position:absolute;visibility:hidden;white-space:pre;width:100ch'
  view.scrollDOM.appendChild(probe)
  const width = probe.getBoundingClientRect().width / 100
  probe.remove()
  return width
}

function horizontalPadding(el: Element): number {
  const style = getComputedStyle(el)
  return (
    (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
  )
}

function build(view: EditorView): {
  decorations: DecorationSet
  atomic: DecorationSet
} {
  const out: Array<Pending> = []
  // Measured lazily and once per build: reading layout mid-update forces the
  // browser to reflow, and it is only worth paying for when a table is
  // actually on screen — which most keystrokes are not.
  let width = 0
  const columns = () => (width ||= measureColumns(view))
  // An unfocused editor has no meaningful cursor, but its selection still
  // reads as offset 0 — which would "reveal" whatever starts the document,
  // so an article opens with its first heading showing a stray `#`. Treat
  // unfocused as no selection at all and render everything cleanly.
  const ranges = view.hasFocus ? view.state.selection.ranges : []
  const fmEnd = frontmatterEnd(view.state, out)
  for (const { from, to } of view.visibleRanges) {
    // Skip the frontmatter block: its `---` fences parse as horizontal rules
    // and its `key: value` lines as paragraphs, none of which should be
    // decorated as prose.
    const start = Math.max(from, fmEnd)
    if (start >= to) continue
    treeDecorations(view.state, ranges, start, to, out, columns)
    customDecorations(view.state, ranges, start, to, out)
  }
  // Two passes each emit in document order, but merged they are not ordered at
  // all — and CodeMirror throws on unsorted input. Sort once, at the end.
  out.sort(bySortOrder)
  return {
    decorations: Decoration.set(
      out.map((p) => p.deco.range(p.from, p.to)),
      true,
    ),
    /*
      Only the decorations that actually COLLAPSE text may be atomic, which is
      exactly the replace ones (`point` is true for a replace, false for a
      mark). Making the whole set atomic swept up the plain styling marks too —
      and `cm-dm-wikilink` spans the entire link label, so one backspace inside
      `[[Strahdd]]` deleted the whole label rather than the typo. The caret
      still must not enter a hidden `**`, which is what atomic ranges are for;
      styling a range is no reason to make it indivisible.
    */
    atomic: Decoration.set(
      out.filter((p) => p.deco.point).map((p) => p.deco.range(p.from, p.to)),
      true,
    ),
  }
}

export const liveDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    /** The collapsing subset — see the note in `build`. */
    atomic: DecorationSet

    constructor(view: EditorView) {
      const built = build(view)
      this.decorations = built.decorations
      this.atomic = built.atomic
    }

    update(update: ViewUpdate) {
      // `selectionSet` is the whole feature: without it the syntax only
      // reappears when you type, not when you arrow into a word.
      // `focusChanged` matters because build() ignores the selection entirely
      // while unfocused — without it, clicking into the editor wouldn't reveal
      // the construct under the caret until you also moved it.
      // `geometryChanged` matters because table columns are sized to the width
      // of the pane: without it, dragging the split leaves them at the old one.
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.focusChanged ||
        update.geometryChanged
      ) {
        const built = build(update.view)
        this.decorations = built.decorations
        this.atomic = built.atomic
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    // Hidden `**` is zero pixels wide but two characters long. Without atomic
    // ranges the caret steps into the collapsed region and appears stuck —
    // this is not polish, the editor feels broken within seconds.
    //
    // `atomic`, NOT `decorations`: see the note in `build`. Handing the whole
    // set over made every styled range indivisible, so backspacing a typo in a
    // [[wiki link]] deleted the entire label.
    provide: (plugin) =>
      EditorView.atomicRanges.of(
        (view) => view.plugin(plugin)?.atomic ?? Decoration.none,
      ),
  },
)
