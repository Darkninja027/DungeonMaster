import fs from 'node:fs'
import path from 'node:path'
import {
  decodeWorldId,
  encodeWorldId,
  escapeRegExp,
  nameError,
  resolveInWorld,
} from './sanitize'
import { noteSelfWrite } from './watcher'

export const IMAGES_DIR = '_images'

/**
 * The one file at a world root that describes the world: name/description/
 * createdAt alongside the hand-editable settings (the class list). Its presence
 * is also what marks a folder as a world.
 */
export const WORLD_FILE = 'worldSettings.json'

/**
 * Worlds used to keep metadata in a second file next to the settings. Folders
 * created by older builds still have it, so it counts as a marker and is read as
 * a fallback; migrateWorldFolder (worldSettings.ts) folds it in and deletes it
 * the first time such a world is opened.
 */
export const LEGACY_WORLD_FILE = 'world.json'

/** The on-disk shape's version. Bumped when world metadata moved into it. */
export const WORLD_FILE_VERSION = 2

export interface WorldMeta {
  name: string
  description: string
  createdAt: string
}

export interface WorldSummary extends WorldMeta {
  id: string
  articleCount: number
}

export interface FolderNode {
  id: string // world-relative dir path, '/'-separated
  parentFolderId: string | null
  name: string
  sortOrder: number
}

export interface ArticleSummary {
  id: string // world-relative file path without .md
  folderId: string | null
  title: string
  updatedAt: string
}

export interface Article extends ArticleSummary {
  worldId: string
  content: string
  createdAt: string
}

export interface SearchResult {
  id: string
  folderId: string | null
  title: string
  snippet: string
}

export interface MentionResult {
  id: string
  title: string
}

/**
 * Either file marks a world: a folder written by an older build has only the
 * legacy one, and it must still open — the migration that removes it can't run
 * until we've agreed the folder is a world in the first place.
 */
export function isWorldFolder(root: string): boolean {
  return (
    fs.existsSync(path.join(root, WORLD_FILE)) ||
    fs.existsSync(path.join(root, LEGACY_WORLD_FILE))
  )
}

export function worldRoot(worldId: string): string {
  const root = decodeWorldId(worldId)
  if (!isWorldFolder(root)) {
    throw new Error(`Not a world folder (missing ${WORLD_FILE}): ${root}`)
  }
  return root
}

/**
 * Parse a JSON file at the world root, or null if it's missing *or* corrupt.
 *
 * Callers must not treat null as "absent and therefore safe to overwrite": a
 * file that won't parse is a hand edit with a typo in it. Check existsSync for
 * that question — the same contract readWorldSettings holds.
 */
export function readWorldFile(
  root: string,
  file: string = WORLD_FILE,
): Record<string, unknown> | null {
  try {
    const raw: unknown = JSON.parse(
      fs.readFileSync(path.join(root, file), 'utf8'),
    )
    return typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const text = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null

/**
 * World metadata, read tolerantly from the merged file and falling back to the
 * legacy one field by field.
 *
 * Never throws: with either file counting as a marker, and either being open to
 * hand edits, every combination of missing/corrupt has to yield a usable world
 * rather than making the folder unopenable.
 */
export function readWorldMeta(root: string): WorldMeta {
  const merged = readWorldFile(root) ?? {}
  const legacy = readWorldFile(root, LEGACY_WORLD_FILE) ?? {}
  const pick = (key: keyof WorldMeta): string | null =>
    text(merged[key]) ?? text(legacy[key])
  return {
    name: pick('name') ?? path.basename(root),
    // Description is the one field where '' is a real value, not a gap — but a
    // blank in the merged file still defers to the legacy one during migration.
    description:
      pick('description') ??
      (typeof merged.description === 'string' ? merged.description : ''),
    createdAt: pick('createdAt') ?? new Date(0).toISOString(),
  }
}

/**
 * Splice world metadata into the merged file, preserving everything else in it
 * — `classes`, `_comment`, and any keys a hand-editor added that we don't know
 * about. Atomic, because this file is the world marker: a truncated write here
 * would leave the folder unopenable.
 */
export function writeWorldMeta(root: string, meta: WorldMeta) {
  const next = {
    ...(readWorldFile(root) ?? {}),
    version: WORLD_FILE_VERSION,
    ...meta,
  }
  atomicWrite(path.join(root, WORLD_FILE), JSON.stringify(next, null, 2))
}

export function initWorld(root: string, name: string, description: string) {
  fs.mkdirSync(root, { recursive: true })
  writeWorldMeta(root, {
    name,
    description,
    createdAt: new Date().toISOString(),
  })
}

function isVisibleEntry(entry: fs.Dirent): boolean {
  return !entry.name.startsWith('.') && entry.name.toLowerCase() !== IMAGES_DIR
}

/** Recursive walk of a world: real directories are folders, *.md files are articles. */
export function readTree(root: string): {
  folders: Array<FolderNode>
  articles: Array<ArticleSummary>
} {
  const folders: Array<FolderNode> = []
  const articles: Array<ArticleSummary> = []

  const walk = (relDir: string | null) => {
    const absDir = relDir ? resolveInWorld(root, relDir) : root
    const entries = fs
      .readdirSync(absDir, { withFileTypes: true })
      .filter(isVisibleEntry)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      )
    let order = 0
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        folders.push({
          id: rel,
          parentFolderId: relDir,
          name: entry.name,
          sortOrder: order++,
        })
        walk(rel)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const stat = fs.statSync(path.join(absDir, entry.name))
        articles.push({
          id: rel.slice(0, -3),
          folderId: relDir,
          title: entry.name.slice(0, -3),
          updatedAt: stat.mtime.toISOString(),
        })
      }
    }
  }

  walk(null)
  return { folders, articles }
}

