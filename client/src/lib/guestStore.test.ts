import { beforeEach, describe, expect, it } from 'vitest'
import {
  apply,
  guestSnapshot,
  normalizeBaseUrl,
  resetGuestForTest,
} from './guestStore'
import { clearRollLog, rollLogSnapshot } from './rollLog'

/**
 * Frames arrive from the HOST — another machine — so every one is checked
 * before it reaches state. These cover the checking, not the transport.
 */

describe('normalizeBaseUrl', () => {
  it('adds the default port and scheme to a bare host', () => {
    expect(normalizeBaseUrl('192.168.1.42')).toBe('http://192.168.1.42:7777')
    expect(normalizeBaseUrl('dm-laptop')).toBe('http://dm-laptop:7777')
  })

  it('keeps an explicit port', () => {
    expect(normalizeBaseUrl('192.168.1.42:9000')).toBe(
      'http://192.168.1.42:9000',
    )
  })

  it('PRESERVES an explicit scheme rather than stripping it', () => {
    // The old behaviour stripped this and hardcoded http://, which made a TLS
    // host impossible to reach at all.
    expect(normalizeBaseUrl('https://box.tailnet.ts.net')).toBe(
      'https://box.tailnet.ts.net',
    )
    expect(normalizeBaseUrl('http://192.168.1.42:9000/')).toBe(
      'http://192.168.1.42:9000',
    )
  })

  it('appends no port to an explicit https host, so 443 is used', () => {
    // Pinning :7777 onto a tunnel or reverse-proxy URL would break it.
    expect(normalizeBaseUrl('https://dm.example.com')).toBe(
      'https://dm.example.com',
    )
    // ...but an explicit port on https is still honoured.
    expect(normalizeBaseUrl('https://dm.example.com:8443')).toBe(
      'https://dm.example.com:8443',
    )
  })

  it('still defaults the port for an explicit http host', () => {
    expect(normalizeBaseUrl('http://192.168.1.42')).toBe(
      'http://192.168.1.42:7777',
    )
  })

  it('drops a path and trailing slashes', () => {
    expect(normalizeBaseUrl('http://192.168.1.42:9000/join/')).toBe(
      'http://192.168.1.42:9000',
    )
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeBaseUrl('  192.168.1.42  ')).toBe(
      'http://192.168.1.42:7777',
    )
  })

  it('handles a bracketed IPv6 address', () => {
    // Tailscale hands these out; the old regex port test got them wrong.
    expect(normalizeBaseUrl('[fd7a:115c:a1e0::1]')).toBe(
      'http://[fd7a:115c:a1e0::1]:7777',
    )
    expect(normalizeBaseUrl('[fd7a:115c:a1e0::1]:9000')).toBe(
      'http://[fd7a:115c:a1e0::1]:9000',
    )
  })

  it('refuses a scheme that is not http or https', () => {
    // This string is concatenated into fetch() and EventSource() URLs, so an
    // unvalidated scheme is an injection surface rather than a typo.
    expect(normalizeBaseUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeBaseUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeBaseUrl('ws://192.168.1.42:7777')).toBeNull()
  })

  it('refuses credentials and a query string', () => {
    expect(normalizeBaseUrl('http://user:pass@192.168.1.42:7777')).toBeNull()
    expect(normalizeBaseUrl('http://192.168.1.42:7777/?token=x')).toBeNull()
  })

  it('refuses empty or unparseable input', () => {
    expect(normalizeBaseUrl('')).toBeNull()
    expect(normalizeBaseUrl('   ')).toBeNull()
    expect(normalizeBaseUrl('http://')).toBeNull()
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
