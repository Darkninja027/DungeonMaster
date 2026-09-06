import { describe, expect, it } from 'vitest'
import {
  MAX_PENDING,
  MAX_SEATS,
  PENDING_TTL_MS,
  canSeat,
  codeMatches,
  emptyTable,
  isPrivateAddress,
  isTailscaleAddress,
  makeRemoteSecret,
  makeCode,
  normalizeCode,
  parseArticleId,
  parseJoin,
  parseRoll,
  parseSheetPatch,
  pruneAttempts,
  safeError,
  secretMatches,
  seatOwns,
  withCharacterClaimed,
  waitingJoins,
  withPendingAdded,
  withPendingAnswered,
  withPendingPruned,
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
      patch: { hpCurrent: 17, hpTemp: 4 },
    })
    expect(out).toEqual({
      characterId: id,
      patch: { hpCurrent: 17, hpTemp: 4 },
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
    expect(
      parseSheetPatch({ characterId: id, patch: { level: 20 } }),
    ).toBeNull()
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

  it('drops conditions and notes, which the sheet cannot store as scalars', () => {
    // Character has no conditions field, and its notes are structured entries.
    // Accepting either here would 200 and then silently discard the change.
    const out = parseSheetPatch({
      characterId: id,
      patch: { hpCurrent: 5, conditions: ['prone'], notes: 'poisoned' },
    })
    expect(out?.patch).toEqual({ hpCurrent: 5 })
  })
})

describe('pruneAttempts', () => {
  const rec = (until: number, n = 1) => ({ n, until })

  it('drops records whose window has passed and keeps live ones', () => {
    const attempts = new Map([
      ['10.0.0.1', rec(500)],
      ['10.0.0.2', rec(1500)],
      ['10.0.0.3', rec(1000)], // exactly now: not yet expired
    ])
    pruneAttempts(attempts, 1000)
    expect([...attempts.keys()]).toEqual(['10.0.0.2', '10.0.0.3'])
  })

  it('preserves the count on a record it keeps', () => {
    const attempts = new Map([['10.0.0.1', rec(2000, 7)]])
    pruneAttempts(attempts, 1000)
    expect(attempts.get('10.0.0.1')?.n).toBe(7)
  })

  it('caps the map when a burst of live addresses outruns expiry', () => {
    // The case a sweep alone cannot handle: every record is in-window, so
    // nothing expires, and without the ceiling the map grows without limit.
    const attempts = new Map<string, { n: number; until: number }>()
    for (let i = 0; i < 50; i++) attempts.set(`10.0.0.${i}`, rec(1000 + i))
    pruneAttempts(attempts, 0, 10)
    expect(attempts.size).toBe(10)
    // Oldest-first: the ten closest to expiring are the ones that went.
    expect(attempts.has('10.0.0.0')).toBe(false)
    expect(attempts.has('10.0.0.39')).toBe(false)
    expect(attempts.has('10.0.0.40')).toBe(true)
    expect(attempts.has('10.0.0.49')).toBe(true)
  })

  it('leaves a map already under the cap alone', () => {
    const attempts = new Map([['10.0.0.1', rec(2000)]])
    pruneAttempts(attempts, 1000, 10)
    expect(attempts.size).toBe(1)
  })

  it('handles an empty map', () => {
    const attempts = new Map<string, { n: number; until: number }>()
    expect(() => pruneAttempts(attempts, 1000, 10)).not.toThrow()
    expect(attempts.size).toBe(0)
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

describe('isPrivateAddress', () => {
  it('accepts loopback', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true)
    expect(isPrivateAddress('127.1.2.3')).toBe(true)
    expect(isPrivateAddress('::1')).toBe(true)
  })

  it('accepts the RFC1918 ranges', () => {
    expect(isPrivateAddress('10.0.0.1')).toBe(true)
    expect(isPrivateAddress('10.255.255.255')).toBe(true)
    expect(isPrivateAddress('192.168.1.5')).toBe(true)
    expect(isPrivateAddress('172.16.0.1')).toBe(true)
    expect(isPrivateAddress('172.31.255.255')).toBe(true)
  })

  it('gets the 172.16/12 boundaries right', () => {
    // The classic off-by-one: the range is 172.16-172.31, not 172.16-172.32
    // and not all of 172/8.
    expect(isPrivateAddress('172.15.255.255')).toBe(false)
    expect(isPrivateAddress('172.32.0.1')).toBe(false)
    expect(isPrivateAddress('172.0.0.1')).toBe(false)
  })

  it('accepts link-local and Tailscale', () => {
    expect(isPrivateAddress('169.254.1.1')).toBe(true)
    expect(isPrivateAddress('100.64.0.1')).toBe(true)
    expect(isPrivateAddress('100.127.255.255')).toBe(true)
  })

  it('gets the Tailscale 100.64/10 boundaries right', () => {
    expect(isPrivateAddress('100.63.255.255')).toBe(false)
    expect(isPrivateAddress('100.128.0.1')).toBe(false)
  })

  it('rejects ordinary public addresses', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false)
    expect(isPrivateAddress('203.0.113.5')).toBe(false)
    expect(isPrivateAddress('1.1.1.1')).toBe(false)
  })

  it('unwraps an IPv4-mapped IPv6 peer', () => {
    // Node reports this shape on a dual-stack socket.
    expect(isPrivateAddress('::ffff:192.168.1.5')).toBe(true)
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false)
  })

  it('accepts IPv6 unique-local and link-local', () => {
    expect(isPrivateAddress('fd7a:115c:a1e0::1')).toBe(true)
    expect(isPrivateAddress('fc00::1')).toBe(true)
    expect(isPrivateAddress('fe80::1%eth0')).toBe(true)
  })

  it('rejects a public IPv6 address', () => {
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false)
  })

  it('rejects malformed input rather than guessing', () => {
    expect(isPrivateAddress('')).toBe(false)
    expect(isPrivateAddress('not an address')).toBe(false)
    expect(isPrivateAddress('10.0.0')).toBe(false)
    expect(isPrivateAddress('10.0.0.999')).toBe(false)
    expect(isPrivateAddress('10.0.0.1.5')).toBe(false)
  })
})