export function countArticles(root: string): number {
  return readTree(root).articles.length
}

/** Case-insensitive existence check — Windows filesystems are case-insensitive. */
function entryExists(absDir: string, name: string): boolean {
  if (!fs.existsSync(absDir)) return false
  const lower = name.toLowerCase()
  return fs.readdirSync(absDir).some((e) => e.toLowerCase() === lower)
}

function articleAbsPath(root: string, articleId: string): string {
  const abs = resolveInWorld(root, articleId + '.md')
  if (!fs.existsSync(abs))
    throw new Error('Article not found — it may have been moved or renamed.')
  return abs
}

export function getArticle(worldId: string, articleId: string): Article {
  const root = worldRoot(worldId)
  const abs = articleAbsPath(root, articleId)
  const stat = fs.statSync(abs)
  const slash = articleId.lastIndexOf('/')
  return {
    id: articleId,
    worldId,
    folderId: slash < 0 ? null : articleId.slice(0, slash),
    title: articleId.slice(slash + 1),
    content: fs.readFileSync(abs, 'utf8'),
    createdAt: stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
  }
}

export function createArticle(input: {
  worldId: string
  folderId?: string | null
  title: string
  content?: string
}): Article {
  const root = worldRoot(input.worldId)
  const error = nameError(input.title)
  if (error) throw new Error(error)
  const title = input.title.trim()
  const dir = input.folderId ? resolveInWorld(root, input.folderId) : root
  if (!fs.existsSync(dir)) throw new Error('Folder not found.')
  if (entryExists(dir, title + '.md'))
    throw new Error(`"${title}" already exists in this folder.`)
  atomicWrite(path.join(dir, title + '.md'), input.content ?? '')
  const id = input.folderId ? `${input.folderId}/${title}` : title
  return getArticle(input.worldId, id)
}

/** Write via temp file + rename so a crash mid-write never truncates an article. */
export function atomicWrite(abs: string, content: string) {
  const tmp = abs + `.tmp-${process.pid}`
  noteSelfWrite(tmp)
  noteSelfWrite(abs)
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, abs)
}

/**
 * One mutation at a time per world. A rename rewrites [[links]] across every
 * article, and that loop awaits per file — so without this a second mutation
 * runs *inside* the first one's window and targets a path already renamed away,
 * failing with "Article not found".
 *
 * A plain promise chain: each caller queues behind the previous one. The stored
 * tail never rejects, so one failure can't poison the queue for the next caller.
 */
const worldLocks = new Map<string, Promise<unknown>>()

export function withWorldLock<T>(
  worldId: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const prev = worldLocks.get(worldId) ?? Promise.resolve()
  // Run regardless of how the predecessor settled.
  const run = prev.then(fn, fn)
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  worldLocks.set(worldId, tail)
  void tail.then(() => {
    // Drop the entry once this is the last queued op, so the map can't grow
    // unboundedly across a long session.
    if (worldLocks.get(worldId) === tail) worldLocks.delete(worldId)
  })
  return run
}

export function updateArticle(
  worldId: string,
  articleId: string,
  input: { title: string; content: string },
): Promise<Article> {
  return withWorldLock(worldId, () =>
    updateArticleUnlocked(worldId, articleId, input),
  )
}

