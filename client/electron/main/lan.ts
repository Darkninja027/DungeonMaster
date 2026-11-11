import os from 'node:os'

/**
 * Which of this machine's addresses a guest can actually reach.
 *
 * Electron-free and IO-free apart from one `os.networkInterfaces()` read, the
 * same split table.ts follows — the HTTP server and the beacon that consume
 * this live in tableHost.ts and beacon.ts, while every decision about WHICH
 * address to trust lives here and is covered by lan.test.ts.
 *
 * WHY THIS EXISTS. `os.networkInterfaces()` filtered on `IPv4 && !internal`
 * returns everything, in no defined order, and on a real Windows machine most
 * of it is junk. The host this was written for had eight addresses and only
 * ONE was reachable:
 *
 *   169.254.54.139   Ethernet 4                    APIPA — no DHCP on that port
 *   169.254.195.136  Ethernet 2                    APIPA
 *   172.22.160.1     vEthernet (Default Switch)    Hyper-V's own subnet
 *   169.254.183.20   Local Area Connection* 2      APIPA
 *   10.4.0.17        Ethernet                      <- the only one that works
 *   169.254.190.77   Local Area Connection* 1      APIPA
 *   169.254.191.173  Bluetooth Network Connection  APIPA
 *   169.254.80.108   Wi-Fi                         APIPA
 *
 * The panel showed the DM `169.254.54.139` and their players could not connect.
 * So ranking is not cosmetic: it is the difference between a working table and
 * an address that routes nowhere.
 *
 * TWO SIGNALS, AND BOTH ARE NEEDED. An address tells you about APIPA and about
 * the private ranges; it does NOT tell you an adapter is virtual, because
 * `172.22.160.1` is a perfectly ordinary private address that happens to belong
 * to a Hyper-V switch. Only the interface NAME says that. Conversely a name
 * cannot spot APIPA, since "Wi-Fi" is the realest adapter there is right up
 * until DHCP fails on it.
 *
 * NOTHING IS DISCARDED HERE. Ranking, not filtering: the data layer stays
 * honest and the UI decides what to show. Two machines on a direct cable with
 * no router both self-assign 169.254.x on the SAME adapter and can genuinely
 * reach each other, so a link-local address is a last resort rather than a lie.
 * Dropping it here would remove the only escape hatch from exactly the setup
 * that needs one.
 */

/** The subset of `os.NetworkInterfaceInfo` this module reads. */
export interface NetInterfaceLike {
  address: string
  netmask: string
  /** Node 18+ gives a string here; older gave a number. */
  family: string | number
  internal: boolean
}

export type AddressKind = 'private' | 'public' | 'apipa'

export interface LanCandidate {
  address: string
  /** The `os.networkInterfaces()` key, e.g. "vEthernet (Default Switch)". */
  iface: string
  netmask: string
  /** Directed broadcast for this interface, e.g. 10.4.0.255. */
  broadcast: string
  kind: AddressKind
  /** True when the interface NAME looks like a virtual adapter. */
  virtual: boolean
  /** Lower sorts first; see RANK_* below. */
  rank: number
}

/**
 * Interface-name fragments that mean "not the network your players are on",
 * matched case-insensitively as substrings.
 *
 * A named list rather than one regex so it is greppable and a new hypervisor is
 * one line. Bluetooth earns its place even though a Bluetooth PAN is almost
 * always APIPA anyway: if one ever does get a DHCP lease it still must not
 * outrank the Wi-Fi card.
 */
export const VIRTUAL_ADAPTER_PATTERNS = [
  'vethernet', // Hyper-V, WSL2, Docker Desktop
  'hyper-v',
  'virtualbox',
  'vmware',
  'vmnet',
  'loopback', // "Npcap Loopback Adapter", "Software Loopback"
  'wsl',
  'docker',
  'tailscale',
  'zerotier',
  'tap-', // OpenVPN TAP
  'wintun', // WireGuard
  'bluetooth',
] as const

/** A real NIC on a private network — what a LAN table wants. */
const RANK_PRIVATE_REAL = 0
/** A real NIC with a routable address. Unusual, but genuinely reachable. */
const RANK_PUBLIC_REAL = 1
/** Private, but on a hypervisor's own subnet — reachable only by its guests. */
const RANK_PRIVATE_VIRTUAL = 2
const RANK_PUBLIC_VIRTUAL = 3
/** Self-assigned because DHCP failed. Works on a direct cable and nowhere else. */
const RANK_APIPA = 4

