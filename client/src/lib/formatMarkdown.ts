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
    .map((page) => (page.columns ? `\\columns ${page.columns}\n\n${page.body}` : page.body))
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
      body: String(await processor.process(page.body)).trim().replaceAll('\\[\\[', '[['),
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
  articles: Array<{ id: number; title: string }>,
  worldId: number,
): string {
  const byTitle = new Map(articles.map((a) => [a.title.trim().toLowerCase(), a.id]))
  // remark escapes leading brackets as \[\[ — normalize before matching
  return text.replaceAll('\\[\\[', '[[').replace(WIKI_LINK, (_, title: string, display?: string) => {
    const label = (display ?? title).trim()
    const id = byTitle.get(title.trim().toLowerCase())
    return id != null ? `[${label}](/worlds/${worldId}/articles/${id})` : `[${label}](#missing)`
  })
}

export const snippets = {
  table: [
    '| Column | Column | Column |',
    '| ------ | ------ | ------ |',
    '| Cell   | Cell   | Cell   |',
    '| Cell   | Cell   | Cell   |',
  ].join('\n'),
  readAloud: '> Boxed read-aloud text: describe the scene to your players here.',
  divider: '---',
  pageBreak: '\\page',
  singleColumn: '\\columns 1',
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
