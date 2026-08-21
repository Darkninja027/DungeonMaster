import { describe, expect, it } from 'vitest'
import type { CharacterNote, ClassFeature, Spell } from './character'
import {
  featureCost,
  featureRows,
  noteCost,
  paginate,
  paginateFeatureRows,
  paginateNotes,
  paginateSpellRows,
  spellRows,
} from './sheetPages'

const nums = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

const spell = (name: string, level: number): Spell => ({ name, level })

describe('paginate', () => {
  it('yields no pages for an empty list', () => {
    expect(paginate([], 10, 20)).toEqual([])
  })

  it('fits exactly `first` items on one page', () => {
    expect(paginate(nums(10), 10, 20)).toEqual([nums(10)])
  })

  it('spills the eleventh item onto a second page', () => {
    const pages = paginate(nums(11), 10, 20)
    expect(pages).toHaveLength(2)
    expect(pages[1]).toEqual([11])
  })

  it('uses the larger `rest` capacity after the first page', () => {
    const pages = paginate(nums(35), 5, 15)
    expect(pages.map((p) => p.length)).toEqual([5, 15, 15])
  })

  it('never loses or reorders an item', () => {
    const items = nums(97)
    expect(paginate(items, 13, 29).flat()).toEqual(items)
  })

  it('does not hang on a non-positive capacity', () => {
    expect(paginate(nums(5), 0, 10)).toEqual([nums(5)])
    expect(paginate(nums(5), 10, 0)).toEqual([nums(5)])
    expect(paginate(nums(5), -1, -1)).toEqual([nums(5)])
  })
})

describe('spellRows', () => {
  it('is empty for no spells', () => {
    expect(spellRows([])).toEqual([])
  })

  it('puts a heading before each level, cantrips first', () => {
    const rows = spellRows([
      spell('Fireball', 3),
      spell('Fire Bolt', 0),
      spell('Shield', 1),
    ])
    expect(rows).toEqual([
      { kind: 'cap', level: 0 },
      { kind: 'spell', spell: spell('Fire Bolt', 0) },
      { kind: 'cap', level: 1 },
      { kind: 'spell', spell: spell('Shield', 1) },
      { kind: 'cap', level: 3 },
      { kind: 'spell', spell: spell('Fireball', 3) },
    ])
  })

  it('emits one heading for several spells of the same level', () => {
    const rows = spellRows([spell('Shield', 1), spell('Bless', 1)])
    expect(rows.filter((r) => r.kind === 'cap')).toHaveLength(1)
    // sorted by name within a level
    expect(rows).toEqual([
      { kind: 'cap', level: 1 },
      { kind: 'spell', spell: spell('Bless', 1) },
      { kind: 'spell', spell: spell('Shield', 1) },
    ])
  })
})

