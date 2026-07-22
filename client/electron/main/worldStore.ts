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
const WORLD_FILE = 'world.json'

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

export function worldRoot(worldId: string): string {
  const root = decodeWorldId(worldId)
  if (!fs.existsSync(path.join(root, WORLD_FILE))) {
    throw new Error(`Not a world folder (missing ${WORLD_FILE}): ${root}`)
  }
  return root
}

export function readWorldMeta(root: string): WorldMeta {
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, WORLD_FILE), 'utf8'),
  ) as Partial<WorldMeta>
  return {
    name:
      typeof raw.name === 'string' && raw.name ? raw.name : path.basename(root),
    description: typeof raw.description === 'string' ? raw.description : '',
    createdAt:
      typeof raw.createdAt === 'string'
        ? raw.createdAt
        : new Date(0).toISOString(),
  }
}

export function writeWorldMeta(root: string, meta: WorldMeta) {
  const abs = path.join(root, WORLD_FILE)
  noteSelfWrite(abs)
  fs.writeFileSync(abs, JSON.stringify(meta, null, 2))
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

export async function updateArticle(
  worldId: string,
  articleId: string,
  input: { title: string; content: string },
): Promise<Article> {
  const root = worldRoot(worldId)
  const abs = articleAbsPath(root, articleId)
  atomicWrite(abs, input.content)
  const id = await renameArticleFile(root, articleId, input.title.trim())
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
  return folderId ? `${folderId}/${newTitle}` : newTitle
}

/** Rename without touching content — for the sidebar context menu. */
export async function renameArticle(
  worldId: string,
  articleId: string,
  title: string,
): Promise<Article> {
  const root = worldRoot(worldId)
  const id = await renameArticleFile(root, articleId, title.trim())
  return getArticle(worldId, id)
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
    const abs = resolveInWorld(root, article.id + '.md')
    const content = await fs.promises.readFile(abs, 'utf8')
    const updated = content.replace(
      pattern,
      (_, tail: string) => `[[${newTitle}${tail}`,
    )
    if (updated !== content) atomicWrite(abs, updated)
  }
}

export function moveArticle(
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
