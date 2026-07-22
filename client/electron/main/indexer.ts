import fs from 'node:fs'
import { parse as parseYaml } from 'yaml'
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
  /** Parsed YAML frontmatter, or null if absent/malformed. Computed once here. */
  frontmatter: Record<string, unknown> | null
}

export type WorldIndex = Map<string, IndexEntry>

/**
 * Parse an article's leading YAML frontmatter block into a plain object.
 * Defensive: anything malformed (or not an object) yields null, never throws —
 * a hand-edited article in Obsidian must never break the index.
 */
export function parseFrontmatter(
  content: string,
): Record<string, unknown> | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!m) return null
  try {
    const raw = parseYaml(m[1]) as unknown
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

let indexed: { worldId: string; index: WorldIndex } | null = null

export async function buildIndex(worldId: string): Promise<void> {
  try {
    const root = worldRoot(worldId)
    const index: WorldIndex = new Map()
    // Async per-article read so this whole-world scan yields to the event loop
    // instead of blocking the single main-process thread (freezing input/IPC)
    // on a large world.
    for (const a of readTree(root).articles) {
      const content = await fs.promises.readFile(
        resolveInWorld(root, a.id + '.md'),
        'utf8',
      )
      index.set(a.id, {
        id: a.id,
        folderId: a.folderId,
        title: a.title,
        content,
        frontmatter: parseFrontmatter(content),
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
    frontmatter: parseFrontmatter(article.content),
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
export async function refreshIndex(worldId: string): Promise<void> {
  if (getIndex(worldId)) await buildIndex(worldId)
}
