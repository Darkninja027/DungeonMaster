import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'

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
export function relayRoll(sender: WebContents, entry: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    const target = win.webContents
    if (target.id === sender.id) continue
    target.send('rolls:entry', entry)
  }
}
