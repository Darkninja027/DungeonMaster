import path from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { registerIpcHandlers } from './ipc'
import { registerWorldProtocol, handleWorldProtocol } from './images'

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

registerWorldProtocol()

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

  win.once('ready-to-show', () => win.show())
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
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    handleWorldProtocol()
    registerIpcHandlers()
    const win = createWindow()

    // Replay the latest update status to the renderer once it has loaded —
    // updater events can fire before the page is ready to receive them.
    win.webContents.on('did-finish-load', () => {
      sendUpdateStatus(win, lastUpdateStatus)
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
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