/** The highest rank the UI shows without being asked. */
export const RANK_WORTH_SHOWING = RANK_PUBLIC_REAL

export function isVirtualAdapter(name: string): boolean {
  const lower = name.toLowerCase()
  return VIRTUAL_ADAPTER_PATTERNS.some((p) => lower.includes(p))
}

/**
 * Classify an IPv4 address by range.
 *
 * The 172 case parses the second octet rather than testing a `'172.'` prefix:
 * only 172.16–31 is private, so a naive prefix check wrongly condemns
 * 172.15.x and 172.32.x, both of which are ordinary routable addresses.
 */
export function classify(address: string): AddressKind {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) {
    return 'public'
  }
  const [a, b] = parts
  if (a === 169 && b === 254) return 'apipa'
  if (a === 10) return 'private'
  if (a === 192 && b === 168) return 'private'
  if (a === 172 && b >= 16 && b <= 31) return 'private'
  return 'public'
}

/**
 * The directed broadcast for an address, i.e. its host bits all set.
 *
 * This is what the beacon sends to. A limited broadcast (255.255.255.255) from
 * a socket bound to 0.0.0.0 leaves via ONE interface picked by the routing
 * table, which on the machine described above was not the one anybody was
 * listening on.
 */
export function broadcastFor(address: string, netmask: string): string {
  const a = address.split('.').map(Number)
  const m = netmask.split('.').map(Number)
  if (a.length !== 4 || m.length !== 4) return '255.255.255.255'
  if ([...a, ...m].some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return '255.255.255.255'
  }
  return a.map((oct, i) => (oct & m[i]) | (~m[i] & 0xff)).join('.')
}

function rankOf(kind: AddressKind, virtual: boolean): number {
  if (kind === 'apipa') return RANK_APIPA
  if (kind === 'private') {
    return virtual ? RANK_PRIVATE_VIRTUAL : RANK_PRIVATE_REAL
  }
  return virtual ? RANK_PUBLIC_VIRTUAL : RANK_PUBLIC_REAL
}

/**
 * Rank every IPv4 address on this machine, best first.
 *
 * Pure: takes the shape `os.networkInterfaces()` returns so a test can hand it
 * a real machine's adapter table as a fixture.
 *
 * Ties break on interface name then address, because `os.networkInterfaces()`
 * guarantees no ordering. Without that the panel could show one address and a
 * later refresh show a different equally-good one — after the DM has already
 * read the first one out.
 */
export function rankInterfaces(
  ifaces: Record<string, Array<NetInterfaceLike> | undefined>,
): Array<LanCandidate> {
  const out: Array<LanCandidate> = []
  for (const [iface, list] of Object.entries(ifaces)) {
    for (const net of list ?? []) {
      // Node 18+ reports 'IPv4'; tolerate the legacy numeric 4 too.
      if (net.family !== 'IPv4' && net.family !== 4) continue
      if (net.internal) continue
      const kind = classify(net.address)
      const virtual = isVirtualAdapter(iface)
      out.push({
        address: net.address,
        iface,
        netmask: net.netmask,
        broadcast: broadcastFor(net.address, net.netmask),
        kind,
        virtual,
        rank: rankOf(kind, virtual),
      })
    }
  }
  return out.sort(
    (x, y) =>
      x.rank - y.rank ||
      x.iface.localeCompare(y.iface) ||
      x.address.localeCompare(y.address),
  )
}

/** Rank the addresses this machine actually has. */
export function lanCandidates(): Array<LanCandidate> {
  return rankInterfaces(os.networkInterfaces())
}

/**
 * Ranked addresses as bare strings, best first.
 *
 * The shape `TableInfo.addresses` has always had, kept so nothing downstream
 * breaks; `lanCandidates()` is what the panel wants, since only that carries
 * the reason an address is ranked where it is.
 */
export function lanAddresses(): Array<string> {
  return lanCandidates().map((c) => c.address)
}

/**
 * The candidates worth putting in front of the DM.
 *
 * Real NICs only — unless there are none, in which case everything is offered
 * rather than an empty list. A machine whose only address is 169.254.x is
 * either on a direct cable (where that address is the right answer) or not on a
 * network at all, and showing nothing helps neither.
 */
export function preferredCandidates(
  candidates: Array<LanCandidate>,
): Array<LanCandidate> {
  const good = candidates.filter((c) => c.rank <= RANK_WORTH_SHOWING)
  return good.length > 0 ? good : candidates
}
