import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LibraryEntry } from './bestiary'
import {
  isEmptySpellCard,
  parseSpellCard,
  resolveSpellArticle,
  spellCardSubtitle,
} from './spellCard'

/**
 * Fixtures are the real bundled articles, pasted verbatim, not synthetic
 * strings — the entire risk in spellCard.ts is "does it match the corpus we
 * ship", and a hand-rolled sample proves nothing about that. The corpus test at
 * the bottom covers the other 980.
 */

const FIREBALL = `---
type: spell
level: 3
school: evocation
classes: Sorcerer, Wizard
---

# Fireball

*Level 3 evocation*

| | |
| --- | --- |
| **Casting Time** | 1 action |
| **Range** | 150 feet |
| **Components** | V, S, M (A tiny ball of bat guano and sulfur.) |
| **Duration** | Instantaneous |

A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame.

**At Higher Levels.** When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.
`

/** A cantrip, with the "*Cantrip evocation*" subtitle shape. */
const FIRE_BOLT = `---
type: spell
level: 0
school: evocation
classes: Sorcerer, Wizard
---

# Fire Bolt

*Cantrip evocation*

| | |
| --- | --- |
| **Casting Time** | 1 action |
| **Range** | 120 feet |
| **Components** | V, S |
| **Duration** | Instantaneous |

You hurl a mote of fire at a creature or object within range.
`

/**
 * The school-first cantrip subtitle, and no `school:` in frontmatter — so the
 * school has to come off the subtitle itself.
 */
const SHILLELAGH = `---
type: spell
level: 0
---

# Shillelagh

*Transmutation cantrip*

| | |
| --- | --- |
| **Casting Time** | 1 bonus action |
| **Range** | Touch |
| **Components** | V, S, M (Mistletoe) |
| **Duration** | 1 minute |

The wood of a club or quarterstaff you are holding is imbued with nature's power.
`

const DETECT_MAGIC = `---
type: spell
level: 1
school: divination
---

# Detect Magic

*Level 1 divination (ritual)*

| | |
| --- | --- |
| **Casting Time** | 1 action |
| **Range** | Self |
| **Components** | V, S |
| **Duration** | Concentration, up to 10 minutes |

For the duration, you sense the presence of magic within 30 feet of you.
`

/**
 * The corruption case: a second table *inside* the description. Eight bundled
 * articles do this, and a non-positional parse eats them.
 */
const ANIMATE_OBJECTS = `---
type: spell
level: 5
school: transmutation
classes: Bard, Sorcerer, Wizard
---

# Animate Objects

*Level 5 transmutation*

| | |
| --- | --- |
| **Casting Time** | 1 action |
| **Range** | 120 feet |
| **Components** | V, S |
| **Duration** | Concentration, Up to 1 minute |

Objects come to life at your command.
### Animated Object Statistics
| Size | HP | AC | Attack | Str | Dex |
|--------|----|----|----------------------------|-----|-----|
| Tiny | 20 | 18 | +8 to hit, 1d4 + 4 damage | 4 | 18 |
| Small | 25 | 16 | +6 to hit, 1d8 + 2 damage | 6 | 14 |

An animated object is a construct with AC, hit points, attacks, Strength, and Dexterity determined by its size.
`

/** A long Components value — the wrapping case the cost model has to charge for. */
const SYMBOL_COMPONENTS =
  'V, S, M (Mercury, phosphorus, and powdered diamond and opal with a total value of at least 1,000 gp, which the spell consumes)'

const SYMBOL = `---
type: spell
level: 7
school: abjuration
---

# Symbol

*Level 7 abjuration*

| | |
| --- | --- |
| **Casting Time** | 1 minute |
| **Range** | Touch |
| **Components** | ${SYMBOL_COMPONENTS} |
| **Duration** | Until dispelled or triggered |

When you cast this spell, you inscribe a harmful glyph.
`

const entry = (over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  worldId: 'library-world',
  articleId: 'Spells/Fireball',
  title: 'Fireball',
  global: true,
  queryable: true,
  ...over,
})

