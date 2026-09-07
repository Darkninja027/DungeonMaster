import { afterEach, describe, expect, it } from 'vitest'
import {
  decodeBeacon,
  encodeBeacon,
  findTable,
  startBeacon,
  stopBeacon,
} from './beacon'

/**
 * Discovery is what lets a guest type a room code and nothing else. The codec
 * is pure and covered exhaustively; the round trip is exercised over a real UDP
 * socket, because a beacon that encodes correctly and never actually arrives is
 * the failure that matters.
 */

describe('beacon codec', () => {
  it('round-trips a code and port', () => {
    const frame = decodeBeacon(encodeBeacon('ABC-234', 7777))
    expect(frame).toEqual({ code: 'ABC234', port: 7777 })
  })

  it('normalises the code so a dash on either side does not matter', () => {
    expect(decodeBeacon(encodeBeacon('abc-234', 80))?.code).toBe('ABC234')
  })

  it('ignores traffic that is not ours', () => {
    // Anything on the LAN can send to this port.
    expect(decodeBeacon('hello')).toBeNull()
    expect(decodeBeacon('')).toBeNull()
    expect(decodeBeacon('OTHER ABC234 7777')).toBeNull()
    expect(decodeBeacon('DMTBL1 ABC234')).toBeNull()
    expect(decodeBeacon('DMTBL1 ABC234 7777 extra')).toBeNull()
  })

  it('rejects a malformed code or port', () => {
    expect(decodeBeacon('DMTBL1 abc-234 7777')).toBeNull() // not normalised
    expect(decodeBeacon('DMTBL1 AB 7777')).toBeNull() // too short
    expect(decodeBeacon('DMTBL1 ABC234 0')).toBeNull()
    expect(decodeBeacon('DMTBL1 ABC234 99999')).toBeNull()
    expect(decodeBeacon('DMTBL1 ABC234 http')).toBeNull()
  })

  it('carries nothing but the code and port', () => {
    // A beacon is audible to everything on the wifi, so it must not leak what
    // the session is about.
    const raw = encodeBeacon('ABC-234', 7777)
    expect(raw.split(/\s+/)).toHaveLength(3)
  })
})

describe('beacon over a real socket', () => {
  afterEach(() => stopBeacon())

  it('finds a table announcing the code it was given', async () => {
    startBeacon('ABC-234', 7777)
    const found = await findTable('ABC-234', 3000)
    expect(found).not.toBeNull()
    expect(found?.port).toBe(7777)
    expect(found?.address).toBeTruthy()
  })

  it('accepts the code typed without its dash', async () => {
    startBeacon('ABC-234', 7777)
    expect(await findTable('abc234', 3000)).not.toBeNull()
  })

  it('resolves null for a code nobody is announcing', async () => {
    startBeacon('ABC-234', 7777)
    // Short timeout: this is the "nothing answered" path, and the caller
    // treats null as ordinary rather than as an error.
    expect(await findTable('ZZZ-999', 600)).toBeNull()
  })

  it('resolves null when nothing is hosting at all', async () => {
    expect(await findTable('ABC-234', 600)).toBeNull()
  })
})
