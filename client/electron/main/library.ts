/**
 * The global library: one folder, shared by every world, holding a bestiary and
 * a spell list the user imports once instead of per world.
 *
 * The library folder *is* a world folder — it carries the same worldSettings.json
 * marker — so readTree, getArticle, worlds:query, shell:reveal and the world://
 * image protocol all work on it unchanged, keyed by encodeWorldId(root). This
 * module only has to find the folder and fill it; everything downstream already
 * knows what to do with a world id.
 *
 * Deliberately not added to recents: the library is reference material, not a
 * world you open, so it stays off the home screen.
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { encodeWorldId, nameError, resolveInWorld } from './sanitize'
import {
  atomicWrite,
  entryExists,
  initWorld,
  isWorldFolder,
  withWorldLock,
} from './worldStore'
import { readLibraryRoot, writeLibraryRoot } from './recents'
import { noteSelfWrite } from './watcher'

/** The two folders a library is scaffolded with. Import targets, nothing else. */
export type LibraryFolder = 'Monsters' | 'Spells'
export const LIBRARY_FOLDERS: Array<LibraryFolder> = ['Monsters', 'Spells']

export interface LibraryInfo {
  /** encodeWorldId(path) — usable anywhere the app takes a worldId. */
  worldId: string
  path: string
  /** False when the folder has been moved, deleted, or is on a drive that's away. */
  available: boolean
}

export interface ImportSkip {
  /** Path relative to the folder the user picked. */
  file: string
  reason: string
}

export interface ImportSummary {
  copied: number
  skipped: Array<ImportSkip>
  /** True when the walk hit MAX_FILES and stopped early. */
  truncated: boolean
}

/** A statblock is kilobytes; anything this big is a mistake, not an article. */
const MAX_FILE_BYTES = 2 * 1024 * 1024
/** Backstop against someone picking C:\ — the walk stops rather than grinding. */
const MAX_FILES = 5000

/**
 * Bump when the bundled content changes. Stored in the library so a seed runs
 * once per version rather than on every launch — and so shipping new spells in
 * a later release tops up an existing library instead of being ignored.
 */
const BUNDLED_CONTENT_VERSION = 1
const SEED_MARKER = '.seeded.json'

/**
 * The content shipped beside the app: four folders of markdown, mapped to the
 * library folder each one imports into. Named to match extraResources in
 * electron-builder.yml.
 */
const BUNDLED_SETS: Array<{ dir: string; target: LibraryFolder }> = [
  { dir: 'DM Bestiary 5e', target: 'Monsters' },
  { dir: 'DM Bestiary 5.5e', target: 'Monsters' },
  { dir: 'DM Spells 5e', target: 'Spells' },
  { dir: 'DM Spells 5.5e', target: 'Spells' },
]

/**
 * Where the bundled content lives. Packaged it sits in resources/content next
 * to the asar; in dev it comes from the repo's own assets folder so the seed
 * path is exercised without building an installer.
 */
function bundledContentDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'content')
    : path.join(app.getAppPath(), 'resources', 'content')
}

/**
 * Where the library goes when the user hasn't chosen somewhere else:
 * %APPDATA%/dungeonmaster/Library on Windows, the platform equivalent
 * elsewhere. Alongside config.json, so the app's own state stays in one place.
 *
 * Split out and lazy because app.getPath throws before Electron is ready, and
 * the unit tests import this module without a real app.
 */
export function defaultLibraryPath(): string {
  return path.join(app.getPath('userData'), 'Library')
}

/**
 * The configured library, or null if there isn't one yet.
 *
 * Reports the *stored* path only — it does not fall back to the default, so the
 * UI can tell "never set up" from "set up and currently unreachable". Use
 * ensureLibrary() when you need one to exist.
 *
 * Never throws and never clears the setting: a library on an unplugged drive
 * reports available:false so the UI can say so, but forgetting the path would
 * lose the user's choice over a temporary condition.
 */
export function getLibrary(): LibraryInfo | null {
  const root = readLibraryRoot()
  if (root === null) return null
  return {
    worldId: encodeWorldId(root),
    path: root,
    available: fs.existsSync(root) && isWorldFolder(root),
  }
}

