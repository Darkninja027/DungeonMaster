import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

interface Config {
  recentWorlds: Array<string> // absolute folder paths, most recent first
  /** The global library folder, or null when the user hasn't chosen one. */
  libraryRoot: string | null
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

// config.json is a plain file users (and older builds) can hand-edit, so an
// entry may not be the bare path string we write. Salvage what we can and drop
// the rest — one bad row must not take down the whole recents list.
function normalizeRecent(entry: unknown): string | null {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object') {
    const legacy = (entry as { path?: unknown }).path
    if (typeof legacy === 'string') return legacy
  }
  return null
}

/** The file as it sits on disk, or {} if it's missing, corrupt, or not an object. */
function readRaw(): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(configPath(), 'utf8'))
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function readConfig(): Config {
  const raw = readRaw()
  const entries = Array.isArray(raw.recentWorlds) ? raw.recentWorlds : []
  return {
    recentWorlds: entries
      .map(normalizeRecent)
      .filter((p): p is string => p !== null),
    libraryRoot:
      typeof raw.libraryRoot === 'string' && raw.libraryRoot !== ''
        ? raw.libraryRoot
        : null,
  }
}

/**
 * Splice keys into config.json, preserving everything else in it — the same
 * contract writeWorldMeta holds for the world file. Replacing the whole object
 * would mean addRecentWorld silently wiped libraryRoot (and any key a
 * hand-editor added) on every world open.
 */
function writeConfig(patch: Partial<Config>) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  const next = { ...readRaw(), ...patch }
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2))
}

export function addRecentWorld(absPath: string) {
  const { recentWorlds } = readConfig()
  writeConfig({
    recentWorlds: [absPath, ...recentWorlds.filter((p) => p !== absPath)].slice(
      0,
      20,
    ),
  })
}

export function removeRecentWorld(absPath: string) {
  const { recentWorlds } = readConfig()
  writeConfig({ recentWorlds: recentWorlds.filter((p) => p !== absPath) })
}

export function readLibraryRoot(): string | null {
  return readConfig().libraryRoot
}

export function writeLibraryRoot(absPath: string | null) {
  writeConfig({ libraryRoot: absPath })
}
