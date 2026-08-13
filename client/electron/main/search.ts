import fs from 'node:fs'
import { escapeRegExp, resolveInWorld } from './sanitize'
import { readTree, worldRoot } from './worldStore'
import type { MentionResult, SearchResult } from './worldStore'
import { getIndex, parseFrontmatter } from './indexer'
import type { IndexEntry } from './indexer'

/**
 * Yields every article with its content — from the in-memory index when one
 * is live for this world, otherwise straight from disk. Query logic below is
 * identical either way, so index and fallback always agree.
 */
function* articleEntries(worldId: string): Generator<IndexEntry> {
  const index = getIndex(worldId)
  if (index) {
    yield* index.values()
    return
  }
  const root = worldRoot(worldId)
  for (const article of readTree(root).articles) {
    const content = fs.readFileSync(
      resolveInWorld(root, article.id + '.md'),
      'utf8',
    )
    yield {
      id: article.id,
      folderId: article.folderId,
      title: article.title,
      content,
      frontmatter: parseFrontmatter(content),
    }
  }
}

/**
 * A ±40-char window around the first body hit, whitespace-collapsed and
 * ellipsed. Empty string when the query only matched the title.
 */
function bodySnippet(content: string, q: string): string {
  const index = content.toLowerCase().indexOf(q)
  if (index < 0) return ''
  const start = Math.max(0, index - 40)
  const end = Math.min(content.length, index + q.length + 40)
  return (
    (start > 0 ? '…' : '') +
    content.slice(start, end).replace(/\s+/g, ' ').trim() +
    (end < content.length ? '…' : '')
  )
}

/** Case-insensitive substring search over titles and bodies, with ±40-char snippets. */
export function searchWorld(
  worldId: string,
  query: string,
): Array<SearchResult> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const results: Array<SearchResult> = []
  for (const { id, folderId, title, content } of articleEntries(worldId)) {
    const titleHit = title.toLowerCase().includes(q)
    const snippet = bodySnippet(content, q)
    if (!titleHit && !snippet) continue
    results.push({ id, folderId, title, snippet })
    if (results.length >= 50) break
  }
  return results
}

export interface RankedResult {
  id: string
  folderId: string | null
  title: string
  snippet: string
  /** Frontmatter `type`, lowercased — the renderer routes characters differently. */
  type: string | null
  score: number
  /** [start, end) offsets into `title` for the characters that matched. */
  matchRanges: Array<[number, number]>
}

export interface TitleScore {
  score: number
  ranges: Array<[number, number]>
}

/**
 * Scores a title against an already-lowercased query. Exported pure so the
 * ranking order can be tested without touching a world folder.
 *
 * Tiers are far enough apart that a weaker tier can never overtake a stronger
 * one via bonuses — an exact hit always beats a prefix hit, and so on.
 */
export function scoreTitle(title: string, q: string): TitleScore | null {
  if (!q) return null
  const lower = title.toLowerCase()

  if (lower === q) return { score: 1000, ranges: [[0, title.length]] }
  if (lower.startsWith(q)) return { score: 500, ranges: [[0, q.length]] }
  const at = lower.indexOf(q)
  if (at >= 0) return { score: 250, ranges: [[at, at + q.length]] }

  // Subsequence: "sthd" matches "Strahd". Denser matches (fewer gaps between
  // the matched characters) score higher, so "sthd" prefers "Strahd" over a
  // title where those letters are scattered across many words.
  const ranges: Array<[number, number]> = []
  let cursor = 0
  for (const ch of q) {
    const found = lower.indexOf(ch, cursor)
    if (found < 0) return null
    // Extend the previous run when this character is adjacent to it.
    if (ranges.length > 0 && ranges[ranges.length - 1][1] === found) {
      ranges[ranges.length - 1][1] = found + 1
    } else {
      ranges.push([found, found + 1])
    }
    cursor = found + 1
  }
  const span = cursor - ranges[0][0]
  const density = q.length / Math.max(span, 1)
  return { score: 100 + Math.round(density * 50), ranges }
}

/**
 * Ranked search for the command palette. Unlike searchWorld, the cap is applied
 * AFTER sorting — capping first would discard the best matches whenever more
 * than `limit` articles happen to match earlier in tree order.
 */
