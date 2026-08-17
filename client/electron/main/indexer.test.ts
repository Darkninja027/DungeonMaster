import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeWorldId } from './sanitize'
import { createArticle, initWorld, updateArticle } from './worldStore'
import {
  buildIndex,
  dropIndex,
  getIndex,
  noteDelete,
  noteWrite,
  refreshIndex,
} from './indexer'
import {
  dropScanCache,
  findMentions,
  listCharacters,
  queryArticles,
  searchWorld,
} from './search'

describe('indexer', () => {
  let root: string
  let worldId: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-index-'))
    initWorld(root, 'Test World', '')
    worldId = encodeWorldId(root)
    createArticle({
      worldId,
      title: 'Strahd',
      content: 'A vampire lord of Barovia.',
    })
    createArticle({
      worldId,
      title: 'Barovia',
      content: 'Ruled by [[Strahd]]. Misty valley.',
    })
    createArticle({ worldId, title: 'Unrelated', content: 'Nothing to see.' })
  })

  afterEach(() => {
    dropIndex()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('indexed results are identical to the disk-scan fallback', async () => {
    const scanSearch = searchWorld(worldId, 'vampire')
    const scanMentions = findMentions(worldId, 'Strahd')

    await buildIndex(worldId)
    expect(getIndex(worldId)).toBeDefined()
    expect(searchWorld(worldId, 'vampire')).toEqual(scanSearch)
    expect(findMentions(worldId, 'Strahd')).toEqual(scanMentions)
  })

  it('search works with no index at all (fallback regression guard)', () => {
    expect(getIndex(worldId)).toBeUndefined()
    expect(searchWorld(worldId, 'misty')).toHaveLength(1)
  })

  it('noteWrite makes app writes searchable without a rebuild', async () => {
    await buildIndex(worldId)
    const article = await updateArticle(worldId, 'Unrelated', {
      title: 'Unrelated',
      content: 'A hidden beholder lair.',
    })
    noteWrite(article)
    expect(searchWorld(worldId, 'beholder').map((r) => r.id)).toEqual([
      'Unrelated',
    ])
  })

  it('noteDelete removes an article from results', async () => {
    await buildIndex(worldId)
    noteDelete(worldId, 'Unrelated')
    expect(searchWorld(worldId, 'nothing to see')).toHaveLength(0)
  })

  it('refreshIndex picks up external file changes', async () => {
    await buildIndex(worldId)
    fs.writeFileSync(path.join(root, 'External.md'), 'A tarrasque approaches!')
    expect(searchWorld(worldId, 'tarrasque')).toHaveLength(0) // index is stale
    await refreshIndex(worldId)
    expect(searchWorld(worldId, 'tarrasque').map((r) => r.id)).toEqual([
      'External',
    ])
  })

  it('refreshIndex is a no-op when no index exists', async () => {
    await refreshIndex(worldId)
    expect(getIndex(worldId)).toBeUndefined()
  })

  it('listCharacters finds frontmatter-typed articles, indexed or not', async () => {
    createArticle({
      worldId,
      title: 'Kaelen',
      content: '---\ntype: character\nlevel: 5\n---\n\n# Kaelen',
    })
    const scan = listCharacters(worldId)
    expect(scan.map((c) => c.title)).toEqual(['Kaelen'])
    await buildIndex(worldId)
    expect(listCharacters(worldId)).toEqual(scan)
  })

  it('getIndex is scoped to the built world', async () => {
    await buildIndex(worldId)
    expect(getIndex('deadbeef')).toBeUndefined()
  })
})

/**
 * The unindexed path caches parsed articles so the global library — 1600+ files,
 * never indexed because it is never the open world — doesn't get fully read and
 * YAML-parsed on every panel open. The cache is only worth having if it can
 * never serve something that isn't on disk, so these are all staleness tests.
 */
describe('disk-scan cache', () => {
  let root: string
  let worldId: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-scan-'))
    initWorld(root, 'Test World', '')
    worldId = encodeWorldId(root)
  })

  afterEach(() => {
    dropIndex()
    dropScanCache()
    // maxRetries, because these tests rewrite the same filenames in quick
    // succession and Windows indexers/AV hold a handle open just long enough
    // for the rmdir to fail with ENOTEMPTY. Retrying is the fix; the test
    // itself has already made its assertions by this point.
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 })
  })

  // mtime has coarse resolution, so a same-millisecond rewrite could otherwise
  // look unchanged. Every edit here is backdated to a distinct, older time,
  // which is both unambiguous and what a real edit minutes later looks like.
  const writeAged = (name: string, content: string, secondsAgo: number) => {
    const abs = path.join(root, name)
    fs.writeFileSync(abs, content)
    const when = new Date(Date.now() - secondsAgo * 1000)
    fs.utimesSync(abs, when, when)
  }

  it('serves repeat scans without going stale', () => {
    writeAged('Goblin.md', '---\ntype: monster\n---\n\n# Goblin\n', 60)
    expect(queryArticles(worldId, { type: 'monster' })).toHaveLength(1)
    expect(queryArticles(worldId, { type: 'monster' })).toHaveLength(1)
  })

  it('picks up an external edit that changes the frontmatter', () => {
    writeAged('Thing.md', '---\ntype: monster\n---\n\n# Thing\n', 60)
    expect(queryArticles(worldId, { type: 'monster' })).toHaveLength(1)

    writeAged('Thing.md', '---\ntype: spell\n---\n\n# Thing\n', 30)

    expect(queryArticles(worldId, { type: 'monster' })).toHaveLength(0)
    expect(queryArticles(worldId, { type: 'spell' })).toHaveLength(1)
  })

  it('picks up an external edit to the body', () => {
    writeAged('Note.md', 'A goblin ambush.', 60)
    expect(searchWorld(worldId, 'goblin')).toHaveLength(1)

    writeAged('Note.md', 'A tarrasque approaches.', 30)

    expect(searchWorld(worldId, 'goblin')).toHaveLength(0)
    expect(searchWorld(worldId, 'tarrasque')).toHaveLength(1)
  })

  // The cache is keyed by path, but the tree decides what is yielded — a
  // deleted file must vanish even while its entry is still remembered.
  it('drops a deleted article even when cached', () => {
    writeAged('Gone.md', '---\ntype: monster\n---\n\n# Gone\n', 60)
    expect(queryArticles(worldId, { type: 'monster' })).toHaveLength(1)

    fs.rmSync(path.join(root, 'Gone.md'))

    expect(queryArticles(worldId, { type: 'monster' })).toHaveLength(0)
  })

  // Two worlds can hold same-named articles; absolute paths keep them apart.
  it('does not leak entries between worlds', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-scan2-'))
    try {
      initWorld(other, 'Other', '')
      writeAged('Goblin.md', '---\ntype: monster\n---\n\n# Goblin\n', 60)
      expect(queryArticles(worldId, { type: 'monster' })).toHaveLength(1)
      expect(
        queryArticles(encodeWorldId(other), { type: 'monster' }),
      ).toHaveLength(0)
    } finally {
      fs.rmSync(other, { recursive: true, force: true })
    }
  })

  // The cache must not become a second source of truth that the index disagrees
  // with — the property the whole fallback is built on.
  it('still agrees with the index after caching', async () => {
    writeAged('Goblin.md', '---\ntype: monster\n---\n\n# Goblin\n', 60)
    const scan = queryArticles(worldId, { type: 'monster' })

    await buildIndex(worldId)

    expect(queryArticles(worldId, { type: 'monster' })).toEqual(scan)
  })
})
