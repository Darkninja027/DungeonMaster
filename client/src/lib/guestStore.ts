import { useSyncExternalStore } from 'react'
import { mergeRoll, onLocalRoll } from './rollLog'
import type { RollEntry } from './rollLog'
import type { Seat } from './api'

/**
 * The guest side of a LAN session: what this machine has joined, what the DM is
 * currently showing, and who else is at the table.
 *
 * Talks to the host over plain fetch + EventSource rather than through IPC —
 * this is the one store in the app that reaches the network directly, because
 * the host is another machine and main has nothing to add to the round trip.
 *
 * Module-level store, the same idiom as sessionStore and rollLog.
 */

export interface Shown {
  articleId: string
  content: string
  title: string
}

export interface GuestSession {
  /** Where the host is, e.g. "192.168.1.42:7777". */
  address: string
  tableId: string
  seatId: string
  token: string
  name: string
}

export interface GuestState {
  session: GuestSession | null
  connected: boolean
  shown: Shown | null
  seats: Array<Seat>
  combat: unknown
  characterId: string | null
}

const empty: GuestState = {
  session: null,
  connected: false,
  shown: null,
  seats: [],
  combat: null,
  characterId: null,
}

let state: GuestState = empty
let stream: EventSource | null = null
let unsubscribeRolls: (() => void) | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function setState(patch: Partial<GuestState>) {
  state = { ...state, ...patch }
  notify()
}

/** Normalise what someone types: bare host, host:port, or a full URL. */
export function normalizeAddress(raw: string, defaultPort = 7777): string {
  const trimmed = raw.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  return /:\d+$/.test(trimmed) ? trimmed : `${trimmed}:${defaultPort}`
}

function base(): string {
  return `http://${state.session?.address ?? ''}`
}

/** POST to the host with this seat's bearer token. */
async function send(path: string, body: unknown): Promise<Response> {
  return fetch(`${base()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${state.session?.token ?? ''}`,
    },
    body: JSON.stringify(body),
  })
}

/** Ask the host for a seat. Throws with the host's own message on refusal. */
export async function joinTable(
  rawAddress: string,
  code: string,
  name: string,
): Promise<void> {
  const address = normalizeAddress(rawAddress)
  const res = await fetch(`http://${address}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, name }),
  })
  const body = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(
      typeof body.error === 'string' ? body.error : 'Could not join',
    )
  }
  setState({
    session: {
      address,
      tableId: String(body.tableId),
      seatId: String(body.seatId),
      token: String(body.token),
      name: String(body.name ?? name),
    },
  })
  // From here on, a roll made on this machine also goes up to the host.
  unsubscribeRolls?.()
  unsubscribeRolls = onLocalRoll(sendRoll)
  openStream()
}

function openStream(): void {
  stream?.close()
  const session = state.session
  if (!session) return
  const es = new EventSource(
    `http://${session.address}/events?token=${encodeURIComponent(session.token)}`,
  )
  stream = es

  es.onopen = () => setState({ connected: true })
  // EventSource retries on its own with backoff; surfacing the gap is enough.
  es.onerror = () => setState({ connected: false })
  es.onmessage = (event: MessageEvent<string>) => {
    let frame: { kind?: unknown; payload?: unknown }
    try {
      frame = JSON.parse(event.data) as typeof frame
    } catch {
      return // a malformed frame is dropped, not fatal
    }
    apply(frame)
  }
}

/**
 * Apply one frame from the host. Exported for tests; the payloads come from a
 * machine we do not control, so each is checked before it reaches state.
 */
export function apply(frame: { kind?: unknown; payload?: unknown }): void {
  const p = frame.payload
  switch (frame.kind) {
    case 'hello': {
      if (typeof p !== 'object' || p === null) return
      const hello = p as Record<string, unknown>
      setState({
        seats: Array.isArray(hello.seats) ? (hello.seats as Array<Seat>) : [],
        shown: isShown(hello.shown) ? hello.shown : null,
        combat: hello.combat ?? null,
      })
      // Replayed history, so the guest's log is not empty on arrival.
      if (Array.isArray(hello.rolls)) {
        for (const entry of hello.rolls) {
          if (isRoll(entry)) mergeRoll(entry)
        }
      }
      return
    }
    case 'shown':
      if (isShown(p)) setState({ shown: p })
      return
    case 'seats':
      if (Array.isArray(p)) setState({ seats: p as Array<Seat> })
      return
    case 'combat':
      setState({ combat: p ?? null })
      return
    case 'roll':
      if (isRoll(p)) mergeRoll(p)
      return
    default:
      return
  }
}

function isShown(v: unknown): v is Shown {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    typeof s.articleId === 'string' &&
    typeof s.content === 'string' &&
    typeof s.title === 'string'
  )
}

function isRoll(v: unknown): v is RollEntry {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.notation === 'string' &&
    typeof r.total === 'number'
  )
}

/** Claim a character so this seat may roll as, and edit, that sheet. */
export async function claimCharacter(characterId: string): Promise<void> {
  const res = await send('/claim', { characterId })
  if (!res.ok) {
    const body = (await res.json()) as Record<string, unknown>
    throw new Error(
      typeof body.error === 'string' ? body.error : 'Could not claim',
    )
  }
  setState({ characterId })
}

/** Send a roll made on this machine up to the host, which fans it out. */
export function sendRoll(entry: RollEntry): void {
  if (!state.session) return
  void send('/roll', entry).catch(() => {
    // A dropped roll is a cosmetic loss; it is already in this guest's own log.
  })
}

/** Patch the claimed sheet. The host refuses anything this seat does not own. */
export async function sendSheetPatch(
  patch: Record<string, unknown>,
): Promise<void> {
  if (!state.characterId) throw new Error('Claim a character first')
  const res = await send('/sheet', { characterId: state.characterId, patch })
  if (!res.ok) {
    const body = (await res.json()) as Record<string, unknown>
    throw new Error(
      typeof body.error === 'string' ? body.error : 'Could not save',
    )
  }
}

export function leaveTable(): void {
  stream?.close()
  stream = null
  unsubscribeRolls?.()
  unsubscribeRolls = null
  state = empty
  notify()
}

export function useGuest(): GuestState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

/** Reset between tests. Not used by the app. */
export function resetGuestForTest(): void {
  stream = null
  unsubscribeRolls?.()
  unsubscribeRolls = null
  state = empty
}
