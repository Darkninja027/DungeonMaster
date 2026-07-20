# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DungeonMaster is an **Electron desktop app** — a worldbuilding notebook for D&D.
The defining idea: **a "world" is just a folder on disk.** Articles are `.md`
files, folders are real directories, and images live in an `_images/` subfolder.
There is **no server and no database** — world folders are portable and open
fine in Obsidian too.

## Commands

Everything runs from `client/` — there is no root-level `package.json`.

```sh
cd client
npm install
npm run dev      # Vite dev server (port 4280) + Electron with HMR
npm test         # data-layer unit tests (vitest)
npm run lint     # eslint
npm run format   # prettier --write + eslint --fix
npm run check    # prettier --check
```

Run a single test file or test:

```sh
npx vitest run electron/main/worldStore.test.ts
npx vitest -t "round-trips absolute paths"
```

Build and release (Windows):

```sh
npm run dist     # NSIS installer -> client/release/
npm run release  # build + publish a draft GitHub Release (needs GH_TOKEN)
```

Before `release`, bump `"version"` in `client/package.json` — the auto-updater
only offers versions greater than the installed one. Regenerate routes after
adding a route file: `npm run generate-routes`.

## Architecture

### Two processes, one bridge

The React renderer **never touches disk**. It calls
`window.dmApi.invoke(channel, args)`, exposed by `client/electron/preload/index.ts`
via a **channel allowlist**. Adding a new IPC channel means adding it in *both*
the preload allowlist and `ipc.ts`, or the call is rejected.

### Data layer = Electron main (`client/electron/main/`)

- `ipc.ts` — the single place every `ipcMain.handle(...)` lives; maps channels to functions.
- `worldStore.ts` — the filesystem model. `readTree` walks the world folder (directories become folders, `*.md` files become articles). Writes are atomic (temp file + rename) so a crash never truncates an article. Renaming an article calls `rewriteWikiLinks` to fix `[[links]]` across the entire world.
- `sanitize.ts` — **security-critical.** `resolveInWorld` rejects any path that escapes the world root, and **every** handler funnels through it before touching disk. `nameError` validates titles/folder names as filenames. World ids are **hex-encoded** absolute paths — hex (not base64) because the id also rides in the host of `world://` URLs, which get lowercased.
- `images.ts` — serves world images read-only through a custom `world://<hexWorldId>/_images/<file>` protocol; enforces type/size limits on upload.
- `recents.ts` — recent-worlds list, stored in `userData/config.json`.

### Client data access

Components go through the typed `api` object in `client/src/lib/api.ts`, which
mirrors the IPC channels. Add methods there — don't scatter raw `invoke` calls
through components.

### Ids are path strings (not DB keys)

- **World id** = hex of the absolute folder path.
- **Article id** = world-relative path minus `.md` (e.g. `NPCs/Strahd`).
- **Folder id** = world-relative directory path. `null` folder = world root.

### Markdown rendering

`client/src/components/Markdown.tsx` + `client/src/lib/formatMarkdown.ts` handle
`[[wiki links]]`, clickable dice notation (`2d6+3`), rollable `d100` tables, and
Homebrewery-style `\page` / `\columns` markers. Book pages are fixed
816×1056 sheets; a hidden off-screen measurer counts CSS columns to decide the
sheet count. Images on disk use portable relative paths (`_images/foo.png`); the
renderer rewrites them to `world://` URLs at display time.

### Build pipeline

- Vite builds the renderer into `dist/`.
- **esbuild** (`esbuild.electron.mjs`) bundles main + preload into `dist-electron/` as **`.cjs`** files — the package is `"type": "module"`, so the Electron entry points must be CommonJS.
- `prepare-electron-dist.mjs` copies Electron's dist to `.electron-dist` minus `default_app.asar`, because corporate antivirus holds fresh `.asar` files open and makes electron-builder's normal unlink fail (EBUSY).

### Frontend stack

React 19 + TanStack Router (file-based routes in `client/src/routes/`; do **not**
hand-edit the generated `routeTree.gen.ts`) + TanStack Query. Tailwind CSS 4 and
shadcn/ui — add components with `pnpm dlx shadcn@latest add <name>`, they land in
`client/src/components/ui/`.

## Gotchas

- `client/README.md` is **stale TanStack Start boilerplate** (Nitro servers, server functions, API routes) — none of it applies. Ignore it.
- `server/` (an empty `Data/` dir) and `scripts/migrate-sqlite.mjs` are **dead remnants** of a removed .NET/SQLite server, kept only for one-time migration. They are not part of the running app.
- Deletes go to the OS Recycle Bin via `shell.trashItem`, not `fs.rm` (the exception is image deletion).
