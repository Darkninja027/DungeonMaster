import { describe, expect, it } from 'vitest'
import {
  collectMonsters,
  collectSpells,
  entryKey,
  filterEntries,
  filterSpells,
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

const ref = (
  id: string,
  title: string,
  extra: Partial<ArticleRef> = {},
): ArticleRef => ({
  id,
  folderId: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : null,
  title,
  cr: null,
  xp: null,
  level: null,
  school: null,
  classes: null,
  ...extra,
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

  // `queryable` means "the encounter builder can see this", which is a monster
  // concept — spells are never hidden from anything, typed or not.
  it('always reports queryable', () => {
    const entries = collectSpells(
      WORLD,
      tree([{ id: 'Spells/Fireball', folderId: 'Spells', title: 'Fireball' }]),
    )
    expect(entries[0].queryable).toBe(true)
  })

  // The regression this union exists for: the library's spells used to hang
  // entirely on one tree read, so a tree that was empty — or belonged to another
  // world, which a shared query key made routine — rendered an empty panel while
  // the files sat on disk.
  it('takes typed spells when the tree is missing', () => {
    const entries = collectSpells(LIB, undefined, [
      ref('Spells/Fireball', 'Fireball'),
      ref('Spells/Bless', 'Bless'),
    ])
    expect(entries.map((e) => e.articleId)).toEqual([
      'Spells/Bless',
      'Spells/Fireball',
    ])
  })

  it('takes typed spells when the tree is another world’s', () => {
    const entries = collectSpells(
      LIB,
      tree([{ id: 'NPCs/Strahd', folderId: 'NPCs', title: 'Strahd' }]),
      [ref('Spells/Fireball', 'Fireball')],
    )
    expect(entries.map((e) => e.articleId)).toEqual(['Spells/Fireball'])
  })

  it('does not duplicate a spell present in both sources', () => {
    const entries = collectSpells(
      LIB,
      tree([{ id: 'Spells/Fireball', folderId: 'Spells', title: 'Fireball' }]),
      [ref('Spells/Fireball', 'Fireball')],
    )
    expect(entries).toHaveLength(1)
  })

  // Typed articles are matched on frontmatter, so they count wherever they live
  // — the same rule collectMonsters already applies.
  it('takes a typed spell filed outside the Spells folder', () => {
    const entries = collectSpells(LIB, tree([]), [
      ref('Homebrew/Chromatic Orb', 'Chromatic Orb'),
    ])
    expect(entries.map((e) => e.articleId)).toEqual(['Homebrew/Chromatic Orb'])
  })
})

describe('collectSpells frontmatter', () => {
  it('carries level, school and classes off the typed refs', () => {
    const entries = collectSpells(WORLD, undefined, [
      ref('Spells/Fire Bolt', 'Fire Bolt', {
        level: 0,
        school: 'evocation',
        classes: ['Sorcerer', 'Wizard'],
      }),
    ])
    expect(entries[0].level).toBe(0)
    expect(entries[0].school).toBe('evocation')
    expect(entries[0].classes).toEqual(['Sorcerer', 'Wizard'])
  })

  it('prefers the typed record over the folder walk’s bare title', () => {
    // Both sources see the same article; only the query knows its level, so the
    // richer record has to be the one that survives or the filters go blind.
    const entries = collectSpells(
      WORLD,
      tree([
        { id: 'Spells/Fire Bolt', folderId: 'Spells', title: 'Fire Bolt' },
      ]),
      [ref('Spells/Fire Bolt', 'Fire Bolt', { level: 0 })],
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].level).toBe(0)
  })
})

describe('filterSpells', () => {
  const spell = (
    title: string,
    level: number | null,
    classes: Array<string> | null = null,
  ): LibraryEntry => ({
    worldId: WORLD,
    articleId: `Spells/${title}`,
    title,
    global: false,
    queryable: true,
    level,
    classes,
  })

  const FIRE_BOLT = spell('Fire Bolt', 0, ['Sorcerer', 'Wizard'])
  const GUIDANCE = spell('Guidance', 0, ['Cleric', 'Druid'])
  const MAGIC_MISSILE = spell('Magic Missile', 1, ['Sorcerer', 'Wizard'])
  const HOMEBREW = spell('Grelling’s Gambit', null)
  const ALL = [FIRE_BOLT, GUIDANCE, MAGIC_MISSILE, HOMEBREW]

  it('narrows to one spell level', () => {
    expect(filterSpells(ALL, { level: 0 }).map((e) => e.title)).toEqual([
      'Fire Bolt',
      'Guidance',
      'Grelling’s Gambit',
    ])
  })

  it('narrows to a class list, case-insensitively', () => {
    expect(
      filterSpells(ALL, { level: 0, className: 'wizard' }).map((e) => e.title),
    ).toEqual(['Fire Bolt', 'Grelling’s Gambit'])
  })

  it('keeps a spell that declares nothing', () => {
    // The point of this: a homebrew spell with no frontmatter must stay
    // offerable. A picker that silently hides the user's own content is worse
    // than one that offers a little too much.
    expect(
      filterSpells([HOMEBREW], { level: 9, className: 'Bard' }),
    ).toHaveLength(1)
  })

  it('returns everything when asked for nothing', () => {
    expect(filterSpells(ALL)).toHaveLength(ALL.length)
  })

  it('does not confuse a class name with a substring of another', () => {
    const bard = spell('Vicious Mockery', 0, ['Bard'])
    expect(
      filterSpells([bard], { level: 0, className: 'Barbarian' }),
    ).toHaveLength(0)
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

describe('filterSpells by a level ceiling', () => {
  const entries = [
    { worldId: 'w', articleId: 'a', title: 'Fire Bolt', level: 0 },
    { worldId: 'w', articleId: 'b', title: 'Charm Person', level: 1 },
    { worldId: 'w', articleId: 'c', title: 'Invisibility', level: 2 },
    { worldId: 'w', articleId: 'd', title: 'Fireball', level: 3 },
    { worldId: 'w', articleId: 'e', title: 'Homebrew Thing' },
  ] as Array<Parameters<typeof filterSpells>[0][number]>

  it('offers every level a character has slots for, not just the highest', () => {
    // A 7th-level Arcane Trickster may learn a 1st *or* 2nd level spell.
    // Filtering to the highest open level alone hid half of what they can take.
    const names = filterSpells(entries, { maxLevel: 2 }).map((e) => e.title)
    expect(names).toContain('Charm Person')
    expect(names).toContain('Invisibility')
    expect(names).not.toContain('Fireball')
  })

  it('leaves cantrips out — they are counted and chosen separately', () => {
    expect(
      filterSpells(entries, { maxLevel: 2 }).map((e) => e.title),
    ).not.toContain('Fire Bolt')
  })

  it('still shows a spell that declares no level', () => {
    // The permissive rule the whole filter is built on: homebrew is never
    // silently hidden.
    expect(
      filterSpells(entries, { maxLevel: 1 }).map((e) => e.title),
    ).toContain('Homebrew Thing')
  })

  it('leaves the exact-level filter alone', () => {
    const names = filterSpells(entries, { level: 1 }).map((e) => e.title)
    expect(names).toContain('Charm Person')
    expect(names).not.toContain('Invisibility')
  })
})
