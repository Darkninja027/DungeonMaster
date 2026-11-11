import dgram from 'node:dgram'
import log from 'electron-log'
import { normalizeCode } from './table'
import { lanCandidates } from './lan'
import type { LanCandidate } from './lan'

/**
 * LAN discovery, so a guest types a room code and nothing else.
 *
 * The host shouts a tiny datagram every second; a guest listens, matches the
 * code it was given, and learns the address. Built on node:dgram — no
 * dependency, matching the transport's own no-dependency rule.
 *
 * ONE SOCKET PER INTERFACE, AND WHY. This used to be a single socket bound to
 * 0.0.0.0 sending to the limited broadcast 255.255.255.255, which failed
 * completely on the machine it was written for. Windows sends a limited
 * broadcast from an unbound socket out exactly ONE interface, chosen by routing
 * metric, and that machine had a Hyper-V switch plus six link-local adapters
 * ahead of the real NIC. The datagrams never reached the network anybody was
 * on. Binding a socket to a specific source address is what forces the
 * datagram out of that adapter, so there is now one socket per real candidate
 * from lan.ts, each sending to its own DIRECTED broadcast (10.4.0.255 for a
 * /24), best-first.
 *
 * THE LIMITED BROADCAST SOCKET IS THE FALLBACK, NOT THE SELF-DISCOVERY PATH.
 * Measured on the host above: a directed broadcast from an interface-bound
 * socket DOES loop back to a 0.0.0.0-bound listener on the same machine, so
 * host-joins-itself (a documented case, see tableHost.ts) is carried by the
 * per-interface senders and needs nothing extra. The 255.255.255.255 socket
 * matters for the case with no real NIC at all: two machines on a direct cable
 * are both link-local, `real` is empty, and it is then the ONLY sender. Keep it
 * — but do not believe it is what makes the tests below pass, because it is not.
 *
 * Beware measuring this by hand: the netmask must come from the adapter. An
 * earlier probe sent to 10.4.0.255 for a /16 interface whose real directed
 * broadcast is 10.4.255.255, received nothing, and wrongly concluded that
 * directed broadcasts do not loop back. broadcastFor() in lan.ts exists so
 * nothing has to compute that by eye.
 *
 * WHAT THIS STILL DOES NOT DO. Broadcast does not cross subnets and is dropped
 * by access points with client isolation on (typical of guest and café wifi),
 * and some VPN adapters swallow it. So discovery is an affordance, never the
 * only way in: the join screen keeps a manual address field, and the host keeps
 * showing its IP. A beacon that fails must degrade to typing an address, not to
 * a dead end — which is why startBeacon now REPORTS its health rather than
 * returning void. It used to fail silently while the DM's panel promised
 * players needed only the room code.
 *
 * The frame is deliberately dumb — a magic string, the code, and a port. It
 * carries no world name, no seat list and no article: anything on the wifi can
 * hear it, and a beacon is not the place to leak what the session is about.
 */

const PORT = 7778
const MAGIC = 'DMTBL1'
const INTERVAL_MS = 1000

/** Serialize an announcement. Kept tiny and printable for easy debugging. */
export function encodeBeacon(code: string, port: number): string {
  return `${MAGIC} ${normalizeCode(code)} ${port}`
}

export interface BeaconFrame {
  code: string
  port: number
}

/**
 * Parse an announcement, or null if it is not one of ours.
 *
 * Anything on the LAN can send to this port, so every field is checked: a
 * malformed or foreign datagram must be dropped rather than half-read.
 */
export function decodeBeacon(raw: string): BeaconFrame | null {
  const parts = raw.trim().split(/\s+/)
  if (parts.length !== 3) return null
  const [magic, code, port] = parts
  if (magic !== MAGIC) return null
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return null
  const n = Number(port)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null
  return { code, port: n }
}

/** One interface the beacon is announcing on, for the DM's panel. */
export interface BeaconInterface {
  iface: string
  address: string
  broadcast: string
}

export interface BeaconStatus {
  /** 'failed' means every sender died; the address field is the only way in. */
  state: 'off' | 'running' | 'failed'
  interfaces: Array<BeaconInterface>
  /** Senders dropped since start. Non-zero with state 'running' is degraded. */
  failures: number
  /** The most recent error, when there is one worth showing. */
  error?: string
}

interface Sender {
  sock: dgram.Socket
  /** Where this socket shouts. */
  target: string
  /** Null for the limited-broadcast socket, which belongs to no interface. */
  iface: BeaconInterface | null
  /** Set once a send has failed, so a 1 Hz loop logs the fault only once. */
  reported: boolean
}

let senders: Array<Sender> = []
let timer: ReturnType<typeof setInterval> | null = null
let status: BeaconStatus = { state: 'off', interfaces: [], failures: 0 }
let onChange: (() => void) | null = null

/**
 * Register a callback fired whenever the beacon's health changes.
 *
 * The panel only refreshes on mount, so a beacon that dies mid-session would
 * otherwise stay invisible behind copy promising discovery works.
 */
export function onBeaconChange(cb: (() => void) | null): void {
  onChange = cb
}

export function beaconStatus(): BeaconStatus {
  return status
}

function setStatus(patch: Partial<BeaconStatus>): void {
  const before = status
  status = { ...status, ...patch }
  const changed =
    before.state !== status.state ||
    before.failures !== status.failures ||
    before.interfaces.length !== status.interfaces.length
  if (changed) onChange?.()
}

