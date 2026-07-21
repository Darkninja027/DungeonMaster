import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

interface Config {
  recentWorlds: Array<string> // absolute folder paths, most recent first
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function readConfig(): Config {
  try {
    const raw = JSON.parse(
      fs.readFileSync(configPath(), 'utf8'),
    ) as Partial<Config>
    return {
      recentWorlds: Array.isArray(raw.recentWorlds) ? raw.recentWorlds : [],
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
