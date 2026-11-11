import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import { isTableView } from './mapWindow'

/**
 * Relay a dice roll to every OTHER window.
 *
 * The renderer's roll log (src/lib/rollLog.ts) is a module-level array, so it
 * is per-renderer-process. A popout window is a real second BrowserWindow with
 * its own heap, and dice stay rollable there deliberately — so a roll made in
 * one window would otherwise be invisible everywhere else, including in the DM's
 * own session panel.
 *
 * Same fan-out shape as pushToPlayerWindow, with two differences: the target is
 * every window rather than a keyed lookup, and the SENDER is excluded. The
 * sender has already recorded the roll locally; echoing it back would rely on
 * the renderer's id dedupe to stay correct, and not relying on that is cheaper
 * than trusting it.
 *
 * Electron-coupled, so untested — the merge/dedupe logic it feeds lives in
 * rollLog.ts and is unit-tested there.
 */
export function relayRoll(
  sender: WebContents | null,
  entry: unknown,
  channel: 'rolls:entry' | 'table:roll' = 'rolls:entry',
): void {
  recordRoll(entry)
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    const target = win.webContents
    if (sender && target.id === sender.id) continue
    // The players' map window is a display, and the DM rolls behind the
    // screen: it gets rolls only through the redacted map push
    // (forPlayersSession), never raw. Refused HERE so no renderer can opt in.
    if (isTableView(target)) continue
    target.send(channel, entry)
  }
}

/**
 * Every roll this run, oldest first, capped like the renderer's own log.
 *
 * A renderer's log is born empty, which was harmless while only popouts opened
 * mid-session — but the battlemap editor is a window the DM opens halfway
 * through a fight and then wants the roll history in. So main keeps a copy for
 * late windows to catch up from. In memory only, as the log always was.
 */
const history: Array<unknown> = []
const MAX_HISTORY = 200

function recordRoll(entry: unknown): void {
  history.push(entry)
  if (history.length > MAX_HISTORY)
    history.splice(0, history.length - MAX_HISTORY)
}

/** The log for a window catching up. The players' map window gets nothing. */
export function rollHistory(requester: WebContents): Array<unknown> {
  return isTableView(requester) ? [] : [...history]
}

/** Clear main's copy and tell every other window to clear theirs. */
export function clearRolls(sender: WebContents): void {
  history.length = 0
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.id === sender.id) continue
    win.webContents.send('rolls:cleared')
  }
}
