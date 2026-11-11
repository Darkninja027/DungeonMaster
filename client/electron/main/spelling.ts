import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { atomicWrite } from './worldStore'

/**
 * The user's own spelling dictionary — every word they told the editor to stop
 * flagging — stored as `spelling.json` in the app's userData folder.
 *
 * Global rather than per-world: the words you add are mostly names from your
 * own campaigns, and one dictionary for every world is what "Add to
 * dictionary" means everywhere else. It does not travel with a world folder.
 *
 * A file of our own rather than Electron's session dictionary, because the
 * checker is our own (src/lib/spellcheck/worker.ts) — Chromium's never sees
 * these words.
 */

function spellingPath(): string {
  return path.join(app.getPath('userData'), 'spelling.json')
}

/** One word, no whitespace, a sane length — anything else is not a word. */
const WORD = /^\S{1,64}$/u

/** The saved words, or none when the file is missing or unreadable. */
export function readSpellingWords(): Array<string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(spellingPath(), 'utf8')) as {
      words?: unknown
    }
    return Array.isArray(parsed.words)
      ? parsed.words.filter(
          (w): w is string => typeof w === 'string' && WORD.test(w),
        )
      : []
  } catch {
    return []
  }
}

/** Add one word. A word already there is a no-op, not a second copy. */
export function addSpellingWord(word: unknown): void {
  if (typeof word !== 'string' || !WORD.test(word)) {
    throw new Error('Not a single word.')
  }
  const words = readSpellingWords()
  if (words.includes(word)) return
  words.push(word)
  words.sort((a, b) => a.localeCompare(b))
  fs.mkdirSync(path.dirname(spellingPath()), { recursive: true })
  atomicWrite(spellingPath(), JSON.stringify({ words }, null, 2))
}