async function updateArticleUnlocked(
  worldId: string,
  articleId: string,
  input: { title: string; content: string },
): Promise<Article> {
  const root = worldRoot(worldId)
  // Fail fast on a stale id. renameArticleFile early-returns when the title is
  // unchanged *without* checking existence, so without this an update against a
  // deleted article would silently recreate it.
  articleAbsPath(root, articleId)
  // Rename first: the title is the filename, so writing content to the old path
  // only to move it a moment later strands that content there if the rename is
  // then rejected (collision, invalid name).
  const id = await renameArticleFile(root, articleId, input.title.trim())
  atomicWrite(resolveInWorld(root, id + '.md'), input.content)
  return getArticle(worldId, id)
}

/**
 * Rename an article's file and rewrite inbound [[links]] world-wide.
 * The single rename semantics shared by updateArticle and renameArticle.
 * Returns the article's (possibly unchanged) id.
 */
async function renameArticleFile(
  root: string,
  articleId: string,
  newTitle: string,
): Promise<string> {
  const slash = articleId.lastIndexOf('/')
  const oldTitle = articleId.slice(slash + 1)
  const folderId = slash < 0 ? null : articleId.slice(0, slash)
  if (newTitle === oldTitle) return articleId

  const abs = articleAbsPath(root, articleId)
  const error = nameError(newTitle)
  if (error) throw new Error(error)
  const dir = path.dirname(abs)
  // Allow case-only renames (Waterdeep -> waterdeep) despite the case-insensitive FS.
  if (
    newTitle.toLowerCase() !== oldTitle.toLowerCase() &&
    entryExists(dir, newTitle + '.md')
  ) {
    throw new Error(`"${newTitle}" already exists in this folder.`)
  }
  const newAbs = path.join(dir, newTitle + '.md')
  noteSelfWrite(abs)
  noteSelfWrite(newAbs)
  fs.renameSync(abs, newAbs)
  await rewriteWikiLinks(root, oldTitle, newTitle)
  // The rewrite can outrun the watcher's self-write TTL on a large world. Without
  // a re-stamp the watcher reclassifies our own rename as an external edit and
  // the renderer invalidates (and refetches) the now-dead old id.
  noteSelfWrite(abs)
  noteSelfWrite(newAbs)
  return folderId ? `${folderId}/${newTitle}` : newTitle
}

/** Rename without touching content — for the sidebar context menu. */
export function renameArticle(
  worldId: string,
  articleId: string,
  title: string,
): Promise<Article> {
  return withWorldLock(worldId, async () => {
    const root = worldRoot(worldId)
    const id = await renameArticleFile(root, articleId, title.trim())
    return getArticle(worldId, id)
  })
}

/** Copy an article as "Title (copy)" / "Title (copy N)" in the same folder. */
export function duplicateArticle(worldId: string, articleId: string): Article {
  const root = worldRoot(worldId)
  const abs = articleAbsPath(root, articleId)
  const slash = articleId.lastIndexOf('/')
  const title = articleId.slice(slash + 1)
  const folderId = slash < 0 ? null : articleId.slice(0, slash)
  const dir = path.dirname(abs)
  let copyTitle = `${title} (copy)`
  for (let n = 2; entryExists(dir, copyTitle + '.md'); n++)
    copyTitle = `${title} (copy ${n})`
  atomicWrite(path.join(dir, copyTitle + '.md'), fs.readFileSync(abs, 'utf8'))
  return getArticle(worldId, folderId ? `${folderId}/${copyTitle}` : copyTitle)
}

/**
 * After a rename, update [[Old Title]] / [[Old Title|alias]] across the whole
 * world. Async so the per-article read/write loop yields to the event loop:
 * on a large world this can touch hundreds of files, and blocking the single
 * main-process thread synchronously would freeze the whole app (input, IPC,
 * window events) until it finished.
 */
async function rewriteWikiLinks(
  root: string,
  oldTitle: string,
  newTitle: string,
) {
  const pattern = new RegExp(
    `\\[\\[\\s*${escapeRegExp(oldTitle)}\\s*(\\]\\]|\\|)`,
    'gi',
  )
  for (const article of readTree(root).articles) {
    try {
      const abs = resolveInWorld(root, article.id + '.md')
      const content = await fs.promises.readFile(abs, 'utf8')
      const updated = content.replace(
        pattern,
        (_, tail: string) => `[[${newTitle}${tail}`,
      )
      if (updated !== content) atomicWrite(abs, updated)
    } catch {
      // The tree was snapshotted before this loop and every iteration awaits, so
      // an article can vanish or be locked mid-walk (Obsidian, Dropbox, git).
      // The rename itself is already committed: one stale link is cosmetic, but
      // rejecting the whole save here would lose the user's edit.
    }
  }
}

