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
  'worlds:searchRanked',
  'worlds:tags',
  'worlds:query',
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
  'images:tree',
  'images:upload',
  'images:rename',
  'images:move',
  'images:delete',
  'images:createFolder',
  'images:renameFolder',
  'images:moveFolder',
  'images:deleteFolder',
  'images:countIn',
  'images:reveal',
  'characters:list',
  'session:get',
  'session:set',
  'views:get',
  'views:set',
  'worldSettings:get',
  'worldSettings:set',
  'homebrew:get',
  'homebrew:set',
  'vault:get',
  'vault:ensure',
  'library:get',
  'library:pick',
  'library:forget',
  'library:import',
  'library:restore',
  'shell:reveal',
  'updates:quitAndInstall',
  'player:show',
  'player:close',
  'player:closeAll',
  'player:push',
])

// Channels the main process may PUSH to the renderer. Kept as a separate
// allowlist so the renderer can never subscribe to arbitrary IPC channels.
const EVENT_CHANNELS = new Set([
  'updates:status',
  'library:status',
  'world:changed',
  'player:content',
])

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
