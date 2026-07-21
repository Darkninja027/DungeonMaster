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
import { findMentions, searchWorld } from './search'

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

  it('indexed results are identical to the disk-scan fallback', () => {
    const scanSearch = searchWorld(worldId, 'vampire')
    const scanMentions = findMentions(worldId, 'Strahd')

    buildIndex(worldId)
    expect(getIndex(worldId)).toBeDefined()
    expect(searchWorld(worldId, 'vampire')).toEqual(scanSearch)
    expect(findMentions(worldId, 'Strahd')).toEqual(scanMentions)
  })

  it('search works with no index at all (fallback regression guard)', () => {
    expect(getIndex(worldId)).toBeUndefined()
    expect(searchWorld(worldId, 'misty')).toHaveLength(1)
  })

  it('noteWrite makes app writes searchable without a rebuild', () => {
    buildIndex(worldId)
    const article = updateArticle(worldId, 'Unrelated', {
      title: 'Unrelated',
      content: 'A hidden beholder lair.',
    })
    noteWrite(article)
    expect(searchWorld(worldId, 'beholder').map((r) => r.id)).toEqual([
      'Unrelated',
    ])
  })

  it('noteDelete removes an article from results', () => {
    buildIndex(worldId)
    noteDelete(worldId, 'Unrelated')
    expect(searchWorld(worldId, 'nothing to see')).toHaveLength(0)
  })

  it('refreshIndex picks up external file changes', () => {
    buildIndex(worldId)
    fs.writeFileSync(path.join(root, 'External.md'), 'A tarrasque approaches!')
    expect(searchWorld(worldId, 'tarrasque')).toHaveLength(0) // index is stale
    refreshIndex(worldId)
    expect(searchWorld(worldId, 'tarrasque').map((r) => r.id)).toEqual([
      'External',
    ])
  })

  it('refreshIndex is a no-op when no index exists', () => {
    refreshIndex(worldId)
    expect(getIndex(worldId)).toBeUndefined()
  })

  it('getIndex is scoped to the built world', () => {
    buildIndex(worldId)
    expect(getIndex('deadbeef')).toBeUndefined()
  })
})
