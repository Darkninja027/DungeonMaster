import { describe, expect, it } from 'vitest'
import {
  collectMonsters,
  collectSpells,
  entryKey,
  filterEntries,
  mergeEntries,
} from './bestiary'
import type { LibraryEntry } from './bestiary'
import type { ArticleRef, WorldTree } from './api'

const WORLD = 'w1'
const LIB = 'lib'

function tree(
  articles: Array<{ id: string; folderId: string | null; title: string }>,
): WorldTree {
  return {
    folders: [],
    articles: articles.map((a) => ({
      ...a,
      updatedAt: '2026-01-01T00:00:00Z',
    })),
  }
}

const ref = (id: string, title: string): ArticleRef => ({
  id,
  folderId: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : null,
  title,
})

describe('collectMonsters', () => {
  it('takes articles in the Monsters folder', () => {
    const entries = collectMonsters(
      WORLD,
      tree([
        { id: 'Monsters/Goblin', folderId: 'Monsters', title: 'Goblin' },
        { id: 'NPCs/Strahd', folderId: 'NPCs', title: 'Strahd' },
      ]),
      [],
    )
    expect(entries.map((e) => e.articleId)).toEqual(['Monsters/Goblin'])
    expect(entries[0].worldId).toBe(WORLD)
    expect(entries[0].global).toBe(false)
  })

  it('includes nested subfolders but not similarly-named siblings', () => {
    const entries = collectMonsters(
      WORLD,
      tree([
        {
          id: 'Monsters/CR 5+/Wyrm',
          folderId: 'Monsters/CR 5+',
          title: 'Wyrm',
        },
        { id: 'MonstersOld/Kobold', folderId: 'MonstersOld', title: 'Kobold' },
      ]),
      [],
    )
    expect(entries.map((e) => e.articleId)).toEqual(['Monsters/CR 5+/Wyrm'])
  })

  it('unions in type: monster articles from anywhere', () => {
    const entries = collectMonsters(
      WORLD,
      tree([{ id: 'Monsters/Goblin', folderId: 'Monsters', title: 'Goblin' }]),
      [ref('Lairs/Dragon', 'Dragon')],
    )
    expect(entries.map((e) => e.articleId).sort()).toEqual([
      'Lairs/Dragon',
      'Monsters/Goblin',
    ])
  })

  it('flags folder-only entries as not queryable', () => {
    const entries = collectMonsters(
      WORLD,
      tree([
        { id: 'Monsters/Goblin', folderId: 'Monsters', title: 'Goblin' },
        { id: 'Monsters/Kobold', folderId: 'Monsters', title: 'Kobold' },
      ]),
      [ref('Monsters/Kobold', 'Kobold')],
    )
    const byId = new Map(entries.map((e) => [e.articleId, e.queryable]))
    expect(byId.get('Monsters/Goblin')).toBe(false)
    expect(byId.get('Monsters/Kobold')).toBe(true)
  })

  it('dedupes an article that is both in the folder and typed', () => {
    const entries = collectMonsters(
      WORLD,
      tree([{ id: 'Monsters/Goblin', folderId: 'Monsters', title: 'Goblin' }]),
      [ref('Monsters/Goblin', 'Goblin')],
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].queryable).toBe(true)
  })

  it('sorts case-insensitively by title', () => {
    const entries = collectMonsters(
      WORLD,
      tree([
        { id: 'Monsters/zombie', folderId: 'Monsters', title: 'zombie' },
        { id: 'Monsters/Ankheg', folderId: 'Monsters', title: 'Ankheg' },
        { id: 'Monsters/basilisk', folderId: 'Monsters', title: 'basilisk' },
      ]),
      [],
    )
    expect(entries.map((e) => e.title)).toEqual([
      'Ankheg',
      'basilisk',
      'zombie',
    ])
  })

  it('marks library entries global and carries the library world id', () => {
    const entries = collectMonsters(
      LIB,
      tree([{ id: 'Monsters/Goblin', folderId: 'Monsters', title: 'Goblin' }]),
      [],
      { global: true },
    )
    expect(entries[0]).toMatchObject({ worldId: LIB, global: true })
  })

  it('is empty when the tree has not loaded', () => {
    expect(collectMonsters(WORLD, undefined, undefined)).toEqual([])
  })
})

