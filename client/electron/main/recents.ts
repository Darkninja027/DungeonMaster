import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

interface Config {
  recentWorlds: Array<string> // absolute folder paths, most recent first
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

export function readConfig(): Config {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as {
      recentWorlds?: unknown
    }
    const entries = Array.isArray(raw.recentWorlds) ? raw.recentWorlds : []
    return {
      recentWorlds: entries
        .map(normalizeRecent)
        .filter((p): p is string => p !== null),
    }
  } catch {
    return { recentWorlds: [] }
  }
}

function writeConfig(config: Config) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2))
}

export function addRecentWorld(absPath: string) {
  const config = readConfig()
  config.recentWorlds = [
    absPath,
    ...config.recentWorlds.filter((p) => p !== absPath),
  ].slice(0, 20)
  writeConfig(config)
}

export function removeRecentWorld(absPath: string) {
  const config = readConfig()
  config.recentWorlds = config.recentWorlds.filter((p) => p !== absPath)
  writeConfig(config)
}
