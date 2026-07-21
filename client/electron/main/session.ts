import fs from 'node:fs'
import path from 'node:path'
import { resolveInWorld } from './sanitize'
import { atomicWrite, worldRoot } from './worldStore'

/**
 * Small per-world JSON state lives under .dm/ inside the world folder, so it
 * travels with the world. The dot prefix keeps it hidden from readTree and from
 * Obsidian. Relative paths are hardcoded per feature — the renderer only ever
 * supplies the payload, never a path.
 */

/** Renderer payloads are small; anything bigger is a bug, not state. */
export const MAX_STATE_BYTES = 256 * 1024

/** Read and JSON-parse a .dm/ file; null if missing or corrupt. */
export function readWorldJson(worldId: string, relPath: string): unknown {
  const abs = resolveInWorld(worldRoot(worldId), relPath)
  if (!fs.existsSync(abs)) return null
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8')) as unknown
  } catch {
    return null // corrupt file: the renderer starts fresh
  }
}

/** Atomically write a small JSON payload into a .dm/ file. */
export function writeWorldJson(
  worldId: string,
  relPath: string,
  state: unknown,
): void {
  const json = JSON.stringify(state, null, 2)
  if (Buffer.byteLength(json) > MAX_STATE_BYTES) {
    throw new Error('State payload is unreasonably large — refusing to save.')
  }
  const abs = resolveInWorld(worldRoot(worldId), relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  atomicWrite(abs, json)
}

const SESSION_REL = '.dm/session.json'
const VIEWS_REL = '.dm/views.json'

/** Combat/session state (initiative tracker). */
export function readSession(worldId: string): unknown {
  return readWorldJson(worldId, SESSION_REL)
}
export function writeSession(worldId: string, state: unknown): void {
  writeWorldJson(worldId, SESSION_REL, state)
}

/** Saved Smart Views for this world. */
export function readViews(worldId: string): unknown {
  return readWorldJson(worldId, VIEWS_REL)
}
export function writeViews(worldId: string, state: unknown): void {
  writeWorldJson(worldId, VIEWS_REL, state)
}
