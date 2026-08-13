import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeWorldId } from './sanitize'
import {
  LEGACY_WORLD_FILE,
  initWorld,
  readTree,
  readWorldMeta,
  worldRoot,
} from './worldStore'
import {
  SEED_CLASSES,
  SEED_SETTINGS,
  WORLD_SETTINGS_FILE,
  migrateWorldFolder,
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
    expect(raw.version).toBe(2)
    expect(raw.classes).toHaveLength(12)
    expect(raw.classes.map((c) => c.name)).toContain('Fighter')
  })

  it('scaffolds the class list on first read', () => {
    // initWorld already made the file — it holds the world's metadata — but
    // nothing has put a class list in it yet.
    const before = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<
      string,
      unknown
    >
    expect('classes' in before).toBe(false)

    const settings = readWorldSettings(worldId) as { classes: Array<unknown> }
    expect(settings.classes).toHaveLength(12)

    const after = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      name: string
      classes: Array<unknown>
    }
    expect(after.classes).toHaveLength(12)
    expect(after.name).toBe('Test World')
  })

  it('round-trips settings through the file', () => {
    const custom = {
      version: 2,
      classes: [{ name: 'Blood Hunter', hitDie: 10, subclasses: [] }],
    }
    writeWorldSettings(worldId, custom)
    // A subset, not toEqual: the file also carries the world metadata initWorld
    // wrote, which a settings write preserves rather than replaces.
    expect(readWorldSettings(worldId)).toMatchObject(custom)
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
    fs.writeFileSync(settingsPath, JSON.stringify({ version: 2, classes: [] }))
    expect(readWorldSettings(worldId)).toEqual({ version: 2, classes: [] })
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

  // The regression this whole merge is designed around: the world's name shares
  // the file with the class list, and the renderer only ever sends the classes.
  it('keeps the world name when only classes are saved', () => {
    writeWorldSettings(worldId, {
      version: 2,
      classes: [{ name: 'Blood Hunter', hitDie: 10, subclasses: [] }],
    })
    expect(readWorldMeta(root).name).toBe('Test World')
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      name: string
      classes: Array<unknown>
    }
    expect(raw.name).toBe('Test World')
    expect(raw.classes).toHaveLength(1)
  })
})

describe('migrating a legacy world.json', () => {
  let root: string
  let legacyPath: string
  let settingsPath: string

  const writeLegacy = (meta: unknown) =>
    fs.writeFileSync(legacyPath, JSON.stringify(meta))

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-migrate-'))
    legacyPath = path.join(root, LEGACY_WORLD_FILE)
    settingsPath = path.join(root, WORLD_SETTINGS_FILE)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('folds the metadata in and deletes the legacy file', () => {
    writeLegacy({
      name: 'Barovia',
      description: 'Gothic horror',
      createdAt: '2020-01-01T00:00:00.000Z',
    })
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ version: 1, classes: SEED_CLASSES }),
    )

    migrateWorldFolder(root)

    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      version: number
      name: string
      description: string
      createdAt: string
      classes: Array<unknown>
    }
    expect(raw.name).toBe('Barovia')
    expect(raw.description).toBe('Gothic horror')
    expect(raw.createdAt).toBe('2020-01-01T00:00:00.000Z')
    expect(raw.classes).toHaveLength(12)
    expect(raw.version).toBe(2)
    expect(fs.existsSync(legacyPath)).toBe(false)
  })

  it('opens a world that still has only world.json', () => {
    writeLegacy({ name: 'Legacy Land', description: '', createdAt: '' })
    expect(() => worldRoot(encodeWorldId(root))).not.toThrow()
    expect(readWorldMeta(root).name).toBe('Legacy Land')
  })

  it('seeds the class list a legacy-only world never had', () => {
    writeLegacy({ name: 'Legacy Land' })
    migrateWorldFolder(root)
    const settings = readWorldSettings(encodeWorldId(root)) as {
      name: string
      classes: Array<unknown>
    }
    expect(settings.classes).toHaveLength(12)
    expect(settings.name).toBe('Legacy Land')
  })

  it('lets the merged file win on a conflicting field', () => {
    writeLegacy({ name: 'Old Name' })
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ version: 2, name: 'New Name', classes: [] }),
    )

    migrateWorldFolder(root)

    expect(readWorldMeta(root).name).toBe('New Name')
    expect(fs.existsSync(legacyPath)).toBe(false)
  })

  it('survives a corrupt world.json without losing the settings', () => {
    fs.writeFileSync(legacyPath, '{not json')
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ version: 2, name: 'Intact', classes: SEED_CLASSES }),
    )

    migrateWorldFolder(root)

    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      name: string
      classes: Array<unknown>
    }
    expect(raw.name).toBe('Intact')
    expect(raw.classes).toHaveLength(12)
  })

  it('never overwrites a corrupt worldSettings.json', () => {
    writeLegacy({ name: 'Barovia' })
    fs.writeFileSync(settingsPath, '{not json')

    migrateWorldFolder(root)

    // Both files survive untouched: the settings file is a hand edit with a
    // typo in it, and world.json is still the only readable metadata.
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe('{not json')
    expect(fs.existsSync(legacyPath)).toBe(true)
  })

  it('does nothing when there is no legacy file', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ version: 2, classes: [] }))
    const before = fs.readFileSync(settingsPath, 'utf8')
    migrateWorldFolder(root)
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe(before)
  })
})
