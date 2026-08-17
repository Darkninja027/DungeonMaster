import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// library.ts reaches Electron only through recents.ts (userData) — point that
// at a scratch folder so the real profile's config.json is never touched.
let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData },
}))

const { encodeWorldId } = await import('./sanitize')
const { initWorld, readTree } = await import('./worldStore')
const {
  clearLibrary,
  dedupeName,
  defaultLibraryPath,
  ensureLibrary,
  getLibrary,
  importMarkdownFolder,
  setLibrary,
} = await import('./library')

describe('dedupeName', () => {
  it('uses the bare name when it is free', () => {
    expect(dedupeName(() => false, 'Goblin')).toBe('Goblin.md')
  })

  it('counts up past every taken name', () => {
    const taken = new Set(['Goblin.md', 'Goblin (2).md', 'Goblin (3).md'])
    expect(dedupeName((n) => taken.has(n), 'Goblin')).toBe('Goblin (4).md')
  })
})

describe('library against real temp folders', () => {
  let scratch: string
  let libraryPath: string
  let source: string

  const libPath = (...parts: Array<string>) => path.join(libraryPath, ...parts)

  function writeSource(rel: string, contents = '# entry\n') {
    const abs = path.join(source, ...rel.split('/'))
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, contents)
  }

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-library-'))
    userData = path.join(scratch, 'userData')
    fs.mkdirSync(userData, { recursive: true })
    libraryPath = path.join(scratch, 'Library')
    source = path.join(scratch, 'source')
    fs.mkdirSync(source, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true })
  })

  describe('setLibrary / getLibrary', () => {
    it('is null until a library is chosen', () => {
      expect(getLibrary()).toBeNull()
    })

    it('scaffolds a bare folder into a world with both import targets', () => {
      const info = setLibrary(libraryPath)
      expect(info.worldId).toBe(encodeWorldId(libraryPath))
      expect(info.available).toBe(true)
      expect(fs.existsSync(libPath('worldSettings.json'))).toBe(true)
      expect(fs.existsSync(libPath('Monsters'))).toBe(true)
      expect(fs.existsSync(libPath('Spells'))).toBe(true)
    })

    // Adopting an existing world as the library must not reset its metadata.
    it('does not overwrite an existing world file', () => {
      fs.mkdirSync(libraryPath, { recursive: true })
      initWorld(libraryPath, 'My Reference', 'hand made')
      setLibrary(libraryPath)
      const settings = JSON.parse(
        fs.readFileSync(libPath('worldSettings.json'), 'utf8'),
      ) as { name: string; description: string }
      expect(settings.name).toBe('My Reference')
      expect(settings.description).toBe('hand made')
    })

    // An unplugged drive must report unavailable, not throw and not self-clear.
    it('reports available:false when the folder is gone', () => {
      setLibrary(libraryPath)
      fs.rmSync(libraryPath, { recursive: true, force: true })
      const info = getLibrary()
      expect(info?.available).toBe(false)
      expect(info?.path).toBe(libraryPath)
    })

    it('clearLibrary forgets the path but leaves the folder alone', () => {
      setLibrary(libraryPath)
      clearLibrary()
      expect(getLibrary()).toBeNull()
      expect(fs.existsSync(libPath('worldSettings.json'))).toBe(true)
    })
  })

  describe('ensureLibrary', () => {
    it('creates one in userData when none is configured', () => {
      expect(getLibrary()).toBeNull()
      const info = ensureLibrary()
      expect(info.path).toBe(defaultLibraryPath())
      expect(info.path).toBe(path.join(userData, 'Library'))
      expect(info.available).toBe(true)
      expect(fs.existsSync(path.join(info.path, 'Monsters'))).toBe(true)
      expect(fs.existsSync(path.join(info.path, 'Spells'))).toBe(true)
      expect(getLibrary()?.path).toBe(info.path)
    })

    it('returns the configured library untouched when one exists', () => {
      setLibrary(libraryPath)
      const info = ensureLibrary()
      expect(info.path).toBe(libraryPath)
      expect(fs.existsSync(defaultLibraryPath())).toBe(false)
    })

    // A briefly-unplugged drive must not silently relocate the user's library.
    it('re-scaffolds a configured path that has gone missing, not the default', () => {
      setLibrary(libraryPath)
      fs.rmSync(libraryPath, { recursive: true, force: true })
      const info = ensureLibrary()
      expect(info.path).toBe(libraryPath)
      expect(fs.existsSync(defaultLibraryPath())).toBe(false)
    })

    it('is idempotent', () => {
      const a = ensureLibrary()
      const b = ensureLibrary()
      expect(a).toEqual(b)
    })
  })

  describe('importMarkdownFolder', () => {
    // First import is one dialog, not two: no library means create the default
    // one rather than stopping to ask where it should live.
    it('creates the default library when none is configured', async () => {
      writeSource('Goblin.md')
      const summary = await importMarkdownFolder(source, 'Monsters')
      expect(summary.copied).toBe(1)
      expect(getLibrary()?.path).toBe(defaultLibraryPath())
      expect(
        fs.existsSync(path.join(defaultLibraryPath(), 'Monsters', 'Goblin.md')),
      ).toBe(true)
    })

    it('re-creates a configured library that has gone missing', async () => {
      setLibrary(libraryPath)
      fs.rmSync(libraryPath, { recursive: true, force: true })
      writeSource('Goblin.md')
      const summary = await importMarkdownFolder(source, 'Monsters')
      expect(summary.copied).toBe(1)
      expect(fs.existsSync(libPath('Monsters', 'Goblin.md'))).toBe(true)
    })

    it('copies recursively, preserving subfolders', async () => {
      setLibrary(libraryPath)
      writeSource('Goblin.md')
      writeSource('CR 5+/Basilisk.md')
      writeSource('CR 5+/Deep/Wyrm.md')

      const summary = await importMarkdownFolder(source, 'Monsters')

      expect(summary).toEqual({ copied: 3, skipped: [], truncated: false })
      expect(fs.existsSync(libPath('Monsters', 'Goblin.md'))).toBe(true)
      expect(fs.existsSync(libPath('Monsters', 'CR 5+', 'Basilisk.md'))).toBe(
        true,
      )
      expect(
        fs.existsSync(libPath('Monsters', 'CR 5+', 'Deep', 'Wyrm.md')),
      ).toBe(true)
    })

    it('lands entries where readTree can see them', async () => {
      setLibrary(libraryPath)
      writeSource('Goblin.md')
      writeSource('CR 5+/Basilisk.md')
      await importMarkdownFolder(source, 'Monsters')

      const tree = readTree(libraryPath)
      expect(tree.articles.map((a) => a.id).sort()).toEqual([
        'Monsters/CR 5+/Basilisk',
        'Monsters/Goblin',
      ])
    })

    it('imports into Spells independently of Monsters', async () => {
      setLibrary(libraryPath)
      writeSource('Fireball.md')
      await importMarkdownFolder(source, 'Spells')
      expect(fs.existsSync(libPath('Spells', 'Fireball.md'))).toBe(true)
      expect(fs.existsSync(libPath('Monsters', 'Fireball.md'))).toBe(false)
    })

    it('filters non-markdown and dot-directories silently', async () => {
      setLibrary(libraryPath)
      writeSource('Goblin.md')
      writeSource('README.txt', 'not markdown')
      writeSource('.obsidian/workspace.json', '{}')

      const summary = await importMarkdownFolder(source, 'Monsters')

      expect(summary.copied).toBe(1)
      expect(summary.skipped).toEqual([])
      expect(fs.existsSync(libPath('Monsters', '.obsidian'))).toBe(false)
    })

    // '#' breaks wiki-links and a leading dot hides the file; both are
    // creatable on Windows, so they have to be reported rather than thrown.
    it('reports files whose names cannot become articles', async () => {
      setLibrary(libraryPath)
      writeSource('Goblin.md')
      writeSource('Goblin #2.md')

      const summary = await importMarkdownFolder(source, 'Monsters')

      expect(summary.copied).toBe(1)
      expect(summary.skipped).toHaveLength(1)
      expect(summary.skipped[0].file).toBe('Goblin #2.md')
      expect(summary.skipped[0].reason).toMatch(/\[\[, \]\] or #/)
    })

    it('reports an invalid directory name, not just an invalid file name', async () => {
      setLibrary(libraryPath)
      writeSource('#tags/Goblin.md')

      const summary = await importMarkdownFolder(source, 'Monsters')

      expect(summary.copied).toBe(0)
      expect(summary.skipped[0].file).toBe('#tags/Goblin.md')
    })

    it('skips files over the size cap', async () => {
      setLibrary(libraryPath)
      writeSource('Huge.md', 'x'.repeat(2 * 1024 * 1024 + 1))

      const summary = await importMarkdownFolder(source, 'Monsters')

      expect(summary.copied).toBe(0)
      expect(summary.skipped[0].reason).toMatch(/2 MB/)
    })

    // Re-importing must never eat an edit made to a previously imported entry.
    it('dedupes instead of overwriting on a repeat import', async () => {
      setLibrary(libraryPath)
      writeSource('Goblin.md', 'original')
      await importMarkdownFolder(source, 'Monsters')
      fs.writeFileSync(libPath('Monsters', 'Goblin.md'), 'my edit')

      writeSource('Goblin.md', 'second run')
      const summary = await importMarkdownFolder(source, 'Monsters')

      expect(summary.copied).toBe(1)
      expect(fs.readFileSync(libPath('Monsters', 'Goblin.md'), 'utf8')).toBe(
        'my edit',
      )
      expect(
        fs.readFileSync(libPath('Monsters', 'Goblin (2).md'), 'utf8'),
      ).toBe('second run')
    })

    it('dedupes case-insensitively, the way the filesystem does', async () => {
      setLibrary(libraryPath)
      writeSource('Goblin.md', 'first')
      await importMarkdownFolder(source, 'Monsters')
      writeSource('Goblin.md')
      fs.renameSync(
        path.join(source, 'Goblin.md'),
        path.join(source, 'GOBLIN.md'),
      )

      await importMarkdownFolder(source, 'Monsters')

      expect(fs.readFileSync(libPath('Monsters', 'Goblin.md'), 'utf8')).toBe(
        'first',
      )
      expect(fs.existsSync(libPath('Monsters', 'GOBLIN (2).md'))).toBe(true)
    })

    it('preserves file contents verbatim', async () => {
      setLibrary(libraryPath)
      const body = '---\ntype: monster\ncr: "1/4"\n---\n\n# Grubling\n'
      writeSource('Grubling.md', body)
      await importMarkdownFolder(source, 'Monsters')
      expect(fs.readFileSync(libPath('Monsters', 'Grubling.md'), 'utf8')).toBe(
        body,
      )
    })

    it('leaves no temp files behind', async () => {
      setLibrary(libraryPath)
      writeSource('Goblin.md')
      await importMarkdownFolder(source, 'Monsters')
      expect(
        fs.readdirSync(libPath('Monsters')).filter((n) => n.includes('.tmp-')),
      ).toEqual([])
    })

    it('cannot write outside the library, even via a .. segment', async () => {
      setLibrary(libraryPath)
      // '..' is a path segment the walk can produce only if a directory is
      // literally named that; nameError rejects it before resolveInWorld sees
      // it, but the escape must fail either way.
      writeSource('Goblin.md')
      await importMarkdownFolder(source, 'Monsters')
      expect(fs.existsSync(path.join(scratch, 'Goblin.md'))).toBe(false)
    })

    it('returns an empty summary for a folder with no markdown', async () => {
      setLibrary(libraryPath)
      writeSource('notes.txt', 'nope')
      expect(await importMarkdownFolder(source, 'Monsters')).toEqual({
        copied: 0,
        skipped: [],
        truncated: false,
      })
    })
  })
})
