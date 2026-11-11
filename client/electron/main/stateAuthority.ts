import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import { applyStatePatch } from './statePatch'
import type { StatePatch } from './statePatch'

/**
 * The authoritative copy of a per-world `.dm/` list, held in the main process.
 *
 * Why it moved here at all: `writeWorldJson` replaces a whole file, and the
 * renderer stores (`lib/useMaps.ts`, `lib/sessionStore.ts`) are module globals —
 * one copy per renderer PROCESS. One window was fine. The moment a battlemap can
 * open in its own window, two processes each hold a full file and each save on a
 * debounce, and whichever fires last overwrites everything the other did. See
 * statePatch.ts for why that is structural rather than a tuning problem.
 *
 * So: one copy per world, here, and renderers send per-entry patches. Three
 * properties follow, and all three are the point:
 *
 *   - **There is one debounce**, not N racing ones, so there is no interleaving
 *     to reason about.
 *   - **A renderer crash or reload loses nothing**, because the pending timer
 *     lives in the process that dies last. The old `beforeunload` flush becomes
 *     a nicety rather than the thing correctness rests on.
 *   - **Closing the DM window while a map window is open is a non-event.** That
 *     case is why the authority is here rather than in the DM renderer, which
 *     would otherwise have to stay alive to serve a window it does not own.
 *
 * `rev` is a monotonic counter per world, and it is what makes an echo
 * impossible to confuse with a genuine update: a renderer ignores any change
 * whose rev it already has, and a gap tells it that it missed one and should
 * re-read. Sender-exclusion alone (the `rollRelay.ts` pattern) would stop the
 * echo but not the divergence — a roll log is an append-only bag, while these
 * files are shared mutable state.
 *
 * Electron-coupled (BrowserWindow, timers), so untested — the merge rule it
 * wraps is pure and lives in statePatch.ts, which is where the tests are.
 */

interface Entry {
  /** The raw file payload, exactly as read from or written to disk. */
  file: unknown
  rev: number
  timer: ReturnType<typeof setTimeout> | null
  /** Set once a write has failed, so the error is reported once, not per tick. */
  reported: boolean
}

export interface StateChannel {
  /** Event channel the fan-out uses, e.g. 'maps:changed'. */
  event: string
  /** The array key inside the file, e.g. 'maps'. */
  key: string
  read: (worldId: string) => unknown
  write: (worldId: string, state: unknown) => void
}

const SAVE_DEBOUNCE_MS = 800

/** `${event}::${worldId}` -> that world's authoritative entry. */
const entries = new Map<string, Entry>()

const keyOf = (channel: StateChannel, worldId: string) =>
  `${channel.event}::${worldId}`

/**
 * The entry for a world, read from disk on first use.
 *
 * Lazy rather than eager, because nothing knows in advance which worlds will be
 * touched.
 *
 * KNOWN LIMITATION worth naming: `readWorldJson` returns null both for a file
 * that is absent and for one that exists but could not be parsed, and this
 * treats both as an empty list. For an absent file that is right. For an
 * unreadable one it means the first patch writes a one-entry file over whatever
 * was there. The same collapse is what every other `.dm/` reader does today —
 * `parseMaps` cannot tell the two apart either — so fixing it belongs in
 * `readWorldJson`, where both callers would benefit, rather than here.
 */
function entryFor(channel: StateChannel, worldId: string): Entry {
  const k = keyOf(channel, worldId)
  const existing = entries.get(k)
  if (existing) return existing
  const fresh: Entry = {
    file: channel.read(worldId) ?? { version: 1, [channel.key]: [] },
    rev: 0,
    timer: null,
    reported: false,
  }
  entries.set(k, fresh)
  return fresh
}

/** Read the current file and revision, for a renderer that is starting up. */
export function readState(
  channel: StateChannel,
  worldId: string,
): { file: unknown; rev: number } {
  const entry = entryFor(channel, worldId)
  return { file: entry.file, rev: entry.rev }
}

