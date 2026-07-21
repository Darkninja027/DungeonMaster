import { contextBridge, ipcRenderer } from 'electron'

const CHANNELS = new Set([
  'worlds:list',
  'worlds:pickAndOpen',
  'worlds:create',
  'worlds:get',
  'worlds:update',
  'worlds:remove',
  'worlds:tree',
  'worlds:search',
  'worlds:watch',
  'worlds:unwatch',
  'folders:create',
  'folders:rename',
  'folders:move',
  'folders:delete',
  'articles:get',
  'articles:create',
  'articles:update',
  'articles:rename',
  'articles:duplicate',
  'articles:move',
  'articles:delete',
  'articles:mentions',
  'images:list',
  'images:upload',
  'images:delete',
  'session:get',
  'session:set',
  'updates:quitAndInstall',
])

// Channels the main process may PUSH to the renderer. Kept as a separate
// allowlist so the renderer can never subscribe to arbitrary IPC channels.
const EVENT_CHANNELS = new Set(['updates:status', 'world:changed'])

contextBridge.exposeInMainWorld('dmApi', {
  invoke: (channel: string, args?: unknown) => {
    if (!CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Unknown channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, args)
  },
  // Subscribe to a main->renderer event; returns an unsubscribe function.
  // Only the raw payload is forwarded — never the Electron event object.
  on: (channel: string, cb: (payload: unknown) => void) => {
    if (!EVENT_CHANNELS.has(channel)) return () => {}
    const listener = (_e: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})
