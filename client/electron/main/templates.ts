import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { atomicWrite } from './worldStore'

/**
 * Global article templates — the skeletons the New-article picker and the
 * editor's Insert menu offer, stored as `templates.json` in the app's userData
 * folder and shared by every world.
 *
 * App-level rather than per-world for the same reason homebrew is: a template
 * you write once should be offered everywhere, and a world folder you send to
 * someone else has no business carrying your authoring habits with it.
 *
 * A separate file from both `config.json` and `homebrew.json` on purpose. A
 * corrupt template must not cost someone their recents or their races, and
 * keeping them apart leaves each one small enough to open and hand-edit — which
 * is the point of storing them as readable JSON.
 *
 * The renderer owns parsing (src/lib/templateStore.ts), so this module stays a
 * dumb reader/writer: whatever is on disk goes up as-is, and the renderer's
 * tolerant parser decides what is usable. That keeps the parsing unit-testable
 * without Electron, matching how homebrew.ts and worldSettings.ts are split.
 */

function templatesPath(): string {
  return path.join(app.getPath('userData'), 'templates.json')
}

/**
 * Template bodies are markdown, so this cap is generous next to homebrew's —
 * but a payload past it is still a bug rather than a template.
 */
export const MAX_TEMPLATES_BYTES = 2 * 1024 * 1024

/**
 * The file as it sits on disk, or null when it's missing, unreadable or not
 * valid JSON. The renderer treats null as "no templates yet" and falls back to
 * the built-ins alone — a corrupt file must never empty the picker, let alone
 * stop the app starting.
 */
export function readTemplates(): unknown {
  try {
    return JSON.parse(fs.readFileSync(templatesPath(), 'utf8')) as unknown
  } catch {
    return null
  }
}

/**
 * Replace the file wholesale. Like homebrew and unlike config.json this is not
 * a key splice: the renderer always sends the complete set, and a partial merge
 * would make "delete this template" impossible.
 *
 * The size check runs before anything touches disk, so an oversize payload
 * leaves the existing file intact rather than truncating away every template.
 * Atomic (temp + rename) for the same reason.
 */
export function writeTemplates(store: unknown): void {
  const json = JSON.stringify(store, null, 2)
  if (Buffer.byteLength(json) > MAX_TEMPLATES_BYTES) {
    throw new Error(
      'Template payload is unreasonably large — refusing to save.',
    )
  }
  fs.mkdirSync(path.dirname(templatesPath()), { recursive: true })
  atomicWrite(templatesPath(), json)
}
