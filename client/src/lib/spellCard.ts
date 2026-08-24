import { spellInfoFromContent, wikiLinkTitle } from './character'
import { splitFrontmatter } from './formatMarkdown'
import type { LibraryEntry } from './bestiary'

/**
 * Spell cards for the printed character sheet: the rules text of every spell a
 * character knows, parsed out of the spell's own article.
 *
 * This exists because a `Spell` on the sheet stores only a name and a level. On
 * screen that is enough — the spell list links each row to the spell panel —
 * but on paper a link is dead ink, and a printed sheet with no book beside it
 * can't tell you what Counterspell does. So the cards are assembled from the
 * articles at print time rather than stored on the character: the article stays
 * the single source of truth, an edit in Obsidian shows up on the next print,
 * and no rules text is ever duplicated onto a character sheet.
 *
 * Pure and article-shaped, deliberately: no React, no IPC, no Character. The
 * fetching lives in lib/useSpellCards.ts and the page layout in sheetPages.ts,
 * so everything here is testable against the real bundled corpus — which is
 * what spellCard.test.ts does, because the whole risk of this file is "does it
 * match the 987 spell articles we ship".
 */

/** One `**Label** | value` row of a spell's stat block. */
export interface SpellStat {
  label: string
  value: string
}

export interface SpellCard {
  /**
   * The article's *title*, not its H1. They usually agree, but the 5.5e
   * articles are titled "Fireball 5.5e" over an H1 of "# Fireball", and a card
   * has to carry the same string the sheet's spell list printed a page earlier
   * — that cross-reference is the whole point of the cards.
   */
  name: string
  /** 0 for a cantrip. Null when neither frontmatter nor the subtitle said. */
  level: number | null
  /** Lowercased ("evocation"). Null when unknown. */
  school: string | null
  /** The subtitle carried "(ritual)" — real rules information, so it's kept. */
  ritual: boolean
  /**
   * The stat rows, in the order the article wrote them.
   *
   * A list of pairs rather than a fixed Casting Time / Range / Components /
   * Duration record: the order comes for free, and a homebrew article with
   * three rows (or six) prints what it has instead of a row of em dashes for a
   * field nobody wrote. The renderer maps over it; the cost model measures it.
   */
  stats: Array<SpellStat>
  /** The description, as markdown, with the H1, subtitle and stat table gone. */
  description: string
}

/**
 * The article subtitle, in every shape the bundled corpus uses:
 * "*Level 3 evocation*", "*Cantrip evocation*", "*Evocation cantrip*"
 * (school-first), any of them with a trailing "(ritual)".
 *
 * Matched in order to be *stripped* — it is re-rendered from the parsed fields
 * by spellCardSubtitle — so the school and the ritual flag are captured on the
 * way past rather than parsed out again later.
 */
const SUBTITLE =
  /^\*\s*(?:level\s*([0-9])\s+([a-z]+)|cantrip\s+([a-z]+)|([a-z]+)\s+cantrip)\s*(\(ritual\))?\s*\*$/i

/** A stat row: `| **Casting Time** | 1 action |`. */
const STAT_ROW = /^\|\s*\*\*([^*]+)\*\*\s*\|\s*(.*?)\s*\|\s*$/

/**
 * How far into the body the subtitle may sit before it stops counting as one.
 * The H1, a blank line and the subtitle is three lines; a few spare cover an
 * article that opens with a stray blank or omits the H1. Bounded on purpose,
 * for the same reason spellLevelFromContent only reads the first 300
 * characters: an "At Higher Levels… 2nd level or higher" sentence further down
 * must never be mistaken for the subtitle.
 */
const SUBTITLE_SEARCH_LINES = 6

/**
 * Read a spell's article into a printable card.
 *
 * The body is consumed **positionally** — skip blanks, drop an H1, drop a
 * subtitle, then take the one table block that follows and stop at the first
 * line that isn't part of it. That matters more than it looks: eight of the
 * bundled articles (Animate Objects, Confusion, Divine Word, Prismatic Spray,
 * Prismatic Wall, Reincarnate, Scrying, Teleport) carry a second table *inside*
 * their description, and a scan for `| **Label** |` across the whole body would
 * hoist those rows into the stat block and leave the table half-eaten in the
 * prose.
 *
 * Every step is optional. A hand-written or homebrew article with no H1, no
 * subtitle and no table falls all the way through and yields its whole body as
 * the description with `stats: []`, which prints as prose under a name.
 * Nothing here throws on any input, including an article that isn't a spell.
 */
