import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { registerIpcHandlers } from './ipc'
import { registerWorldProtocol, handleWorldProtocol } from './images'

const devServerUrl = process.env.VITE_DEV_SERVER_URL

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
    createWindow()

    // Check GitHub Releases for a newer version; downloads in the background
    // and installs on next app restart. No-op in dev.
    if (app.isPackaged) {
      // Log updater activity to %APPDATA%/DungeonMaster/logs/main.log so a
      // failed update (e.g. a 404 from a filename mismatch) is diagnosable
      // instead of vanishing into a packaged app's dead console.
      autoUpdater.logger = log
      log.transports.file.level = 'info'
      autoUpdater.on('error', (e) => log.error('updater error', e))
      autoUpdater.on('update-available', (i) => log.info('update available', i.version))
      autoUpdater.on('update-not-available', (i) => log.info('no update', i.version))
      autoUpdater.on('update-downloaded', (i) => log.info('downloaded', i.version))

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
