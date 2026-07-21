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
    const index = content.toLowerCase().indexOf(q)
    if (!titleHit && index < 0) continue
    let snippet = ''
    if (index >= 0) {
      const start = Math.max(0, index - 40)
      const end = Math.min(content.length, index + q.length + 40)
      snippet =
        (start > 0 ? '…' : '') +
        content.slice(start, end).replace(/\s+/g, ' ').trim() +
        (end < content.length ? '…' : '')
    }
    results.push({ id, folderId, title, snippet })
    if (results.length >= 50) break
  }
  return results
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
