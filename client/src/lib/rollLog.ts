import { useSyncExternalStore } from 'react'

/**
 * Session-scoped log of every dice roll (dice chips and rollable tables).
 * A module-level store so components deep inside the markdown renderer can
 * log without provider wiring; in-memory only, cleared on app restart.
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

export function logRoll(entry: Omit<RollEntry, 'id' | 'at'>): void {
  entries = [
    { ...entry, id: crypto.randomUUID(), at: Date.now() },
    ...entries,
  ].slice(0, MAX_ENTRIES)
  notify()
}

export function clearRollLog(): void {
  entries = []
  notify()
}

export function useRollLog(): Array<RollEntry> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => entries,
  )
}
