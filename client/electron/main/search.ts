import fs from 'node:fs'
import { escapeRegExp, resolveInWorld } from './sanitize'
import { readTree, worldRoot } from './worldStore'
import type { MentionResult, SearchResult } from './worldStore'
import { getIndex } from './indexer'
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
    yield {
      id: article.id,
      folderId: article.folderId,
      title: article.title,
      content: fs.readFileSync(
        resolveInWorld(root, article.id + '.md'),
        'utf8',
      ),
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

/**
 * Articles whose YAML frontmatter declares `type: character` — the character
 * manager's list. Same index-or-disk source as search.
 */
export function listCharacters(
  worldId: string,
): Array<{ id: string; folderId: string | null; title: string }> {
  const results: Array<{ id: string; folderId: string | null; title: string }> =
    []
  for (const { id, folderId, title, content } of articleEntries(worldId)) {
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    if (fm && /^type:\s*character\s*$/m.test(fm[1])) {
      results.push({ id, folderId, title })
    }
  }
  return results.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  )
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
