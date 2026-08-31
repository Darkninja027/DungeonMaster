import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { atomicWrite } from './worldStore'

/**
 * Global homebrew — races, backgrounds, class kits and classes shared by every
 * world, stored as `homebrew.json` in the app's userData folder.
 *
 * A separate file from `config.json` on purpose. That file holds the recent
 * worlds list and the library root, and a corrupt homebrew entry must not cost
 * someone their recents; keeping them apart also leaves this one small enough
 * to open and hand-edit, which is the point of storing it as readable JSON.
 *
 * The renderer owns parsing (src/lib/homebrew.ts), so this module stays a dumb
 * reader/writer: whatever is on disk goes up as-is, and the renderer's tolerant
 * parser decides what is usable. That keeps the parsing unit-testable without
 * Electron, matching how worldSettings.ts is split.
 */

function homebrewPath(): string {
  return path.join(app.getPath('userData'), 'homebrew.json')
}

/** Renderer payloads are small; anything bigger is a bug, not homebrew. */
export const MAX_HOMEBREW_BYTES = 2 * 1024 * 1024

/**
 * The file as it sits on disk, or null when it's missing, unreadable or not
 * valid JSON. The renderer treats null as "no homebrew yet" and falls back to
 * the SRD tables alone — a corrupt file must never stop the app starting.
 */
export function readHomebrew(): unknown {
  try {
    return JSON.parse(fs.readFileSync(homebrewPath(), 'utf8')) as unknown
  } catch {
    return null
  }
}

/**
 * Replace the file wholesale. Unlike config.json this is not a key splice: the
 * renderer always sends the complete set, and a partial merge would make
 * "delete this race" impossible.
 *
 * Atomic (temp + rename) so a crash mid-write can't truncate the file and lose
 * every homebrew entry at once.
 */
export function writeHomebrew(homebrew: unknown): void {
  const json = JSON.stringify(homebrew, null, 2)
  if (Buffer.byteLength(json) > MAX_HOMEBREW_BYTES) {
    throw new Error(
      'Homebrew payload is unreasonably large — refusing to save.',
    )
  }
  fs.mkdirSync(path.dirname(homebrewPath()), { recursive: true })
  atomicWrite(homebrewPath(), json)
}
