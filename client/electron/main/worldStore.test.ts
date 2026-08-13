import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  decodeWorldId,
  encodeWorldId,
  nameError,
  resolveInWorld,
} from './sanitize'
import {
  createArticle,
  createFolder,
  duplicateArticle,
  getArticle,
  initWorld,
  moveArticle,
  moveFolder,
  readTree,
  renameArticle,
  updateArticle,
} from './worldStore'
import { findMentions, searchWorld } from './search'

describe('world ids', () => {
  it('round-trips absolute paths, including unicode', () => {
    for (const p of ['C:\\Worlds\\Faerûn', '/home/brent/wörlds/x']) {
      expect(decodeWorldId(encodeWorldId(p))).toBe(p)
    }
  })

  it('survives lowercasing (ids travel in URL hosts)', () => {
    const id = encodeWorldId('C:\\Worlds\\MyWorld')
    expect(decodeWorldId(id.toLowerCase())).toBe('C:\\Worlds\\MyWorld')
  })

  it('rejects non-hex input', () => {
    expect(() => decodeWorldId('../../etc/passwd')).toThrow()
  })
})

describe('resolveInWorld', () => {
  const root = path.join(os.tmpdir(), 'dm-root')

  it('resolves ids inside the world', () => {
    expect(resolveInWorld(root, 'NPCs/Strahd.md')).toBe(
      path.join(root, 'NPCs', 'Strahd.md'),
    )
  })

  it('rejects traversal attempts', () => {
    expect(() => resolveInWorld(root, '../outside.md')).toThrow()
    expect(() => resolveInWorld(root, 'NPCs/../../outside.md')).toThrow()
  })
})

describe('nameError', () => {
  it('accepts ordinary D&D names', () => {
    expect(nameError('Strahd von Zarovich')).toBeNull()
    expect(nameError('The Sword Coast - North')).toBeNull()
  })

  it('rejects filesystem-invalid and reserved names', () => {
    expect(nameError('Act I: The Beginning')).toMatch(/colon/)
    expect(nameError('a/b')).toBeTruthy()
    expect(nameError('CON')).toMatch(/reserved/)
    expect(nameError('ends with dot.')).toBeTruthy()
    expect(nameError('  ')).toBeTruthy()
    expect(nameError('bad [[link]] name')).toBeTruthy()
    expect(nameError('_images')).toBeTruthy()
  })
})