describe('featureRows', () => {
  const feat = (name: string, level: number, text?: string): ClassFeature =>
    text ? { level, name, text } : { level, name }

  it('is empty for no features', () => {
    expect(featureRows([])).toEqual([])
  })

  it('puts one heading before each level, sorted', () => {
    const rows = featureRows([
      feat('Steady Aim', 3),
      feat('Sneak Attack', 1),
      feat('Fast Hands', 3),
    ])
    expect(rows).toEqual([
      { kind: 'cap', level: 1 },
      { kind: 'feature', feature: feat('Sneak Attack', 1) },
      { kind: 'cap', level: 3 },
      { kind: 'feature', feature: feat('Fast Hands', 3) },
      { kind: 'feature', feature: feat('Steady Aim', 3) },
    ])
  })

  it('puts racial traits first, in authored order, under one heading', () => {
    const rows = featureRows(
      [feat('Sneak Attack', 1)],
      [{ name: 'Lucky' }, { name: 'Brave', text: 'Advantage vs frightened.' }],
    )
    expect(rows).toEqual([
      { kind: 'cap', level: null, label: 'Racial Traits' },
      { kind: 'entry', entry: { name: 'Lucky' } },
      {
        kind: 'entry',
        entry: { name: 'Brave', text: 'Advantage vs frightened.' },
      },
      { kind: 'cap', level: 1 },
      { kind: 'feature', feature: feat('Sneak Attack', 1) },
    ])
  })

  it('orders traits, then feats, then levelled features', () => {
    const rows = featureRows(
      [feat('Sneak Attack', 1)],
      [{ name: 'Darkvision' }],
      [{ name: 'Alert' }],
    )
    expect(
      rows.map((r) => (r.kind === 'cap' ? (r.label ?? r.level) : r)),
    ).toEqual([
      'Racial Traits',
      { kind: 'entry', entry: { name: 'Darkvision' } },
      'Feats',
      { kind: 'entry', entry: { name: 'Alert' } },
      1,
      { kind: 'feature', feature: feat('Sneak Attack', 1) },
    ])
  })

  it('emits no heading for an empty flat section', () => {
    const traitsOnly = featureRows([], [{ name: 'Darkvision' }], [])
    expect(
      traitsOnly.some((r) => r.kind === 'cap' && r.label === 'Feats'),
    ).toBe(false)
    const featsOnly = featureRows([], [], [{ name: 'Alert' }])
    expect(
      featsOnly.some((r) => r.kind === 'cap' && r.label === 'Racial Traits'),
    ).toBe(false)
    const neither = featureRows([feat('Sneak Attack', 1)])
    expect(neither.some((r) => r.kind === 'cap' && r.level === null)).toBe(
      false,
    )
  })

  it('costs an entry by its description, like a feature', () => {
    const bare = featureCost({ kind: 'entry', entry: { name: 'Brave' } })
    const wordy = featureCost({
      kind: 'entry',
      entry: { name: 'Wordy', text: 'x'.repeat(200) },
    })
    expect(wordy).toBeGreaterThan(bare)
  })

  it('charges a full line per authored newline, however short', () => {
    // An Oath Spells style list: five short lines must not be costed as if
    // they were one 150-character paragraph, or the page clips them.
    const list = [
      '3rd Level: Bane, Hunter’s Mark',
      '5th Level: Hold Person, Misty Step',
      '9th Level: Haste, Protection from Energy',
      '13th Level: Banishment, Dimension Door',
      '17th Level: Hold Monster, Scrying',
    ].join('\n')
    const cost = featureCost({
      kind: 'feature',
      feature: { level: 3, name: 'Oath Spells', text: list },
    })
    // five hard-broken lines, whatever the per-line character budget
    const runOn = featureCost({
      kind: 'feature',
      feature: {
        level: 3,
        name: 'Oath Spells',
        text: list.replace(/\n/g, ' '),
      },
    })
    expect(cost).toBeGreaterThan(runOn)
  })

  it('estimates a long paragraph close to how it really renders', () => {
    // Measured on the rendered sheet: a 786-character description occupies
    // ~11 lines. The estimate must land near that — over-counting by 40% is
    // what stranded half a page of white space.
    const cost = featureCost({
      kind: 'entry',
      entry: { name: 'Divine Sense', text: 'x'.repeat(786) },
    })
    expect(cost).toBeGreaterThan(11)
    expect(cost).toBeLessThan(15)
  })

  it('charges a blank line less than a line of text', () => {
    const twoParas = featureCost({
      kind: 'entry',
      entry: { name: 'A', text: `${'x'.repeat(64)}\n\n${'y'.repeat(64)}` },
    })
    const threeLines = featureCost({
      kind: 'entry',
      entry: {
        name: 'A',
        text: `${'x'.repeat(64)}\n${'z'.repeat(64)}\n${'y'.repeat(64)}`,
      },
    })
    expect(twoParas).toBeLessThan(threeLines)
  })

  it('costs a feature by how much rules text it carries', () => {
    const bare = featureCost({ kind: 'feature', feature: feat('Bare', 1) })
    const wordy = featureCost({
      kind: 'feature',
      feature: feat('Wordy', 1, 'x'.repeat(200)),
    })
    expect(wordy).toBeGreaterThan(bare)
  })
})