describe('isTailscaleAddress', () => {
  it('recognises the CGNAT range and nothing else', () => {
    expect(isTailscaleAddress('100.64.0.1')).toBe(true)
    expect(isTailscaleAddress('100.101.102.103')).toBe(true)
    expect(isTailscaleAddress('100.127.255.255')).toBe(true)
    expect(isTailscaleAddress('100.63.0.1')).toBe(false)
    expect(isTailscaleAddress('100.128.0.1')).toBe(false)
    expect(isTailscaleAddress('192.168.1.5')).toBe(false)
    expect(isTailscaleAddress('garbage')).toBe(false)
  })
})

describe('canSeat', () => {
  it('fills up to the cap and then refuses', () => {
    let state = emptyTable('t1', 'ABC-234')
    for (let i = 0; i < MAX_SEATS; i++) {
      expect(canSeat(state)).toBe(true)
      state = withSeatAdded(state, `G${i}`, `s${i}`, i)
    }
    expect(canSeat(state)).toBe(false)
  })

  it('takes an explicit maximum', () => {
    const state = withSeatAdded(emptyTable('t1', 'ABC-234'), 'Sarah', 'a', 1)
    expect(canSeat(state, 1)).toBe(false)
    expect(canSeat(state, 2)).toBe(true)
  })
})

