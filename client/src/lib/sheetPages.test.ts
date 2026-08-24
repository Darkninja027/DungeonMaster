import { describe, expect, it } from 'vitest'
import type { CharacterNote, ClassFeature, Spell } from './character'
import {
  SPELL_CARD_LINES,
  featureCost,
  featureRows,
  isTallSpellCard,
  noteCost,
  paginate,
  paginateFeatureRows,
  paginateNotes,
  paginateSpellCards,
  paginateSpellRows,
  spellCardCost,
  spellRows,
} from './sheetPages'
import type { SpellCard } from './spellCard'

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

describe('spell card pagination', () => {
  const card = (over: Partial<SpellCard> = {}): SpellCard => ({
    name: 'Fireball',
    level: 3,
    school: 'evocation',
    ritual: false,
    stats: [
      { label: 'Casting Time', value: '1 action' },
      { label: 'Range', value: '150 feet' },
      { label: 'Components', value: 'V, S, M (A tiny ball of bat guano.)' },
      { label: 'Duration', value: 'Instantaneous' },
    ],
    description: 'A bright streak flashes from your pointing finger.',
    ...over,
  })

  // Fireball's real description: 662 characters is the corpus median, so this
  // is the card the budget has to seat five of.
  const median = card({
    description: [
      'A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one. The fire spreads around corners. It ignites flammable objects in the area that are not being worn or carried.',
      '',
      '**At Higher Levels.** When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.',
    ].join('\n'),
  })

  it('costs a card by how much description it carries', () => {
    const short = card({ description: 'It goes bang.' })
    const long = card({
      description: Array.from({ length: 12 }, () => 'x'.repeat(60)).join('\n'),
    })
    expect(spellCardCost(long)).toBeGreaterThan(spellCardCost(short))
  })

  it('charges a wrapping Components row more than a one-line one', () => {
    // Symbol's material components run 138 characters — three lines in a 337px
    // column, not one. Charging every row a flat 1 under-counts exactly the
    // high-level cards that are already the tightest, and it clips silently.
    const short = card({
      stats: [{ label: 'Components', value: 'V, S' }],
    })
    const wrapping = card({
      stats: [
        {
          label: 'Components',
          value:
            'V, S, M (Mercury, phosphorus, and powdered diamond and opal with a total value of at least 1,000 gp, which the spell consumes)',
        },
      ],
    })
    expect(spellCardCost(wrapping)).toBeGreaterThan(spellCardCost(short) + 1.5)
  })

  it('charges a card with no stat block less than one with four rows', () => {
    expect(spellCardCost(card({ stats: [] }))).toBeLessThan(
      spellCardCost(card()),
    )
  })

  it('charges a blank line less than a line of text', () => {
    const blank = card({ description: 'a\n\nb' })
    const filled = card({ description: `a\n${'x'.repeat(60)}\nb` })
    expect(spellCardCost(blank)).toBeLessThan(spellCardCost(filled))
  })

  it('does not count wiki-link brackets, which never print', () => {
    const linked = card({ description: 'As [[Fireball|the classic blast]].' })
    const plain = card({ description: 'As the classic blast.' })
    expect(spellCardCost(linked)).toBe(spellCardCost(plain))
  })

  it('estimates a median card close to how it really renders', () => {
    // 662 characters of description over two columns is ~11 lines, plus the
    // name, subtitle, four stat rows and the chrome.
    const cost = spellCardCost(median)
    expect(cost).toBeGreaterThan(16)
    expect(cost).toBeLessThan(26)
  })

  it('fits five median cards on a full page', () => {
    // The budget-drift canary, against the REAL budget rather than a copy of
    // it — restating the number here is what let this drift from the renderer
    // once already. A median card costs ~19.6 (measured across all 987 bundled
    // articles), so a page seats five with room to spare. If this ever needs
    // two pages, the cost model or the budget has moved and the printed page
    // count will balloon.
    expect(
      paginateSpellCards(
        Array.from({ length: 5 }, () => median),
        SPELL_CARD_LINES,
      ),
    ).toHaveLength(1)
  })

  it('yields no pages for an empty list', () => {
    expect(paginateSpellCards([], 100)).toEqual([])
  })

  it('splits a long list across pages, losing nothing', () => {
    const cards = Array.from({ length: 17 }, (_, i) =>
      card({ name: `Spell ${i}`, description: median.description }),
    )
    const pages = paginateSpellCards(cards, 100)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.flat()).toEqual(cards)
  })

  it('gives a card bigger than a whole page its own page rather than looping', () => {
    // The PAGE-level oversize path, which is a different threshold from
    // isTallSpellCard's column-level one below: this card exceeds the whole
    // budget, not merely half of it.
    const huge = card({
      name: 'Prismatic Wall',
      description: Array.from({ length: 90 }, () => 'x'.repeat(60)).join('\n'),
    })
    const pages = paginateSpellCards([card(), huge, card()], 100)
    expect(pages.flat()).toHaveLength(3)
    expect(pages.some((p) => p.length === 1 && p[0] === huge)).toBe(true)
  })

  it('does not hang on a non-positive budget', () => {
    const cards = [card(), card()]
    expect(paginateSpellCards(cards, 0)).toEqual([cards])
    expect(paginateSpellCards(cards, -5)).toEqual([cards])
  })

  /**
   * The regression guard for the clip this feature actually shipped with.
   *
   * Cards are atomic, so a card that doesn't fit the space left in a column is
   * pushed whole into the next one and the remainder is stranded. A paginator
   * that only tracks a flat page total can't see that: it fills the page to
   * budget, the strand pushes everything down, and the last card is clipped off
   * the bottom of the second column. Prestidigitation lost its final bullet
   * exactly this way in the running app.
   */
  describe('column-aware packing', () => {
    /**
     * Replays the layout the browser performs: fill column 1, then column 2,
     * then the page is full. Returns the number of columns a page really needs,
     * so > 2 means it clips.
     */
    const columnsNeeded = (page: Array<SpellCard>, budget: number) => {
      const col = budget / 2
      let used = 0
      let columns = 1
      for (const c of page) {
        const cost = spellCardCost(c)
        if (cost > col) {
          used += cost
          while (used > col * columns) columns++
          continue
        }
        if (used + cost > col * columns) {
          columns++
          used = col * (columns - 1) + cost
        } else used += cost
      }
      return columns
    }

    it('never emits a page needing more than two columns', () => {
      // A run of awkward sizes: each is a little over a third of a column, so a
      // flat page budget seats three per column on paper and two in reality.
      const budget = 126
      const awkward = Array.from({ length: 24 }, (_, i) =>
        card({
          name: `Spell ${i}`,
          description: Array.from({ length: 14 + (i % 5) * 3 }, () =>
            'x'.repeat(60),
          ).join('\n'),
        }),
      )
      const pages = paginateSpellCards(awkward, budget)
      for (const page of pages) {
        expect(columnsNeeded(page, budget)).toBeLessThanOrEqual(2)
      }
      expect(pages.flat()).toEqual(awkward)
    })

    it('charges the space a card strands when it will not fit a column', () => {
      // Two cards at 0.6 of a column each. They cannot share a column, so this
      // is a full page — even though 1.2 columns is well under the 2.0 budget a
      // flat total would compare against.
      const budget = 100
      const big = card({
        description: Array.from({ length: 26 }, () => 'x'.repeat(60)).join(
          '\n',
        ),
      })
      expect(spellCardCost(big)).toBeGreaterThan(budget / 2 / 2)
      expect(spellCardCost(big)).toBeLessThan(budget / 2)
      const pages = paginateSpellCards([big, big, big], budget)
      expect(pages).toHaveLength(2)
      expect(pages[0]).toHaveLength(2)
    })

    it('lets a tall card flow across the seam instead of starting a column', () => {
      // A breaking card needs contiguous room, not a fresh column, so a short
      // card ahead of it still shares the page.
      const budget = 126
      const tall = card({
        name: 'Summon Fiend',
        description: Array.from({ length: 60 }, () => 'x'.repeat(60)).join(
          '\n',
        ),
      })
      expect(isTallSpellCard(tall, budget)).toBe(true)
      const pages = paginateSpellCards([card(), tall], budget)
      expect(pages).toHaveLength(1)
      expect(pages[0]).toHaveLength(2)
    })
  })

  describe('isTallSpellCard', () => {
    /**
     * The escape hatch that lets a card break across a column, and the one
     * thing standing between "cards are atomic" and the silent clip that
     * atomicity reintroduces. Its whole value is being NARROW: if it were to
     * return true for ordinary cards, every card would break again and the bug
     * it exists beside would be back with no test failing.
     */
    it('is false for a median card — the escape hatch is not the default', () => {
      // The most important assertion in this block. A median card costs ~19.6
      // against a half-page of 63, so it is nowhere near tall.
      expect(isTallSpellCard(median, SPELL_CARD_LINES)).toBe(false)
      expect(isTallSpellCard(card(), SPELL_CARD_LINES)).toBe(false)
    })

    it('is true for a card taller than one column', () => {
      // Shaped like the real cluster this exists for: the Summon X family,
      // whose stat blocks carry whole tables. Summon Fiend costs 82 against a
      // column of 63.
      const summon = card({
        name: 'Summon Fiend',
        description: Array.from({ length: 60 }, () => 'x'.repeat(60)).join(
          '\n',
        ),
      })
      expect(spellCardCost(summon)).toBeGreaterThan(SPELL_CARD_LINES / 2)
      expect(isTallSpellCard(summon, SPELL_CARD_LINES)).toBe(true)
    })

    it('still packs a tall card onto a page beside its neighbours', () => {
      // The gap the suite had: a card can exceed a COLUMN while fitting a PAGE
      // comfortably, so the page-level oversize path never fires for it. That
      // is precisely the case that used to clip.
      const summon = card({
        name: 'Summon Fiend',
        description: Array.from({ length: 60 }, () => 'x'.repeat(60)).join(
          '\n',
        ),
      })
      expect(isTallSpellCard(summon, SPELL_CARD_LINES)).toBe(true)
      const pages = paginateSpellCards([summon, card()], SPELL_CARD_LINES)
      expect(pages).toHaveLength(1)
      expect(pages[0]).toHaveLength(2)
    })

    it('splits exactly at half the budget', () => {
      const cost = spellCardCost(median)
      // Just under half the budget is not tall; just over is.
      expect(isTallSpellCard(median, cost * 2 + 0.1)).toBe(false)
      expect(isTallSpellCard(median, cost * 2 - 0.1)).toBe(true)
    })

    it('is relative to the budget, not a fixed height', () => {
      expect(isTallSpellCard(median, 10)).toBe(true)
      expect(isTallSpellCard(median, 1000)).toBe(false)
    })
  })
})