describe('paginateFeatureRows', () => {
  const feat = (name: string, level: number, text?: string): ClassFeature =>
    text ? { level, name, text } : { level, name }

  it('yields no pages for no rows', () => {
    expect(paginateFeatureRows([], 40, 60)).toEqual([])
  })

  it('keeps everything on one page when it fits', () => {
    const rows = featureRows([feat('A', 1), feat('B', 2)])
    expect(paginateFeatureRows(rows, 100, 100)).toEqual([rows])
  })

  it('splits on the line budget and loses nothing', () => {
    const rows = featureRows(
      Array.from({ length: 20 }, (_, i) =>
        feat(`Feature ${i}`, (i % 5) + 1, 'y'.repeat(120)),
      ),
    )
    const pages = paginateFeatureRows(rows, 30, 40)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.flat()).toEqual(rows)
  })

  it('never ends a page on a level heading', () => {
    const rows = featureRows(
      Array.from({ length: 12 }, (_, i) => feat(`F${i}`, i + 1)),
    )
    const pages = paginateFeatureRows(rows, 8, 8)
    expect(pages.length).toBeGreaterThan(1)
    for (const page of pages.slice(0, -1)) {
      expect(page[page.length - 1].kind).not.toBe('cap')
    }
    expect(pages.flat()).toEqual(rows)
  })

  it('gives an oversized row its own page instead of looping', () => {
    const rows = featureRows([
      feat('Short', 1),
      feat('Enormous', 2, 'z'.repeat(4000)),
      feat('Also short', 3),
    ])
    const pages = paginateFeatureRows(rows, 10, 10)
    expect(pages.flat()).toEqual(rows)
    expect(pages.length).toBeGreaterThan(1)
  })

  it('does not hang on a non-positive budget', () => {
    const rows = featureRows([feat('A', 1)])
    expect(paginateFeatureRows(rows, 0, 10)).toEqual([rows])
    expect(paginateFeatureRows(rows, 10, 0)).toEqual([rows])
  })
})

describe('paginateSpellRows', () => {
  it('never leaves a level heading as the last row of a page', () => {
    // Capacity 3: rows are [cap0, Fire Bolt, cap1, Bless, Shield] so a naive
    // split would orphan cap1 at the foot of page one.
    const rows = spellRows([
      spell('Fire Bolt', 0),
      spell('Shield', 1),
      spell('Bless', 1),
    ])
    const pages = paginateSpellRows(rows, 3, 3)
    expect(pages[0]).toEqual([
      { kind: 'cap', level: 0 },
      { kind: 'spell', spell: spell('Fire Bolt', 0) },
    ])
    expect(pages[1][0]).toEqual({ kind: 'cap', level: 1 })
  })

  it('keeps every row when a heading moves pages', () => {
    const rows = spellRows([
      spell('Fire Bolt', 0),
      spell('Shield', 1),
      spell('Bless', 1),
    ])
    expect(paginateSpellRows(rows, 3, 3).flat()).toEqual(rows)
  })

  it('leaves a trailing heading alone on the final page', () => {
    // Nothing follows it, so there is nowhere to push it — and in practice
    // spellRows never emits a heading without a spell after it.
    const pages = paginateSpellRows([{ kind: 'cap', level: 2 }], 3, 3)
    expect(pages).toEqual([[{ kind: 'cap', level: 2 }]])
  })

  it('handles consecutive page-trailing headings', () => {
    const rows = spellRows([
      spell('Fire Bolt', 0),
      spell('Shield', 1),
      spell('Fireball', 3),
    ])
    const pages = paginateSpellRows(rows, 2, 2)
    for (const page of pages.slice(0, -1)) {
      expect(page[page.length - 1]?.kind).not.toBe('cap')
    }
    expect(pages.flat()).toEqual(rows)
  })

  it('charges a heading one row, like a spell', () => {
    // The list fills down one column and then the other, so a heading is an
    // ordinary in-column row — it no longer spans a grid and costs two, and
    // there is no half-row left to pad. cap0 + Fire Bolt + cap1 + Bless = 4.
    const rows = spellRows([spell('Fire Bolt', 0), spell('Bless', 1)])
    expect(paginateSpellRows(rows, 4, 4)).toHaveLength(1)
    // One less, and the trailing cap1 travels with its spell rather than
    // stranding at the foot of the page.
    const split = paginateSpellRows(rows, 3, 3)
    expect(split).toHaveLength(2)
    expect(split[1]).toEqual([
      { kind: 'cap', level: 1 },
      { kind: 'spell', spell: spell('Bless', 1) },
    ])
    expect(split.flat()).toEqual(rows)
  })

  it('never loses or reorders rows across a realistic spell list', () => {
    const rows = spellRows([
      ...nums(3).map((i) => spell(`Cantrip ${i}`, 0)),
      ...nums(7).map((i) => spell(`First ${i}`, 1)),
      ...nums(5).map((i) => spell(`Second ${i}`, 2)),
      ...nums(2).map((i) => spell(`Third ${i}`, 3)),
    ])
    const pages = paginateSpellRows(rows, 12, 12)
    expect(pages.flat()).toEqual(rows)
    for (const page of pages.slice(0, -1)) {
      expect(page[page.length - 1]?.kind).not.toBe('cap')
    }
  })

  it('yields no pages for an empty list', () => {
    expect(paginateSpellRows([], 10, 10)).toEqual([])
  })

  it('falls back to one page when a capacity is non-positive', () => {
    const rows = spellRows([spell('Bless', 1)])
    expect(paginateSpellRows(rows, 0, 10)).toEqual([rows])
    expect(paginateSpellRows(rows, 10, 0)).toEqual([rows])
  })
})

