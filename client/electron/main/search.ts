import fs from 'node:fs'
import { escapeRegExp, resolveInWorld } from './sanitize'
import { readTree, worldRoot } from './worldStore'
import type { MentionResult, SearchResult } from './worldStore'

/** Case-insensitive substring search over titles and bodies, with ±40-char snippets. */
export function searchWorld(worldId: string, query: string): Array<SearchResult> {
  const root = worldRoot(worldId)
  const q = query.trim().toLowerCase()
  if (!q) return []
  const results: Array<SearchResult> = []
  for (const article of readTree(root).articles) {
    const content = fs.readFileSync(resolveInWorld(root, article.id + '.md'), 'utf8')
    const titleHit = article.title.toLowerCase().includes(q)
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
    results.push({ id: article.id, folderId: article.folderId, title: article.title, snippet })
    if (results.length >= 50) break
  }
  return results
}

/** Articles whose content wiki-links to the given article's title. */
export function findMentions(worldId: string, articleId: string): Array<MentionResult> {
  const root = worldRoot(worldId)
  const title = articleId.slice(articleId.lastIndexOf('/') + 1)
  const pattern = new RegExp(`\\[\\[\\s*${escapeRegExp(title)}\\s*(\\]\\]|\\|)`, 'i')
  const results: Array<MentionResult> = []
  for (const article of readTree(root).articles) {
    if (article.id === articleId) continue
    const content = fs.readFileSync(resolveInWorld(root, article.id + '.md'), 'utf8')
    if (pattern.test(content)) results.push({ id: article.id, title: article.title })
  }
  return results
}
