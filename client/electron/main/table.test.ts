import { describe, expect, it } from 'vitest'
import {
  codeMatches,
  emptyTable,
  makeCode,
  normalizeCode,
  parseArticleId,
  parseJoin,
  parseRoll,
  parseSheetPatch,
  safeError,
  seatOwns,
  withCharacterClaimed,
  withSeatAdded,
  withSeatRemoved,
} from './table'

/**
 * These cover the decision-making half of LAN hosting. Everything here runs on
 * input that arrived from another machine, so the negative cases matter more
 * than the happy paths — a validator that accepts too much is the security bug.
 */

const seq = (values: Array<number>) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('room codes', () => {
  it('formats as XXX-XXX from the unambiguous alphabet', () => {
    const code = makeCode(seq([0]))
    expect(code).toBe('AAA-AAA')
    expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/)
  })

  it('never emits characters that are misread aloud', () => {
    for (let i = 0; i < 200; i++) {
      expect(makeCode()).not.toMatch(/[01OIL]/)
    }
  })

  it('accepts a code typed in any case or without the dash', () => {
    expect(codeMatches('ABC-234', 'abc234')).toBe(true)
    expect(codeMatches('ABC-234', 'ABC-234')).toBe(true)
    expect(codeMatches('ABC-234', 'abc-234')).toBe(true)
  })

  it('rejects a wrong code, including a prefix of the right one', () => {
    expect(codeMatches('ABC-234', 'ABC-235')).toBe(false)
    expect(codeMatches('ABC-234', 'ABC')).toBe(false)
    expect(codeMatches('ABC-234', '')).toBe(false)
  })

  it('normalizes away punctuation and spaces', () => {
    expect(normalizeCode(' a b c - 2 3 4 ')).toBe('ABC234')
  })
})

describe('seats', () => {
  const base = emptyTable('t1', 'ABC-234')

  it('suffixes a duplicate name rather than rejecting it', () => {
    let s = withSeatAdded(base, 'Sarah', 'a', 1)
    s = withSeatAdded(s, 'sarah', 'b', 2)
    expect(s.seats.map((x) => x.name)).toEqual(['Sarah', 'sarah 2'])
  })

  it('falls back to Guest for an empty name', () => {
    const s = withSeatAdded(base, '   ', 'a', 1)
    expect(s.seats[0].name).toBe('Guest')
  })

  it('removes a seat by id', () => {
    let s = withSeatAdded(base, 'Sarah', 'a', 1)
    s = withSeatAdded(s, 'Brok', 'b', 2)
    expect(withSeatRemoved(s, 'a').seats.map((x) => x.id)).toEqual(['b'])
  })
})

describe('character claims', () => {
  const twoSeats = withSeatAdded(
    withSeatAdded(emptyTable('t1', 'ABC-234'), 'Sarah', 'a', 1),
    'Brok',
    'b',
    2,
  )

  it('records a claim and grants write access', () => {
    const s = withCharacterClaimed(twoSeats, 'a', 'Characters/Thalia')
    expect(seatOwns(s, 'a', 'Characters/Thalia')).toBe(true)
  })

  it('refuses a second seat claiming a taken character', () => {
    let s = withCharacterClaimed(twoSeats, 'a', 'Characters/Thalia')
    s = withCharacterClaimed(s, 'b', 'Characters/Thalia')
    expect(seatOwns(s, 'a', 'Characters/Thalia')).toBe(true)
    expect(seatOwns(s, 'b', 'Characters/Thalia')).toBe(false)
  })

  it('lets a seat re-claim the character it already holds', () => {
    let s = withCharacterClaimed(twoSeats, 'a', 'Characters/Thalia')
    s = withCharacterClaimed(s, 'a', 'Characters/Thalia')
    expect(seatOwns(s, 'a', 'Characters/Thalia')).toBe(true)
  })

  it('denies write access to a character nobody claimed', () => {
    expect(seatOwns(twoSeats, 'a', 'Characters/Thalia')).toBe(false)
  })
})

describe('parseJoin', () => {
  it('accepts a well formed request', () => {
    expect(parseJoin({ code: 'ABC-234', name: 'Sarah' })).toEqual({
      code: 'ABC-234',
      name: 'Sarah',
    })
  })

  it('rejects non-objects and missing fields', () => {
    expect(parseJoin(null)).toBeNull()
    expect(parseJoin('ABC-234')).toBeNull()
    expect(parseJoin([])).toBeNull()
    expect(parseJoin({ code: 'ABC-234' })).toBeNull()
    expect(parseJoin({ code: 42, name: 'Sarah' })).toBeNull()
  })

  it('caps an absurd name', () => {
    const out = parseJoin({ code: 'A', name: 'x'.repeat(200) })
    expect(out?.name).toHaveLength(40)
  })
})