/**
 * The library, creating it at the default location if none is configured.
 *
 * This is what makes import a one-click affair: the first import doesn't stop
 * to ask where things go, it just puts them in the app's own data folder. The
 * picker still exists in Settings for anyone who wants the library somewhere
 * portable — beside their worlds, in a synced folder, whatever.
 *
 * A configured-but-missing library is re-scaffolded rather than relocated: the
 * user chose that path, and silently moving their library to userData because a
 * drive was briefly unplugged would be far worse than a failed import.
 */
export function ensureLibrary(): LibraryInfo {
  const existing = getLibrary()
  if (existing?.available) return existing
  return setLibrary(existing?.path ?? defaultLibraryPath())
}

/** Which bundled-content version this library has already been seeded with. */
function seededVersion(root: string): number {
  try {
    const raw: unknown = JSON.parse(
      fs.readFileSync(path.join(root, SEED_MARKER), 'utf8'),
    )
    const v = (raw as { version?: unknown }).version
    return typeof v === 'number' ? v : 0
  } catch {
    return 0
  }
}

/**
 * Copy the content shipped with the app into the library, once per content
 * version. Called on startup so a fresh install opens with a full bestiary and
 * spell list rather than empty panels.
 *
 * Deliberately quiet and non-fatal: a failure here must never stop the app
 * launching.
 *
 * The rule is "a content update tops the library back up to the full shipped
 * set". Concretely:
 *
 *  - Same version, every later launch: does nothing at all.
 *  - Version bumped: copies any shipped file whose name isn't already in the
 *    library, and leaves every existing entry exactly as it is — so a spell
 *    the user edited keeps their wording, and nothing gains a "(2)" twin.
 *  - A file the user deleted therefore comes back on the *next* version bump,
 *    since "deleted" and "never had it" look identical on disk. That's the
 *    accepted trade for not maintaining a tombstone list that would drift out
 *    of sync the moment anyone edited the folder outside the app.
 */
export async function seedBundledContent(): Promise<ImportSummary | null> {
  const source = bundledContentDir()
  if (!fs.existsSync(source)) return null

  const library = ensureLibrary()
  if (seededVersion(library.path) >= BUNDLED_CONTENT_VERSION) return null

  let copied = 0
  const skipped: Array<ImportSkip> = []
  let truncated = false
  for (const set of BUNDLED_SETS) {
    const dir = path.join(source, set.dir)
    if (!fs.existsSync(dir)) continue
    const summary = await importMarkdownFolder(dir, set.target, {
      skipExisting: true,
    })
    copied += summary.copied
    skipped.push(...summary.skipped)
    truncated ||= summary.truncated
  }

  atomicWrite(
    path.join(library.path, SEED_MARKER),
    JSON.stringify(
      { version: BUNDLED_CONTENT_VERSION, seededAt: new Date().toISOString() },
      null,
      2,
    ),
  )
  return { copied, skipped, truncated }
}

/**
 * Adopt `absPath` as the global library, making it a world folder if it isn't
 * one already and scaffolding the two import targets.
 */
export function setLibrary(absPath: string): LibraryInfo {
  if (!isWorldFolder(absPath)) {
    initWorld(absPath, path.basename(absPath), 'Global reference library')
  }
  for (const folder of LIBRARY_FOLDERS) {
    const dir = path.join(absPath, folder)
    for (const level of missingAncestors(dir)) noteSelfWrite(level)
    fs.mkdirSync(dir, { recursive: true })
  }
  writeLibraryRoot(absPath)
  return {
    worldId: encodeWorldId(absPath),
    path: absPath,
    available: true,
  }
}

/** Forget the library. The folder itself is left completely alone. */
export function clearLibrary() {
  writeLibraryRoot(null)
}

/** Directories mkdirSync({recursive}) would have to create, outermost first. */
function missingAncestors(abs: string): Array<string> {
  const missing: Array<string> = []
  for (let dir = abs; !fs.existsSync(dir); dir = path.dirname(dir)) {
    missing.unshift(dir)
    if (path.dirname(dir) === dir) break
  }
  return missing
}

