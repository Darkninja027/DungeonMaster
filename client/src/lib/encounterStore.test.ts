import { describe, expect, it } from 'vitest'
import {
  dropEncounter,
  emptyEncounters,
  monsterCount,
  parseEncounters,
  sortedEncounters,
  upsertEncounter,
} from './encounterStore'
import type { EncounterFile, SavedEncounter } from './encounterStore'

/**
 * `.dm/encounters.json` is a file people can hand-edit, and it sits beside a
 * world folder that travels. So the parse has to be tolerant in the same way
 * the template store's is: one bad row must never cost someone every other
 * encounter they prepared.
 */

function entry(over: Partial<SavedEncounter> = {}): SavedEncounter {
  return {
    id: 'a1',
    name: 'Goblin Ambush',
    counts: { 'w1:Monsters/Goblin': 4 },
    party: ['Characters/Verron'],
    savedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function fileOf(...encounters: Array<SavedEncounter>): EncounterFile {
  return { version: 1, encounters }
}

describe('parseEncounters', () => {
  it('reads a well-formed file', () => {
    const parsed = parseEncounters({ version: 1, encounters: [entry()] })
    expect(parsed.encounters).toHaveLength(1)
    expect(parsed.encounters[0].counts).toEqual({ 'w1:Monsters/Goblin': 4 })
  })

  it('falls back to empty for junk rather than throwing', () => {
    expect(parseEncounters(null)).toEqual(emptyEncounters())
    expect(parseEncounters('nope')).toEqual(emptyEncounters())
    expect(parseEncounters({})).toEqual(emptyEncounters())
    expect(parseEncounters({ encounters: 'no' })).toEqual(emptyEncounters())
  })

  it('drops unusable rows but keeps the good ones', () => {
    const parsed = parseEncounters({
      encounters: [
        entry({ id: 'keep', name: 'Real' }),
        { id: '', name: 'No id' },
        { id: 'x', name: '   ' }, // blank name
        null,
        'string',
        entry({ id: 'keep2', name: 'Also real' }),
      ],
    })
    expect(parsed.encounters.map((e) => e.name)).toEqual(['Real', 'Also real'])
  })

  it('keeps the first of two rows sharing an id', () => {
    const parsed = parseEncounters({
      encounters: [entry({ name: 'First' }), entry({ name: 'Second' })],
    })
    expect(parsed.encounters).toHaveLength(1)
    expect(parsed.encounters[0].name).toBe('First')
  })

  it('discards counts that are not a fieldable number of monsters', () => {
    const parsed = parseEncounters({
      encounters: [
        entry({
          counts: {
            good: 3,
            zero: 0,
            negative: -2,
            fractional: 2.7,
            text: 'four' as unknown as number,
            nan: Number.NaN,
          },
        }),
      ],
    })
    // Fractional floors rather than drops: 2.7 goblins is a typo, not nothing.
    expect(parsed.encounters[0].counts).toEqual({ good: 3, fractional: 2 })
  })

  it('tolerates a missing party or counts', () => {
    const parsed = parseEncounters({
      encounters: [{ id: 'a', name: 'Bare' }],
    })
    expect(parsed.encounters[0]).toMatchObject({ counts: {}, party: [] })
  })
})

describe('upsertEncounter', () => {
  it('appends a new name', () => {
    const next = upsertEncounter(fileOf(entry()), {
      name: 'Wolf Pack',
      counts: {},
      party: [],
      savedAt: '2026-02-01T00:00:00.000Z',
    })
    expect(next.encounters.map((e) => e.name)).toEqual([
      'Goblin Ambush',
      'Wolf Pack',
    ])
  })

  it('replaces a same-name encounter in place, keeping its id', () => {
    // Saving twice under one name is an update, not a second row a DM has to
    // tell apart mid-session.
    const next = upsertEncounter(fileOf(entry({ id: 'original' })), {
      name: 'goblin ambush', // different case on purpose
      counts: { 'w1:Monsters/Goblin': 9 },
      party: [],
      savedAt: '2026-03-01T00:00:00.000Z',
    })
    expect(next.encounters).toHaveLength(1)
    expect(next.encounters[0].id).toBe('original')
    expect(next.encounters[0].counts).toEqual({ 'w1:Monsters/Goblin': 9 })
  })

  it('trims the stored name', () => {
    const next = upsertEncounter(emptyEncounters(), {
      name: '  Spaced  ',
      counts: {},
      party: [],
      savedAt: '',
    })
    expect(next.encounters[0].name).toBe('Spaced')
  })
})

describe('dropEncounter', () => {
  it('removes only the named id', () => {
    const file = fileOf(entry({ id: 'a' }), entry({ id: 'b', name: 'Other' }))
    expect(dropEncounter(file, 'a').encounters.map((e) => e.id)).toEqual(['b'])
  })
})

describe('sortedEncounters', () => {
  it('lists newest first', () => {
    const file = fileOf(
      entry({ id: 'old', name: 'Old', savedAt: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'new', name: 'New', savedAt: '2026-06-01T00:00:00.000Z' }),
    )
    expect(sortedEncounters(file).map((e) => e.name)).toEqual(['New', 'Old'])
  })
})

describe('monsterCount', () => {
  it('sums every stack', () => {
    expect(monsterCount(entry({ counts: { a: 4, b: 2 } }))).toBe(6)
    expect(monsterCount(entry({ counts: {} }))).toBe(0)
  })
})