export function searchRanked(
  worldId: string,
  query: string,
  limit = 30,
): Array<RankedResult> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: Array<RankedResult> = []

  for (const {
    id,
    folderId,
    title,
    content,
    frontmatter,
  } of articleEntries(worldId)) {
    const titleMatch = scoreTitle(title, q)
    const snippet = bodySnippet(content, q)
    if (!titleMatch && !snippet) continue

    const rawType = frontmatter?.type
    const type =
      rawType == null || typeof rawType === 'object'
        ? null
        : String(rawType).trim().toLowerCase()

    let score = titleMatch ? titleMatch.score : 0
    if (snippet) score += 25
    // Characters are the most frequently revisited articles in play.
    if (type === 'character') score += 10

    scored.push({
      id,
      folderId,
      title,
      snippet,
      type,
      score,
      matchRanges: titleMatch ? titleMatch.ranges : [],
    })
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.title.length - b.title.length ||
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  )
  return scored.slice(0, limit)
}

export interface TagCount {
  tag: string
  count: number
}

/**
 * Every tag used anywhere in the world, with usage counts — the palette's `#`
 * mode. Without this there is no way to discover which tags exist; Smart Views
 * can only query tags you already know the name of.
 */
export function listTags(worldId: string): Array<TagCount> {
  const counts = new Map<string, number>()
  for (const { frontmatter } of articleEntries(worldId)) {
    if (!frontmatter) continue
    for (const tag of tagSet(frontmatter)) {
      if (!tag) continue
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' }),
    )
}

export interface ArticleQuery {
  /** `type: <value>` frontmatter equality (case-insensitive). */
  type?: string
  /** Every tag must be present in the `tags` array (case-insensitive). */
  tags?: Array<string>
  /** Arbitrary scalar frontmatter equality (case-insensitive string compare). */
  fields?: Record<string, string>
}

export interface ArticleRef {
  id: string
  folderId: string | null
  title: string
}

/** Case-insensitive equality between a frontmatter scalar and a query string. */
function scalarEquals(value: unknown, want: string): boolean {
  if (value == null) return false
  if (Array.isArray(value) || typeof value === 'object') return false
  return String(value).trim().toLowerCase() === want.trim().toLowerCase()
}

/** Lowercased string members of a frontmatter `tags` value (array or scalar). */
function tagSet(fm: Record<string, unknown>): Set<string> {
  const raw = fm.tags
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  return new Set(
    list
      .filter((t): t is string | number => typeof t !== 'object')
      .map((t) => String(t).trim().toLowerCase()),
  )
}

function matchesQuery(
  fm: Record<string, unknown> | null,
  query: ArticleQuery,
): boolean {
  if (!fm) return false
  if (query.type != null && !scalarEquals(fm.type, query.type)) return false
  if (query.tags && query.tags.length > 0) {
    const tags = tagSet(fm)
    if (!query.tags.every((t) => tags.has(t.trim().toLowerCase()))) return false
  }
  if (query.fields) {
    for (const [key, want] of Object.entries(query.fields)) {
      if (!scalarEquals(fm[key], want)) return false
    }
  }
  return true
}

/**
 * Articles whose frontmatter matches the query, sorted by title. The building
 * block for Smart Views and the encounter builder's monster/character pickers.
 * Same index-or-disk source as search, so results agree either way.
 */
export function queryArticles(
  worldId: string,
  query: ArticleQuery,
): Array<ArticleRef> {
  const results: Array<ArticleRef> = []
  for (const { id, folderId, title, frontmatter } of articleEntries(worldId)) {
    if (matchesQuery(frontmatter, query)) results.push({ id, folderId, title })
  }
  return results.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  )
}

/**
 * Articles whose YAML frontmatter declares `type: character` — the character
 * manager's list. A thin wrapper over queryArticles so there's one code path.
 */
export function listCharacters(worldId: string): Array<ArticleRef> {
  return queryArticles(worldId, { type: 'character' })
}

/** Articles whose content wiki-links to the given article's title. */
export function findMentions(
  worldId: string,
  articleId: string,
): Array<MentionResult> {
  const title = articleId.slice(articleId.lastIndexOf('/') + 1)
  const pattern = new RegExp(
    `\\[\\[\\s*${escapeRegExp(title)}\\s*(\\]\\]|\\|)`,
    'i',
  )
  const results: Array<MentionResult> = []
  for (const article of articleEntries(worldId)) {
    if (article.id === articleId) continue
    if (pattern.test(article.content))
      results.push({ id: article.id, title: article.title })
  }
  return results
}
