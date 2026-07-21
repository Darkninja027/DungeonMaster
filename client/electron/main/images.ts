import fs from 'node:fs'
import path from 'node:path'
import { net, protocol, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { resolveInWorld } from './sanitize'
import { noteSelfWrite } from './watcher'
import { IMAGES_DIR, worldRoot } from './worldStore'

export interface ImageInfo {
  id: string // filename within _images/
  fileName: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
  url: string
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

function imageUrl(worldId: string, fileName: string): string {
  return `world://${worldId}/${IMAGES_DIR}/${encodeURIComponent(fileName)}`
}

function toInfo(worldId: string, absDir: string, fileName: string): ImageInfo {
  const stat = fs.statSync(path.join(absDir, fileName))
  return {
    id: fileName,
    fileName,
    contentType:
      CONTENT_TYPES[path.extname(fileName).toLowerCase()] ??
      'application/octet-stream',
    sizeBytes: stat.size,
    uploadedAt: stat.birthtime.toISOString(),
    url: imageUrl(worldId, fileName),
  }
}

export function listImages(worldId: string): Array<ImageInfo> {
  const root = worldRoot(worldId)
  const dir = path.join(root, IMAGES_DIR)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => path.extname(name).toLowerCase() in CONTENT_TYPES)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((name) => toInfo(worldId, dir, name))
}

export function uploadImage(
  worldId: string,
  fileName: string,
  bytes: ArrayBuffer,
): ImageInfo {
  const root = worldRoot(worldId)
  const base = path.basename(fileName)
  const ext = path.extname(base).toLowerCase()
  if (!(ext in CONTENT_TYPES))
    throw new Error('Only png, jpeg, gif, webp and svg images are allowed.')
  if (bytes.byteLength > MAX_BYTES)
    throw new Error('Images are limited to 20 MB.')
  const dir = path.join(root, IMAGES_DIR)
  fs.mkdirSync(dir, { recursive: true })
  // Dedupe: "map.png" -> "map (2).png"
  const stem = base.slice(0, base.length - ext.length)
  let name = base
  for (let n = 2; fs.existsSync(path.join(dir, name)); n++)
    name = `${stem} (${n})${ext}`
  const abs = path.join(dir, name)
  noteSelfWrite(dir)
  noteSelfWrite(abs)
  fs.writeFileSync(abs, Buffer.from(bytes))
  return toInfo(worldId, dir, name)
}

export async function deleteImage(
  worldId: string,
  fileName: string,
): Promise<void> {
  const root = worldRoot(worldId)
  const abs = resolveInWorld(root, `${IMAGES_DIR}/${path.basename(fileName)}`)
  if (fs.existsSync(abs)) {
    noteSelfWrite(abs)
    await shell.trashItem(abs)
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
