import fs from 'node:fs'
import path from 'node:path'
import { resolveInWorld } from './sanitize'
import { atomicWrite, worldRoot } from './worldStore'

/**
 * DM session state (initiative tracker) lives in .dm/session.json inside the
 * world folder, so it travels with the world. The dot prefix keeps it hidden
 * from readTree and from Obsidian. The relative path is hardcoded here — the
 * renderer only ever supplies the payload, never a path.
 */

const SESSION_REL = '.dm/session.json'

/** Renderer payloads are small; anything bigger is a bug, not a session. */
export const MAX_SESSION_BYTES = 256 * 1024

export function readSession(worldId: string): unknown {
  const abs = resolveInWorld(worldRoot(worldId), SESSION_REL)
  if (!fs.existsSync(abs)) return null
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8')) as unknown
  } catch {
    return null // corrupt file: the renderer starts fresh
  }
}

export function writeSession(worldId: string, state: unknown): void {
  const json = JSON.stringify(state, null, 2)
  if (Buffer.byteLength(json) > MAX_SESSION_BYTES) {
    throw new Error('Session state is unreasonably large — refusing to save.')
  }
  const abs = resolveInWorld(worldRoot(worldId), SESSION_REL)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  atomicWrite(abs, json)
}
