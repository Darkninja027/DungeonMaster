import fs from 'node:fs'
import path from 'node:path'
import { app, shell } from 'electron'
import { atomicWrite } from './worldStore'

/**
 * The DM's own Describe-panel lists: `describe-names.md` and
 * `describe-details.md` in the app's userData folder, shared by every world.
 *
 * Markdown files rather than JSON because they *are* markdown — long bullet
 * lists the renderer parses (src/lib/describe/) — and keeping them as `.md`
 * means they open and hand-edit cleanly outside the app.
 *
 * A missing file means "use the built-ins". There is no merge: a saved file
 * replaces the built-in list of its kind wholesale, which is what makes
 * deleting a built-in name possible. Like templates.ts this module is a dumb
 * reader/writer; the renderer owns parsing.
 */

export const DESCRIBE_KINDS = ['names', 'details'] as const
export type DescribeKind = (typeof DESCRIBE_KINDS)[number]

/** A list file past this is a bug, not a list. */
export const MAX_DESCRIBE_BYTES = 2 * 1024 * 1024

/**
 * The kind is checked against a fixed list before it becomes part of a
 * filename — it arrives over IPC, and an unchecked string here would be a path.
 */
function describePath(kind: unknown): string {
  if (!DESCRIBE_KINDS.includes(kind as DescribeKind))
    throw new Error(`Unknown describe list: ${String(kind)}`)
  return path.join(app.getPath('userData'), `describe-${kind as string}.md`)
}

function readOne(kind: DescribeKind): string | null {
  try {
    return fs.readFileSync(describePath(kind), 'utf8')
  } catch {
    return null
  }
}

/** Both files; null for any that is missing or unreadable. */
export function readDescribeLists(): Record<DescribeKind, string | null> {
  return { names: readOne('names'), details: readOne('details') }
}

/**
 * Save one list, or with `text: null` reset it so the built-ins come back.
 * A reset sends the file to the Recycle Bin like every other delete in this
 * app — it is somebody's hand-written list. Saves are atomic and size-checked
 * before anything touches disk.
 */
export async function writeDescribeList(
  kind: unknown,
  text: unknown,
): Promise<void> {
  const file = describePath(kind)
  if (text === null) {
    if (fs.existsSync(file)) await shell.trashItem(file)
    return
  }
  if (typeof text !== 'string') throw new Error('Describe list must be text.')
  if (Buffer.byteLength(text) > MAX_DESCRIBE_BYTES)
    throw new Error('Describe list is unreasonably large — refusing to save.')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  atomicWrite(file, text)
}