/**
 * Apply one renderer's patch, fan it out, and schedule the disk write.
 *
 * Returns the new revision so the sender can record it — the sender has already
 * applied the change optimistically, which is what keeps a token drag feeling
 * instant while the disk lags 800ms behind.
 */
export function applyState(
  channel: StateChannel,
  worldId: string,
  patch: StatePatch,
  sender: WebContents | null,
): { rev: number } {
  const entry = entryFor(channel, worldId)
  entry.file = applyStatePatch(entry.file, channel.key, patch)
  entry.rev += 1

  // The patch, not the whole file: a follower applying one entry cannot clobber,
  // and a fog bitmask crossing IPC per stroke is cheap where a whole file is not.
  const payload = { worldId, rev: entry.rev, ...patch }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    const target = win.webContents
    // The sender already has it. Belt and braces with the rev check on the far
    // side, but not relying on that is cheaper than trusting it.
    if (sender && target.id === sender.id) continue
    target.send(channel.event, payload)
  }

  scheduleWrite(channel, worldId, entry)
  return { rev: entry.rev }
}

/**
 * Replace the whole payload, for the edits that genuinely are whole-file.
 *
 * Starting a fight rewrites every combatant at once, and expressing that as N
 * patches would be both slower and a lie about what happened. It still goes
 * through the authority — same rev bump, same fan-out, same debounce — so it
 * cannot race a patch or be lost by one. This is NOT a back door to the old
 * behaviour: the danger was a renderer saving a whole file it had held while
 * another edited it, and here the replacement is the user's explicit action
 * rather than a stale cache being flushed.
 */
export function replaceState(
  channel: StateChannel,
  worldId: string,
  state: unknown,
  sender: WebContents | null,
): { rev: number } {
  const entry = entryFor(channel, worldId)
  entry.file = state
  entry.rev += 1

  const payload = { worldId, rev: entry.rev, replace: state }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    const target = win.webContents
    if (sender && target.id === sender.id) continue
    target.send(channel.event, payload)
  }

  scheduleWrite(channel, worldId, entry)
  return { rev: entry.rev }
}

function scheduleWrite(
  channel: StateChannel,
  worldId: string,
  entry: Entry,
): void {
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    entry.timer = null
    writeNow(channel, worldId, entry)
  }, SAVE_DEBOUNCE_MS)
}

/**
 * Write, keeping the in-memory copy whatever happens.
 *
 * A payload over MAX_STATE_BYTES throws rather than truncating — that cap is
 * what forces the packed fog bitmask, and it is reachable on a large map. There
 * is no renderer awaiting this call, so the throw would otherwise vanish into a
 * timer and repeat every 800ms. Reported once per world, and the state stays in
 * memory so nothing is lost while the DM fixes the map.
 */
function writeNow(channel: StateChannel, worldId: string, entry: Entry): void {
  try {
    channel.write(worldId, entry.file)
    entry.reported = false
  } catch (err) {
    if (entry.reported) return
    entry.reported = true
    const message = err instanceof Error ? err.message : String(err)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel.event, {
          worldId,
          rev: entry.rev,
          error: message,
        })
      }
    }
  }
}

/** Write any pending change for this world now. Best effort. */
export function flushState(channel: StateChannel, worldId: string): void {
  const entry = entries.get(keyOf(channel, worldId))
  if (!entry?.timer) return
  clearTimeout(entry.timer)
  entry.timer = null
  writeNow(channel, worldId, entry)
}

/** Write every pending change, for app quit. */
export function flushAllState(channels: Array<StateChannel>): void {
  for (const channel of channels) {
    for (const [k, entry] of entries) {
      if (!k.startsWith(`${channel.event}::`) || !entry.timer) continue
      clearTimeout(entry.timer)
      entry.timer = null
      writeNow(channel, k.slice(channel.event.length + 2), entry)
    }
  }
}

/**
 * Drop a world's cached copy, flushing first.
 *
 * For tests and for a world being closed: without it the map would grow one
 * entry per world opened in a long session, each pinning a whole file.
 */
export function forgetState(channel: StateChannel, worldId: string): void {
  flushState(channel, worldId)
  entries.delete(keyOf(channel, worldId))
}
