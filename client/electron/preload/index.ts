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
  'folders:create',
  'folders:rename',
  'folders:move',
  'folders:delete',
  'articles:get',
  'articles:create',
  'articles:update',
  'articles:move',
  'articles:delete',
  'articles:mentions',
  'images:list',
  'images:upload',
  'images:delete',
])

contextBridge.exposeInMainWorld('dmApi', {
  invoke: (channel: string, args?: unknown) => {
    if (!CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Unknown channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, args)
  },
})
