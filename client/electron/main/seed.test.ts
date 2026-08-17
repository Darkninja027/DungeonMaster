import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// seedBundledContent resolves its source from app.isPackaged / getAppPath, so
// the mock points both at a scratch folder we fill per test.
let userData = ''
let appPath = ''
vi.mock('electron', () => ({
  app: {
    getPath: () => userData,
    getAppPath: () => appPath,
    isPackaged: false,
  },
}))

const {
  importMarkdownFolder,
  restoreBundledFolder,
  seedBundledContent,
  setLibrary,
  getLibrary,
} = await import('./library')

let scratch = ''
let contentDir = ''

function writeContent(set: string, files: Record<string, string>) {
  const dir = path.join(contentDir, set)
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body)
  }
}

const spell = (n: string) => `---\ntype: spell\nlevel: 1\n---\n\n# ${n}\n`
const monster = (n: string) => `---\ntype: monster\ncr: "1"\n---\n\n# ${n}\n`

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-seed-'))
  userData = path.join(scratch, 'ud')
  appPath = path.join(scratch, 'app')
  contentDir = path.join(appPath, 'resources', 'content')
  fs.mkdirSync(userData, { recursive: true })
  fs.mkdirSync(contentDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true })
})

const libFiles = (folder: string) => {
  const dir = path.join(getLibrary()!.path, folder)
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
    : []
}

describe('seedBundledContent', () => {
  it('does nothing when no content ships with the app', async () => {
    fs.rmSync(contentDir, { recursive: true, force: true })
    expect(await seedBundledContent()).toBeNull()
  })

  it('creates the library and fills it on a fresh install', async () => {
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })
    writeContent('DM Bestiary 5e', { 'Goblin.md': monster('Goblin') })

    const summary = await seedBundledContent()

    expect(summary?.copied).toBe(2)
    expect(libFiles('Spells')).toEqual(['Fireball.md'])
    expect(libFiles('Monsters')).toEqual(['Goblin.md'])
  })

  it('routes each bundled set to its own library folder', async () => {
    writeContent('DM Spells 5.5e', { 'Fireball 5.5e.md': spell('Fireball') })
    writeContent('DM Bestiary 5.5e', { 'Goblin 5.5e.md': monster('Goblin') })

    await seedBundledContent()

    expect(libFiles('Spells')).toEqual(['Fireball 5.5e.md'])
    expect(libFiles('Monsters')).toEqual(['Goblin 5.5e.md'])
  })

  // The marker is what stops every launch re-copying a thousand files.
  it('is a no-op on the next launch', async () => {
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })
    await seedBundledContent()
    expect(await seedBundledContent()).toBeNull()
    expect(libFiles('Spells')).toEqual(['Fireball.md'])
  })

  // A user who deletes a bundled spell must not get it back next launch.
  it('does not restore content the user deleted', async () => {
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })
    await seedBundledContent()
    fs.rmSync(path.join(getLibrary()!.path, 'Spells', 'Fireball.md'))

    await seedBundledContent()

    expect(libFiles('Spells')).toEqual([])
  })

  it("leaves the user's own edits alone", async () => {
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })
    await seedBundledContent()
    const abs = path.join(getLibrary()!.path, 'Spells', 'Fireball.md')
    fs.writeFileSync(abs, 'my houserule')

    await seedBundledContent()

    expect(fs.readFileSync(abs, 'utf8')).toBe('my houserule')
  })

  it('seeds into a library the user relocated', async () => {
    const custom = path.join(scratch, 'MyLibrary')
    setLibrary(custom)
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })

    await seedBundledContent()

    expect(getLibrary()?.path).toBe(custom)
    expect(fs.existsSync(path.join(custom, 'Spells', 'Fireball.md'))).toBe(true)
  })
})