describe('collectSpells', () => {
  it('takes the Spells folder and its subfolders', () => {
    const entries = collectSpells(
      WORLD,
      tree([
        { id: 'Spells/Fireball', folderId: 'Spells', title: 'Fireball' },
        {
          id: 'Spells/Rituals/Bind',
          folderId: 'Spells/Rituals',
          title: 'Bind',
        },
        { id: 'NPCs/Strahd', folderId: 'NPCs', title: 'Strahd' },
      ]),
    )
    expect(entries.map((e) => e.articleId)).toEqual([
      'Spells/Rituals/Bind',
      'Spells/Fireball',
    ])
  })

  // Spells match by folder alone, so there is no "invisible to the builder" case.
  it('always reports queryable', () => {
    const entries = collectSpells(
      WORLD,
      tree([{ id: 'Spells/Fireball', folderId: 'Spells', title: 'Fireball' }]),
    )
    expect(entries[0].queryable).toBe(true)
  })
})

describe('mergeEntries', () => {
  const world: Array<LibraryEntry> = [
    {
      worldId: WORLD,
      articleId: 'Monsters/Strahd',
      title: 'Strahd',
      global: false,
      queryable: true,
    },
  ]
  const global: Array<LibraryEntry> = [
    {
      worldId: LIB,
      articleId: 'Monsters/Ankheg',
      title: 'Ankheg',
      global: true,
      queryable: true,
    },
  ]

  it('interleaves both sources by title', () => {
    expect(mergeEntries(world, global).map((e) => e.title)).toEqual([
      'Ankheg',
      'Strahd',
    ])
  })

  // No override semantics: a world Goblin and a library Goblin are two articles.
  it('keeps same-titled entries from both worlds', () => {
    const merged = mergeEntries(
      [
        {
          worldId: WORLD,
          articleId: 'Monsters/Goblin',
          title: 'Goblin',
          global: false,
          queryable: true,
        },
      ],
      [
        {
          worldId: LIB,
          articleId: 'Monsters/Goblin',
          title: 'Goblin',
          global: true,
          queryable: true,
        },
      ],
    )
    expect(merged).toHaveLength(2)
    expect(merged.map((e) => e.global)).toEqual([false, true])
  })

  it('gives same-id entries from different worlds distinct keys', () => {
    const merged = mergeEntries(
      [
        {
          worldId: WORLD,
          articleId: 'Monsters/Goblin',
          title: 'Goblin',
          global: false,
          queryable: true,
        },
      ],
      [
        {
          worldId: LIB,
          articleId: 'Monsters/Goblin',
          title: 'Goblin',
          global: true,
          queryable: true,
        },
      ],
    )
    expect(new Set(merged.map(entryKey)).size).toBe(2)
  })
})

describe('filterEntries', () => {
  const entries = mergeEntries(
    [
      {
        worldId: WORLD,
        articleId: 'Monsters/Goblin',
        title: 'Goblin',
        global: false,
        queryable: true,
      },
    ],
    [
      {
        worldId: LIB,
        articleId: 'Monsters/Ankheg',
        title: 'Ankheg',
        global: true,
        queryable: true,
      },
    ],
  )

  it('returns everything for a blank filter', () => {
    expect(filterEntries(entries, '   ')).toHaveLength(2)
  })

  it('matches case-insensitive substrings across both sources', () => {
    expect(filterEntries(entries, 'gob').map((e) => e.title)).toEqual([
      'Goblin',
    ])
    expect(filterEntries(entries, 'KHE').map((e) => e.title)).toEqual([
      'Ankheg',
    ])
  })
})
