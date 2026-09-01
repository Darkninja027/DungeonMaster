import path from 'node:path'
import { BrowserWindow, shell } from 'electron'

/**
 * Secondary windows showing one article, in one of two MODES:
 *
 *   'player' — chrome-free, for the table. :::dm blocks stripped, every link
 *              and dice chip inert. Roll20's player view.
 *   'popout' — the same article for the DM's own second monitor: nothing
 *              stripped, dice still rollable. A reference window, not a
 *              display one.
 *
 * They share the window plumbing and share nothing else — the whole point of
 * the modes is that their content rules are opposites. The mode is part of the
 * window key, so a monster can be popped out for the DM AND shown to the
 * players at the same time without one stealing the other's window.
 *
 * NOTE: 'player' here is unrelated to WorldMode's `'player'` in
 * src/lib/worldMode.ts, which is a per-world chrome setting for someone
 * playing a character in someone else's game.
 *
 * Electron-coupled, so untested — the same split watcher.ts observes from the
 * other side (it is Electron-free *because* it is unit-tested, while images.ts
 * imports shell and is not).
 */

const devServerUrl = process.env.VITE_DEV_SERVER_URL

export type ViewerMode = 'player' | 'popout'

/** `${mode}::${worldId}::${articleId}` -> the window showing it. */
const players = new Map<string, BrowserWindow>()

const keyOf = (mode: ViewerMode, worldId: string, articleId: string) =>
  `${mode}::${worldId}::${articleId}`

export interface PlayerContent {
  worldId: string
  articleId: string
  content: string
  title: string
}

/** Open a viewer window for this article, or focus the one already showing it. */
export function showPlayerWindow(
  worldId: string,
  articleId: string,
  mode: ViewerMode = 'player',
): void {
  const key = keyOf(mode, worldId, articleId)
  const existing = players.get(key)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return
  }

  const win = new BrowserWindow({
    width: 1100,
    height: 850,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0c0a09', // matches the route's bg-stone-950: no white flash
    title: mode === 'popout' ? 'Reference' : 'Player view',
    webPreferences: {
      // Identical to the DM window's. Notably NO `partition`: the world://
      // protocol is registered against the default session, so a partitioned
      // window would silently serve no images.
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Same two guards the DM window sets. They are per-webContents and are NOT
  // inherited — an external link in an article is exactly as dangerous here.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const isApp = devServerUrl
      ? url.startsWith(devServerUrl)
      : url.startsWith('file:')
    if (isApp) return
    e.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })

  // encodeURIComponent because an article id is a path — `NPCs/Strahd`.
  const hash =
    `/${mode === 'popout' ? 'popout' : 'player'}` +
    `/${worldId}/${encodeURIComponent(articleId)}`
  if (devServerUrl) {
    void win.loadURL(`${devServerUrl}/#${hash}`)
    // Deliberately no openDevTools, unlike the DM window: a detached devtools
    // pane on a projector is visible to the players.
  } else {
    void win.loadFile(path.join(__dirname, '../../dist/index.html'), { hash })
  }

  win.on('closed', () => {
    // Identity-checked: a fast close/reopen would otherwise have the old
    // window's event delete the new window's entry.
    if (players.get(key) === win) players.delete(key)
  })
  players.set(key, win)
}

export function closePlayerWindow(
  worldId: string,
  articleId: string,
  mode: ViewerMode = 'player',
): void {
  const win = players.get(keyOf(mode, worldId, articleId))
  if (win && !win.isDestroyed()) win.close()
}

/** Close every player window. Returns how many were open. */
export function closeAllPlayerWindows(): number {
  // Iterate a copy: close() can fire 'closed' synchronously, which mutates
  // the map we would otherwise be walking.
  const open = [...players.values()].filter((w) => !w.isDestroyed())
  for (const win of open) win.close()
  return open.length
}

/**
 * Relay the DM's live editor buffer to any window showing that article.
 *
 * This exists because the file watcher cannot do the job: every write the app
 * makes is announced via noteSelfWrite and dropped by watcher.ts, so a DM
 * typing in the DM window is by construction invisible to it.
 *
 * Sent to BOTH modes: a popout is a reference window, and a reference that
 * silently goes stale while you edit the thing it is showing is worse than no
 * reference at all.
 */
export function pushToPlayerWindow(payload: PlayerContent): void {
  for (const mode of ['player', 'popout'] as const) {
    const win = players.get(keyOf(mode, payload.worldId, payload.articleId))
    if (win && !win.isDestroyed()) win.webContents.send('player:content', payload)
  }
}
