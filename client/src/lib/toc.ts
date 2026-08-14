import { COLUMNS_MARKER, PAGE_MARKER } from './formatMarkdown'

/**
 * The article outline, parsed from the markdown **source** rather than the
 * rendered DOM.
 *
 * That is not a stylistic choice. `Markdown` renders the entire article body
 * once per sheet and windows it with `overflow: hidden` (see .dnd-page in
 * styles.css), so a heading exists `sheetCount` times over in the DOM — most
 * copies clipped and invisible. Querying the DOM would return duplicates, and
 * injecting slug ids would collide. The source string is the only place a
 * heading appears exactly once.
 */
export interface TocHeading {
  /** 1-6. */
  level: number
  /** Heading text with inline markdown stripped. */
  text: string
  /** 0-based line index in the ORIGINAL source, frontmatter and \page included. */
  line: number
  /**
   * Character offset of the start of that line in the original source.
   * Carried alongside `line` because the editor jump needs an offset for
   * setSelectionRange; accumulating it during the same walk is free and avoids
   * a second split() (and the CRLF off-by-one that comes with it).
   */
  offset: number
  /**
   * Which \page chunk the heading falls in, 0-based. The preview renders one
   * <Markdown> per chunk, so locating a heading on screen starts here.
   */
  pageIndex: number
  /** Stable identity for React keys and for matching against rendered DOM. */
  id: string
  /** 0-based position among the headings of its own \page chunk. */
  ordinalInPage: number
  /**
   * How many earlier headings in the same chunk carry identical text. Repeated
   * headings are the norm in a bestiary ("Tactics" under every monster), and
   * the preview lookup matches on text — this disambiguates which one is meant.
   */
  duplicateIndex: number
}

/**
 * CommonMark allows up to 3 leading spaces; a 4th makes it an indented code
 * block. `#Foo` (no space after the hashes) is not a heading either, and
 * remark won't render one — so neither do we.
 */
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/
/** A fence opener: three or more backticks or tildes, up to 3 spaces indented. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const FRONTMATTER_FENCE = /^---[ \t]*$/

/**
 * Setext headings (`Title` underlined with === or ---) are deliberately NOT
 * parsed. The --- form is ambiguous with a thematic break and with the
 * frontmatter fence, and telling them apart needs paragraph-continuation
 * state — more parser than everything else here combined, with the worst
 * failure mode available: a plain --- divider becoming a phantom entry that
 * jumps somewhere wrong.
 *
 * Nothing in this app emits setext anyway. Templates, `snippets` and the
 * editor's formatting shortcuts all write ATX, and formatMarkdown's remark
 * round-trip rewrites setext to ATX on the next Tidy. Please don't "fix" this.
 */
