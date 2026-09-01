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

// Exported so the outline parser (lib/toc.ts) recognises exactly the same
// markers this one does — two copies would drift.
export const PAGE_MARKER = /^\\page\s*$/
export const COLUMNS_MARKER = /^\\columns\s+([12])\s*$/

/**
 * Split leading YAML frontmatter (---\n…\n---) from the markdown body.
 * Character sheets keep structured data there; remark knows nothing about
 * frontmatter, so it must be carved off before any processing (Tidy would
 * mangle it, the book preview would render it as literal text).
 */
export function splitFrontmatter(text: string): {
  frontmatter: string | null
  body: string
} {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/)
  if (!m) return { frontmatter: null, body: text }
  // Also consume the conventional blank line after the closing fence, so
  // join(split(x)) round-trips.
  return {
    frontmatter: m[1],
    body: text.slice(m[0].length).replace(/^\r?\n/, ''),
  }
}

export function joinFrontmatter(
  frontmatter: string | null,
  body: string,
): string {
  return frontmatter == null
    ? body
    : `---\n${frontmatter}\n---\n\n${body.replace(/^\n+/, '')}`
}

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
 * DM-only blocks: content the DM sees but the players never do.
 *
 *   :::dm
 *   Strahd already knows they are coming.
 *   :::
 *
 * Three-colon containers because Obsidian renders an unknown one as literal
 * text and round-trips it untouched — a world folder has to stay readable
 * there. `%%dm%%` was rejected because Obsidian's own comment syntax hides
 * content in BOTH views, which defeats the DM-side box, and HTML comments
 * because Tidy's remark round-trip strips them.
 *
 * The fence run may be longer than three (::::) and the `dm` word is
 * case-insensitive; the closer is a bare run of colons.
 */
const DM_OPEN = /^ {0,3}(:{3,})[ \t]*dm[ \t]*$/i
const DM_CLOSE = /^ {0,3}(:{3,})[ \t]*$/
/** Same grammar as toc.ts's FENCE — a code fence opener, ``` or ~~~. */
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * The marker `mark` mode emits as the first line of its blockquote. Chosen to
 * mirror GitHub/Obsidian callout syntax, and parsed by remark-gfm already —
 * which is why this needs no remark plugin. It is purely an internal
 * representation: the form on disk is always `:::dm`.
 */
export const DM_CALLOUT_MARKER = '[!dm]'

/**
 * Strip or mark up every `:::dm` block.
 *
 * - `'strip'` removes them entirely. This is what the player window renders,
 *   so it is the security-critical direction.
 * - `'mark'` rewrites each into a blockquote led by DM_CALLOUT_MARKER, which
 *   the renderer styles as a tinted "DM only" box.
 *
 * Runs BEFORE parsePages, so in `strip` mode a \page inside a block vanishes
 * with it and the player's page count legitimately differs from the DM's. In
 * `mark` mode a \page or \columns line inside a block is dropped instead: the
 * block becomes one blockquote, and a page break through the middle of it
 * would split the box across two sheets and render broken.
 *
 * Three deliberate rules, each of which has a test:
 *   1. An UNCLOSED block strips to the end of the document. A DM who forgot
 *      the closing ::: has written secret content, so leaking it is the
 *      catastrophic failure and truncating the players' view is the
 *      recoverable one. Fail closed.
 *   2. `:::dm` inside a code fence is literal text and survives both modes —
 *      the fence state machine tracks the fence CHARACTER and run length, so
 *      a ~~~ line cannot close a ``` block (same rule as toc.ts).
 *   3. No nesting. A second opener while already inside a block is content.
 */
export function transformDmBlocks(
  text: string,
  mode: 'strip' | 'mark',
): string {
  // Split on either line ending and rejoin with \n, exactly as parsePages
  // does: article content on disk may be CRLF (Obsidian on Windows), and a
  // trailing \r would defeat the anchored $ in DM_OPEN — which fails by
  // leaving the block unrecognised, i.e. by putting a secret on the projector.
  const lines = text.split(/\r?\n/)
  const out: Array<string> = []
  let openFence: string | null = null
  let inDm = false

  for (const line of lines) {
    const fence = line.match(CODE_FENCE)

    // Inside a code fence nothing is a marker — but the fence still has to be
    // tracked while inside a DM block, or a ::: within a fenced example would
    // close the block early.
    if (openFence) {
      if (
        fence &&
        fence[1][0] === openFence[0] &&
        fence[1].length >= openFence.length &&
        line.slice(line.indexOf(fence[1]) + fence[1].length).trim() === ''
      ) {
        openFence = null
      }
      if (!inDm) out.push(line)
      else if (mode === 'mark') out.push(`> ${line}`)
      continue
    }

    if (fence) {
      openFence = fence[1]
      if (!inDm) out.push(line)
      else if (mode === 'mark') out.push(`> ${line}`)
      continue
    }

    if (!inDm) {
      if (DM_OPEN.test(line)) {
        inDm = true
        if (mode === 'mark') {
          // The marker needs its own paragraph inside the blockquote, or
          // remark's lazy continuation folds it into the first line of the
          // content and the renderer cannot tell the two apart. The bare `>`
          // is what forces the break.
          out.push(`> ${DM_CALLOUT_MARKER}`)
          out.push('>')
        }
        continue
      }
      out.push(line)
      continue
    }

    // Inside a DM block.
    if (DM_CLOSE.test(line)) {
      inDm = false
      continue
    }
    if (mode === 'mark') {
      const trimmed = line.trim()
      // A page break inside a callout is meaningless — see the doc comment.
      if (PAGE_MARKER.test(trimmed) || COLUMNS_MARKER.test(trimmed)) continue
      out.push(`> ${line}`)
    }
    // strip mode: drop the line. An unclosed block therefore runs to EOF.
  }

  // A stripped block leaves the blank lines that surrounded it behind, which
  // would otherwise stack up as vertical space on the players' page.
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
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
  const { frontmatter, body: bodyText } = splitFrontmatter(text)
  const pages = parsePages(bodyText)
  const formatted = await Promise.all(
    pages.map(async (page) => ({
      ...page,
      // remark escapes [[wiki links]] to \[\[...]] — undo that
      body: String(await processor.process(page.body))
        .trim()
        .replaceAll('\\[\\[', '[['),
    })),
  )
  return joinFrontmatter(frontmatter, serializePages(formatted))
}

