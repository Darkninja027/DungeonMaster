import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let userData = ''
let appPath = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => appPath, isPackaged: false },
}))

const { seedBundledContent, getLibrary } = await import('./library')

let scratch = ''
let contentDir = ''

const spell = (n: string) => `---\ntype: spell\nlevel: 1\n---\n\n# ${n}\n`

function ship(files: Record<string, string>) {
  const dir = path.join(contentDir, 'DM Spells 5e')
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body)
  }
}

const librarySpells = () => {
  const dir = path.join(getLibrary()!.path, 'Spells')
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
    : []
}

/** Rewrite the marker to simulate the app having shipped an older content set. */
function pretendSeededVersion(v: number) {
  fs.writeFileSync(
    path.join(getLibrary()!.path, '.seeded.json'),
    JSON.stringify({ version: v }),
  )
}

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-upgrade-'))
  userData = path.join(scratch, 'ud')
  appPath = path.join(scratch, 'app')
  contentDir = path.join(appPath, 'resources', 'content')
  fs.mkdirSync(userData, { recursive: true })
  fs.mkdirSync(contentDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true })
})

describe('shipping more content in a later release', () => {
  it('adds only the new spells and leaves the existing ones untouched', async () => {
    // v1 of the app ships two spells.
    ship({ 'Fireball.md': spell('Fireball'), 'Shield.md': spell('Shield') })
    await seedBundledContent()
    expect(librarySpells()).toEqual(['Fireball.md', 'Shield.md'])

    // The user edits one of them.
    const fireball = path.join(getLibrary()!.path, 'Spells', 'Fireball.md')
    fs.writeFileSync(fireball, 'my houseruled fireball')

    // v2 ships the same two plus a third. Pretend this library was seeded by
    // the older build, which is what a real upgrade looks like.
    ship({ 'Ice Knife.md': spell('Ice Knife') })
    pretendSeededVersion(0)

    const summary = await seedBundledContent()

    // Only the new one copied — no "Fireball (2).md", no restored original.
    expect(summary?.copied).toBe(1)
    expect(librarySpells()).toEqual([
      'Fireball.md',
      'Ice Knife.md',
      'Shield.md',
    ])
    expect(fs.readFileSync(fireball, 'utf8')).toBe('my houseruled fireball')
  })

  // The accepted trade for having no tombstone list: an update tops the
  // library back up to the full shipped set, so a deleted entry returns. It
  // stays deleted for every launch in between — only a version bump revives it.
  it('restores a deleted entry on the next content update', async () => {
    ship({ 'Fireball.md': spell('Fireball') })
    await seedBundledContent()
    fs.rmSync(path.join(getLibrary()!.path, 'Spells', 'Fireball.md'))

    // Same version: the deletion sticks.
    expect(await seedBundledContent()).toBeNull()
    expect(librarySpells()).toEqual([])

    // A later release ships new content; the deleted one is in that set too.
    ship({ 'Ice Knife.md': spell('Ice Knife') })
    pretendSeededVersion(0)
    await seedBundledContent()

    expect(librarySpells()).toEqual(['Fireball.md', 'Ice Knife.md'])
  })

  it('does nothing when the version has not moved', async () => {
    ship({ 'Fireball.md': spell('Fireball') })
    await seedBundledContent()

    ship({ 'Ice Knife.md': spell('Ice Knife') })
    // No version bump: the new file is ignored until the constant changes.
    expect(await seedBundledContent()).toBeNull()
    expect(librarySpells()).toEqual(['Fireball.md'])
  })
})