export function moveArticle(
  worldId: string,
  articleId: string,
  folderId: string | null,
): Promise<void> {
  return withWorldLock(worldId, () => {
    moveArticleUnlocked(worldId, articleId, folderId)
  })
}

function moveArticleUnlocked(
  worldId: string,
  articleId: string,
  folderId: string | null,
): void {
  const root = worldRoot(worldId)
  const abs = articleAbsPath(root, articleId)
  const name = path.basename(abs)
  const targetDir = folderId ? resolveInWorld(root, folderId) : root
  if (!fs.existsSync(targetDir)) throw new Error('Target folder not found.')
  if (path.dirname(abs) === targetDir) return
  if (entryExists(targetDir, name)) {
    throw new Error(
      `"${name.slice(0, -3)}" already exists in the target folder.`,
    )
  }
  const newAbs = path.join(targetDir, name)
  noteSelfWrite(abs)
  noteSelfWrite(newAbs)
  fs.renameSync(abs, newAbs)
}

export function createFolder(input: {
  worldId: string
  parentFolderId?: string | null
  name: string
}): FolderNode {
  const root = worldRoot(input.worldId)
  const error = nameError(input.name)
  if (error) throw new Error(error)
  const name = input.name.trim()
  const parentAbs = input.parentFolderId
    ? resolveInWorld(root, input.parentFolderId)
    : root
  if (!fs.existsSync(parentAbs)) throw new Error('Parent folder not found.')
  if (entryExists(parentAbs, name))
    throw new Error(`"${name}" already exists here.`)
  const dirAbs = path.join(parentAbs, name)
  noteSelfWrite(dirAbs)
  fs.mkdirSync(dirAbs)
  return {
    id: input.parentFolderId ? `${input.parentFolderId}/${name}` : name,
    parentFolderId: input.parentFolderId ?? null,
    name,
    sortOrder: 0,
  }
}

export function renameFolder(
  worldId: string,
  folderId: string,
  name: string,
): Promise<void> {
  return withWorldLock(worldId, () => {
    renameFolderUnlocked(worldId, folderId, name)
  })
}

function renameFolderUnlocked(
  worldId: string,
  folderId: string,
  name: string,
): void {
  const root = worldRoot(worldId)
  const error = nameError(name)
  if (error) throw new Error(error)
  const newName = name.trim()
  const abs = resolveInWorld(root, folderId)
  if (!fs.existsSync(abs)) throw new Error('Folder not found.')
  if (newName === path.basename(abs)) return
  const dir = path.dirname(abs)
  if (
    newName.toLowerCase() !== path.basename(abs).toLowerCase() &&
    entryExists(dir, newName)
  ) {
    throw new Error(`"${newName}" already exists here.`)
  }
  const newAbs = path.join(dir, newName)
  noteSelfWrite(abs)
  noteSelfWrite(newAbs)
  fs.renameSync(abs, newAbs)
}

export function moveFolder(
  worldId: string,
  folderId: string,
  parentFolderId: string | null,
): Promise<void> {
  return withWorldLock(worldId, () => {
    moveFolderUnlocked(worldId, folderId, parentFolderId)
  })
}

function moveFolderUnlocked(
  worldId: string,
  folderId: string,
  parentFolderId: string | null,
): void {
  const root = worldRoot(worldId)
  const abs = resolveInWorld(root, folderId)
  if (!fs.existsSync(abs)) throw new Error('Folder not found.')
  const name = path.basename(abs)
  const targetDir = parentFolderId ? resolveInWorld(root, parentFolderId) : root
  if (!fs.existsSync(targetDir)) throw new Error('Target folder not found.')
  // A folder cannot move into itself or its own descendants.
  if (targetDir === abs || targetDir.startsWith(abs + path.sep)) {
    throw new Error('Cannot move a folder into itself.')
  }
  if (path.dirname(abs) === targetDir) return
  if (entryExists(targetDir, name))
    throw new Error(`"${name}" already exists in the target folder.`)
  const newAbs = path.join(targetDir, name)
  noteSelfWrite(abs)
  noteSelfWrite(newAbs)
  fs.renameSync(abs, newAbs)
}

export { encodeWorldId }