export function parseHeadings(source: string): Array<TocHeading> {
  if (!source) return []

  const lines = source.split(/\r?\n/)
  const headings: Array<TocHeading> = []

  let offset = 0
  let pageIndex = 0
  let ordinalInPage = 0
  /** Per-chunk tally of heading text, for duplicateIndex. */
  let seenText = new Map<string, number>()
  /** The fence character run that opened the current code block, if any. */
  let openFence: string | null = null
  let inFrontmatter = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Advance the offset at the END of each iteration, so `offset` always
    // points at the start of the line being examined. `+ 1` for the newline —
    // under CRLF the split ate two characters, corrected below.
    const lineStart = offset
    offset += line.length + 1
    if (source[lineStart + line.length] === '\r') offset += 1

    // Frontmatter only counts when it opens the document. A --- anywhere else
    // is a thematic break, and an unclosed opener must not swallow the article.
    if (i === 0 && FRONTMATTER_FENCE.test(line)) {
      const close = lines.indexOf('---', 1)
      if (close > 0) {
        inFrontmatter = true
        continue
      }
    }
    if (inFrontmatter) {
      if (FRONTMATTER_FENCE.test(line)) inFrontmatter = false
      continue
    }

    const fence = line.match(FENCE)
    if (openFence) {
      // A fence closes only on its own character, with a run at least as long
      // as the opener's. Both rules matter: `snippets.statBlock` nests markdown
      // inside a ```statblock fence, and a ~~~ line must not close a ``` block.
      if (
        fence &&
        fence[1][0] === openFence[0] &&
        fence[1].length >= openFence.length &&
        line.slice(line.indexOf(fence[1]) + fence[1].length).trim() === ''
      )
        openFence = null
      continue
    }
    if (fence) {
      openFence = fence[1]
      continue
    }

    const trimmed = line.trim()
    if (PAGE_MARKER.test(trimmed)) {
      pageIndex += 1
      ordinalInPage = 0
      seenText = new Map()
      continue
    }
    // \columns is not a heading, but it is still a line — it must not be
    // skipped before the offset bookkeeping above, only after.
    if (COLUMNS_MARKER.test(trimmed)) continue

    const heading = line.match(ATX_HEADING)
    if (!heading) continue

    // Group 2 is optional — a bare `#` has no text — so headingText takes the
    // undefined case rather than a `?? ''` the linter reads as unreachable.
    const text = headingText(heading[2])
    const duplicateIndex = seenText.get(text) ?? 0
    seenText.set(text, duplicateIndex + 1)

    headings.push({
      level: heading[1].length,
      text,
      line: i,
      offset: lineStart,
      pageIndex,
      ordinalInPage,
      duplicateIndex,
      id: `${pageIndex}-${ordinalInPage}`,
    })
    ordinalInPage += 1
  }

  return headings
}

/**
 * Strip the inline markdown a heading is likely to carry. Deliberately shallow:
 * this is a label in a 224px-wide pane, not a second renderer. Wiki links are
 * unwrapped to whatever the reader would see — `resolveWikiLinks` runs on the
 * preview body but never on outline text, so it is handled here.
 */
function headingText(raw: string | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/[ \t]+#+[ \t]*$/, '') // closing sequence: ## Title ##
    .replace(/\[\[([^\][\n|]+)(?:\|([^\][\n]+))?\]\]/g, (_, t, alias) =>
      String(alias ?? t),
    )
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .trim()
}

/**
 * The heading a given source line sits under — the last one at or above it.
 * Drives the Write tab's active highlight from the caret position.
 */
export function activeHeadingAt(
  headings: Array<TocHeading>,
  line: number,
): TocHeading | null {
  let found: TocHeading | null = null
  for (const heading of headings) {
    if (heading.line > line) break
    found = heading
  }
  return found
}

/**
 * Which sheet of its \page chunk a heading sits on, from its horizontal offset
 * within the chunk's column flow.
 *
 * The flow lays content out in fixed-width columns running left to right; each
 * sheet windows `columns` of them (see the marginLeft trick in Markdown.tsx).
 * So the column index is offset / (column + gap), and the sheet holds `columns`
 * of those. This is the inverse of `sheetsForWidth`.
 *
 * Pure and exported so the arithmetic is testable — the offsetLeft it consumes
 * can only come from a live layout.
 */
export function sheetIndexForOffset(
  offsetLeft: number,
  columns: 1 | 2,
  contentWidth = 712,
  columnGap = 40,
): number {
  const colW = columns === 2 ? (contentWidth - columnGap) / 2 : contentWidth
  const columnIndex = Math.max(0, Math.round(offsetLeft / (colW + columnGap)))
  return Math.floor(columnIndex / columns)
}

/* -------------------------------------------------------------------------- */
/* Everything below needs a live layout, so it isn't unit-tested — see         */
/* toc.test.ts. The arithmetic it leans on is `sheetIndexForOffset`, which is. */
/* -------------------------------------------------------------------------- */

/** U+200B, written as an escape so it can't be mistaken for a stray space. */
const ZERO_WIDTH_SPACE = '\u200B'

