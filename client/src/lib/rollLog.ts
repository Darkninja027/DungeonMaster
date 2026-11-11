import { useSyncExternalStore } from 'react'
import { api, bridged } from './api'

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

/**
 * Where a roll came from — the article or sheet whose dice chip was clicked.
 *
 * A roll that arrived over a LAN table carries only `title`: a world id is hex
 * of the HOST's absolute path, so it is stripped at the wire (forGuests in
 * electron/main/tableHost.ts) and a guest could not resolve it anyway. The
 * fields stay required because every LOCAL caller has them and making them
 * optional pushes undefined through SheetTab and the sheet preview, which use
 * worldId for images. Renderers must instead treat a relayed source as
 * label-only — see RollHistory, which links only when the roll is this
 * machine's own.
 */
export interface RollSource {
  worldId: string
  articleId: string
  title: string
}

/**
 * Who made a roll, when it came from a LAN guest. Absent for the DM's own.
 *
 * Stamped by the host from the seat it authenticated, never taken from the
 * payload — a guest naming its own seat could otherwise attribute a roll to
 * someone else. `character` is a display label only.
 */
export interface RollSeat {
  id: string
  name: string
  character?: string
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
  seat?: RollSeat
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
  entries = [entry, ...entries]
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_ENTRIES)
  return true
}

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
  // If this machine is a GUEST at someone else's table, the roll also goes up
  // to the host, which stamps the seat and fans it out. Registered rather than
  // imported so this module keeps no dependency on the network layer — the
  // markdown renderer imports it, and that must stay cheap.
  for (const sink of sinks) sink(full)
}

type RollSink = (entry: RollEntry) => void
const sinks = new Set<RollSink>()

/**
 * Also send every locally made roll somewhere else (the LAN host).
 * Returns an unsubscribe fn. A sink must never call logRoll, or a roll would
 * loop; guestStore uses mergeRoll for anything arriving the other way.
 */
export function onLocalRoll(sink: RollSink): () => void {
  sinks.add(sink)
  return () => sinks.delete(sink)
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

/**
 * Clear the log everywhere: this window, every other one, and main's copy.
 *
 * Everywhere rather than here, since main keeps the log for windows that open
 * later — a clear that only emptied this window would come back the next time
 * the battlemap opened.
 */
export function clearRollLog(): void {
  entries = []
  notify()
  if (bridged()) void api.rolls.clear().catch(() => {})
}

/** Loose shape check for rolls arriving from main, which stores what it was sent. */
function isRollEntry(v: unknown): v is RollEntry {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.notation === 'string' &&
    typeof r.total === 'number' &&
    typeof r.at === 'number'
  )
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
if (bridged()) {
  api.rolls.onEntry(mergeRoll)
  // A LAN guest's roll, stamped with its seat by the host. It goes in the same
  // log the DM's own rolls do; mergeRoll rather than logRoll, or the host would
  // re-broadcast a roll back to the table it just came from. Subscribed here
  // rather than in tableStore so windows that never load the table panel — the
  // battlemap — see guest rolls too.
  api.table.onRoll(mergeRoll)
  api.rolls.onCleared(() => {
    entries = []
    notify()
  })
  // Catch up on what happened before this window opened. Merged, so a roll
  // that arrived over the relay while this was in flight is not doubled.
  void api.rolls
    .history()
    .then((list) => {
      let changed = false
      for (const entry of list)
        if (isRollEntry(entry) && insert(entry)) changed = true
      if (changed) notify()
    })
    .catch(() => {})
}

/** A raw subscription, for callers outside React (the battlemap's live push). */
export function subscribeRollLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
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
