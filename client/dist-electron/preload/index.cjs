"use strict";

// electron/preload/index.ts
var import_electron = require("electron");
var CHANNELS = /* @__PURE__ */ new Set([
  "worlds:list",
  "worlds:pickAndOpen",
  "worlds:create",
  "worlds:get",
  "worlds:update",
  "worlds:remove",
  "worlds:tree",
  "worlds:search",
  "folders:create",
  "folders:rename",
  "folders:move",
  "folders:delete",
  "articles:get",
  "articles:create",
  "articles:update",
  "articles:move",
  "articles:delete",
  "articles:mentions",
  "images:list",
  "images:upload",
  "images:delete"
]);
import_electron.contextBridge.exposeInMainWorld("dmApi", {
  invoke: (channel, args) => {
    if (!CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Unknown channel: ${channel}`));
    }
    return import_electron.ipcRenderer.invoke(channel, args);
  }
});
