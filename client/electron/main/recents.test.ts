import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// recents.ts resolves its config path from Electron's userData dir at call
// time, so point that at a scratch folder instead of the real profile.
let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData },
}))

const { readConfig, addRecentWorld } = await import('./recents')

function writeRawConfig(contents: string) {
  fs.writeFileSync(path.join(userData, 'config.json'), contents)
}

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-recents-'))
})

afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('readConfig', () => {
  it('returns empty recents when the config is missing or unparseable', () => {
    expect(readConfig().recentWorlds).toEqual([])
    writeRawConfig('{ not json')
    expect(readConfig().recentWorlds).toEqual([])
  })

  it('keeps plain string paths', () => {
    writeRawConfig(
      JSON.stringify({ recentWorlds: ['C:\\Worlds\\A', '/home/b/worlds/B'] }),
    )
    expect(readConfig().recentWorlds).toEqual([
      'C:\\Worlds\\A',
      '/home/b/worlds/B',
    ])
  })

  it('lifts the path out of hand-written object entries', () => {
    writeRawConfig(
      JSON.stringify({
        recentWorlds: [
          {
            id: '433a5c55',
            path: 'C:\\Worlds\\FromObject',
            name: 'From Object',
            openedAt: 1786412272244,
          },
        ],
      }),
    )
    expect(readConfig().recentWorlds).toEqual(['C:\\Worlds\\FromObject'])
  })

  it('drops junk entries without losing the valid ones around them', () => {
    writeRawConfig(
      JSON.stringify({
        recentWorlds: [
          { name: 'no path here' },
          'C:\\Worlds\\Real',
          null,
          42,
          { path: 17 },
        ],
      }),
    )
    expect(readConfig().recentWorlds).toEqual(['C:\\Worlds\\Real'])
  })

  it('ignores a non-array recentWorlds', () => {
    writeRawConfig(JSON.stringify({ recentWorlds: { nope: true } }))
    expect(readConfig().recentWorlds).toEqual([])
  })

  it('persists normalized entries on the next write', () => {
    writeRawConfig(
      JSON.stringify({
        recentWorlds: [
          { path: 'C:\\Worlds\\Legacy', openedAt: 1 },
          'C:\\Worlds\\Real',
        ],
      }),
    )
    addRecentWorld('C:\\Worlds\\New')
    expect(readConfig().recentWorlds).toEqual([
      'C:\\Worlds\\New',
      'C:\\Worlds\\Legacy',
      'C:\\Worlds\\Real',
    ])
  })
})
