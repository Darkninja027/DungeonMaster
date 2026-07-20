# DungeonMaster

A desktop worldbuilding notebook for D&D — an Obsidian-style app where a **World
is just a folder on your disk**: articles are markdown files, folders are real
directories, and images live in an `_images/` subfolder. No server, no database.
World folders are portable — they open fine in Obsidian too.

## Features

- Multiple worlds (recent-worlds picker; open any folder as a world)
- Markdown editor with autosave, Write/Preview tabs, and article templates
- `[[Wiki links]]` with autocomplete, backlinks, and create-from-broken-link;
  renaming an article rewrites inbound links across the world
- Clickable dice notation (`2d6+3`) and rollable `d100` tables
- Image library per world, embedded via portable relative paths
- Book-style preview with page/column markers, print and PDF export
- Deletes go to the Recycle Bin

## Stack

Electron + React (TanStack Router/Query), Vite, Tailwind CSS 4, shadcn/ui,
react-markdown. The Electron main process (`client/electron/`) is the data
layer: plain file I/O on the world folder.

## Development

```sh
cd client
npm install
npm run dev     # Vite dev server + Electron with HMR
npm test        # data-layer unit tests (vitest)
```

## Building the installer

```sh
cd client
npm run dist    # outputs a Windows installer to client/release/
```

## Releasing an update (auto-update)

Installed copies check [GitHub Releases](https://github.com/Darkninja027/DungeonMaster/releases)
on launch, download updates in the background, and install on next restart.

To publish a new version:

1. Bump `"version"` in `client/package.json` (e.g. `1.0.1`) — the updater
   only offers versions greater than the installed one.
2. `cd client && set GH_TOKEN=<personal access token> && npm run release`
   (token needs the `public_repo` scope; create one at
   https://github.com/settings/tokens)
3. The release is created as a **draft** — go to GitHub Releases and publish it.

Everyone's app picks it up automatically on their next launch.

## World folder layout

```
My World/
  world.json          # name, description, createdAt
  Fens Crossing.md    # root-level article
  NPCs/               # folders are directories
    Strahd.md
  _images/            # world image library
    map.png
```

## Migrating from the old SQLite version

```sh
node scripts/migrate-sqlite.mjs --db path/to/dungeonmaster.db --out "C:\Worlds"
```

Read-only against the database; exports each world as a folder.
