import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeWorldId } from './sanitize'
import { initWorld, readTree } from './worldStore'
import {
  SEED_CLASSES,
  SEED_SETTINGS,
  WORLD_SETTINGS_FILE,
  readWorldSettings,
  seedWorldSettings,
  writeWorldSettings,
} from './worldSettings'

describe('worldSettings.json in the world folder', () => {
  let root: string
  let worldId: string
  let settingsPath: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-settings-'))
    initWorld(root, 'Test World', '')
    worldId = encodeWorldId(root)
    settingsPath = path.join(root, WORLD_SETTINGS_FILE)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('seeds the 12 classes at the world root', () => {
    seedWorldSettings(root)
    expect(fs.existsSync(settingsPath)).toBe(true)
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      version: number
      classes: Array<{ name: string }>
    }
    expect(raw.version).toBe(1)
    expect(raw.classes).toHaveLength(12)
    expect(raw.classes.map((c) => c.name)).toContain('Fighter')
  })

  it('scaffolds the file on first read', () => {
    expect(fs.existsSync(settingsPath)).toBe(false)
    const settings = readWorldSettings(worldId) as { classes: Array<unknown> }
    expect(settings.classes).toHaveLength(12)
    expect(fs.existsSync(settingsPath)).toBe(true)
  })

  it('round-trips settings through the file', () => {
    const custom = {
      version: 1,
      classes: [{ name: 'Blood Hunter', hitDie: 10, subclasses: [] }],
    }
    writeWorldSettings(worldId, custom)
    expect(readWorldSettings(worldId)).toEqual(custom)
  })

  // The sharpest trap in this feature: a file that won't parse is a hand edit
  // with a typo in it. Rewriting the seed over the top would destroy the user's
  // work, so the missing check must be existsSync, not "did the parse fail".
  it('never overwrites a corrupt file', () => {
    fs.writeFileSync(settingsPath, '{not json')
    expect(readWorldSettings(worldId)).toBeNull()
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe('{not json')
  })

  it('never overwrites a deliberately emptied list', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ version: 1, classes: [] }))
    expect(readWorldSettings(worldId)).toEqual({ version: 1, classes: [] })
  })

  it('stays invisible in the article tree', () => {
    seedWorldSettings(root)
    const tree = readTree(root)
    expect(tree.folders).toHaveLength(0)
    expect(tree.articles).toHaveLength(0)
  })

  it('refuses unreasonably large payloads', () => {
    expect(() =>
      writeWorldSettings(worldId, { blob: 'x'.repeat(300 * 1024) }),
    ).toThrow(/large/)
  })

  it('carries an explanatory comment for hand-editors', () => {
    expect(SEED_SETTINGS._comment).toMatch(/free text/i)
    seedWorldSettings(root)
    expect(fs.readFileSync(settingsPath, 'utf8')).toContain('_comment')
  })

  it('seeds no ids — the name is the on-disk identity', () => {
    seedWorldSettings(root)
    expect(fs.readFileSync(settingsPath, 'utf8')).not.toContain('"id"')
    for (const cl of SEED_CLASSES) {
      expect(cl).not.toHaveProperty('id')
    }
  })
})
