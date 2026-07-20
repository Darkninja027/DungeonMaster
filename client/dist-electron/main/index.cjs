"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main/index.ts
var import_node_path = __toESM(require("node:path"), 1);
var import_electron2 = require("electron");

// electron/main/ipc.ts
function registerIpcHandlers() {
}

// electron/main/images.ts
var import_electron = require("electron");
function registerWorldProtocol() {
  import_electron.protocol.registerSchemesAsPrivileged([
    {
      scheme: "world",
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
    }
  ]);
}
function handleWorldProtocol() {
  import_electron.protocol.handle("world", () => new Response("Not found", { status: 404 }));
}

// electron/main/index.ts
var devServerUrl = process.env.VITE_DEV_SERVER_URL;
registerWorldProtocol();
function createWindow() {
  const win = new import_electron2.BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: import_node_path.default.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.once("ready-to-show", () => win.show());
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(import_node_path.default.join(__dirname, "../../dist/index.html"));
  }
  return win;
}
if (!import_electron2.app.requestSingleInstanceLock()) {
  import_electron2.app.quit();
} else {
  import_electron2.app.on("second-instance", () => {
    const [win] = import_electron2.BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  void import_electron2.app.whenReady().then(() => {
    handleWorldProtocol();
    registerIpcHandlers();
    createWindow();
    import_electron2.app.on("activate", () => {
      if (import_electron2.BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  import_electron2.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") import_electron2.app.quit();
  });
}
