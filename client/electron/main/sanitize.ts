import path from 'node:path'

/**
 * World ids are hex-encoded absolute folder paths. Hex (not base64url) because
 * the id also travels as the host of world:// URLs, and URL hosts are
 * lowercased — hex survives that, base64 does not.
 */
export function encodeWorldId(absPath: string): string {
  return Buffer.from(absPath, 'utf8').toString('hex')
}

export function decodeWorldId(worldId: string): string {
  if (!/^[0-9a-fA-F]+$/.test(worldId)) throw new Error('Invalid world id')
  return Buffer.from(worldId, 'hex').toString('utf8')
}

/**
 * Resolve a world-relative id ("NPCs/Strahd") to an absolute path, refusing
 * anything that escapes the world root. Every IPC handler funnels through
 * this before touching disk.
 */
export function resolveInWorld(root: string, rel: string): string {
  const abs = path.resolve(root, ...rel.split('/'))
  const normRoot = path.resolve(root)
  if (abs !== normRoot && !abs.startsWith(normRoot + path.sep)) {
    throw new Error('Path escapes world folder')
  }
  return abs
}

const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

/**
 * Validate a title / folder name for use as a filename. Returns an error
 * message, or null if the name is fine. We reject rather than mangle so the
 * user knows exactly what to change.
 */
export function nameError(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Name cannot be empty.'
  const bad = trimmed.match(INVALID_CHARS)
  if (bad)
    return `Name cannot contain ${bad[0] === ':' ? 'a colon (:)' : `"${bad[0]}"`} — it must be a valid filename.`
  if (RESERVED.test(trimmed))
    return `"${trimmed}" is a reserved Windows filename.`
  if (/[. ]$/.test(trimmed) || trimmed.startsWith('.')) {
    return 'Name cannot start with a dot or end with a dot or space.'
  }
  if (
    trimmed.includes('[[') ||
    trimmed.includes(']]') ||
    trimmed.includes('#')
  ) {
    return 'Name cannot contain [[, ]] or # — they break wiki-links.'
  }
  return trimmed.toLowerCase() === '_images'
    ? '"_images" is reserved for world images.'
    : null
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