describe('session note pagination', () => {
  const note = (at: string, text: string, title?: string): CharacterNote => ({
    at,
    text,
    tags: ['session'],
    ...(title ? { title } : {}),
  })

  // A real recap from play — 17 bulleted beats, dense with [[wiki links]].
  const bryertown = note(
    '2026-08-13',
    [
      '- session started in [[Bryertown]] which is run by [[Baron Clayn Greenbane]]',
      '- he established the [[Thornwatch]]',
      '- the festival of thorns is to comemerate the defeat of the thorn queen 30 years ago',
      '- [[Elder Rothar Moss]] is the town elder',
      '- Berry sisters, [[Berryl]], [[Sherryl]], and [[Merryl]] - (out of character i feel like these 3 are hags)',
      '- Blacksmith of [[Bryertown]]: [[Edvard Trowl]]',
      '- Met 3 children: [[Iris]], [[Ellise]] and [[Lily]] and their mother [[Juniper]]',
      '- Helped [[Mischeif]] (Sparrows Character) out of a folk dance group',
      '- Helped [[Berryl]] move a table',
      '- Rolled 4x 18s in a row which is HUGE',
      '- i explain what Goodberry is to [[Melody]] (Aleighshas Character) she did not seem to comprehend it',
      '- I confiscate a training sword from a 4 year old child, [[Melody]] gave it back',
      '- I gave 2 gold pieces to [[Ivy]] (Elles Character) for the bale toss game',
      '- I notice bandits robbing the blacksmiths stall during the game',
      '- Combat ensued i killed 2 [[Boot Bandits]] and took one in for questioning',
      '- [[Clayn]] cut his hand off and sent him away then gave us a mission to hunt them down',
      '- Ate a goodberry pie which gives me + 10 HP for 1 week',
    ].join('\n'),
    'Festival of Thorns',
  )

  it('fits a full session recap on one page', () => {
    // 17 beats plus card chrome. If this ever spills to two pages the budget
    // has drifted — a recap this size is the common case, not the extreme.
    expect(paginateNotes([bryertown], 54)).toHaveLength(1)
  })

  it('does not count wiki-link brackets, which never print', () => {
    const linked = note(
      '2026-08-13',
      '- Met [[Baron Clayn Greenbane|the Baron]]',
    )
    const plain = note('2026-08-13', '- Met the Baron')
    expect(noteCost(linked)).toBe(noteCost(plain))
  })

  it('costs a blank line less than a line of text', () => {
    const spaced = note('2026-08-13', 'one\n\ntwo')
    const tight = note('2026-08-13', 'one\ntwo')
    expect(noteCost(spaced)).toBeGreaterThan(noteCost(tight))
    expect(noteCost(spaced) - noteCost(tight)).toBeLessThan(1)
  })

  it('splits a long run of notes across pages, losing none', () => {
    const many = nums(8).map((i) => note(`2026-08-0${i % 9}`, `beat ${i}`))
    const pages = paginateNotes(many, 12)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.flat()).toEqual(many)
  })

  it('gives an oversized note its own page rather than looping', () => {
    const huge = note(
      '2026-08-13',
      nums(200)
        .map((i) => `- beat ${i}`)
        .join('\n'),
    )
    const pages = paginateNotes([huge, note('2026-08-12', 'short')], 54)
    expect(pages[0]).toEqual([huge])
    expect(pages.flat()).toHaveLength(2)
  })

  it('yields no pages for an empty list, one for a non-positive budget', () => {
    expect(paginateNotes([], 54)).toEqual([])
    const one = [note('2026-08-13', 'x')]
    expect(paginateNotes(one, 0)).toEqual([one])
  })
})