/**
 * Wiki links: [[Article Title]] or [[Article Title|shown text]].
 * Resolved against article titles (case-insensitive) into normal markdown
 * links; unresolved links point at #missing so the renderer can flag them.
 */
/**
 * Exported as a source string, not a RegExp: the live-preview decorator scans
 * for the same syntax, and a shared `g`-flagged object carries a mutable
 * `lastIndex` between the two callers — which silently skips every other match.
 * Sharing the grammar rather than the object avoids that entirely.
 */
export const WIKI_LINK_SOURCE = String.raw`\[\[([^\][\n|]+)(?:\|([^\][\n]+))?\]\]`

const WIKI_LINK = new RegExp(WIKI_LINK_SOURCE, 'g')

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

// Exported for the live-preview decorator, so the editor chips exactly what
// this module would linkify. See WIKI_LINK_SOURCE for why it's a string.
/**
 * The `NdN` core stays tight — no space before or after the `d` — because
 * "you have 1 d6 left" is prose, not a roll. Only the modifier may be spaced,
 * since `1d6 + 3` is how people actually type damage. rollDice() strips
 * whitespace before parsing, so a spaced notation rolls the same as a tight
 * one; this grammar is only about what becomes a clickable chip.
 */
export const DICE_NOTATION = String.raw`\d{0,2}d\d{1,3}(?:\s*[+-]\s*\d{1,3})?`
const CODE_SPANS = '```[\\s\\S]*?```|`[^`\\n]*`'
// A complete named-roll link, either form: [Short Sword](2d6+3) or (dice:2d6+3)
export const NAMED_ROLL_SOURCE = String.raw`\[([^\]\n]+)\]\((?:dice:)?(${DICE_NOTATION})\)`
const NAMED_ROLL = new RegExp(NAMED_ROLL_SOURCE, 'g')
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
  // First header cell must be bare dice notation (RollableTable matches /^d\d+$/)
  // for the Roll button to appear; the second names the roll in history.
  rollableTable: [
    '| d100 | Trinket |',
    '| ---- | ------- |',
    '| 01–25 | A cracked hourglass that runs backwards. |',
    '| 26–50 | A brass key with no matching lock. |',
    '| 51–75 | A vial of water from a river that no longer exists. |',
    '| 76–100 | A silver ring engraved with a name you cannot read. |',
  ].join('\n'),
  readAloud:
    '> Boxed read-aloud text: describe the scene to your players here.',
  // Stripped from the player window entirely (transformDmBlocks); shown to the
  // DM as a tinted box. The Insert menu is how anyone discovers this syntax.
  dmOnly: [
    ':::dm',
    'Only you can see this. The player window strips it entirely.',
    ':::',
  ].join('\n'),
  divider: '---',
  namedRoll: '[Short Sword](1d20+5)',
  // #hidename must trail the label: the chip shows only the dice, while roll
  // history still logs the name.
  hiddenRoll: '[Sneak Attack #hidename](3d6)',
  wikiLink: '[[Article Title|shown text]]',
  pageBreak: '\\page',
  singleColumn: '\\columns 1',
  twoColumn: '\\columns 2',
  portraitImage:
    '![Portrait](https://placehold.co/440x560/8a7a5c/2b2117?text=Portrait#right&w=45%)',
  floatImage: '![Alt text](_images/your-image.png#left&w=40%)',
  statBlock: [
    '```statblock',
    'name: Creature Name',
    'size: Medium humanoid, neutral evil',
    'image: _images/your-image.png',
    'ac: 12',
    'hp: 22 (4d8 + 4)',
    'speed: 30 ft.',
    'str: 10',
    'dex: 14',
    'con: 12',
    'int: 10',
    'wis: 11',
    'cha: 8',
    'cr: 1 (200 XP)',
    '---',
    '**Trait Name.** Description of the trait.',
    '',
    '## Actions',
    '',
    '**Attack Name.** *Melee Weapon Attack:* +4 to hit. *Hit:* 5 (1d6 + 2) damage.',
    '```',
  ].join('\n'),
}
