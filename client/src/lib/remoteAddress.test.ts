import { describe, expect, it } from 'vitest'
import {
  isPrivateHost,
  isTailscaleAddress,
  remoteWarning,
} from './remoteAddress'

/**
 * These decide what the DM is told about their own address, and the one that
 * matters is remoteWarning: a warning shown for an encrypted connection trains
 * people to ignore the one that is real.
 */

describe('isTailscaleAddress', () => {
  it('recognises the CGNAT range and nothing else', () => {
    expect(isTailscaleAddress('100.64.0.1')).toBe(true)
    expect(isTailscaleAddress('100.101.102.103')).toBe(true)
    expect(isTailscaleAddress('100.127.255.255')).toBe(true)
    expect(isTailscaleAddress('100.63.255.255')).toBe(false)
    expect(isTailscaleAddress('100.128.0.1')).toBe(false)
    expect(isTailscaleAddress('192.168.1.5')).toBe(false)
    expect(isTailscaleAddress('')).toBe(false)
    expect(isTailscaleAddress('not.an.address.x')).toBe(false)
  })
})

describe('isPrivateHost', () => {
  it('accepts names and addresses that cannot leave the network', () => {
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('dm-laptop.local')).toBe(true)
    expect(isPrivateHost('127.0.0.1')).toBe(true)
    expect(isPrivateHost('10.0.0.1')).toBe(true)
    expect(isPrivateHost('192.168.1.5')).toBe(true)
    expect(isPrivateHost('172.16.0.1')).toBe(true)
    expect(isPrivateHost('169.254.1.1')).toBe(true)
    expect(isPrivateHost('100.101.102.103')).toBe(true)
    expect(isPrivateHost('[fd7a:115c:a1e0::1]')).toBe(true)
  })

  it('gets the 172.16/12 boundaries right', () => {
    expect(isPrivateHost('172.15.255.255')).toBe(false)
    expect(isPrivateHost('172.32.0.1')).toBe(false)
  })

  it('rejects public hosts', () => {
    expect(isPrivateHost('example.com')).toBe(false)
    expect(isPrivateHost('203.0.113.5')).toBe(false)
    expect(isPrivateHost('8.8.8.8')).toBe(false)
    expect(isPrivateHost('')).toBe(false)
  })
})

describe('remoteWarning', () => {
  it('warns about plain http to a public address', () => {
    // The case that is genuinely unsafe and has no fix short of TLS.
    expect(remoteWarning('http://203.0.113.5:7777')).toContain('not encrypted')
    expect(remoteWarning('http://dm.example.com:7777')).toContain(
      'not encrypted',
    )
  })

  it('stays quiet for https', () => {
    expect(remoteWarning('https://dm.example.com')).toBeNull()
    expect(remoteWarning('https://box.tailnet.ts.net:7777')).toBeNull()
  })

  it('stays quiet for Tailscale and private addresses', () => {
    // Encrypted at the network layer, so warning here would be noise that
    // teaches people to skip the warning that matters.
    expect(remoteWarning('http://100.101.102.103:7777')).toBeNull()
    expect(remoteWarning('http://192.168.1.5:7777')).toBeNull()
    expect(remoteWarning('http://localhost:7777')).toBeNull()
  })

  it('says so when the address is not parseable', () => {
    expect(remoteWarning('nonsense')).toContain('does not look right')
  })
})