describe('the remote secret', () => {
  it('is longer than the room code and from the same alphabet', () => {
    const secret = makeRemoteSecret()
    expect(secret).toHaveLength(16)
    expect(secret).toMatch(/^[A-Z2-9]+$/)
    expect(secret).not.toMatch(/[01OIL]/)
  })

  it('matches case-insensitively and rejects a near miss', () => {
    const secret = makeRemoteSecret()
    expect(secretMatches(secret, secret.toLowerCase())).toBe(true)
    expect(secretMatches(secret, secret.slice(0, -1))).toBe(false)
    expect(secretMatches(secret, `${secret}A`)).toBe(false)
    expect(secretMatches(secret, '')).toBe(false)
  })
})

describe('pending joins', () => {
  const add = (list: ReturnType<typeof withPendingAdded>, t: string, at = 0) =>
    withPendingAdded(list, t, `Guest ${t}`, at)

  it('records a request as waiting', () => {
    const list = withPendingAdded([], 'tk1', 'Sarah', 100)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      ticket: 'tk1',
      name: 'Sarah',
      status: 'waiting',
    })
    expect(waitingJoins(list)).toHaveLength(1)
  })

  it('falls back to Guest for an empty name and caps a long one', () => {
    expect(withPendingAdded([], 'tk1', '   ', 0)[0].name).toBe('Guest')
    expect(withPendingAdded([], 'tk2', 'x'.repeat(99), 0)[0].name).toHaveLength(
      40,
    )
  })

  it('carries the seat identity through approval', () => {
    let list = withPendingAdded([], 'tk1', 'Sarah', 0)
    list = withPendingAnswered(list, 'tk1', 'approved', {
      seatId: 's1',
      token: 'tok',
    })
    expect(list[0]).toMatchObject({
      status: 'approved',
      seatId: 's1',
      token: 'tok',
    })
    expect(waitingJoins(list)).toHaveLength(0)
  })

  it('records a denial with no seat', () => {
    let list = withPendingAdded([], 'tk1', 'Sarah', 0)
    list = withPendingAnswered(list, 'tk1', 'denied')
    expect(list[0].status).toBe('denied')
    expect(list[0].seatId).toBeUndefined()
  })

  it('never answers the same ticket twice', () => {
    // Otherwise one request could mint two seats: the DM double-clicks, or the
    // poll and the click race.
    let list = withPendingAdded([], 'tk1', 'Sarah', 0)
    list = withPendingAnswered(list, 'tk1', 'approved', {
      seatId: 's1',
      token: 'tok1',
    })
    list = withPendingAnswered(list, 'tk1', 'approved', {
      seatId: 's2',
      token: 'tok2',
    })
    expect(list[0].seatId).toBe('s1')
    list = withPendingAnswered(list, 'tk1', 'denied')
    expect(list[0].status).toBe('approved')
  })

  it('ignores an unknown ticket', () => {
    const list = withPendingAdded([], 'tk1', 'Sarah', 0)
    expect(withPendingAnswered(list, 'nope', 'approved')).toEqual(list)
  })

  it('prunes what has aged out', () => {
    let list = add(add([], 'old', 0), 'new', PENDING_TTL_MS)
    list = withPendingPruned(list, PENDING_TTL_MS + 1)
    expect(list.map((x) => x.ticket)).toEqual(['new'])
  })

  it('caps the queue oldest-first', () => {
    let list: ReturnType<typeof withPendingAdded> = []
    for (let i = 0; i < MAX_PENDING + 5; i++)
      list = add(list, `t${i}`, 1000 + i)
    const pruned = withPendingPruned(list, 1000)
    expect(pruned).toHaveLength(MAX_PENDING)
    expect(pruned[0].ticket).toBe('t5')
  })

  it('cannot be answered once it has been pruned away', () => {
    // A ticket the DM approves after it expired must not resurrect.
    let list = withPendingAdded([], 'tk1', 'Sarah', 0)
    list = withPendingPruned(list, PENDING_TTL_MS + 1)
    expect(list).toHaveLength(0)
    expect(withPendingAnswered(list, 'tk1', 'approved')).toHaveLength(0)
  })
})
