import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeWorldId } from './sanitize'
import { createArticle, initWorld } from './worldStore'
import { buildIndex, dropIndex, getIndex } from './indexer'
import { listTags, scoreTitle, searchRanked } from './search'

describe('scoreTitle', () => {
  it('ranks exact > prefix > substring > subsequence', () => {
    const exact = scoreTitle('Strahd', 'strahd')!.score
    const prefix = scoreTitle('Strahd von Zarovich', 'strahd')!.score
    const substring = scoreTitle('Count Strahd', 'strahd')!.score
    const subsequence = scoreTitle('Strahd', 'sthd')!.score
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(substring)
    expect(substring).toBeGreaterThan(subsequence)
  })

  it('matches a subsequence and reports the matched ranges', () => {
    const hit = scoreTitle('Strahd', 'sthd')
    expect(hit).not.toBeNull()
    // "Strahd": "St" at 0-1, then "hd" at 4-5 — two contiguous runs.
    expect(hit!.ranges).toEqual([
      [0, 2],
      [4, 6],
    ])
  })

  it('merges adjacent characters into one range', () => {
    expect(scoreTitle('Barovia', 'baro')!.ranges).toEqual([[0, 4]])
  })

  it('returns null when the characters are not all present in order', () => {
    expect(scoreTitle('Strahd', 'zzz')).toBeNull()
    expect(scoreTitle('Strahd', 'dhs')).toBeNull() // right letters, wrong order
    expect(scoreTitle('Strahd', '')).toBeNull()
  })

  it('prefers a denser subsequence match', () => {
    const dense = scoreTitle('Strahd', 'sth')!.score
    const sparse = scoreTitle('Sunless Citadel of the Hollow', 'sth')!.score
    expect(dense).toBeGreaterThan(sparse)
  })

  it('is case-insensitive on the title', () => {
    expect(scoreTitle('STRAHD', 'strahd')!.score).toBe(1000)
  })
})

describe('searchRanked', () => {
  let root: string
  let worldId: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-ranked-'))
    initWorld(root, 'Test World', '')
    worldId = encodeWorldId(root)
  })

  afterEach(() => {
    dropIndex()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('orders exact title above prefix above body-only matches', () => {
    createArticle({ worldId, title: 'Notes', content: 'Strahd rules here.' })
    createArticle({ worldId, title: 'Strahd von Zarovich', content: 'Prefix.' })
    createArticle({ worldId, title: 'Strahd', content: 'Exact.' })

    expect(searchRanked(worldId, 'strahd').map((r) => r.title)).toEqual([
      'Strahd',
      'Strahd von Zarovich',
      'Notes',
    ])
  })

  it('applies the limit AFTER sorting, not during the scan', () => {
    // 60 body-only matches created first, so in tree order they all precede
    // the exact title hit. A cap applied during the scan would drop it.
    for (let i = 0; i < 60; i++) {
      createArticle({
        worldId,
        title: `Filler ${String(i).padStart(2, '0')}`,
        content: 'Mentions Strahd in passing.',
      })
    }
    createArticle({ worldId, title: 'Strahd', content: 'The exact article.' })

    const top = searchRanked(worldId, 'strahd', 5)
    expect(top).toHaveLength(5)
    expect(top[0].title).toBe('Strahd')
  })

  it('defaults to at most 30 results', () => {
    for (let i = 0; i < 40; i++) {
      createArticle({ worldId, title: `Ghoul ${i}`, content: 'undead' })
    }
    expect(searchRanked(worldId, 'ghoul')).toHaveLength(30)
  })

  it('reports frontmatter type so characters can route to their sheet', () => {
    createArticle({
      worldId,
      title: 'Kaelen',
      content: '---\ntype: character\n---\n\n# Kaelen',
    })
    createArticle({ worldId, title: 'Kaelens Sword', content: 'A blade.' })

    const hits = searchRanked(worldId, 'kaelen')
    expect(hits.find((h) => h.title === 'Kaelen')?.type).toBe('character')
    expect(hits.find((h) => h.title === 'Kaelens Sword')?.type).toBeNull()
  })

  it('includes a body snippet only when the body matched', () => {
    createArticle({ worldId, title: 'Barovia', content: 'No mention here.' })
    createArticle({ worldId, title: 'Mists', content: 'The Barovia border.' })

    const hits = searchRanked(worldId, 'barovia')
    expect(hits.find((h) => h.title === 'Barovia')?.snippet).toBe('')
    expect(hits.find((h) => h.title === 'Mists')?.snippet).toContain('Barovia')
  })

  it('returns nothing for an empty query', () => {
    createArticle({ worldId, title: 'Strahd', content: 'Anything.' })
    expect(searchRanked(worldId, '   ')).toEqual([])
  })

  it('ranks identically with a warm index and a cold disk scan', async () => {
    createArticle({ worldId, title: 'Strahd', content: 'Exact.' })
    createArticle({ worldId, title: 'Strahd von Zarovich', content: 'Prefix.' })
    createArticle({ worldId, title: 'Castle Ravenloft', content: 'Strahd.' })

    expect(getIndex(worldId)).toBeUndefined()
    const cold = searchRanked(worldId, 'strahd')

    await buildIndex(worldId)
    expect(getIndex(worldId)).toBeDefined()
    expect(searchRanked(worldId, 'strahd')).toEqual(cold)
  })
})

describe('listTags', () => {
  let root: string
  let worldId: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-tags-'))
    initWorld(root, 'Test World', '')
    worldId = encodeWorldId(root)
  })

  afterEach(() => {
    dropIndex()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('counts tags across articles, most-used first', () => {
    createArticle({
      worldId,
      title: 'Ghoul',
      content: '---\ntags: [undead, cr1]\n---\n',
    })
    createArticle({
      worldId,
      title: 'Wight',
      content: '---\ntags: [undead, cr3]\n---\n',
    })
    createArticle({
      worldId,
      title: 'Zombie',
      content: '---\ntags: [undead]\n---\n',
    })

    expect(listTags(worldId)).toEqual([
      { tag: 'undead', count: 3 },
      { tag: 'cr1', count: 1 },
      { tag: 'cr3', count: 1 },
    ])
  })

  it('folds tags case-insensitively', () => {
    createArticle({
      worldId,
      title: 'A',
      content: '---\ntags: [Undead]\n---\n',
    })
    createArticle({
      worldId,
      title: 'B',
      content: '---\ntags: [undead]\n---\n',
    })
    expect(listTags(worldId)).toEqual([{ tag: 'undead', count: 2 }])
  })

  it('accepts a bare scalar tags value as well as an array', () => {
    createArticle({ worldId, title: 'A', content: '---\ntags: undead\n---\n' })
    expect(listTags(worldId)).toEqual([{ tag: 'undead', count: 1 }])
  })

  it('ignores articles with no frontmatter or no tags', () => {
    createArticle({ worldId, title: 'Plain', content: 'Just prose.' })
    createArticle({ worldId, title: 'Typed', content: '---\ntype: npc\n---\n' })
    expect(listTags(worldId)).toEqual([])
  })

  it('agrees between a warm index and a cold disk scan', async () => {
    createArticle({
      worldId,
      title: 'Ghoul',
      content: '---\ntags: [undead, cr1]\n---\n',
    })
    const cold = listTags(worldId)
    await buildIndex(worldId)
    expect(listTags(worldId)).toEqual(cold)
  })
})
