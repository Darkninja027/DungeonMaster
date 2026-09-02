import path from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { registerIpcHandlers } from './ipc'
import { registerWorldProtocol, handleWorldProtocol } from './images'
import { seedBundledContent } from './library'
import { closeAllPlayerWindows } from './playerWindow'

const devServerUrl = process.env.VITE_DEV_SERVER_URL

// Latest auto-update status, pushed to the renderer over the `updates:status`
// channel. Kept here so a renderer that finishes loading *after* an updater
// event fired can be replayed the current state on `did-finish-load`.
type UpdateStatus = {
  state: 'checking' | 'available' | 'downloaded' | 'idle' | 'error'
  version?: string
}
let lastUpdateStatus: UpdateStatus = { state: 'idle' }

function sendUpdateStatus(win: BrowserWindow, status: UpdateStatus) {
  lastUpdateStatus = status
  if (!win.isDestroyed()) win.webContents.send('updates:status', status)
}

/**
 * Whether the bundled content is still being copied into the library.
 *
 * Same replay bargain as the updater status above: on a fresh install the seed
 * starts before the renderer is listening, so the state is remembered and
 * re-sent on `did-finish-load`. Without that the loading gate would sit on its
 * generic message through a first run that copies 1,640 files.
 */
type LibraryStatus = { state: 'seeding' | 'ready' }
let lastLibraryStatus: LibraryStatus = { state: 'ready' }

function sendLibraryStatus(win: BrowserWindow, status: LibraryStatus) {
  lastLibraryStatus = status
  if (!win.isDestroyed()) win.webContents.send('library:status', status)
}

registerWorldProtocol()

/**
 * The DM window. Tracked by reference rather than found via getAllWindows(),
 * which became ambiguous once player windows existed — that list is creation
 * ordered, so [0] is not reliably this one.
 */
let mainWindow: BrowserWindow | null = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    title: `DungeonMaster v${app.getVersion()}`,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow = win
  win.once('ready-to-show', () => win.show())

  // Player windows are views onto the DM's article — orphaning one on a
  // projector after the DM quits is the worst possible failure, so they go
  // with it. ('close', not 'closed': window-all-closed will not fire while a
  // player window is still open, so the app would otherwise never quit.)
  win.on('close', () => closeAllPlayerWindows())
  // Keep our versioned title — the page's <title> would overwrite it on load.
  win.on('page-title-updated', (e) => e.preventDefault())

  // The app never opens child windows. target="_blank" links (external URLs
  // in articles) go to the system browser; anything else is dropped — a child
  // window would load the app without its preload bridge and just error.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Same for in-place navigation: only the app's own origin may load.
  win.webContents.on('will-navigate', (e, url) => {
    const isApp = devServerUrl
      ? url.startsWith(devServerUrl)
      : url.startsWith('file:')
    if (isApp) return
    e.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })

  if (devServerUrl) {
    void win.loadURL(devServerUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = mainWindow
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    handleWorldProtocol()
    registerIpcHandlers()
    const win = createWindow()

    // Fill the global library from the content shipped with the app, so a
    // fresh install opens with a full bestiary and spell list. Runs once per
    // bundled-content version and never blocks the window: a failure here is a
    // missing convenience, not a reason to stop launching.
    sendLibraryStatus(win, { state: 'seeding' })
    void seedBundledContent()
      .then((summary) => {
        if (summary?.copied) {
          log.info(`[library] seeded ${summary.copied} bundled articles`)
        }
      })
      .catch((error: unknown) => {
        log.warn('[library] bundled content seed failed', error)
      })
      // Always cleared, on both paths: a failed seed is a thinner library, not
      // a reason to leave the renderer waiting on a splash forever.
      .finally(() => sendLibraryStatus(win, { state: 'ready' }))

    // Replay the latest update status to the renderer once it has loaded —
    // updater events can fire before the page is ready to receive them.
    win.webContents.on('did-finish-load', () => {
      sendUpdateStatus(win, lastUpdateStatus)
      sendLibraryStatus(win, lastLibraryStatus)
    })

    // Renderer clicks "Restart to update" -> quit and install the download.
    ipcMain.handle('updates:quitAndInstall', () => autoUpdater.quitAndInstall())

    // Dev-only: the real updater is a no-op unless packaged, so under
    // `npm run dev` cycle the status through the UI states (spinner -> ready)
    // to exercise the indicator. Never runs in the packaged app.
    if (devServerUrl) {
      win.webContents.on('did-finish-load', () => {
        setTimeout(() => sendUpdateStatus(win, { state: 'checking' }), 2000)
        setTimeout(
          () => sendUpdateStatus(win, { state: 'available', version: '9.9.9' }),
          4000,
        )
        setTimeout(
          () =>
            sendUpdateStatus(win, { state: 'downloaded', version: '9.9.9' }),
          7000,
        )
      })
    }

    // Check GitHub Releases for a newer version; downloads in the background
    // and installs on next app restart. No-op in dev.
    if (app.isPackaged) {
      // Log updater activity to %APPDATA%/DungeonMaster/logs/main.log so a
      // failed update (e.g. a 404 from a filename mismatch) is diagnosable
      // instead of vanishing into a packaged app's dead console. Each handler
      // also pushes a status to the renderer so the UI can show progress.
      autoUpdater.logger = log
      log.transports.file.level = 'info'
      autoUpdater.on('checking-for-update', () => {
        sendUpdateStatus(win, { state: 'checking' })
      })
      autoUpdater.on('update-available', (i) => {
        log.info('update available', i.version)
        sendUpdateStatus(win, { state: 'available', version: i.version })
      })
      autoUpdater.on('update-not-available', (i) => {
        log.info('no update', i.version)
        sendUpdateStatus(win, { state: 'idle' })
      })
      autoUpdater.on('update-downloaded', (i) => {
        log.info('downloaded', i.version)
        sendUpdateStatus(win, { state: 'downloaded', version: i.version })
      })
      autoUpdater.on('error', (e) => {
        log.error('updater error', e)
        sendUpdateStatus(win, { state: 'error' })
      })

      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        log.error('Update check failed:', err)
      })
    }

    app.on('activate', () => {
      // Keyed on the DM window rather than the window count: a lone player
      // window would otherwise suppress recreating the one that matters.
      if (!mainWindow || mainWindow.isDestroyed()) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
