/**
 * The pure text side of spellchecking: what counts as a word, and which parts
 * of a markdown document are not prose at all.
 *
 * Both surfaces share it — the live editor's squiggles (lib/cm/spellcheck) and
 * the context menu's suggestions — so a `[[link]]` that draws no squiggle can
 * never be offered a "correction" either. No DOM and no Lezer tree, so it
 * works on a textarea's value exactly as on a CodeMirror document.
 */

export interface WordSpan {
  word: string
  /** Offsets into the full text, so a caller can replace the word. */
  start: number
  end: number
}

/** A half-open `[from, to)` span of the document that is not prose. */
export type Range = readonly [from: number, to: number]

// Letters and combining marks, plus digits so `d100` reads as one token that
// is then refused, rather than as a lone misspelled "d".
const WORD_CHAR = /[\p{L}\p{M}\p{N}'’]/u
const WORD_RUN = /[\p{L}\p{M}\p{N}'’]+/gu
const HAS_DIGIT = /\p{N}/u
const LEADING_APOSTROPHES = /^['’]+/u
const TRAILING_APOSTROPHES = /['’]+$/u

/**
 * Trim a raw run of word characters to the word worth checking, or null.
 * Apostrophes stay inside a word (`don't`, `Ka’zhal`) but come off its ends,
 * so a quoted 'word' is checked as the word. Anything with a digit is dice,
 * a level or a page number, never a spelling mistake.
 */
function trimWord(raw: string, start: number): WordSpan | null {
  const lead = raw.length - raw.replace(LEADING_APOSTROPHES, '').length
  const word = raw.slice(lead).replace(TRAILING_APOSTROPHES, '')
  if (!word || HAS_DIGIT.test(word)) return null
  return { word, start: start + lead, end: start + lead + word.length }
}

/**
 * The word touching `offset` in `text`, or null when there is none worth
 * spellchecking.
 *
 * "Touching" includes the offset just past a word's last letter, because a
 * click on the right half of a final character resolves there.
 */
export function wordAt(text: string, offset: number): WordSpan | null {
  if (offset < 0 || offset > text.length) return null
  let start = offset
  let end = offset
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--
  while (end < text.length && WORD_CHAR.test(text[end])) end++
  return trimWord(text.slice(start, end), start)
}

/**
 * Every checkable word in `text[from, to)`, skipping the excluded ranges.
 * `from`/`to` let the live editor check only what is on screen; a word cut by
 * either edge is still read whole, so a viewport boundary can't split one.
 */
export function wordsIn(
  text: string,
  excluded: ReadonlyArray<Range>,
  from = 0,
  to = text.length,
): Array<WordSpan> {
  while (from > 0 && WORD_CHAR.test(text[from - 1])) from--
  while (to < text.length && WORD_CHAR.test(text[to])) to++
  const out: Array<WordSpan> = []
  const slice = text.slice(from, to)
  for (const match of slice.matchAll(WORD_RUN)) {
    const span = trimWord(match[0], from + match.index)
    if (span && !isExcluded(excluded, span.start)) out.push(span)
  }
  return out
}

/** Whether `offset` falls inside one of `ranges` (sorted, non-overlapping). */
export function isExcluded(ranges: ReadonlyArray<Range>, offset: number) {
  let lo = 0
  let hi = ranges.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const [from, to] = ranges[mid]
    if (offset < from) hi = mid - 1
    else if (offset >= to) lo = mid + 1
    else return true
  }
  return false
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
/** `\page`, `\columns 2`, `:::wrap` — layout markers, not prose. */
const MARKER_LINE = /^\s*(\\page|\\columns|:::)/
const INLINE_PATTERNS = [
  /`[^`\n]*`/g, // inline code
  /\[\[[^\]\n]*\]\]/g, // [[wiki links]] — they name your own world
  /\]\([^)\n]*\)/g, // a markdown link's or image's (target)
  /\b(?:https?:\/\/|www\.)\S+/g, // bare URLs
  /<[^>\n]+>/g, // HTML tags
]

/**
 * The parts of a markdown document that are not prose: frontmatter, code,
 * wiki links, link targets, URLs, HTML tags and layout markers. Sorted and
 * merged, ready for `isExcluded`.
 *
 * A line scan rather than the Lezer tree so a textarea gets the same answer
 * as the live editor. It is deliberately a little generous: missing a typo
 * inside an odd construct costs nothing, while a squiggle on every NPC name in
 * your frontmatter is the thing that gets spellcheck switched off.
 */
export function excludedRanges(text: string): Array<Range> {
  const ranges: Array<[number, number]> = []
  const lines = text.split('\n')
  let pos = 0
  let lineIndex = 0

  // Frontmatter: a `---` first line through the next `---` line.
  if (lines.length > 1 && lines[0].trim() === '---') {
    let end = lines[0].length + 1
    for (let i = 1; i < lines.length; i++) {
      end += lines[i].length + 1
      if (lines[i].trim() === '---') {
        ranges.push([0, Math.min(end, text.length)])
        pos = end
        lineIndex = i + 1
        break
      }
    }
  }

  let fence: { marker: string; from: number } | null = null
  for (let i = lineIndex; i < lines.length; i++) {
    const line = lines[i]
    const lineEnd = pos + line.length
    const opener = FENCE.exec(line)
    if (fence) {
      if (
        opener &&
        opener[1][0] === fence.marker[0] &&
        opener[1].length >= fence.marker.length
      ) {
        ranges.push([fence.from, lineEnd])
        fence = null
      }
    } else if (opener) {
      fence = { marker: opener[1], from: pos }
    } else if (MARKER_LINE.test(line)) {
      ranges.push([pos, lineEnd])
    } else {
      for (const pattern of INLINE_PATTERNS) {
        for (const match of line.matchAll(pattern)) {
          const from = pos + match.index
          ranges.push([from, from + match[0].length])
        }
      }
    }
    pos = lineEnd + 1
  }
  // An unclosed fence runs to the end, as markdown renders it.
  if (fence) ranges.push([fence.from, text.length])

  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged.at(-1)
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([range[0], range[1]])
  }
  return merged
}
