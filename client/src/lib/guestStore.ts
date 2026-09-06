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
  /**
   * The host's full origin, scheme included, e.g. "http://192.168.1.42:7777"
   * or "https://box.tailnet.ts.net".
   *
   * The scheme is STORED rather than assumed. It used to be stripped and
   * http:// hardcoded at every call site, which made a TLS host — a Tailscale
   * name behind a proxy, a tunnel URL — impossible to type at all. Named
   * baseUrl and not `origin` because GuestState.origin already means something
   * unrelated: where the claimed character came from.
   */
  baseUrl: string
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

/**
 * The character chosen on the join screen, before a table exists to tell.
 *
 * Picking who you are is part of sitting down, not something you do after
 * arriving — so the choice is made first and applied the moment the seat is
 * granted.
 */
export interface PendingCharacter {
  origin: 'own'
  worldId: string
  articleId: string
  title: string
  content: string
}

let pending: PendingCharacter | null = null

export function setPendingCharacter(next: PendingCharacter | null): void {
  pending = next
}

export function getPendingCharacter(): PendingCharacter | null {
  return pending
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

/**
 * Normalise what someone types into a full origin, or null if it is not one.
 *
 * Accepts a bare host, host:port, or a full URL, and PRESERVES an explicit
 * scheme — that is the whole point, since the result is concatenated into
 * fetch() and EventSource() URLs. Which is also why only http and https are
 * allowed through: anything else here would be an injection surface.
 *
 * Port defaulting is scheme-aware. A bare host gets `defaultPort`, because that
 * is how the LAN has always worked. An explicit https:// with no port gets
 * NOTHING appended — 443 is right, and pinning :7777 onto a tunnel or reverse
 * proxy URL would break it.
 *
 * Returns null rather than throwing so the join screen can say "that doesn't
 * look like an address" instead of surfacing a TypeError from deep in fetch.
 */
export function normalizeBaseUrl(
  raw: string,
  defaultPort = 7777,
): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const hadScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  // new URL, not a regex: it is the only thing that gets bracketed IPv6 right,
  // and Tailscale hands out IPv6 addresses.
  let url: URL
  try {
    url = new URL(hadScheme ? trimmed : `http://${trimmed}`)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // Credentials and a query string are never part of a host address, and both
  // would ride along into every request built from this.
  if (url.username || url.password || url.search) return null
  if (!url.hostname) return null
  // A path is dropped rather than rejected: people paste links with a trailing
  // slash constantly, and that is not an error worth refusing.
  const port =
    url.port ||
    (hadScheme && url.protocol === 'https:' ? '' : String(defaultPort))
  return port
    ? `${url.protocol}//${url.hostname}:${port}`
    : `${url.protocol}//${url.hostname}`
}

/** Whether the IPC bridge exists — false in unit tests. */
const bridged = () => typeof window !== 'undefined' && Boolean(window.dmApi)

function base(): string {
  return state.session?.baseUrl ?? ''
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
    // A full origin, so every caller handles one shape. The beacon is LAN-only
    // by definition, and a LAN host is always plain http.
    return found ? `http://${found.address}:${found.port}` : null
  } catch {
    return null
  }
}

/** How long to keep asking whether the DM has answered, and how often. */
const APPROVAL_TIMEOUT_MS = 120_000
const APPROVAL_POLL_MS = 2000

/**
 * Wait for the DM to let us in.
 *
 * The host answers a remote join with 202 and a ticket rather than holding the
 * request open — an open connection interacts badly with proxy timeouts — so
 * the waiting happens here. `onWaiting` fires once so the UI can say what is
 * going on instead of looking hung.
 */
async function awaitApproval(
  baseUrl: string,
  ticket: string,
  onWaiting?: () => void,
): Promise<Record<string, unknown>> {
  onWaiting?.()
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS
  for (;;) {
    await new Promise((r) => setTimeout(r, APPROVAL_POLL_MS))
    const res = await fetch(
      `${baseUrl}/join/status?ticket=${encodeURIComponent(ticket)}`,
    )
    const body = (await res.json()) as Record<string, unknown>
    if (res.status === 200) return body
    if (res.status === 202) {
      if (Date.now() > deadline) {
        throw new Error('The DM did not answer. Ask them, then try again.')
      }
      continue
    }
    throw new Error(
      typeof body.error === 'string' ? body.error : 'Could not join',
    )
  }
}

/**
 * Ask the host for a seat. Throws with the host's own message on refusal.
 *
 * `secret` is the extra key a table that accepts internet joins requires; a LAN
 * table ignores it. `onWaiting` fires if the DM has to approve first.
 */
export async function joinTable(
  rawAddress: string,
  code: string,
  name: string,
  opts: { secret?: string; onWaiting?: () => void } = {},
): Promise<void> {
  const baseUrl = normalizeBaseUrl(rawAddress)
  if (!baseUrl) throw new Error('That does not look like an address')
  const res = await fetch(`${baseUrl}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      name,
      ...(opts.secret ? { secret: opts.secret } : {}),
    }),
  })
  let body = (await res.json()) as Record<string, unknown>
  if (!res.ok && res.status !== 202) {
    throw new Error(
      typeof body.error === 'string' ? body.error : 'Could not join',
    )
  }
  // 202 means the DM has to let us in first.
  if (res.status === 202) {
    const ticket = typeof body.ticket === 'string' ? body.ticket : ''
    if (!ticket) throw new Error('Could not join')
    body = await awaitApproval(baseUrl, ticket, opts.onWaiting)
  }
  setState({
    session: {
      baseUrl,
      tableId: String(body.tableId),
      seatId: String(body.seatId),
      token: String(body.token),
      name: String(body.name ?? name),
    },
  })
  // From here on, a roll made on this machine also goes up to the host.
  unsubscribeRolls?.()
  unsubscribeRolls = onLocalRoll(sendRoll)
  // A character chosen on the join screen is applied now that there is a seat
  // to attach it to.
  if (pending) {
    bringOwnCharacter(
      pending.worldId,
      pending.articleId,
      pending.title,
      pending.content,
    )
    pending = null
  }
  openStream()
}

function openStream(): void {
  stream?.close()
  const session = state.session
  if (!session) return
  const es = new EventSource(
    `${session.baseUrl}/events?token=${encodeURIComponent(session.token)}`,
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
      // null is the DM taking it down, and is meaningfully different from a
      // malformed frame: the first clears the screen, the second must leave
      // whatever is there alone rather than blanking it on a bad payload.
      if (p === null) setState({ shown: null })
      else if (isShown(p)) setState({ shown: p })
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
  // Tell the host the display name so rolls read "Sarah as Thalia". Nothing is
  // claimed — the host holds no file — and a failure only costs the label.
  if (state.session)
    void send('/playing', { characterName: title }).catch(() => {})
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
  pending = null
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

/**
 * The current state, for callers outside React and for tests. Inside a
 * component use `useGuest` so the read is subscribed.
 */
export function guestSnapshot(): GuestState {
  return state
}

/** Reset between tests. Not used by the app. */
export function resetGuestForTest(): void {
  stream = null
  unsubscribeRolls?.()
  unsubscribeRolls = null
  state = empty
}