describe('worldStore against a real temp folder', () => {
  let root: string
  let worldId: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-test-'))
    initWorld(root, 'Test World', 'a test')
    worldId = encodeWorldId(root)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('creates and reads articles in folders', () => {
    createFolder({ worldId, name: 'NPCs' })
    const a = createArticle({
      worldId,
      folderId: 'NPCs',
      title: 'Strahd',
      content: '# Hi',
    })
    expect(a.id).toBe('NPCs/Strahd')
    expect(a.folderId).toBe('NPCs')
    expect(getArticle(worldId, 'NPCs/Strahd').content).toBe('# Hi')

    const tree = readTree(root)
    expect(tree.folders.map((f) => f.id)).toEqual(['NPCs'])
    expect(tree.articles.map((a2) => a2.id)).toEqual(['NPCs/Strahd'])
  })

  it('rejects case-insensitive duplicate titles', () => {
    createArticle({ worldId, title: 'Waterdeep' })
    expect(() => createArticle({ worldId, title: 'WATERDEEP' })).toThrow(
      /already exists/,
    )
  })

  it('rename rewrites inbound wiki-links across the world', async () => {
    createArticle({ worldId, title: 'Old Name', content: 'x' })
    createArticle({
      worldId,
      title: 'Linker',
      content: 'See [[Old Name]] and [[old name|the guy]].',
    })

    const updated = await updateArticle(worldId, 'Old Name', {
      title: 'New Name',
      content: 'x',
    })
    expect(updated.id).toBe('New Name')
    expect(getArticle(worldId, 'Linker').content).toBe(
      'See [[New Name]] and [[New Name|the guy]].',
    )
    expect(() => getArticle(worldId, 'Old Name')).toThrow(/not found/)
  })

  it('update on a stale path errors instead of recreating the file', async () => {
    createArticle({ worldId, title: 'Here', content: '' })
    await updateArticle(worldId, 'Here', { title: 'There', content: '' })
    await expect(
      updateArticle(worldId, 'Here', { title: 'Here', content: 'ghost' }),
    ).rejects.toThrow(/not found/)
  })

  // The autosave shape after the "Article not found" fix: the editor sends the
  // article's on-disk title, so a content save never renames the file.
  it('an update whose title matches the file only writes content', async () => {
    createArticle({ worldId, title: 'Keep', content: 'old' })
    const updated = await updateArticle(worldId, 'Keep', {
      title: 'Keep',
      content: 'new',
    })
    expect(updated.id).toBe('Keep')
    expect(getArticle(worldId, 'Keep').content).toBe('new')
  })

  // Regression: two updates used to interleave inside the awaited world-wide
  // link rewrite, so the second targeted a path the first had already renamed
  // away and failed with "Article not found".
  it('serialises concurrent updates across a rename', async () => {
    createArticle({ worldId, title: 'Gan', content: 'body' })
    createArticle({ worldId, title: 'Linker', content: 'See [[Gan]].' })

    const first = updateArticle(worldId, 'Gan', {
      title: 'Ganda',
      content: 'body',
    })
    const second = updateArticle(worldId, 'Ganda', {
      title: 'Gandalf',
      content: 'body2',
    })
    const [a, b] = await Promise.all([first, second])

    expect(a.id).toBe('Ganda')
    expect(b.id).toBe('Gandalf')
    expect(getArticle(worldId, 'Gandalf').content).toBe('body2')
    expect(getArticle(worldId, 'Linker').content).toBe('See [[Gandalf]].')
  })

  // Rename-first ordering: content must not land on the old file when the
  // rename is going to be rejected.
  it('a colliding rename does not write content to the old file', async () => {
    createArticle({ worldId, title: 'One', content: 'original' })
    createArticle({ worldId, title: 'Two', content: '' })
    await expect(
      updateArticle(worldId, 'One', { title: 'Two', content: 'clobber' }),
    ).rejects.toThrow(/already exists/)
    expect(getArticle(worldId, 'One').content).toBe('original')
  })

  // The link rewrite snapshots the tree then awaits per file, so an article can
  // become unreadable mid-walk. The rename is already committed by then —
  // failing the whole save would lose the user's edit over a cosmetic link.
  it('a rename survives an unreadable article during the link rewrite', async () => {
    createArticle({ worldId, title: 'Old Name', content: 'x' })
    createArticle({ worldId, title: 'Linker', content: 'See [[Old Name]].' })
    // A directory named like an article: readTree lists it, readFile gets EISDIR.
    fs.mkdirSync(path.join(root, 'Broken.md'))

    const updated = await updateArticle(worldId, 'Old Name', {
      title: 'New Name',
      content: 'x',
    })
    expect(updated.id).toBe('New Name')
    expect(getArticle(worldId, 'Linker').content).toBe('See [[New Name]].')
  })

  it('moves articles between folders and blocks collisions', async () => {
    createFolder({ worldId, name: 'A' })
    createFolder({ worldId, name: 'B' })
    createArticle({ worldId, folderId: 'A', title: 'Doc' })
    createArticle({ worldId, folderId: 'B', title: 'Doc' })
    await expect(moveArticle(worldId, 'A/Doc', 'B')).rejects.toThrow(
      /already exists/,
    )
    await moveArticle(worldId, 'A/Doc', null)
    expect(getArticle(worldId, 'Doc').folderId).toBeNull()
  })

  it('blocks moving a folder into its own descendant', async () => {
    createFolder({ worldId, name: 'Outer' })
    createFolder({ worldId, parentFolderId: 'Outer', name: 'Inner' })
    await expect(moveFolder(worldId, 'Outer', 'Outer/Inner')).rejects.toThrow(
      /into itself/,
    )
  })

  it('search finds matches with snippets, ignoring case', () => {
    createArticle({
      worldId,
      title: 'Lore',
      content: 'The ancient DRAGON sleeps beneath the city.',
    })
    const results = searchWorld(worldId, 'dragon')
    expect(results).toHaveLength(1)
    expect(results[0].snippet).toContain('DRAGON')
    expect(searchWorld(worldId, 'beholder')).toHaveLength(0)
  })

  it('mentions finds wiki-links to a title', () => {
    createArticle({ worldId, title: 'Strahd', content: '' })
    createArticle({
      worldId,
      title: 'Barovia',
      content: 'Ruled by [[Strahd]].',
    })
    createArticle({ worldId, title: 'Unrelated', content: 'Nothing here.' })
    expect(findMentions(worldId, 'Strahd').map((m) => m.id)).toEqual([
      'Barovia',
    ])
  })

  it('renameArticle rewrites inbound links without touching content', async () => {
    createArticle({ worldId, title: 'Old Name', content: '# Body stays' })
    createArticle({ worldId, title: 'Linker', content: 'See [[Old Name]].' })

    const renamed = await renameArticle(worldId, 'Old Name', 'New Name')
    expect(renamed.id).toBe('New Name')
    expect(renamed.content).toBe('# Body stays')
    expect(getArticle(worldId, 'Linker').content).toBe('See [[New Name]].')
    expect(() => getArticle(worldId, 'Old Name')).toThrow(/not found/)
  })

  it('renameArticle rejects collisions but allows case-only renames', async () => {
    createArticle({ worldId, title: 'One' })
    createArticle({ worldId, title: 'Two' })
    await expect(renameArticle(worldId, 'One', 'Two')).rejects.toThrow(
      /already exists/,
    )
    expect((await renameArticle(worldId, 'One', 'ONE')).id).toBe('ONE')
  })

  it('duplicateArticle copies content into the same folder with (copy) naming', () => {
    createFolder({ worldId, name: 'NPCs' })
    createArticle({
      worldId,
      folderId: 'NPCs',
      title: 'Strahd',
      content: '# Vampire',
    })

    const first = duplicateArticle(worldId, 'NPCs/Strahd')
    expect(first.id).toBe('NPCs/Strahd (copy)')
    expect(first.folderId).toBe('NPCs')
    expect(first.content).toBe('# Vampire')

    const second = duplicateArticle(worldId, 'NPCs/Strahd')
    expect(second.id).toBe('NPCs/Strahd (copy 2)')
  })

  it('ignores the _images directory in the tree', () => {
    fs.mkdirSync(path.join(root, '_images'))
    fs.writeFileSync(path.join(root, '_images', 'map.png'), 'x')
    expect(readTree(root).folders).toHaveLength(0)
  })
})
