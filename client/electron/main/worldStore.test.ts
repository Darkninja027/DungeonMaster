import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decodeWorldId, encodeWorldId, nameError, resolveInWorld } from './sanitize'
import {
  createArticle,
  createFolder,
  getArticle,
  initWorld,
  moveArticle,
  moveFolder,
  readTree,
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
    expect(resolveInWorld(root, 'NPCs/Strahd.md')).toBe(path.join(root, 'NPCs', 'Strahd.md'))
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
    const a = createArticle({ worldId, folderId: 'NPCs', title: 'Strahd', content: '# Hi' })
    expect(a.id).toBe('NPCs/Strahd')
    expect(a.folderId).toBe('NPCs')
    expect(getArticle(worldId, 'NPCs/Strahd').content).toBe('# Hi')

    const tree = readTree(root)
    expect(tree.folders.map((f) => f.id)).toEqual(['NPCs'])
    expect(tree.articles.map((a2) => a2.id)).toEqual(['NPCs/Strahd'])
  })

  it('rejects case-insensitive duplicate titles', () => {
    createArticle({ worldId, title: 'Waterdeep' })
    expect(() => createArticle({ worldId, title: 'WATERDEEP' })).toThrow(/already exists/)
  })

  it('rename rewrites inbound wiki-links across the world', () => {
    createArticle({ worldId, title: 'Old Name', content: 'x' })
    createArticle({ worldId, title: 'Linker', content: 'See [[Old Name]] and [[old name|the guy]].' })

    const updated = updateArticle(worldId, 'Old Name', { title: 'New Name', content: 'x' })
    expect(updated.id).toBe('New Name')
    expect(getArticle(worldId, 'Linker').content).toBe(
      'See [[New Name]] and [[New Name|the guy]].',
    )
    expect(() => getArticle(worldId, 'Old Name')).toThrow(/not found/)
  })

  it('update on a stale path errors instead of recreating the file', () => {
    createArticle({ worldId, title: 'Here', content: '' })
    updateArticle(worldId, 'Here', { title: 'There', content: '' })
    expect(() => updateArticle(worldId, 'Here', { title: 'Here', content: 'ghost' })).toThrow(
      /not found/,
    )
  })

  it('moves articles between folders and blocks collisions', () => {
    createFolder({ worldId, name: 'A' })
    createFolder({ worldId, name: 'B' })
    createArticle({ worldId, folderId: 'A', title: 'Doc' })
    createArticle({ worldId, folderId: 'B', title: 'Doc' })
    expect(() => moveArticle(worldId, 'A/Doc', 'B')).toThrow(/already exists/)
    moveArticle(worldId, 'A/Doc', null)
    expect(getArticle(worldId, 'Doc').folderId).toBeNull()
  })

  it('blocks moving a folder into its own descendant', () => {
    createFolder({ worldId, name: 'Outer' })
    createFolder({ worldId, parentFolderId: 'Outer', name: 'Inner' })
    expect(() => moveFolder(worldId, 'Outer', 'Outer/Inner')).toThrow(/into itself/)
  })

  it('search finds matches with snippets, ignoring case', () => {
    createArticle({ worldId, title: 'Lore', content: 'The ancient DRAGON sleeps beneath the city.' })
    const results = searchWorld(worldId, 'dragon')
    expect(results).toHaveLength(1)
    expect(results[0].snippet).toContain('DRAGON')
    expect(searchWorld(worldId, 'beholder')).toHaveLength(0)
  })

  it('mentions finds wiki-links to a title', () => {
    createArticle({ worldId, title: 'Strahd', content: '' })
    createArticle({ worldId, title: 'Barovia', content: 'Ruled by [[Strahd]].' })
    createArticle({ worldId, title: 'Unrelated', content: 'Nothing here.' })
    expect(findMentions(worldId, 'Strahd').map((m) => m.id)).toEqual(['Barovia'])
  })

  it('ignores the _images directory in the tree', () => {
    fs.mkdirSync(path.join(root, '_images'))
    fs.writeFileSync(path.join(root, '_images', 'map.png'), 'x')
    expect(readTree(root).folders).toHaveLength(0)
  })
})