/** Drop one dead sender; only when the last one goes is the beacon 'failed'. */
function dropSender(sender: Sender, why: string): void {
  const at = senders.indexOf(sender)
  if (at === -1) return
  senders.splice(at, 1)
  try {
    sender.sock.close()
  } catch {
    /* already closed */
  }
  if (!sender.reported) {
    sender.reported = true
    log.warn(`[beacon] sender ${sender.target} dropped: ${why}`)
  }
  const live = senders
    .map((s) => s.iface)
    .filter((i): i is BeaconInterface => i !== null)
  setStatus({
    interfaces: live,
    failures: status.failures + 1,
    error: why,
    // Only a total loss is a failure. One bad adapter used to take the whole
    // beacon down with it.
    state: senders.length === 0 ? 'failed' : status.state,
  })
}

function makeSender(
  frame: Buffer,
  target: string,
  bindAddress: string | null,
  iface: BeaconInterface | null,
): Sender | null {
  let sock: dgram.Socket
  try {
    sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  } catch {
    return null
  }
  const sender: Sender = { sock, target, iface, reported: false }
  sock.on('error', (err) => dropSender(sender, err.message))
  // Binding to a source address is what pins the datagram to that adapter;
  // port 0 lets the OS pick, since nothing ever replies to a beacon.
  const bind = () => {
    try {
      if (bindAddress) sock.bind(0, bindAddress)
      else sock.bind()
    } catch (err) {
      dropSender(sender, err instanceof Error ? err.message : 'bind failed')
    }
  }
  sock.on('listening', () => {
    try {
      sock.setBroadcast(true)
    } catch (err) {
      // Some adapters refuse broadcast. Only this one is lost.
      dropSender(sender, err instanceof Error ? err.message : 'no broadcast')
      return
    }
    sock.send(frame, PORT, target, (err) => {
      if (err) dropSender(sender, err.message)
    })
  })
  bind()
  return sender
}

/**
 * Start announcing this table, and report whether it worked.
 *
 * `candidates` exists for tests, which need to inject an unbindable address to
 * prove one dead adapter no longer stops the rest.
 */
export function startBeacon(
  code: string,
  port: number,
  candidates: Array<LanCandidate> = lanCandidates(),
): BeaconStatus {
  stopBeacon()
  const frame = Buffer.from(encodeBeacon(code, port))

  // Real NICs only. A link-local adapter cannot carry a directed broadcast
  // anywhere useful, and the 0.0.0.0 sender below covers the direct-cable case.
  const real = candidates.filter((c) => c.kind !== 'apipa' && !c.virtual)

  const built: Array<Sender> = []
  for (const c of real) {
    const sender = makeSender(frame, c.broadcast, c.address, {
      iface: c.iface,
      address: c.address,
      broadcast: c.broadcast,
    })
    if (sender) built.push(sender)
  }
  // The limited-broadcast socket. Not redundant: it is the only sender that
  // reaches a listener on this same machine, so host-joins-itself needs it.
  const limited = makeSender(frame, '255.255.255.255', null, null)
  if (limited) built.push(limited)

  senders = built
  if (senders.length === 0) {
    status = {
      state: 'failed',
      interfaces: [],
      failures: 0,
      error: 'no usable network adapter',
    }
    log.warn('[beacon] no usable sender; discovery is off')
    onChange?.()
    return status
  }

  const ifaces = real.map((c) => ({
    iface: c.iface,
    address: c.address,
    broadcast: c.broadcast,
  }))
  status = { state: 'running', interfaces: ifaces, failures: 0 }
  log.info(
    `[beacon] announcing on ${ifaces.length} interface(s): ${
      ifaces.map((i) => `${i.iface} ${i.address}->${i.broadcast}`).join(', ') ||
      '(limited broadcast only)'
    }`,
  )
  onChange?.()

  timer = setInterval(() => {
    // Iterate a copy: a send error drops the sender from the live array.
    for (const sender of [...senders]) {
      sender.sock.send(frame, PORT, sender.target, (err) => {
        if (err) dropSender(sender, err.message)
      })
    }
  }, INTERVAL_MS)
  return status
}

export function stopBeacon(): void {
  if (timer) clearInterval(timer)
  timer = null
  for (const sender of senders) {
    try {
      sender.sock.close()
    } catch {
      /* already closed */
    }
  }
  senders = []
  const wasOff = status.state === 'off'
  status = { state: 'off', interfaces: [], failures: 0 }
  if (!wasOff) onChange?.()
}

/**
 * Listen for a table announcing the given code, and resolve with its address.
 *
 * Resolves null on timeout rather than throwing — not finding a beacon is the
 * ordinary case on a locked-down network, and the caller's answer to it is to
 * ask for an address, not to show an error.
 *
 * Bound to 0.0.0.0 so it hears a datagram arriving on any adapter, and
 * reuseAddr so a machine already hosting can still listen for itself.
 */
export function findTable(
  code: string,
  timeoutMs = 4000,
): Promise<{ address: string; port: number } | null> {
  const want = normalizeCode(code)
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    let done = false

    const finish = (value: { address: string; port: number } | null) => {
      if (done) return
      done = true
      clearTimeout(deadline)
      try {
        sock.close()
      } catch {
        /* already closed */
      }
      resolve(value)
    }

    const deadline = setTimeout(() => finish(null), timeoutMs)
    sock.on('error', () => finish(null))
    sock.on('message', (msg, rinfo) => {
      const frame = decodeBeacon(msg.toString('utf8'))
      if (!frame || frame.code !== want) return
      finish({ address: rinfo.address, port: frame.port })
    })
    try {
      sock.bind(PORT)
    } catch {
      finish(null)
    }
  })
}
