import { describe, expect, it } from 'vitest'
import {
  broadcastFor,
  classify,
  isVirtualAdapter,
  lanAddresses,
  preferredCandidates,
  rankInterfaces,
} from './lan'
import type { NetInterfaceLike } from './lan'

const v4 = (address: string, netmask = '255.255.0.0'): NetInterfaceLike => ({
  address,
  netmask,
  family: 'IPv4',
  internal: false,
})

/**
 * The real adapter table of the machine where LAN hosting failed, captured from
 * `Get-NetIPAddress` while a table was actually running. Seven of these eight
 * addresses are unreachable from another machine; the panel showed the first
 * one and the DM's players could not connect.
 */
const REAL_HOST: Record<string, Array<NetInterfaceLike>> = {
  'Ethernet 4': [v4('169.254.54.139')],
  'Ethernet 2': [v4('169.254.195.136')],
  'vEthernet (Default Switch)': [v4('172.22.160.1', '255.255.240.0')],
  'Local Area Connection* 2': [v4('169.254.183.20')],
  Ethernet: [v4('10.4.0.17', '255.255.255.0')],
  'Local Area Connection* 1': [v4('169.254.190.77')],
  'Bluetooth Network Connection': [v4('169.254.191.173')],
  'Wi-Fi': [v4('169.254.80.108')],
}

describe('classify', () => {
  it('names the private ranges', () => {
    expect(classify('10.4.0.17')).toBe('private')
    expect(classify('192.168.1.42')).toBe('private')
    expect(classify('172.22.160.1')).toBe('private')
  })

  it('parses the second octet of 172, rather than the prefix', () => {
    // Only 172.16-31 is private. A `startsWith('172.')` check condemns these
    // two, which are ordinary routable addresses.
    expect(classify('172.15.0.1')).toBe('public')
    expect(classify('172.32.0.1')).toBe('public')
    expect(classify('172.16.0.1')).toBe('private')
    expect(classify('172.31.255.254')).toBe('private')
  })

  it('spots a self-assigned address', () => {
    expect(classify('169.254.54.139')).toBe('apipa')
    // 169 alone is not link-local.
    expect(classify('169.253.0.1')).toBe('public')
  })

  it('treats anything unparseable as public rather than throwing', () => {
    expect(classify('')).toBe('public')
    expect(classify('not-an-address')).toBe('public')
  })
})

describe('isVirtualAdapter', () => {
  it('catches the hypervisors by name', () => {
    // 172.22.160.1 is a legitimate private address, so the NAME is the only
    // thing that can say this adapter is a Hyper-V switch.
    expect(isVirtualAdapter('vEthernet (Default Switch)')).toBe(true)
    expect(isVirtualAdapter('VMware Network Adapter VMnet8')).toBe(true)
    expect(isVirtualAdapter('VirtualBox Host-Only Network')).toBe(true)
    expect(isVirtualAdapter('Npcap Loopback Adapter')).toBe(true)
    expect(isVirtualAdapter('Bluetooth Network Connection')).toBe(true)
  })

  it('leaves real adapters alone', () => {
    expect(isVirtualAdapter('Ethernet')).toBe(false)
    expect(isVirtualAdapter('Wi-Fi')).toBe(false)
    expect(isVirtualAdapter('Local Area Connection* 1')).toBe(false)
  })
})

describe('broadcastFor', () => {
  it('sets the host bits of a /24', () => {
    expect(broadcastFor('10.4.0.17', '255.255.255.0')).toBe('10.4.0.255')
  })

  it('handles a mask that is not on an octet boundary', () => {
    // The Hyper-V /20 — an off-by-one in the masking shows up here and nowhere
    // else, since every other fixture is byte-aligned.
    expect(broadcastFor('172.22.160.1', '255.255.240.0')).toBe('172.22.175.255')
  })

  it('handles a /16', () => {
    expect(broadcastFor('169.254.54.139', '255.255.0.0')).toBe(
      '169.254.255.255',
    )
  })

  it('falls back to the limited broadcast on garbage', () => {
    expect(broadcastFor('nope', '255.255.255.0')).toBe('255.255.255.255')
    expect(broadcastFor('10.0.0.1', '')).toBe('255.255.255.255')
  })
})

