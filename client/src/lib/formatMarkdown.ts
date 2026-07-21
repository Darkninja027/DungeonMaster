import { remark } from 'remark'
import remarkGfm from 'remark-gfm'

/**
 * Articles support two special markers on their own line (Homebrewery-style):
 *   \page       — start a new book page
 *   \columns 1  — this page renders single-column (2 = two-column, the default)
 * Markers are extracted before any remark processing so Tidy never mangles them.
 */
export interface BookPage {
  columns: 1 | 2 | null
  body: string
}

const PAGE_MARKER = /^\\page\s*$/
const COLUMNS_MARKER = /^\\columns\s+([12])\s*$/

/**
 * Rejoin table rows separated by blank lines (common in exported/pasted
 * markdown). GFM only parses consecutive `|` lines as a table.
 */
export function joinBrokenTables(text: string): string {
  const lines = text.split('\n').map((line) =>
    // A row starting with an escaped pipe is a table row that a markdown
    // serializer mangled (it saw the row as a paragraph) — unescape it.
    /^\s*\\\|/.test(line) ? line.replaceAll('\\|', '|') : line,
  )
  const out: Array<string> = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (!inFence && line.trim() === '' && out.length > 0) {
      let j = i
      while (j < lines.length && lines[j].trim() === '') j++
      const prev = out[out.length - 1].trim()
      const next = j < lines.length ? lines[j].trim() : ''
      if (prev.startsWith('|') && next.startsWith('|')) {
        i = j - 1
        continue
      }
    }
    out.push(line)
  }
  return out.join('\n')
}

export function parsePages(text: string): Array<BookPage> {
  const pages: Array<BookPage> = []
  let lines: Array<string> = []
  let columns: BookPage['columns'] = null

  const flush = () => {
    pages.push({ columns, body: joinBrokenTables(lines.join('\n')).trim() })
    lines = []
    columns = null
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (PAGE_MARKER.test(trimmed)) {
      flush()
      continue
    }
    const match = trimmed.match(COLUMNS_MARKER)
    if (match) {
      columns = Number(match[1]) as 1 | 2
      continue
    }
    lines.push(line)
  }
  flush()
  return pages
}

export function serializePages(pages: Array<BookPage>): string {
  return pages
    .map((page) =>
      page.columns ? `\\columns ${page.columns}\n\n${page.body}` : page.body,
    )
    .join('\n\n\\page\n\n')
}

/**
 * Parse and re-serialize markdown to normalize formatting: aligns table
 * pipes, fixes heading/list spacing, and consistent emphasis markers.
 * Runs per page so \page / \columns markers survive untouched.
 */
export async function formatMarkdown(text: string): Promise<string> {
  const processor = remark().use(remarkGfm).data('settings', {
    bullet: '-',
    emphasis: '*',
    strong: '*',
    rule: '-',
    fences: true,
  })
  const pages = parsePages(text)
  const formatted = await Promise.all(
    pages.map(async (page) => ({
      ...page,
      // remark escapes [[wiki links]] to \[\[...]] — undo that
      body: String(await processor.process(page.body))
        .trim()
        .replaceAll('\\[\\[', '[['),
    })),
  )
  return serializePages(formatted)
}

/**
 * Wiki links: [[Article Title]] or [[Article Title|shown text]].
 * Resolved against article titles (case-insensitive) into normal markdown
 * links; unresolved links point at #missing so the renderer can flag them.
 */
const WIKI_LINK = /\[\[([^\][\n|]+)(?:\|([^\][\n]+))?\]\]/g

export function resolveWikiLinks(
  text: string,
  articles: Array<{ id: string; title: string }>,
  worldId: string,
): string {
  const byTitle = new Map(
    articles.map((a) => [a.title.trim().toLowerCase(), a.id]),
  )
  // remark escapes leading brackets as \[\[ — normalize before matching
  return text
    .replaceAll('\\[\\[', '[[')
    .replace(WIKI_LINK, (_, title: string, display?: string) => {
      const label = (display ?? title).trim()
      const id = byTitle.get(title.trim().toLowerCase())
      return id != null
        ? `[${label}](/worlds/${worldId}/articles/${encodeURIComponent(id)})`
        : `[${label}](missing:${encodeURIComponent(title.trim())})`
    })
}

