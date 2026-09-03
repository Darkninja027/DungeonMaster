import { beforeEach, describe, expect, it } from 'vitest'
import {
  apply,
  guestSnapshot,
  normalizeAddress,
  resetGuestForTest,
} from './guestStore'
import { clearRollLog, rollLogSnapshot } from './rollLog'

/**
 * Frames arrive from the HOST — another machine — so every one is checked
 * before it reaches state. These cover the checking, not the transport.
 */

describe('normalizeAddress', () => {
  it('adds the default port when none is given', () => {
    expect(normalizeAddress('192.168.1.42')).toBe('192.168.1.42:7777')
  })

  it('keeps an explicit port', () => {
    expect(normalizeAddress('192.168.1.42:9000')).toBe('192.168.1.42:9000')
  })

  it('strips a scheme and trailing slashes someone pasted', () => {
    expect(normalizeAddress('http://192.168.1.42:9000/')).toBe(
      '192.168.1.42:9000',
    )
    expect(normalizeAddress('  https://dm-laptop  ')).toBe('dm-laptop:7777')
  })
})

describe('applying host frames', () => {
  beforeEach(() => {
    resetGuestForTest()
    clearRollLog()
  })

  it('ignores a frame with an unknown kind', () => {
    expect(() => apply({ kind: 'nonsense', payload: {} })).not.toThrow()
  })

  it('ignores a malformed shown payload rather than blanking the screen', () => {
    apply({
      kind: 'shown',
      payload: { articleId: 'A', content: 'x', title: 'T' },
    })
    apply({ kind: 'shown', payload: { articleId: 42 } })
    apply({ kind: 'shown', payload: 'nonsense' })
    // The last GOOD value must survive a bad frame.
    expect(guestSnapshot().shown?.title).toBe('T')
  })

  it('clears the screen when the DM takes it down', () => {
    apply({
      kind: 'shown',
      payload: { articleId: 'A', content: 'x', title: 'T' },
    })
    expect(guestSnapshot().shown).not.toBeNull()
    // null is the DM stopping, and is meaningfully different from a malformed
    // frame: one clears the screen, the other leaves it alone.
    apply({ kind: 'shown', payload: null })
    expect(guestSnapshot().shown).toBeNull()
  })

  it('merges a replayed roll history on hello', () => {
    apply({
      kind: 'hello',
      payload: {
        seats: [],
        shown: null,
        combat: null,
        rolls: [
          { id: 'a', notation: '1d20', total: 15, detail: '15', at: 1 },
          { id: 'b', notation: '2d6', total: 7, detail: '3 + 4', at: 2 },
        ],
      },
    })
    expect(
      rollLogSnapshot()
        .map((r) => r.id)
        .sort(),
    ).toEqual(['a', 'b'])
  })

  it('drops malformed entries inside a replayed history', () => {
    apply({
      kind: 'hello',
      payload: {
        rolls: [
          { id: 'good', notation: '1d20', total: 15, detail: '15', at: 1 },
          { notation: 'no id', total: 3 },
          null,
          'nonsense',
        ],
      },
    })
    expect(rollLogSnapshot()).toHaveLength(1)
    expect(rollLogSnapshot()[0].id).toBe('good')
  })

  it('merges a single relayed roll', () => {
    apply({
      kind: 'roll',
      payload: { id: 'r1', notation: '1d8', total: 6, detail: '6', at: 5 },
    })
    expect(rollLogSnapshot()).toHaveLength(1)
  })

  it('ignores a roll missing its numbers', () => {
    apply({ kind: 'roll', payload: { id: 'r1', notation: '1d8' } })
    expect(rollLogSnapshot()).toHaveLength(0)
  })

  it('survives a hello with nothing in it', () => {
    expect(() => apply({ kind: 'hello', payload: {} })).not.toThrow()
    expect(() => apply({ kind: 'hello', payload: null })).not.toThrow()
  })
})
