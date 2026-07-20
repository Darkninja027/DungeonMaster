import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
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
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => win.show())

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
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('Update check failed:', err)
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
