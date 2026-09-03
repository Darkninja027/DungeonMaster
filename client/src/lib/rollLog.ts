import { useSyncExternalStore } from 'react'
import { api } from './api'

/**
 * Session-scoped log of every dice roll (dice chips and rollable tables).
 * A module-level store so components deep inside the markdown renderer can
 * log without provider wiring; in-memory only, cleared on app restart.
 *
 * The log spans EVERY window, not just this one. A popout is a real second
 * BrowserWindow with its own JS heap, and dice stay rollable there on purpose —
 * so without a relay, a roll made in a popout would land in that window's own
 * array and be invisible to the DM's session panel. `logRoll` therefore
 * broadcasts through main, and `mergeRoll` applies what arrives from elsewhere.
 *
 * The split between the two is load-bearing: `mergeRoll` must NOT re-broadcast,
 * or two windows would volley the same entry forever.
 */

export interface RollSource {
  worldId: string
  articleId: string
  title: string
}

export interface RollEntry {
  id: string
  notation: string
  /** Optional name for the roll, e.g. "Short Sword" from [Short Sword](dice:2d6+3). */
  label?: string
  total: number
  detail: string
  at: number
  source?: RollSource
}

const MAX_ENTRIES = 200

let entries: Array<RollEntry> = []
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/**
 * Insert newest-first by `at`, deduped on id. Returns whether it was new.
 *
 * Sorting rather than unshifting matters once entries arrive from other
 * windows: a relayed roll can land after a local one that happened later, and
 * a plain prepend would show the two out of order. Ids come from
 * crypto.randomUUID(), so an entry this window has already seen is dropped
 * rather than duplicated.
 */
function insert(entry: RollEntry): boolean {
  if (entries.some((e) => e.id === entry.id)) return false
  entries = [entry, ...entries].sort((a, b) => b.at - a.at).slice(0, MAX_ENTRIES)
  return true
}

/** Whether the IPC bridge exists — false in unit tests and during SSR. */
const bridged = () => typeof window !== 'undefined' && Boolean(window.dmApi)

/**
 * Record a roll made in THIS window, and tell every other window about it.
 * The broadcast is fire-and-forget: a failed relay must never lose the roll
 * the person in front of this window just made.
 */
export function logRoll(entry: Omit<RollEntry, 'id' | 'at'>): void {
  const full: RollEntry = { ...entry, id: crypto.randomUUID(), at: Date.now() }
  insert(full)
  notify()
  if (bridged()) void api.rolls.broadcast(full).catch(() => {})
}

/**
 * Apply a roll that happened in another window. Deliberately does not
 * broadcast — see the note at the top of the file.
 */
export function mergeRoll(entry: RollEntry): void {
  if (insert(entry)) notify()
}

/**
 * The current log, newest first. Exported for tests and for callers outside
 * React (the table host reads it to replay history to a joining seat); inside a
 * component use `useRollLog` so the read is subscribed.
 */
export function rollLogSnapshot(): Array<RollEntry> {
  return entries
}

export function clearRollLog(): void {
  entries = []
  notify()
}

/**
 * Subscribe this window to rolls made in the others.
 *
 * Done at module scope rather than in a component effect for the same reason
 * the store itself is module-level: the log has no provider and no owning
 * component, and every window that can render a roll must receive them —
 * including the player and popout routes, which mount none of the DM chrome.
 * Guarded for the test environment, where window.dmApi does not exist.
 */
if (bridged()) api.rolls.onEntry(mergeRoll)

export function useRollLog(): Array<RollEntry> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => entries,
  )
}