const DICE_NOTATION = String.raw`\d{0,2}d\d{1,3}(?:[+-]\d{1,3})?`
const CODE_SPANS = '```[\\s\\S]*?```|`[^`\\n]*`'
// A complete named-roll link, either form: [Short Sword](2d6+3) or (dice:2d6+3)
const NAMED_ROLL = new RegExp(
  String.raw`\[([^\]\n]+)\]\((?:dice:)?(${DICE_NOTATION})\)`,
  'g',
)
// Split patterns with exactly ONE capture group each, so split() alternates
// plain (even index) / excluded (odd index) segments.
const SKIP_CODE = new RegExp(`(${CODE_SPANS})`)
const SKIP_CODE_AND_DICE_LINKS = new RegExp(
  String.raw`(${CODE_SPANS}|\[[^\]\n]*\]\(dice:[^)\n]*\))`,
)

/**
 * Turn dice notation (2d6+3, d20, ...) into dice: links the renderer shows
 * as clickable roll chips. Named rolls — [Short Sword](2d6+3) — become dice
 * links keeping their label. Code spans and fences are left alone.
 */
export function linkifyDice(text: string): string {
  // Pass 1: normalize named rolls to dice: links.
  const named = text
    .split(SKIP_CODE)
    .map((segment, i) =>
      i % 2 === 1
        ? segment
        : segment.replace(
            NAMED_ROLL,
            (_, label: string, notation: string) =>
              `[${label}](dice:${encodeURIComponent(notation)})`,
          ),
    )
    .join('')
  // Pass 2: auto-link bare notation, leaving named rolls (and their labels,
  // which may themselves contain notation) untouched.
  return named
    .split(SKIP_CODE_AND_DICE_LINKS)
    .map((segment, i) =>
      i % 2 === 1
        ? segment
        : segment.replace(
            new RegExp(String.raw`(?<![\w/[])(${DICE_NOTATION})(?!\w)`, 'g'),
            (m) => `[${m}](dice:${encodeURIComponent(m)})`,
          ),
    )
    .join('')
}

export interface DiceResult {
  total: number
  detail: string
}

export function rollDice(notation: string): DiceResult | null {
  const m = notation.replace(/\s+/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i)
  if (!m) return null
  const count = Number(m[1] || 1)
  const sides = Number(m[2])
  const mod = m[3] ? Number(m[3]) : 0
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null
  const rolls = Array.from(
    { length: count },
    () => 1 + Math.floor(Math.random() * sides),
  )
  return {
    total: rolls.reduce((a, b) => a + b, 0) + mod,
    detail: rolls.join(' + ') + (mod !== 0 ? ` (${m[3]})` : ''),
  }
}

/** Matches a rollable-table first cell against a rolled number: "01–20", "95". */
export function rangeMatches(cell: string, n: number): boolean {
  const range = cell.trim().match(/^(\d+)\s*[–—-]\s*(\d+)$/)
  if (range) return n >= Number(range[1]) && n <= Number(range[2])
  const single = cell.trim().match(/^(\d+)$/)
  return single ? Number(single[1]) === n : false
}

export const snippets = {
  table: [
    '| Column | Column | Column |',
    '| ------ | ------ | ------ |',
    '| Cell   | Cell   | Cell   |',
    '| Cell   | Cell   | Cell   |',
  ].join('\n'),
  readAloud:
    '> Boxed read-aloud text: describe the scene to your players here.',
  divider: '---',
  namedRoll: '[Short Sword](1d20+5)',
  pageBreak: '\\page',
  singleColumn: '\\columns 1',
  portraitImage:
    '![Portrait](https://placehold.co/440x560/8a7a5c/2b2117?text=Portrait#right&w=45%)',
  statBlock: [
    '## Creature Name',
    '',
    '*Medium humanoid, neutral evil*',
    '',
    '| Stat | Value |',
    '| ---- | ----- |',
    '| Armor Class | 12 |',
    '| Hit Points | 22 (4d8 + 4) |',
    '| Speed | 30 ft. |',
    '',
    '| STR | DEX | CON | INT | WIS | CHA |',
    '| --- | --- | --- | --- | --- | --- |',
    '| 10 (+0) | 14 (+2) | 12 (+1) | 10 (+0) | 11 (+0) | 8 (-1) |',
  ].join('\n'),
}