/**
 * Where the editor should scroll to bring the line at `offset` near the top.
 *
 * A textarea exposes no per-line geometry, and this one soft-wraps, so
 * `line * lineHeight` drifts badly once prose starts wrapping. Instead, measure
 * it: a mirror div styled like the textarea and filled with the text *up to*
 * the offset is exactly as tall as the content above that line.
 *
 * Relying on the browser's own caret-scrolling instead looks fine on paper —
 * it knows the true wrapped geometry — but it scrolls *minimally*, so a jump
 * can leave the heading pinned to the very bottom edge, or (on a long article)
 * land at the end of the document with the heading off-screen entirely.
 */
export function editorScrollTopFor(
  textarea: HTMLTextAreaElement,
  offset: number,
): number {
  const style = getComputedStyle(textarea)
  const mirror = document.createElement('div')
  // Copy every property that affects where a line break falls. Miss one and
  // the mirror wraps differently from the textarea, which is the whole ballgame.
  for (const prop of [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textIndent',
    'textTransform',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'boxSizing',
    'whiteSpace',
    'wordBreak',
    'overflowWrap',
    'tabSize',
  ] as const)
    mirror.style[prop] = style[prop]

  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.height = 'auto'
  mirror.style.width = `${textarea.clientWidth}px`
  // A trailing zero-width space keeps the final (possibly empty) line from
  // being collapsed away, which would under-measure by one line.
  mirror.textContent = textarea.value.slice(0, offset) + ZERO_WIDTH_SPACE

  document.body.appendChild(mirror)
  const above = mirror.scrollHeight
  document.body.removeChild(mirror)

  // Leave a little context above the heading rather than pinning it to the
  // very top edge.
  const lineHeight = parseFloat(style.lineHeight) || 20
  return Math.max(0, above - lineHeight * 2)
}

/**
 * Scroll the book preview so the sheet showing `heading` is in view.
 *
 * Two steps, because the preview is not a continuous document. First find the
 * heading's \page chunk — that much is pure bookkeeping from the parse. Then
 * work out which of that chunk's sheets actually displays it: every sheet holds
 * a full copy of the chunk's DOM and windows two columns of it, so the answer
 * comes from the heading's horizontal offset inside the flow, not from anything
 * vertical.
 */
export function scrollPreviewToHeading(
  scroller: HTMLElement,
  heading: TocHeading,
): void {
  const chunk = scroller.querySelector<HTMLElement>(
    `[data-book-page="${heading.pageIndex}"]`,
  )
  const sheets = chunk
    ? Array.from(chunk.querySelectorAll<HTMLElement>('.dnd-page'))
    : []
  if (sheets.length === 0) return

  const columns = chunk?.dataset.bookColumns === '1' ? 1 : 2
  // Read geometry from the first sheet only. Every sheet carries the same
  // markup, and the first one is unshifted, so offsets read from it are the
  // heading's true position in the flow.
  const flow = sheets[0].querySelector<HTMLElement>('.dnd-flow')
  const matches = flow
    ? Array.from(flow.querySelectorAll<HTMLElement>('[data-toc-text]')).filter(
        (el) => el.dataset.tocText === heading.text,
      )
    : []
  // Repeated heading text ("Tactics" under three monsters) is common, so pick
  // by ordinal among the matches rather than trusting the first hit. The parse
  // and the render walk the same chunk in the same order.
  const target = matches.at(
    Math.min(heading.duplicateIndex, matches.length - 1),
  )

  // Sheet count is measured asynchronously (a useLayoutEffect that re-runs on
  // image load and font readiness), so on a cold Preview the sheet we want may
  // not exist yet. Falling back to the chunk's first sheet beats not moving.
  const sheetIndex = target
    ? sheetIndexForOffset(target.offsetLeft, columns)
    : 0
  const sheet = sheets[Math.min(sheetIndex, sheets.length - 1)]

  scroller.scrollTo({
    top: Math.max(0, sheet.offsetTop - scroller.offsetTop - 16),
    behavior: 'smooth',
  })
}