describe('rankInterfaces', () => {
  it('puts the one reachable address first (the reported bug)', () => {
    // The regression test for it: this machine's panel showed 169.254.54.139
    // and a guest on the same network could not reach the table.
    const ranked = rankInterfaces(REAL_HOST)
    expect(ranked[0].address).toBe('10.4.0.17')
    expect(ranked[0].iface).toBe('Ethernet')
    expect(ranked[0].kind).toBe('private')
    expect(ranked[0].virtual).toBe(false)
  })

  it('ranks a Hyper-V switch below a real NIC but above APIPA', () => {
    const ranked = rankInterfaces(REAL_HOST)
    const hyperV = ranked.findIndex((c) => c.address === '172.22.160.1')
    const real = ranked.findIndex((c) => c.address === '10.4.0.17')
    const apipa = ranked.findIndex((c) => c.kind === 'apipa')
    expect(real).toBeLessThan(hyperV)
    expect(hyperV).toBeLessThan(apipa)
    expect(ranked[hyperV].virtual).toBe(true)
  })

  it('discards nothing — a direct cable makes 169.254.x the right answer', () => {
    expect(rankInterfaces(REAL_HOST)).toHaveLength(8)
  })

  it('orders stably however the adapters are enumerated', () => {
    // os.networkInterfaces() promises no ordering, and the DM reads an address
    // aloud before the next refresh happens.
    const shuffled = Object.fromEntries(
      Object.entries(REAL_HOST).reverse(),
    ) as typeof REAL_HOST
    expect(rankInterfaces(shuffled).map((c) => c.address)).toEqual(
      rankInterfaces(REAL_HOST).map((c) => c.address),
    )
  })

  it('breaks ties between equally good NICs deterministically', () => {
    const two = {
      'Wi-Fi': [v4('192.168.1.50', '255.255.255.0')],
      Ethernet: [v4('192.168.1.20', '255.255.255.0')],
    }
    // Both rank 0, so the interface name decides: Ethernet before Wi-Fi.
    expect(rankInterfaces(two).map((c) => c.iface)).toEqual([
      'Ethernet',
      'Wi-Fi',
    ])
  })

  it('drops IPv6 and loopback', () => {
    const mixed = {
      Ethernet: [
        v4('10.4.0.17', '255.255.255.0'),
        { address: 'fe80::1', netmask: 'ffff::', family: 'IPv6', internal: false },
      ],
      'Loopback Pseudo-Interface 1': [
        { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true },
      ],
    }
    const ranked = rankInterfaces(mixed)
    expect(ranked).toHaveLength(1)
    expect(ranked[0].address).toBe('10.4.0.17')
  })

  it('tolerates the legacy numeric family', () => {
    const legacy = {
      Ethernet: [
        { address: '10.4.0.17', netmask: '255.255.255.0', family: 4, internal: false },
      ],
    }
    expect(rankInterfaces(legacy)).toHaveLength(1)
  })

  it('survives a machine with no usable adapters', () => {
    expect(rankInterfaces({})).toEqual([])
    expect(rankInterfaces({ Ethernet: undefined })).toEqual([])
  })
})

describe('preferredCandidates', () => {
  it('hides the junk when there is a real NIC', () => {
    const shown = preferredCandidates(rankInterfaces(REAL_HOST))
    expect(shown.map((c) => c.address)).toEqual(['10.4.0.17'])
  })

  it('offers everything when nothing is reachable', () => {
    // Otherwise a machine on a direct cable is told it has no address at all.
    const apipaOnly = rankInterfaces({
      'Wi-Fi': [v4('169.254.80.108')],
      Ethernet: [v4('169.254.54.139')],
    })
    expect(preferredCandidates(apipaOnly)).toHaveLength(2)
  })

  it('prefers a real public NIC over a virtual private one', () => {
    const odd = rankInterfaces({
      'vEthernet (Default Switch)': [v4('172.22.160.1', '255.255.240.0')],
      Ethernet: [v4('203.0.113.9', '255.255.255.0')],
    })
    expect(preferredCandidates(odd).map((c) => c.address)).toEqual([
      '203.0.113.9',
    ])
  })
})

describe('lanAddresses', () => {
  it('reads the real machine and returns strings, best first', () => {
    const addresses = lanAddresses()
    expect(Array.isArray(addresses)).toBe(true)
    for (const a of addresses) expect(typeof a).toBe('string')
  })
})