describe('parseArticleId', () => {
  it('accepts a normal world-relative id', () => {
    expect(parseArticleId('Characters/Thalia')).toBe('Characters/Thalia')
    expect(parseArticleId('Monsters/Goblin')).toBe('Monsters/Goblin')
  })

  it('refuses traversal and absolute paths', () => {
    expect(parseArticleId('../../secrets')).toBeNull()
    expect(parseArticleId('NPCs/../../etc/passwd')).toBeNull()
    expect(parseArticleId('C:/Windows/System32')).toBeNull()
    expect(parseArticleId('NPCs\\Strahd')).toBeNull()
    expect(parseArticleId('/etc/passwd')).toBeNull()
    expect(parseArticleId('NPCs/')).toBeNull()
  })

  it('refuses empty and non-string input', () => {
    expect(parseArticleId('')).toBeNull()
    expect(parseArticleId(null)).toBeNull()
    expect(parseArticleId(7)).toBeNull()
  })
})

describe('parseRoll', () => {
  const ok = {
    id: 'r1',
    notation: '1d20+5',
    total: 22,
    detail: '17 + 5',
    at: 1000,
  }

  it('accepts a well formed roll', () => {
    expect(parseRoll(ok)).toEqual(ok)
  })

  it('keeps an optional label and drops an absent one', () => {
    expect(parseRoll({ ...ok, label: 'Stealth' })?.label).toBe('Stealth')
    expect(parseRoll(ok)).not.toHaveProperty('label')
  })

  it('rejects missing or wrongly typed fields', () => {
    expect(parseRoll({ ...ok, total: 'lots' })).toBeNull()
    expect(parseRoll({ ...ok, id: '' })).toBeNull()
    expect(parseRoll({ ...ok, at: Number.NaN })).toBeNull()
    expect(parseRoll(null)).toBeNull()
  })

  it('rejects absurd values rather than storing them', () => {
    expect(parseRoll({ ...ok, total: 1e9 })).toBeNull()
    expect(parseRoll({ ...ok, notation: 'd'.repeat(64) })).toBeNull()
  })

  it('truncates an over-long detail instead of failing', () => {
    const out = parseRoll({ ...ok, detail: 'x'.repeat(9999) })
    expect(out?.detail).toHaveLength(512)
  })
})

describe('parseSheetPatch', () => {
  const id = 'Characters/Thalia'

  it('accepts the allowed fields', () => {
    const out = parseSheetPatch({
      characterId: id,
      patch: { hpCurrent: 17, hpTemp: 4, notes: 'poisoned' },
    })
    expect(out).toEqual({
      characterId: id,
      patch: { hpCurrent: 17, hpTemp: 4, notes: 'poisoned' },
    })
  })

  it('silently drops fields outside the allowlist', () => {
    const out = parseSheetPatch({
      characterId: id,
      patch: { hpCurrent: 5, level: 20, class: 'Wizard', abilities: {} },
    })
    expect(out?.patch).toEqual({ hpCurrent: 5 })
  })

  it('refuses a patch that would be empty after filtering', () => {
    expect(parseSheetPatch({ characterId: id, patch: { level: 20 } })).toBeNull()
    expect(parseSheetPatch({ characterId: id, patch: {} })).toBeNull()
  })

  it('clamps negative hp to zero and floors fractions', () => {
    const out = parseSheetPatch({
      characterId: id,
      patch: { hpCurrent: -12, hpTemp: 3.7 },
    })
    expect(out?.patch).toEqual({ hpCurrent: 0, hpTemp: 3 })
  })

  it('refuses a traversing character id', () => {
    expect(
      parseSheetPatch({ characterId: '../../etc', patch: { hpCurrent: 1 } }),
    ).toBeNull()
  })

  it('caps conditions in count and length', () => {
    const out = parseSheetPatch({
      characterId: id,
      patch: {
        conditions: [...Array(50).keys()].map(() => 'x'.repeat(99)),
      },
    })
    expect(out?.patch.conditions).toHaveLength(20)
    expect(out?.patch.conditions?.[0]).toHaveLength(40)
  })

  it('ignores non-string entries in conditions', () => {
    const out = parseSheetPatch({
      characterId: id,
      patch: { conditions: ['prone', 42, null, 'poisoned'] },
    })
    expect(out?.patch.conditions).toEqual(['prone', 'poisoned'])
  })
})

describe('safeError', () => {
  it('never leaks a filesystem path', () => {
    const err = new Error(
      'Not a world folder (missing world.json): C:\\Users\\Brent\\Worlds\\Barovia',
    )
    expect(safeError(err)).toBe('Request failed')
  })

  it('passes through a plain hand-written phrase', () => {
    expect(safeError(new Error('Wrong room code'))).toBe('Wrong room code')
  })

  it('handles a non-Error throw', () => {
    expect(safeError('C:\\secrets')).toBe('Request failed')
    expect(safeError(undefined)).toBe('Request failed')
  })
})
