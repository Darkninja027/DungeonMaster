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
- `images.ts` — serves world images read-only through a custom `world://<hexWorldId>/_images/<path>` protocol; enforces type/size limits on upload. Images live in **nested subfolders** under `_images/`, so it also owns folder create/rename/move/delete and image rename/move — each confined to `_images/` by a local `resolveInImages` (`resolveInWorld` alone would let `_images/../NPCs` through). Renaming or moving an image or image folder calls `rewriteImageRefs` to repoint `_images/` paths across the whole world, the image-side counterpart of `rewriteWikiLinks`. Because a reference on disk may be percent-encoded (what the picker inserts) or plain (what a human types in Obsidian), the rewriter matches both and preserves whichever style it found.
- `recents.ts` — recent-worlds list, stored in `userData/config.json`.

### Client data access

Components go through the typed `api` object in `client/src/lib/api.ts`, which
mirrors the IPC channels. Add methods there — don't scatter raw `invoke` calls
through components.

### SRD tables are an affordance, never a schema

`client/src/lib/srd/` holds SRD 5.1 races, backgrounds, class starting kits and
equipment tables (TypeScript constants, matching `classes.ts`). They exist so
the character creation wizard can offer choices — nothing more.

The rule that governs the whole folder: **`class`, `subclass`, `race` and
`background` are free text on disk.** A lookup is `name in, undefined out`,
mirroring `findClass`. An id in these tables is for React keys only and must
never reach a `.md` file: the wizard writes `race: Hill Dwarf`, never
`race: hill-dwarf`. A race, class or background the tables don't know
contributes its name and nothing else, and the sheet is still perfectly valid —
that is what keeps homebrew and Obsidian hand-edits round-tripping.

It is deliberately **not a rules engine**, and level 1 only. No per-level
feature tables, no slot progression, no multiclassing. `SubraceInfo.hpPerLevel`
is the single derived-number exception (Hill Dwarf), and it is a field rather
than a mechanism on purpose. `srd.test.ts` asserts data integrity — every skill
id real, every `PickList.id` globally unique — because a transcription error
here is silent: a mistyped skill just vanishes when the sheet parses it back.

`lib/srd/` carries **per-level progression** — features by level, spell slot
tables, ASI levels — and there is a line. What a class gains as it levels is in,
because the level-up wizard needs it. Multiclassing, feat catalogues, encumbrance
rules and anything computed *during play* stay out, and nothing here is ever
enforced: the wizard offers what the table says and the player takes it or
ignores it.

`lib/levelUp.ts` is the level-up wizard's pure layer, and its invariant is the
thing to preserve: **`applyLevelUp` only appends to arrays and raises numbers.**
It never rewrites `hp.current`, never edits an existing feature, never lowers a
slot total. A character is somebody's work. The draft carries its own `base`
snapshot so the step list can't change shape while the dialog is open.

A `ClassKit` is the **whole definition of a class** — hit die and subclasses for
the character sheet, starting gear and features for the wizard. These were two
tables once (`ClassInfo` per-world, kits global, joined by name); they were
merged so a class is edited in one place and travels as one thing. `ClassInfo`
survives only as the shape `classesFrom(tables)` hands the sheet, and as the
legacy `worldSettings.classes` key, which `mergeTables` folds into kits at read
time. **A world file is never rewritten just because it was opened**, so an old
world keeps its `classes` key and an older build opening the same folder still
finds what it expects.

Since v1.4.x the tables are **user-extensible**. `lib/homebrew.ts` parses
`homebrew.json` from the app's userData folder (global — shared by every world,
written by `electron/main/homebrew.ts`), and `worldSettings.json` gained
optional `races`/`backgrounds`/`kits` beside the legacy `classes` (per-world,
and the only tier that travels with a world folder). `lib/tables.ts` merges the three:
**world > global > SRD**, matched case-insensitively on name, so overriding a
built-in replaces it in place rather than duplicating it.

The one genuinely dangerous spot is `findSubrace`. `Character.race` stores only
the full subrace name ("Hill Dwarf"), so the parent race is recovered by
searching every race — and with homebrew merged in, two parents can offer the
same subrace name. Picking the wrong one silently yields the wrong speed and HP
rather than an error, which is why `subraceIndex` is built once over the merged
list and covered directly by `tables.test.ts`.

Editors live in `components/settings/homebrew/` (a Homebrew settings section,
app-wide like Library) and `components/character/create/HomebrewDialog.tsx`
(inline creation from the wizard). The inline path is the **only** sanctioned
refresh of the draft's captured tables — see the ref in `CreateCharacterDialog`,
which exists so a background refetch can't wipe work in progress.

The wizard's pure layer lives beside it and is fully unit-tested without React:
`abilityMethods.ts` (five score methods, including the 3×3 grid), `characterDraft.ts`
(wizard state and step gating — the draft **carries its own merged tables**, so
every derived helper stays a pure function of the draft) and `buildCharacter.ts`
(draft → `Character` +
markdown body). `buildCharacter` must stay **total** — the live summary panel
calls it on every keystroke against a half-filled draft.

### Ids are path strings (not DB keys)

- **World id** = hex of the absolute folder path.
- **Article id** = world-relative path minus `.md` (e.g. `NPCs/Strahd`).
- **Folder id** = world-relative directory path. `null` folder = world root.
- **Image id / image folder id** = path relative to **`_images/`**, not the world
  root (e.g. `Maps/City/tavern.png`). `null` folder = the `_images` root. Markdown
  stores `_images/` + that path; `ImageInfo.encodedRelPath` is the ready-to-paste
  form. Encode paths **per segment** — whole-path `encodeURIComponent` turns the
  separators into `%2F`, which the app tolerates but Obsidian does not.

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
- Deletes go to the OS Recycle Bin via `shell.trashItem`, not `fs.rm`.
- "Reveal in File Explorer" is two channels, not one: `shell:reveal` for articles/folders/the world root, and `images:reveal` for images (`revealImage` in `images.ts`, ids relative to `_images/`). Both go through a path guard. `shell:reveal` takes a **world-relative `relPath`** and resolves it inline in `ipc.ts` via `resolveInWorld` — the *caller* appends `.md` for an article, passes a bare folder id for a folder, and passes nothing at all for the world root. That keeps `worldStore.ts` Electron-free so it stays testable without mocks; `images.ts` already imports `shell`, so its reveal sits there. Renderer side, always go through `revealer(worldId)` and the `REVEAL_LABEL` constant in `client/src/lib/reveal.ts` rather than calling the channel directly, so every reveal affordance reads and behaves the same.
