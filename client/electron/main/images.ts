import fs from 'node:fs'
import path from 'node:path'
import { net, protocol, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { nameError, resolveInWorld } from './sanitize'
import { noteSelfWrite } from './watcher'
import {
  IMAGES_DIR,
  atomicWrite,
  entryExists,
  readTree,
  worldRoot,
} from './worldStore'

export interface ImageInfo {
  id: string // '/'-separated path RELATIVE TO _images/ ('Maps/City/tavern.png')
  fileName: string // basename only ('tavern.png')
  folderId: string | null // 'Maps/City'; null = the _images root
  contentType: string
  sizeBytes: number
  uploadedAt: string
  url: string // world://<worldId>/_images/Maps/City/tavern.png
  relPath: string // '_images/Maps/City/tavern.png' — the portable disk path
  encodedRelPath: string // the same, per-segment percent-encoded, for markdown
}

/** A directory under _images/. `id` is _images-relative, like ImageInfo.id. */
export interface ImageFolder {
  id: string // 'Maps/City'
  parentFolderId: string | null // 'Maps'
  name: string // 'City'
}

export interface ImageTree {
  folders: Array<ImageFolder>
  images: Array<ImageInfo>
}

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

const MAX_BYTES = 20 * 1024 * 1024

/**
 * Percent-encode a '/'-separated path one segment at a time.
 * encodeURIComponent on the whole path would turn the separators into %2F,
 * which the app would still resolve but Obsidian would not — and portability
 * across both is the point of storing relative paths at all.
 */
function encodeRel(rel: string): string {
  return rel.split('/').map(encodeURIComponent).join('/')
}

function decodeSafe(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function imageUrl(worldId: string, rel: string): string {
  return `world://${worldId}/${IMAGES_DIR}/${encodeRel(rel)}`
}

/**
 * Resolve an _images-relative path to absolute, refusing anything that escapes
 * _images/. resolveInWorld already blocks escaping the world, but '../NPCs'
 * stays inside the world while leaving _images — and these handlers take
 * caller-supplied folder ids, so confine them explicitly. '' = the _images root.
 */
function resolveInImages(root: string, rel: string): string {
  const imagesRoot = resolveInWorld(root, IMAGES_DIR)
  const abs = resolveInWorld(root, rel ? `${IMAGES_DIR}/${rel}` : IMAGES_DIR)
  if (abs !== imagesRoot && !abs.startsWith(imagesRoot + path.sep)) {
    throw new Error('Path escapes the image folder')
  }
  return abs
}

/**
 * Validate a single path segment. nameError rejects '/', so it can only ever
 * check one segment — never pass a path. Its '_images' reservation fires here
 * too, which is what we want: it keeps _images/_images/foo.png from existing.
 */
function imageNameError(name: string): string | null {
  return nameError(name)
}

function toInfo(worldId: string, root: string, rel: string): ImageInfo {
  const stat = fs.statSync(resolveInImages(root, rel))
  const slash = rel.lastIndexOf('/')
  const fileName = rel.slice(slash + 1)
  return {
    id: rel,
    fileName,
    folderId: slash < 0 ? null : rel.slice(0, slash),
    contentType:
      CONTENT_TYPES[path.extname(fileName).toLowerCase()] ??
      'application/octet-stream',
    sizeBytes: stat.size,
    uploadedAt: stat.birthtime.toISOString(),
    url: imageUrl(worldId, rel),
    relPath: `${IMAGES_DIR}/${rel}`,
    encodedRelPath: `${IMAGES_DIR}/${encodeRel(rel)}`,
  }
}

function isImageFile(name: string): boolean {
  return path.extname(name).toLowerCase() in CONTENT_TYPES
}

/**
 * Recursive walk of _images/. Mirrors readTree's shape and sort order so the
 * renderer can reuse the article sidebar's parent-id filtering. Empty folders
 * are listed — the user just made them and needs somewhere to upload into.
 */
export function listImageTree(worldId: string): ImageTree {
  const root = worldRoot(worldId)
  const folders: Array<ImageFolder> = []
  const images: Array<ImageInfo> = []
  if (!fs.existsSync(path.join(root, IMAGES_DIR))) return { folders, images }

  const walk = (relDir: string | null) => {
    const entries = fs
      .readdirSync(resolveInImages(root, relDir ?? ''), { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.'))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      )
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        folders.push({ id: rel, parentFolderId: relDir, name: entry.name })
        walk(rel)
      } else if (entry.isFile() && isImageFile(entry.name)) {
        images.push(toInfo(worldId, root, rel))
      }
    }
  }

  walk(null)
  return { folders, images }
}

export function uploadImage(
  worldId: string,
  fileName: string,
  bytes: ArrayBuffer,
  folderId?: string | null,
): ImageInfo {
  const root = worldRoot(worldId)
  // basename, not the caller's path: a browser File.name can contain
  // separators. The destination comes from folderId instead.
  const base = path.basename(fileName)
  const ext = path.extname(base).toLowerCase()
  if (!(ext in CONTENT_TYPES))
    throw new Error('Only png, jpeg, gif, webp and svg images are allowed.')
  if (bytes.byteLength > MAX_BYTES)
    throw new Error('Images are limited to 20 MB.')
  const dir = resolveInImages(root, folderId ?? '')
  // Note every level mkdir will create, or the watcher reports a change we made.
  for (const level of missingAncestors(dir)) noteSelfWrite(level)
  fs.mkdirSync(dir, { recursive: true })
  // Dedupe: "map.png" -> "map (2).png". entryExists, not existsSync, so
  // uploading map.png alongside MAP.PNG dedupes instead of overwriting it.
  const stem = base.slice(0, base.length - ext.length)
  let name = base
  for (let n = 2; entryExists(dir, name); n++) name = `${stem} (${n})${ext}`
  const abs = path.join(dir, name)
  noteSelfWrite(dir)
  noteSelfWrite(abs)
  fs.writeFileSync(abs, Buffer.from(bytes))
  return toInfo(worldId, root, folderId ? `${folderId}/${name}` : name)
}

/** Directories that mkdirSync({recursive}) would have to create, outermost first. */
function missingAncestors(abs: string): Array<string> {
  const missing: Array<string> = []
  for (let dir = abs; !fs.existsSync(dir); dir = path.dirname(dir)) {
    missing.unshift(dir)
    if (path.dirname(dir) === dir) break
  }
  return missing
}

/**
 * To the Recycle Bin. References in markdown are deliberately left alone: a
 * visible broken image is a better signal than prose silently mutating.
 */
export async function deleteImage(
  worldId: string,
  imageId: string,
): Promise<void> {
  const root = worldRoot(worldId)
  const abs = resolveInImages(root, imageId)
  if (fs.existsSync(abs)) {
    noteSelfWrite(abs)
    await shell.trashItem(abs)
  }
}

/**
 * Reveal an image or image folder in the OS file manager. `imageId` is an
 * _images-relative path; '' reveals the _images folder itself. Worlds are just
 * folders on disk, so showing someone where a file actually lives is useful.
 */
export function revealImage(worldId: string, imageId: string): void {
  const root = worldRoot(worldId)
  const abs = resolveInImages(root, imageId)
  if (!fs.existsSync(abs)) throw new Error('That file is no longer on disk.')
  // Selects the item inside its parent folder, for both files and directories.
  shell.showItemInFolder(abs)
}

export function createImageFolder(
  worldId: string,
  parentFolderId: string | null,
  name: string,
): ImageFolder {
  const root = worldRoot(worldId)
  const error = imageNameError(name)
  if (error) throw new Error(error)
  const folderName = name.trim()
  // _images/ itself may not exist yet in a world with no images.
  const imagesRoot = path.join(root, IMAGES_DIR)
  noteSelfWrite(imagesRoot)
  fs.mkdirSync(imagesRoot, { recursive: true })
  const parentAbs = resolveInImages(root, parentFolderId ?? '')
  if (!fs.existsSync(parentAbs)) throw new Error('Parent folder not found.')
  if (entryExists(parentAbs, folderName))
    throw new Error(`"${folderName}" already exists here.`)
  const dirAbs = path.join(parentAbs, folderName)
  noteSelfWrite(dirAbs)
  fs.mkdirSync(dirAbs)
  return {
    id: parentFolderId ? `${parentFolderId}/${folderName}` : folderName,
    parentFolderId: parentFolderId ?? null,
    name: folderName,
  }
}

export async function renameImageFolder(
  worldId: string,
  folderId: string,
  name: string,
): Promise<{ id: string }> {
  const root = worldRoot(worldId)
  const error = imageNameError(name)
  if (error) throw new Error(error)
  const newName = name.trim()
  const abs = resolveInImages(root, folderId)
  if (!fs.existsSync(abs)) throw new Error('Folder not found.')
  if (newName === path.basename(abs)) return { id: folderId }
  const dir = path.dirname(abs)
  // Case-only renames must be allowed through, or capitalisation can never be
  // fixed on a case-insensitive filesystem.
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
  const slash = folderId.lastIndexOf('/')
  const newId = slash < 0 ? newName : `${folderId.slice(0, slash)}/${newName}`
  await rewriteImageRefs(root, folderId, newId)
  return { id: newId }
}

export async function moveImageFolder(
  worldId: string,
  folderId: string,
  parentFolderId: string | null,
): Promise<{ id: string }> {
  const root = worldRoot(worldId)
  const abs = resolveInImages(root, folderId)
  if (!fs.existsSync(abs)) throw new Error('Folder not found.')
  const name = path.basename(abs)
  const targetDir = resolveInImages(root, parentFolderId ?? '')
  if (!fs.existsSync(targetDir)) throw new Error('Target folder not found.')
  // Compared on resolved absolute paths: an id-string check would be fooled by
  // case differences on Windows.
  if (targetDir === abs || targetDir.startsWith(abs + path.sep)) {
    throw new Error('Cannot move a folder into itself.')
  }
  if (path.dirname(abs) === targetDir) return { id: folderId }
  if (entryExists(targetDir, name))
    throw new Error(`"${name}" already exists in the target folder.`)
  const newAbs = path.join(targetDir, name)
  noteSelfWrite(abs)
  noteSelfWrite(newAbs)
  fs.renameSync(abs, newAbs)
  const newId = parentFolderId ? `${parentFolderId}/${name}` : name
  await rewriteImageRefs(root, folderId, newId)
  return { id: newId }
}

export async function deleteImageFolder(
  worldId: string,
  folderId: string,
): Promise<void> {
  const root = worldRoot(worldId)
  if (!folderId) throw new Error('Cannot delete the images folder itself.')
  const abs = resolveInImages(root, folderId)
  if (fs.existsSync(abs)) {
    noteSelfWrite(abs)
    await shell.trashItem(abs)
  }
}

export async function renameImage(
  worldId: string,
  imageId: string,
  name: string,
): Promise<ImageInfo> {
  const root = worldRoot(worldId)
  const abs = resolveInImages(root, imageId)
  if (!fs.existsSync(abs)) throw new Error('Image not found.')
  const oldName = path.basename(abs)
  const oldExt = path.extname(oldName)
  let newName = name.trim()
  // Keep an image extension: without one, world:// would serve the wrong
  // content type and the file would drop out of listImageTree entirely —
  // vanishing from the app while still sitting on disk.
  const givenExt = path.extname(newName).toLowerCase()
  if (!givenExt) newName += oldExt
  else if (!(givenExt in CONTENT_TYPES))
    throw new Error(
      'Images must keep an image extension (png, jpg, gif, webp or svg).',
    )
  const error = imageNameError(newName)
  if (error) throw new Error(error)
  if (newName === oldName) return toInfo(worldId, root, imageId)
  const dir = path.dirname(abs)
  if (
    newName.toLowerCase() !== oldName.toLowerCase() &&
    entryExists(dir, newName)
  ) {
    throw new Error(`"${newName}" already exists here.`)
  }
  const newAbs = path.join(dir, newName)
  noteSelfWrite(abs)
  noteSelfWrite(newAbs)
  fs.renameSync(abs, newAbs)
  const slash = imageId.lastIndexOf('/')
  const newId = slash < 0 ? newName : `${imageId.slice(0, slash)}/${newName}`
  await rewriteImageRefs(root, imageId, newId)
  return toInfo(worldId, root, newId)
}

export async function moveImage(
  worldId: string,
  imageId: string,
  folderId: string | null,
): Promise<ImageInfo> {
  const root = worldRoot(worldId)
  const abs = resolveInImages(root, imageId)
  if (!fs.existsSync(abs)) throw new Error('Image not found.')
  const name = path.basename(abs)
  const targetDir = resolveInImages(root, folderId ?? '')
  if (!fs.existsSync(targetDir)) throw new Error('Target folder not found.')
  if (path.dirname(abs) === targetDir) return toInfo(worldId, root, imageId)
  if (entryExists(targetDir, name))
    throw new Error(`"${name}" already exists in the target folder.`)
  const newAbs = path.join(targetDir, name)
  noteSelfWrite(abs)
  noteSelfWrite(newAbs)
  fs.renameSync(abs, newAbs)
  const newId = folderId ? `${folderId}/${name}` : name
  await rewriteImageRefs(root, imageId, newId)
  return toInfo(worldId, root, newId)
}

/** How many images sit under a folder subtree — for the delete confirmation. */
export function countImagesIn(worldId: string, folderId: string): number {
  const prefix = folderId + '/'
  return listImageTree(worldId).images.filter((image) =>
    image.id.toLowerCase().startsWith(prefix.toLowerCase()),
  ).length
}

/**
 * Every _images/<path> token in a document, with the #fragment (image options
 * like #right&w=45% or #noframe) captured separately so it survives a rewrite
 * untouched.
 *
 * The path run allows spaces and tabs: filenames routinely contain them and
 * only the picker percent-encodes them, so a hand-typed or Obsidian-authored
 * `_images/elf guy.png` has to match as well. It stops at a line break, at the
 * ')' / ']' / quote that closes a markdown link or HTML attribute, and at '#'.
 * That over-reaches on a trailing markdown link title or trailing prose, so the
 * callback trims the run back to the longest prefix that names a real match.
 */
export const IMAGE_REF = /_images\/([^\r\n)\]"'#]+)(#[^\s)\]"']*)?/g

/**
 * Repoint _images/ references from oldRel to newRel. Both are _images-relative
 * and decoded ('Maps/elf guy.png'). Folder paths work too: descendants are
 * repointed as well.
 *
 * A reference on disk can be percent-encoded (what the picker inserts) or
 * plain (what a human types in Obsidian), so rather than encoding that
 * alternation into the pattern, the regex finds every candidate and this
 * decides. The author's encoding style is preserved, so hand-written files
 * aren't churned into percent-escapes.
 */
export function rewriteImageRefsInText(
  content: string,
  oldRel: string,
  newRel: string,
): string {
  const oldLower = oldRel.toLowerCase()

  /** The rewritten path, or null if `raw` does not name the renamed target. */
  const repoint = (raw: string): string | null => {
    const decoded = decodeSafe(raw)
    const decodedLower = decoded.toLowerCase()
    const isSelf = decodedLower === oldLower
    // The '/' boundary keeps a rename of 'Maps' off 'Maps2/x.png'.
    const isChild = decodedLower.startsWith(oldLower + '/')
    if (!isSelf && !isChild) return null
    // Slice the tail off the original-cased path so nested casing survives.
    const next = newRel + (isSelf ? '' : decoded.slice(oldRel.length))
    // Preserve the author's encoding style, so hand-written paths stay readable.
    return raw !== decoded ? encodeRel(next) : next
  }

  return content.replace(
    IMAGE_REF,
    (whole: string, rawPath: string, frag = '') => {
      // The path run can over-reach past the filename (a markdown link title,
      // or prose after a bare path), so try the longest prefix first and keep
      // whatever is left over verbatim.
      for (let end = rawPath.length; end > 0; end--) {
        const next = repoint(rawPath.slice(0, end))
        if (next === null) continue
        return `${IMAGES_DIR}/${next}${rawPath.slice(end)}${frag}`
      }
      return whole
    },
  )
}

/**
 * Apply rewriteImageRefsInText across every article in the world. Async for the
 * same reason rewriteWikiLinks is: on a large world this touches hundreds of
 * files, and blocking the single main-process thread would freeze the app.
 */
async function rewriteImageRefs(
  root: string,
  oldRel: string,
  newRel: string,
): Promise<void> {
  for (const article of readTree(root).articles) {
    const abs = resolveInWorld(root, article.id + '.md')
    const content = await fs.promises.readFile(abs, 'utf8')
    const updated = rewriteImageRefsInText(content, oldRel, newRel)
    if (updated !== content) atomicWrite(abs, updated)
  }
}

// world://<worldId>/_images/<file> — scoped, read-only access to world images.
// Must be registered before app ready.
export function registerWorldProtocol() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'world',
      privileges: {
        standard: true,
        secure: true,
        stream: true,
        supportFetchAPI: true,
      },
    },
  ])
}

// Called after app ready. The world id rides in the URL host (hex is
// case-stable, so host lowercasing is harmless).
export function handleWorldProtocol() {
  protocol.handle('world', (request) => {
    try {
      const url = new URL(request.url)
      const root = worldRoot(url.host)
      const rel = decodeURIComponent(url.pathname.replace(/^\//, ''))
      if (!rel.startsWith(`${IMAGES_DIR}/`))
        return new Response('Forbidden', { status: 403 })
      const abs = resolveInWorld(root, rel)
      if (!fs.existsSync(abs)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })
}