describe('parseSpellCard', () => {
  it('pulls the four stat rows in article order', () => {
    const card = parseSpellCard('Fireball', FIREBALL)
    expect(card.stats).toEqual([
      { label: 'Casting Time', value: '1 action' },
      { label: 'Range', value: '150 feet' },
      {
        label: 'Components',
        value: 'V, S, M (A tiny ball of bat guano and sulfur.)',
      },
      { label: 'Duration', value: 'Instantaneous' },
    ])
  })

  it('strips the H1, the subtitle and the stat table from the description', () => {
    const card = parseSpellCard('Fireball', FIREBALL)
    expect(card.description).toMatch(/^A bright streak flashes/)
    expect(card.description).not.toContain('# Fireball')
    expect(card.description).not.toContain('Level 3 evocation')
    expect(card.description).not.toContain('Casting Time')
  })

  it('keeps the description’s own bold run-in paragraphs and blank lines', () => {
    const card = parseSpellCard('Fireball', FIREBALL)
    expect(card.description).toContain('**At Higher Levels.**')
    // The blank line between paragraphs is what makes them paragraphs, and
    // spellCardCost charges for it.
    expect(card.description).toContain('\n\n')
  })

  it('reads the level and school from frontmatter', () => {
    const card = parseSpellCard('Fireball', FIREBALL)
    expect(card.level).toBe(3)
    expect(card.school).toBe('evocation')
    expect(card.ritual).toBe(false)
  })

  it('reads a cantrip as level 0', () => {
    expect(parseSpellCard('Fire Bolt', FIRE_BOLT).level).toBe(0)
  })

  it('takes the school off a school-first cantrip subtitle', () => {
    const card = parseSpellCard('Shillelagh', SHILLELAGH)
    expect(card.level).toBe(0)
    expect(card.school).toBe('transmutation')
    expect(card.stats).toHaveLength(4)
  })

  it('flags a ritual and keeps it out of the school', () => {
    const card = parseSpellCard('Detect Magic', DETECT_MAGIC)
    expect(card.ritual).toBe(true)
    expect(card.school).toBe('divination')
  })

  it('does not eat a table that belongs to the description', () => {
    // The regression test for this whole file: eight bundled articles carry a
    // second table in their prose, and a non-positional parse hoists its rows
    // into the stat block and leaves the table half-eaten behind it.
    const card = parseSpellCard('Animate Objects', ANIMATE_OBJECTS)
    expect(card.stats).toHaveLength(4)
    expect(card.stats.map((s) => s.label)).toEqual([
      'Casting Time',
      'Range',
      'Components',
      'Duration',
    ])
    expect(card.description).toContain(
      '| Size | HP | AC | Attack | Str | Dex |',
    )
    expect(card.description).toContain('| Tiny | 20 | 18 |')
    expect(card.description).toContain('### Animated Object Statistics')
  })

  it('keeps a long Components value whole', () => {
    const card = parseSpellCard('Symbol', SYMBOL)
    const components = card.stats.find((s) => s.label === 'Components')
    expect(components?.value).toBe(SYMBOL_COMPONENTS)
    expect(components?.value.length).toBeGreaterThan(100)
  })

  it('names the card from the article title, not the H1', () => {
    // The 5.5e articles are titled "Fireball 5.5e" over an H1 of "# Fireball";
    // the card has to match what the spell list printed.
    const card = parseSpellCard('Fireball 5.5e', FIREBALL)
    expect(card.name).toBe('Fireball 5.5e')
  })

  it('degrades to prose-only for an article with no stat table', () => {
    const card = parseSpellCard(
      'Homebrew Bolt',
      '# Homebrew Bolt\n\nIt goes bang. Roll 2d6.\n',
    )
    expect(card.stats).toEqual([])
    expect(card.description).toBe('It goes bang. Roll 2d6.')
  })

  it('degrades for an article with no H1 and no subtitle', () => {
    const card = parseSpellCard('Scribbled Note', 'Just some prose I typed.\n')
    expect(card.stats).toEqual([])
    expect(card.level).toBeNull()
    expect(card.school).toBeNull()
    expect(card.description).toBe('Just some prose I typed.')
  })

  it('ignores a subtitle-shaped line further down the body', () => {
    // "*Level 2 evocation*" appearing mid-prose must not be stripped as chrome
    // or read as the school.
    const body = [
      '# Odd Spell',
      '',
      'Some opening prose.',
      '',
      'Compare it to *Level 2 evocation* spells.',
      '',
      'More prose.',
    ].join('\n')
    const card = parseSpellCard('Odd Spell', body)
    expect(card.description).toContain('*Level 2 evocation*')
    expect(card.school).toBeNull()
  })

  it('never throws on empty, whitespace or frontmatter-only content', () => {
    for (const content of ['', '   ', '\n\n\n', '---\ntype: spell\n---\n']) {
      const card = parseSpellCard('X', content)
      expect(card.name).toBe('X')
      expect(card.stats).toEqual([])
      expect(card.description).toBe('')
    }
  })

  it('parses an article that is not a spell at all without throwing', () => {
    const card = parseSpellCard(
      'Strahd',
      '---\ntype: npc\n---\n\n# Strahd\n\nA vampire.\n',
    )
    expect(card.stats).toEqual([])
    expect(card.description).toBe('A vampire.')
  })
})

describe('isEmptySpellCard', () => {
  it('is true when there is neither a stat block nor prose', () => {
    expect(isEmptySpellCard(parseSpellCard('X', '# X\n'))).toBe(true)
  })

  it('is false when there is prose but no stat block', () => {
    expect(
      isEmptySpellCard(parseSpellCard('X', '# X\n\nIt does a thing.')),
    ).toBe(false)
  })

  it('is false when there is a stat block but no prose', () => {
    const content = '# X\n\n| | |\n| --- | --- |\n| **Range** | Self |\n'
    expect(isEmptySpellCard(parseSpellCard('X', content))).toBe(false)
  })
})