/**
 * First free name in `dir` for `stem`.md — "Goblin.md", then "Goblin (2).md".
 * `exists` is injected so the loop is testable without a filesystem.
 *
 * Copy rather than overwrite: re-importing a bestiary must never eat an edit
 * the user made to an entry that came from the same source last time.
 */
export function dedupeName(
  exists: (name: string) => boolean,
  stem: string,
): string {
  let name = `${stem}.md`
  for (let n = 2; exists(name); n++) name = `${stem} (${n}).md`
  return name
}

/**
 * Every *.md under `dir`, depth-first, as paths relative to `dir`.
 *
 * Skips dot-directories (.git, .obsidian — editor cruft, never content) and
 * symlinks, which could otherwise point the walk into a loop or out of the tree
 * the user actually picked.
 */
async function collectMarkdown(
  dir: string,
  relBase = '',
  found: Array<string> = [],
): Promise<Array<string>> {
  if (found.length >= MAX_FILES) return found
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  entries.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
  for (const entry of entries) {
    if (found.length >= MAX_FILES) break
    if (entry.isSymbolicLink()) continue
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue
      await collectMarkdown(path.join(dir, entry.name), rel, found)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      found.push(rel)
    }
  }
  return found
}

/**
 * Why this relative path can't become an article, or null if it can.
 *
 * Checks every segment, not just the filename: a directory named "CR 5+" is
 * fine but one named "#tags" isn't, and the folder is created on the way in.
 */
function pathError(rel: string): string | null {
  const segments = rel.slice(0, -'.md'.length).split('/')
  for (const segment of segments) {
    const error = nameError(segment)
    if (error) return error
  }
  return null
}

/**
 * Recursively copy every *.md under `sourceDir` into the library's Monsters or
 * Spells folder, preserving subfolder structure.
 *
 * Per-file try/catch rather than fail-fast: one file held open by OneDrive or
 * antivirus must not sink an import of several hundred. The loop awaits its
 * read so it yields to the event loop — the same reason rewriteWikiLinks is
 * async, since blocking the main thread through thousands of files would freeze
 * the window.
 */
export async function importMarkdownFolder(
  sourceDir: string,
  target: LibraryFolder,
  options: {
    /**
     * Leave a same-named entry alone instead of adding "Name (2).md".
     *
     * For the bundled seed, where re-running after a content update should top
     * up what's new rather than duplicate the whole list. A user-driven import
     * keeps the dedupe, because there the second copy is usually the point.
     */
    skipExisting?: boolean
  } = {},
): Promise<ImportSummary> {
  // Creates the default library on first use rather than demanding a location.
  const library = ensureLibrary()

  // One import at a time: dedupeName is check-then-write, so two concurrent
  // runs would both see "Goblin.md" free and one would clobber the other.
  return withWorldLock(library.worldId, async () => {
    const files = await collectMarkdown(sourceDir)
    const skipped: Array<ImportSkip> = []
    let copied = 0

    for (const rel of files) {
      try {
        const src = path.join(sourceDir, ...rel.split('/'))
        const stat = await fs.promises.stat(src)
        if (stat.size > MAX_FILE_BYTES) {
          skipped.push({ file: rel, reason: 'Larger than 2 MB.' })
          continue
        }
        const invalid = pathError(rel)
        if (invalid) {
          skipped.push({ file: rel, reason: invalid })
          continue
        }

        const segments = rel.slice(0, -'.md'.length).split('/')
        const stem = segments.pop() as string
        const destDir = resolveInWorld(
          library.path,
          [target, ...segments].join('/'),
        )
        for (const level of missingAncestors(destDir)) noteSelfWrite(level)
        fs.mkdirSync(destDir, { recursive: true })

        if (options.skipExisting && entryExists(destDir, `${stem}.md`)) continue

        const name = dedupeName((n) => entryExists(destDir, n), stem)
        atomicWrite(
          path.join(destDir, name),
          await fs.promises.readFile(src, 'utf8'),
        )
        copied++
      } catch (error) {
        skipped.push({ file: rel, reason: (error as Error).message })
      }
    }

    return { copied, skipped, truncated: files.length >= MAX_FILES }
  })
}
