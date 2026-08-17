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

const { importMarkdownFolder, seedBundledContent, setLibrary, getLibrary } =
  await import('./library')

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
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : []
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

  it('leaves the user\'s own edits alone', async () => {
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