describe('spellCardSubtitle', () => {
  const card = (over: Partial<Parameters<typeof spellCardSubtitle>[0]>) =>
    spellCardSubtitle({
      name: 'X',
      level: null,
      school: null,
      ritual: false,
      stats: [],
      description: '',
      ...over,
    })

  it('renders a levelled spell', () => {
    expect(card({ level: 3, school: 'evocation' })).toBe('Level 3 evocation')
  })

  it('renders a cantrip school-first, the way the books do', () => {
    expect(card({ level: 0, school: 'evocation' })).toBe('Evocation cantrip')
  })

  it('appends the ritual tag', () => {
    expect(card({ level: 1, school: 'divination', ritual: true })).toBe(
      'Level 1 divination (ritual)',
    )
  })

  it('degrades a piece at a time rather than leaking a null', () => {
    expect(card({ level: 3, school: null })).toBe('Level 3')
    expect(card({ level: null, school: 'evocation' })).toBe('Evocation')
    expect(card({ level: 0, school: null })).toBe('Cantrip')
    expect(card({})).toBe('')
    expect(card({ ritual: true })).toBe('Ritual')
  })
})

describe('resolveSpellArticle', () => {
  const local = [{ id: 'Spells/Fireball', title: 'Fireball' }]

  it('prefers this world’s article over the library', () => {
    expect(resolveSpellArticle('Fireball', 'w1', local, [entry()])).toEqual({
      worldId: 'w1',
      articleId: 'Spells/Fireball',
      title: 'Fireball',
    })
  })

  it('matches case-insensitively', () => {
    expect(resolveSpellArticle('fireBALL', 'w1', local, [])?.articleId).toBe(
      'Spells/Fireball',
    )
  })

  it('falls back to the library and keeps the library’s worldId', () => {
    // The bug this function exists to prevent: dropping the worldId means a
    // later fetch reads the open world's folder for a library article, and two
    // worlds can both hold Spells/Fireball.
    expect(resolveSpellArticle('Fireball', 'w1', [], [entry()])).toEqual({
      worldId: 'library-world',
      articleId: 'Spells/Fireball',
      title: 'Fireball',
    })
  })

  it('resolves a wiki link by its title, alias and all', () => {
    expect(
      resolveSpellArticle('[[Fireball|Boom]]', 'w1', local, [])?.articleId,
    ).toBe('Spells/Fireball')
  })

  it('is null for an unknown name, and for an empty one', () => {
    expect(resolveSpellArticle('Prestidigitation', 'w1', local, [])).toBeNull()
    expect(resolveSpellArticle('   ', 'w1', local, [entry()])).toBeNull()
  })

  it('tolerates a missing article list', () => {
    expect(resolveSpellArticle('Fireball', 'w1', undefined, [])).toBeNull()
    expect(
      resolveSpellArticle('Fireball', 'w1', undefined, [entry()])?.worldId,
    ).toBe('library-world')
  })
})

/**
 * The corpus test. It reads the bundled content off disk, which no other lib/
 * test does — justified for the same reason srd.test.ts asserts data integrity:
 * a content re-import that changes the article shape would break every card
 * silently, and no unit fixture would notice. Skipped on a checkout without
 * resources/ so it degrades rather than failing.
 */
const CONTENT_DIR = join(process.cwd(), 'resources', 'content')
const SPELL_DIRS = ['DM Spells 5e', 'DM Spells 5.5e'].map((d) =>
  join(CONTENT_DIR, d),
)
const haveCorpus = SPELL_DIRS.every(existsSync)

describe.skipIf(!haveCorpus)('the bundled spell corpus', () => {
  const files = SPELL_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ dir, file: f })),
  )

  it('is actually there', () => {
    // A guard on the guard: if a glob change silently emptied this list, every
    // assertion below would vacuously pass.
    expect(files.length).toBeGreaterThan(900)
  })

  it('parses every article into a full stat block and a description', () => {
    const bad: Array<string> = []
    for (const { dir, file } of files) {
      const card = parseSpellCard(
        file.replace(/\.md$/, ''),
        readFileSync(join(dir, file), 'utf8'),
      )
      if (card.stats.length !== 4 || card.description.trim() === '') {
        bad.push(
          `${file}: ${card.stats.length} stats, ${card.description.length} chars`,
        )
      }
    }
    expect(bad).toEqual([])
  })

  it('reads a level and a school for every article', () => {
    const bad = files.filter(({ dir, file }) => {
      const card = parseSpellCard(file, readFileSync(join(dir, file), 'utf8'))
      return card.level === null || card.school === null
    })
    expect(bad.map((b) => b.file)).toEqual([])
  })

  it('never leaves a stat-table row in a description', () => {
    // Catches the inverse of the Animate Objects case: a stat row escaping into
    // the prose because the table block was mis-detected.
    const bad = files.filter(({ dir, file }) => {
      const card = parseSpellCard(file, readFileSync(join(dir, file), 'utf8'))
      return /^\|\s*\*\*(Casting Time|Range|Components|Duration)\*\*/m.test(
        card.description,
      )
    })
    expect(bad.map((b) => b.file)).toEqual([])
  })
})