describe('restoreBundledFolder', () => {
  it('does nothing when no content ships with the app', async () => {
    fs.rmSync(contentDir, { recursive: true, force: true })
    expect(await restoreBundledFolder('Spells')).toBeNull()
  })

  // The whole point of the button: seedBundledContent is version-gated, so a
  // file deleted after the seed stays gone until the next release. This is the
  // way back, and it must work at the version already on disk.
  it('restores a deleted file at the same content version', async () => {
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })
    await seedBundledContent()
    fs.rmSync(path.join(getLibrary()!.path, 'Spells', 'Fireball.md'))

    const summary = await restoreBundledFolder('Spells')

    expect(summary?.copied).toBe(1)
    expect(libFiles('Spells')).toEqual(['Fireball.md'])
  })

  it('draws on every set that targets the folder', async () => {
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })
    writeContent('DM Spells 5.5e', { 'Fireball 5.5e.md': spell('Fireball') })

    const summary = await restoreBundledFolder('Spells')

    expect(summary?.copied).toBe(2)
    expect(libFiles('Spells').sort()).toEqual([
      'Fireball 5.5e.md',
      'Fireball.md',
    ])
  })

  it('leaves the other folder untouched', async () => {
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })
    writeContent('DM Bestiary 5e', { 'Goblin.md': monster('Goblin') })

    await restoreBundledFolder('Spells')

    expect(libFiles('Spells')).toEqual(['Fireball.md'])
    expect(libFiles('Monsters')).toEqual([])
  })

  // Restoring must never cost someone their rewording, and must never leave a
  // "(2)" twin behind — the two failure modes that would make it unusable.
  it('preserves a user edit without adding a duplicate', async () => {
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })
    await seedBundledContent()
    const edited = path.join(getLibrary()!.path, 'Spells', 'Fireball.md')
    fs.writeFileSync(edited, '# My Fireball\n')

    const summary = await restoreBundledFolder('Spells')

    expect(summary?.copied).toBe(0)
    expect(libFiles('Spells')).toEqual(['Fireball.md'])
    expect(fs.readFileSync(edited, 'utf8')).toBe('# My Fireball\n')
  })

  // A manual restore must not disturb the automatic seed's bookkeeping, or it
  // would trigger a full re-copy on the next launch.
  it('leaves the seed marker alone', async () => {
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })
    await seedBundledContent()
    const marker = path.join(getLibrary()!.path, '.seeded.json')
    const before = fs.readFileSync(marker, 'utf8')

    await restoreBundledFolder('Spells')

    expect(fs.readFileSync(marker, 'utf8')).toBe(before)
  })

  // Restoring is how someone with no library gets one, so it can't require one.
  it('creates the library when there is none', async () => {
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })

    const summary = await restoreBundledFolder('Spells')

    expect(summary?.copied).toBe(1)
    expect(getLibrary()?.available).toBe(true)
  })

  it('restores into a library the user relocated', async () => {
    const custom = path.join(scratch, 'MyLibrary')
    setLibrary(custom)
    writeContent('DM Spells 5e', { 'Fireball.md': spell('Fireball') })

    await restoreBundledFolder('Spells')

    expect(fs.existsSync(path.join(custom, 'Spells', 'Fireball.md'))).toBe(true)
  })
})

describe('importMarkdownFolder skipExisting', () => {
  it('adds a numbered copy by default', async () => {
    const src = path.join(scratch, 'src')
    fs.mkdirSync(src, { recursive: true })
    fs.writeFileSync(path.join(src, 'Fireball.md'), spell('Fireball'))
    setLibrary(path.join(scratch, 'Library'))

    await importMarkdownFolder(src, 'Spells')
    const second = await importMarkdownFolder(src, 'Spells')

    expect(second.copied).toBe(1)
    expect(libFiles('Spells').sort()).toEqual([
      'Fireball (2).md',
      'Fireball.md',
    ])
  })

  it('leaves the existing entry alone when asked to skip', async () => {
    const src = path.join(scratch, 'src')
    fs.mkdirSync(src, { recursive: true })
    fs.writeFileSync(path.join(src, 'Fireball.md'), spell('Fireball'))
    setLibrary(path.join(scratch, 'Library'))

    await importMarkdownFolder(src, 'Spells')
    const second = await importMarkdownFolder(src, 'Spells', {
      skipExisting: true,
    })

    expect(second.copied).toBe(0)
    expect(libFiles('Spells')).toEqual(['Fireball.md'])
  })
})
