import dgram from 'node:dgram'
import { normalizeCode } from './table'

/**
 * LAN discovery, so a guest types a room code and nothing else.
 *
 * The host shouts a tiny datagram on the broadcast address every second; a
 * guest listens, matches the code it was given, and learns the address. Built
 * on node:dgram — no dependency, matching the transport's own no-dependency
 * rule.
 *
 * WHAT THIS DOES NOT DO. Broadcast does not cross subnets and is dropped by
 * access points with client isolation on (typical of guest and café wifi), and
 * some VPN adapters swallow it. So discovery is an affordance, never the only
 * way in: the join screen keeps a manual address field, and the host keeps
 * showing its IP. A beacon that silently fails must degrade to typing an
 * address, not to a dead end.
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

let socket: dgram.Socket | null = null
let timer: ReturnType<typeof setInterval> | null = null

/** Start announcing this table. Safe to call when already announcing. */
export function startBeacon(code: string, port: number): void {
  stopBeacon()
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  socket = sock
  sock.on('error', () => stopBeacon())
  sock.bind(() => {
    try {
      sock.setBroadcast(true)
    } catch {
      // Some adapters refuse broadcast; the manual address still works.
      stopBeacon()
      return
    }
    const frame = Buffer.from(encodeBeacon(code, port))
    const send = () => {
      // Errors are ignored per-send: an adapter coming and going mid-session
      // must not take the table down with it.
      sock.send(frame, PORT, '255.255.255.255', () => {})
    }
    send()
    timer = setInterval(send, INTERVAL_MS)
  })
}

export function stopBeacon(): void {
  if (timer) clearInterval(timer)
  timer = null
  try {
    socket?.close()
  } catch {
    /* already closed */
  }
  socket = null
}

/**
 * Listen for a table announcing the given code, and resolve with its address.
 *
 * Resolves null on timeout rather than throwing — not finding a beacon is the
 * ordinary case on a locked-down network, and the caller's answer to it is to
 * ask for an address, not to show an error.
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
