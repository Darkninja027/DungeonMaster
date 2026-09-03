import { useSyncExternalStore } from 'react'
import { api } from './api'
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

/** A character the host offers, and who (if anyone) already holds it. */
export interface OfferedCharacter {
  id: string
  title: string
  claimedBy: string | null
}

export interface GuestState {
  session: GuestSession | null
  connected: boolean
  shown: Shown | null
  seats: Array<Seat>
  combat: unknown
  characterId: string | null
  /**
   * Where the claimed character lives.
   *
   * 'table' — a sheet in the DM's world, claimed from the offered list. The
   *   host owns it, so HP edits write back to the DM's disk.
   * 'own'  — a character from THIS machine's vault, brought to the table. The
   *   host never sees or stores it; only the rolls are shared. There is
   *   nothing to write back, because the file is already local.
   */
  origin: 'table' | 'own' | null
  /** The claimed sheet's raw article content, once fetched. */
  sheet: { id: string; title: string; content: string } | null
  /** For an 'own' character, the local world id its file lives in. */
  ownWorldId: string | null
}

const empty: GuestState = {
  session: null,
  connected: false,
  shown: null,
  seats: [],
  combat: null,
  characterId: null,
  origin: null,
  sheet: null,
  ownWorldId: null,
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
  const trimmed = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
  return /:\d+$/.test(trimmed) ? trimmed : `${trimmed}:${defaultPort}`
}

/** Whether the IPC bridge exists — false in unit tests. */
const bridged = () => typeof window !== 'undefined' && Boolean(window.dmApi)

function base(): string {
  return `http://${state.session?.address ?? ''}`
}

/** GET from the host with this seat's bearer token. */
async function get(path: string): Promise<Response> {
  return fetch(`${base()}${path}`, {
    headers: { authorization: `Bearer ${state.session?.token ?? ''}` },
  })
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

/**
 * Find the host for this code on the LAN.
 *
 * Returns null when nothing answers, which is ordinary rather than an error:
 * broadcast does not cross subnets and is dropped by access points with client
 * isolation on. The caller then asks for an address.
 */
export async function discover(code: string): Promise<string | null> {
  if (!bridged()) return null
  try {
    const found = await api.table.find(code)
    return found ? `${found.address}:${found.port}` : null
  } catch {
    return null
  }
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

/** The characters this table offers, with who already holds each. */
export async function fetchCharacters(): Promise<Array<OfferedCharacter>> {
  const res = await get('/characters')
  if (!res.ok) return []
  const body = (await res.json()) as { characters?: Array<OfferedCharacter> }
  return Array.isArray(body.characters) ? body.characters : []
}

/**
 * Claim a character, then pull its sheet.
 *
 * The two are one action from the guest's point of view — a claim you cannot
 * then read is not worth having — so a failure to load the sheet still leaves
 * the claim recorded, and the caller can retry with reloadSheet.
 */
export async function claimCharacter(characterId: string): Promise<void> {
  const res = await send('/claim', { characterId })
  if (!res.ok) {
    const body = (await res.json()) as Record<string, unknown>
    throw new Error(
      typeof body.error === 'string' ? body.error : 'Could not claim',
    )
  }
  setState({ characterId, origin: 'table', ownWorldId: null })
  await reloadSheet()
}

/**
 * Play a character from THIS machine's vault instead of one of the DM's.
 *
 * The sheet never leaves this machine: the host is told the display name so
 * rolls can be attributed, and nothing else. No claim is sent, because there is
 * nothing at the host to claim — which also means no write-back, since the file
 * is already local and the ordinary editor owns it.
 */
export function bringOwnCharacter(
  worldId: string,
  articleId: string,
  title: string,
  content: string,
): void {
  setState({
    characterId: articleId,
    origin: 'own',
    ownWorldId: worldId,
    sheet: { id: articleId, title, content },
  })
}

/** Put the character down and go back to the picker. */
export function releaseCharacter(): void {
  setState({
    characterId: null,
    origin: null,
    ownWorldId: null,
    sheet: null,
  })
}

/** Re-read the claimed sheet from the host. */
export async function reloadSheet(): Promise<void> {
  const id = state.characterId
  if (!id) return
  // An 'own' character lives on this machine; the host has never seen it and
  // would 403. Its file is refreshed by the ordinary local path instead.
  if (state.origin !== 'table') return
  const res = await get(`/sheet?characterId=${encodeURIComponent(id)}`)
  if (!res.ok) return
  const body = (await res.json()) as {
    id?: string
    title?: string
    content?: string
  }
  if (typeof body.content !== 'string') return
  setState({
    sheet: {
      id: body.id ?? id,
      title: body.title ?? id,
      content: body.content,
    },
  })
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
  // Nothing to send for a character the host does not hold — the file is on
  // this machine and the ordinary editor already wrote it.
  if (state.origin !== 'table') return
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
