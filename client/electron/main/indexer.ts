import fs from 'node:fs'
import { resolveInWorld } from './sanitize'
import { readTree, worldRoot } from './worldStore'
import type { Article } from './worldStore'

/**
 * In-memory index of one world's articles (title + content) so search and
 * backlinks don't re-read every file on every query. Built when the renderer
 * starts watching a world, kept fresh by app writes (ipc.ts) and watcher
 * batches. Correctness rule: on any doubt, drop the index — search.ts always
 * falls back to a disk scan when no index exists.
 */

export interface IndexEntry {
  id: string
  folderId: string | null
  title: string
  content: string
}

export type WorldIndex = Map<string, IndexEntry>

let indexed: { worldId: string; index: WorldIndex } | null = null

export function buildIndex(worldId: string): void {
  try {
    const root = worldRoot(worldId)
    const index: WorldIndex = new Map()
    for (const a of readTree(root).articles) {
      index.set(a.id, {
        id: a.id,
        folderId: a.folderId,
        title: a.title,
        content: fs.readFileSync(resolveInWorld(root, a.id + '.md'), 'utf8'),
      })
    }
    indexed = { worldId, index }
  } catch {
    indexed = null
  }
}

export function dropIndex(): void {
  indexed = null
}

export function getIndex(worldId: string): WorldIndex | undefined {
  return indexed && indexed.worldId === worldId ? indexed.index : undefined
}

/** Targeted update after an app write that produced this article. */
export function noteWrite(article: Article): void {
  const index = getIndex(article.worldId)
  if (!index) return
  index.set(article.id, {
    id: article.id,
    folderId: article.folderId,
    title: article.title,
    content: article.content,
  })
}

export function noteDelete(worldId: string, articleId: string): void {
  getIndex(worldId)?.delete(articleId)
}

/**
 * Anything that can fan out (renames rewrite links world-wide, moves re-key
 * ids, folder ops reshape the tree, external batches are untrusted) triggers
 * a full rebuild — same cost as a single pre-index search, and rare.
 */
export function refreshIndex(worldId: string): void {
  if (getIndex(worldId)) buildIndex(worldId)
}