export function parseSpellCard(title: string, content: string): SpellCard {
  const { frontmatter, body } = splitFrontmatter(content)
  // Level comes from the existing reader, so there is one implementation of
  // "frontmatter wins, else the subtitle" rather than two that can disagree.
  const { level } = spellInfoFromContent(content)

  const lines = body.split('\n')
  let school = frontmatterSchool(frontmatter)
  let ritual = false
  let i = 0

  const skipBlanks = () => {
    while (i < lines.length && lines[i].trim() === '') i++
  }

  skipBlanks()
  // The H1 is dropped: the card's title is the article title (see `name`).
  if (i < lines.length && /^#\s+/.test(lines[i])) i++
  skipBlanks()

  // The subtitle is dropped too, and re-rendered by spellCardSubtitle in one
  // canonical form whichever of the four shapes the article happened to use.
  if (i < SUBTITLE_SEARCH_LINES && i < lines.length) {
    const m = SUBTITLE.exec(lines[i].trim())
    if (m) {
      // Exactly one of the three school alternatives matched, and the others
      // are undefined at runtime however TS types the groups — so take the
      // first that is actually there rather than coalescing.
      const [, , ...groups] = m
      const matched = groups.slice(0, 3).find(Boolean)
      // Frontmatter wins, matching spellInfoFromContent's precedence.
      school = school ?? (matched ? matched.toLowerCase() : null)
      ritual = Boolean(groups[3])
      i++
      skipBlanks()
    }
  }

  const stats: Array<SpellStat> = []
  while (i < lines.length && lines[i].trimStart().startsWith('|')) {
    const row = STAT_ROW.exec(lines[i].trim())
    // The `| | |` header and the `| --- | --- |` delimiter simply don't match,
    // so they fall away without needing a case of their own.
    if (row) stats.push({ label: row[1].trim(), value: row[2].trim() })
    i++
  }

  return {
    name: title,
    level,
    school,
    ritual,
    stats,
    // Blank lines are kept: they are paragraph breaks, they render as such, and
    // spellCardCost charges for them.
    description: lines.slice(i).join('\n').trim(),
  }
}

/**
 * The `school:` key, read off the raw frontmatter without a YAML parse. Every
 * bundled article has one and it is a bare lowercase word, so a line match is
 * enough — and unlike a parse it can't throw on the malformed frontmatter that
 * spellInfoFromContent already tolerates.
 */
function frontmatterSchool(frontmatter: string | null): string | null {
  if (frontmatter == null) return null
  const m = frontmatter.match(/^school:\s*["']?([A-Za-z]+)["']?\s*$/m)
  return m ? m[1].toLowerCase() : null
}

/**
 * True when the article gave us nothing worth printing. The sheet skips these
 * rather than printing a name over white space: the rule is no stub cards, and
 * a resolvable-but-empty article breaks the same promise as an unresolvable
 * name.
 */
export function isEmptySpellCard(card: SpellCard): boolean {
  return card.stats.length === 0 && card.description.trim() === ''
}

/**
 * The card's "Level 3 evocation" line — one canonical rendering of the four
 * subtitle shapes the corpus uses, so the cards read alike even when the
 * articles behind them don't.
 *
 * Degrades a piece at a time rather than all at once: an article that gave a
 * school but no level still says "Evocation", and one that gave neither says
 * nothing rather than "Level null undefined".
 */
export function spellCardSubtitle(card: SpellCard): string {
  const school = card.school
    ? card.school[0].toUpperCase() + card.school.slice(1)
    : null
  const head =
    card.level === 0
      ? school
        ? `${school} cantrip`
        : 'Cantrip'
      : card.level !== null
        ? `Level ${card.level}${card.school ? ` ${card.school}` : ''}`
        : school
  if (!head) return card.ritual ? 'Ritual' : ''
  return card.ritual ? `${head} (ritual)` : head
}

/** Where a spell's article lives: the world that owns it, and its id there. */
export interface SpellArticleRef {
  worldId: string
  articleId: string
  title: string
}

/**
 * Find the article behind a spell on the sheet: this world first, then the
 * global library, matched on title case-insensitively.
 *
 * The returned `worldId` is the one that actually owns the article, and that is
 * the entire reason this is a shared function. Two worlds can both hold
 * `Spells/Fireball`, so a bare article id is ambiguous — everything that
 * fetches, renders or links to the result needs the pair, and a call site that
 * keeps only the id reads the wrong folder silently. (SpellName used to do
 * exactly that.) `LibraryEntry` carries its own `worldId` for the same reason.
 *
 * Null for a name with no article anywhere: a free-text spell still prints in
 * the spell list, and simply gets no card.
 */
export function resolveSpellArticle(
  name: string,
  worldId: string,
  articles: Array<{ id: string; title: string }> | undefined,
  libraryEntries: Array<LibraryEntry>,
): SpellArticleRef | null {
  const title = wikiLinkTitle(name).trim().toLowerCase()
  if (!title) return null
  const local = (articles ?? []).find((a) => a.title.toLowerCase() === title)
  if (local) return { worldId, articleId: local.id, title: local.title }
  const global = libraryEntries.find((e) => e.title.toLowerCase() === title)
  return global
    ? {
        worldId: global.worldId,
        articleId: global.articleId,
        title: global.title,
      }
    : null
}
