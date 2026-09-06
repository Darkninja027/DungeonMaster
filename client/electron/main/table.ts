import crypto from 'node:crypto'

/**
 * The pure core of LAN table hosting: room codes, seats, and the validators
 * every inbound network payload passes through.
 *
 * Electron-free and IO-free by design, the same split watcher.ts follows — the
 * HTTP server that uses this lives in tableHost.ts and is untested, while
 * everything decision-making lives here and is covered by table.test.ts.
 *
 * The word "player" is deliberately absent. It already means three unrelated
 * things in this codebase (a WorldMode, a ViewerMode, and a BookView audience),
 * so a human on another machine is a SEAT at a TABLE, and the two roles are
 * HOST and GUEST.
 */

/** A connected participant. `characterId` is set once they claim a sheet. */
export interface Seat {
  id: string
  name: string
  /** Article id of the character this seat rolls as, once claimed. */
  characterId?: string
  /**
   * Display name of the character this seat is playing.
   *
   * Set for a claimed character from the host's own world, and ALSO for one a
   * guest brought from their own vault — which the host otherwise knows
   * nothing about. In that second case the guest supplies it, so it is a
   * LABEL and never an identity: it is shown beside rolls and is not used to
   * authorise anything. seatOwns still gates every write.
   */
  characterName?: string
  joinedAt: number
}

export interface TableState {
  /** Opaque per-session handle. NEVER a world id — see tableHost.ts. */
  tableId: string
  code: string
  seats: Array<Seat>
}

/**
 * Room codes are shown on the DM's screen and typed by hand, so they avoid
 * characters that are misread aloud or on a projector: no 0/O, no 1/I/L.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LEN = 6

export function makeCode(random: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  }
  return `${out.slice(0, 3)}-${out.slice(3)}`
}

/** Normalise a typed code: case and the separator are not the guest's problem. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Constant-time code comparison.
 *
 * A short code over a LAN is not a serious secret, but an early-exit compare
 * leaks its prefix to anyone who can time responses, and the fix is three
 * lines. Length is compared first because timingSafeEqual throws on a mismatch.
 */
export function codeMatches(expected: string, given: string): boolean {
  const a = Buffer.from(normalizeCode(expected))
  const b = Buffer.from(normalizeCode(given))
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function emptyTable(
  tableId = crypto.randomUUID(),
  code = makeCode(),
): TableState {
  return { tableId, code, seats: [] }
}

/** Duplicate names get auto-suffixed, the same rule withCombatantAdded uses. */
export function withSeatAdded(
  state: TableState,
  name: string,
  id: string,
  at: number,
): TableState {
  const base = name.trim().slice(0, 40) || 'Guest'
  const taken = new Set(state.seats.map((s) => s.name.toLowerCase()))
  let unique = base
  for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${base} ${n}`
  return {
    ...state,
    seats: [...state.seats, { id, name: unique, joinedAt: at }],
  }
}

export function withSeatRemoved(state: TableState, id: string): TableState {
  return { ...state, seats: state.seats.filter((s) => s.id !== id) }
}

/**
 * Claim a character for a seat.
 *
 * One character per seat and one seat per character: two people rolling as the
 * same sheet would make the write-back rules ambiguous, and silently letting
 * the second claim win would take the first person's sheet away mid-session.
 */
export function withCharacterClaimed(
  state: TableState,
  seatId: string,
  characterId: string,
  characterName?: string,
): TableState {
  const takenBy = state.seats.find(
    (s) => s.characterId === characterId && s.id !== seatId,
  )
  if (takenBy) return state
  return {
    ...state,
    seats: state.seats.map((s) =>
      s.id === seatId ? { ...s, characterId, characterName } : s,
    ),
  }
}

/**
 * Record what a seat is playing WITHOUT claiming anything.
 *
 * For a character the guest brought from their own vault: the host holds no
 * file, so there is nothing to claim and nothing for two people to collide
 * over. It exists only so a roll can read "Sarah as Thalia" — which is why it
 * clears characterId rather than setting one. A label must never become
 * authorisation, and seatOwns still gates every write.
 */
export function withCharacterNamed(
  state: TableState,
  seatId: string,
  characterName: string,
): TableState {
  const name = characterName.trim().slice(0, 60)
  return {
    ...state,
    seats: state.seats.map((s) =>
      s.id === seatId
        ? { ...s, characterId: undefined, characterName: name || undefined }
        : s,
    ),
  }
}

/** Whether this seat may write to this character's sheet. */
export function seatOwns(
  state: TableState,
  seatId: string,
  characterId: string,
): boolean {
  const seat = state.seats.find((s) => s.id === seatId)
  return seat?.characterId === characterId
}

// --- Where a request came from ----------------------------------------------

/** The CGNAT range Tailscale allocates from (100.64.0.0/10). */
function inTailscaleRange(a: number, b: number): boolean {
  return a === 100 && b >= 64 && b <= 127
}

/**
 * Whether an address is on the machine or a private network.
 *
 * Used to EXEMPT a genuinely local join from the remote secret, never as the
 * sole gate. Behind a tunnel or reverse proxy the socket's peer is the proxy —
 * loopback — so an address check alone would wave through exactly the traffic
 * it was meant to stop. x-forwarded-for is not consulted: it is set by the
 * caller and is therefore a claim, not evidence.
 *
 * Tailscale's range counts as private. It is a WireGuard overlay only invited
 * devices can reach, which is a stronger boundary than the room code.
 */
export function isPrivateAddress(raw: string): boolean {
  if (!raw) return false
  let addr = raw.trim().toLowerCase()
  // Node reports an IPv4 peer on a dual-stack socket as ::ffff:192.168.1.5.
  if (addr.startsWith('::ffff:')) addr = addr.slice(7)
  // A zone index (fe80::1%eth0) is not part of the address.
  const pct = addr.indexOf('%')
  if (pct !== -1) addr = addr.slice(0, pct)
  if (addr === '::1' || addr === '::') return true
  if (addr.includes(':')) {
    // fc00::/7 — unique local. The high bit of the second nibble is what
    // separates fc00::/8 from fd00::/8, and both are in the range.
    return /^f[cd][0-9a-f]{0,2}:/.test(addr) || /^fe[89ab][0-9a-f]?:/.test(addr)
  }
  const parts = addr.split('.')
  if (parts.length !== 4) return false
  const n = parts.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : Number.NaN))
  if (n.some((x) => Number.isNaN(x) || x > 255)) return false
  const [a, b] = n
  if (a === 10) return true
  if (a === 127) return true
  // 172.16/12 is 172.16 through 172.31 — 172.15 and 172.32 are public, which
  // is the boundary everyone gets wrong.
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  return inTailscaleRange(a, b)
}

/**
 * Whether an address looks like a Tailscale one, for labelling in the DM's UI.
 *
 * Purely cosmetic — it lets the panel say "works from anywhere" beside the
 * right row. No network call: lanAddresses() already surfaces the interface,
 * because a Tailscale adapter is a non-internal IPv4 one like any other.
 */
export function isTailscaleAddress(raw: string): boolean {
  const parts = raw.trim().split('.')
  if (parts.length !== 4) return false
  const n = parts.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : Number.NaN))
  if (n.some((x) => Number.isNaN(x) || x > 255)) return false
  return inTailscaleRange(n[0], n[1])
}

// --- Remote access ----------------------------------------------------------

/**
 * How many seats a table will hold.
 *
 * Generous for D&D and finite on purpose: /join mints a seat and a token per
 * call, so without a ceiling a leaked code is unbounded allocation plus a seat
 * list broadcast to every guest on every join.
 */
export const MAX_SEATS = 8

/** Whether there is room for another seat. */
export function canSeat(state: TableState, max = MAX_SEATS): boolean {
  return state.seats.length < max
}

/**
 * The extra secret a remote join must present, on top of the room code.
 *
 * The 6-char code is read aloud at a table and is worth ~2^30 — fine against a
 * rate-limited LAN, thin when anyone on the internet can try. Rather than
 * lengthening it and ruining the one thing it is good at, a remote join needs
 * this as well, and the DM pastes origin + code + secret as a single link.
 */
const REMOTE_SECRET_LEN = 16

export function makeRemoteSecret(random: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < REMOTE_SECRET_LEN; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  }
  return out
}

/** Constant-time secret comparison, the same reasoning as codeMatches. */
export function secretMatches(expected: string, given: string): boolean {
  const a = Buffer.from(normalizeCode(expected))
  const b = Buffer.from(normalizeCode(given))
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// --- Per-seat request allowance ---------------------------------------------

/**
 * A token bucket: `tokens` refills at `ratePerSec` up to `capacity`.
 *
 * Only /join was ever limited, which is the right shape for a LAN — everything
 * past it needs a seat, and a seat was someone in the room. Reachable from
 * outside, an authenticated seat can still make /roll fan out to every guest
 * and /sheet fan an IPC message to every window, so the allowance follows the
 * seat rather than stopping at the door.
 *
 * A burst is allowed on purpose: opening a sheet fires several requests at
 * once, and a strict per-second cap would refuse ordinary use.
 */
export interface Bucket {
  tokens: number
  last: number
}

/** Sustained requests per second per seat, and the burst it may spend at once. */
export const SEAT_RATE_PER_SEC = 5
export const SEAT_BURST = 20

export function newBucket(now: number, capacity = SEAT_BURST): Bucket {
  return { tokens: capacity, last: now }
}

/**
 * Spend one token, refilling first. Returns false when the seat is over its
 * allowance — mutates, because the bucket belongs to a long-lived seat.
 */
export function takeToken(
  bucket: Bucket,
  now: number,
  ratePerSec = SEAT_RATE_PER_SEC,
  capacity = SEAT_BURST,
): boolean {
  const elapsed = Math.max(0, now - bucket.last) / 1000
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * ratePerSec)
  bucket.last = now
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

// --- Waiting to be let in ---------------------------------------------------

/**
 * A remote join the DM has not answered yet.
 *
 * Only remote joins wait. At a real table you can see who sat down, so making
 * the DM click for someone in the room is friction with nothing behind it —
 * over the internet, a leaked code is otherwise a stranger in your seat list.
 */
export interface PendingJoin {
  ticket: string
  name: string
  at: number
  status: 'waiting' | 'approved' | 'denied'
  /** Set once approved, so the poll can hand back the real seat. */
  seatId?: string
  token?: string
}

/** How long an unanswered request stays on the DM's screen. */
export const PENDING_TTL_MS = 120_000

/**
 * How many may queue at once. The pending list is reachable by anyone holding
 * the code, so without a cap it is simply the unbounded map moved one endpoint
 * along.
 */
export const MAX_PENDING = 16

export function withPendingAdded(
  pending: Array<PendingJoin>,
  ticket: string,
  name: string,
  at: number,
): Array<PendingJoin> {
  return [
    ...pending,
    {
      ticket,
      name: name.trim().slice(0, 40) || 'Guest',
      at,
      status: 'waiting',
    },
  ]
}

/**
 * Answer one request.
 *
 * A ticket that is missing, already answered, or expired is a no-op rather than
 * an error: the DM's panel and the guest's poll race by nature, and the losing
 * side must not throw. Approving carries the seat identity, so the poll has
 * something to hand back — and it is set HERE rather than at poll time, so a
 * ticket can never mint two seats.
 */
export function withPendingAnswered(
  pending: Array<PendingJoin>,
  ticket: string,
  status: 'approved' | 'denied',
  seat?: { seatId: string; token: string },
): Array<PendingJoin> {
  return pending.map((p) =>
    p.ticket === ticket && p.status === 'waiting'
      ? { ...p, status, ...(seat ?? {}) }
      : p,
  )
}

/** Drop what has aged out, then cap oldest-first. */
export function withPendingPruned(
  pending: Array<PendingJoin>,
  now: number,
  ttlMs = PENDING_TTL_MS,
  max = MAX_PENDING,
): Array<PendingJoin> {
  const live = pending.filter((p) => now - p.at < ttlMs)
  return live.length <= max ? live : live.slice(live.length - max)
}

/** The ones the DM still has to answer. */
export function waitingJoins(pending: Array<PendingJoin>): Array<PendingJoin> {
  return pending.filter((p) => p.status === 'waiting')
}

// --- Reconnection -----------------------------------------------------------

/**
 * How long a seat survives with no event stream attached.
 *
 * EventSource reconnects on its own with backoff, so a dropped stream is
 * ordinarily a blip rather than a departure — a lid closed, a wifi handover, a
 * phone changing cell. Reaping the seat the instant the socket dies would drop
 * the guest from the table and, worse, invalidate their token, so the automatic
 * reconnect would then fail with 401 and strand them on the join screen.
 *
 * Long enough to cover EventSource's first few retries; short enough that a
 * guest who really has gone leaves the seat list while the DM still cares.
 */
export const SEAT_GRACE_MS = 30_000

// --- Rate limiting ----------------------------------------------------------

/** One address's recent bad attempts. `until` is when the window expires. */
export interface AttemptRecord {
  n: number
  until: number
}

/**
 * How many addresses the attempt map may hold before the oldest are evicted.
 *
 * A sweep of expired records is not enough on its own: a burst of requests from
 * many distinct addresses inserts faster than any of them expire, so the map
 * needs a hard ceiling too. On a LAN neither ever binds; reachable from outside,
 * the map is otherwise an unbounded allocation any stranger can drive.
 */
export const MAX_ATTEMPT_ENTRIES = 4096

/**
 * Drop expired records, then evict oldest-first down to `maxEntries`.
 *
 * Mutates in place — the caller owns a long-lived map and swapping it for a
 * copy on every request would defeat the point. Eviction is by `until`, so the
 * entry closest to expiring goes first; that can discard a live limit under a
 * flood, which is the right trade, since the alternative is unbounded growth.
 */
export function pruneAttempts(
  attempts: Map<string, AttemptRecord>,
  now: number,
  maxEntries = MAX_ATTEMPT_ENTRIES,
): void {
  for (const [addr, rec] of attempts) {
    if (rec.until < now) attempts.delete(addr)
  }
  if (attempts.size <= maxEntries) return
  const byExpiry = [...attempts.entries()].sort(
    (a, b) => a[1].until - b[1].until,
  )
  for (const [addr] of byExpiry.slice(0, attempts.size - maxEntries)) {
    attempts.delete(addr)
  }
}

// --- Inbound payload validation --------------------------------------------

/**
 * Every value below arrives from a REMOTE machine, so it is typed `unknown` and
 * narrowed here. This is the same discipline libraryFolder() follows in ipc.ts
 * ("it crosses IPC, so the renderer's type is a claim, not a guarantee") — over
 * a network that stops being hygiene and becomes the security boundary.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= 512 ? v : null

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

export interface JoinRequest {
  code: string
  name: string
  /**
   * The extra secret a remote join carries. Optional here rather than in two
   * shapes: a LAN join legitimately has none, and whether one is REQUIRED is a
   * question about the host's settings and the caller's address, which this
   * pure parser cannot see. It only says whether one was supplied.
   */
  secret?: string
}

export function parseJoin(raw: unknown): JoinRequest | null {
  if (!isRecord(raw)) return null
  const code = str(raw.code)
  const name = str(raw.name)
  if (!code || !name) return null
  const secret = str(raw.secret)
  return { code, name: name.slice(0, 40), ...(secret ? { secret } : {}) }
}

/**
 * An article id from a guest. Rejected outright if it tries to traverse or
 * name a drive — resolveInWorld would catch it anyway, but a guest has no
 * legitimate reason to send such a string, so refusing early keeps the error
 * honest rather than surfacing a path in a message that crosses the wire.
 */
export function parseArticleId(raw: unknown): string | null {
  const id = str(raw)
  if (!id) return null
  if (id.includes('..') || id.includes('\\') || /^[a-zA-Z]:/.test(id))
    return null
  if (id.startsWith('/') || id.endsWith('/')) return null
  return id
}

export interface RollMessage {
  id: string
  notation: string
  label?: string
  total: number
  detail: string
  at: number
}

/**
 * A guest's roll. The numbers are computed on the guest's machine and are
 * therefore UNVERIFIABLE — rollDice() has no injectable rng, so the host cannot
 * recompute them. That is an accepted trade for a friendly table; the bounds
 * below only stop a malformed or absurd payload, not a determined cheat.
 */
export function parseRoll(raw: unknown): RollMessage | null {
  if (!isRecord(raw)) return null
  const id = str(raw.id)
  const notation = str(raw.notation)
  const total = num(raw.total)
  const at = num(raw.at)
  if (!id || !notation || total === null || at === null) return null
  if (notation.length > 32) return null
  if (Math.abs(total) > 100000) return null
  const detail = typeof raw.detail === 'string' ? raw.detail.slice(0, 512) : ''
  const label = str(raw.label)
  return {
    id,
    notation,
    total,
    detail,
    at,
    ...(label ? { label: label.slice(0, 80) } : {}),
  }
}

/**
 * The fields a guest may change on their own sheet. Deliberately tiny: HP is
 * what changes minute to minute at a table, and anything structural (class,
 * level, abilities, the article path) stays the DM's. An unlisted field is
 * dropped rather than rejected, so one stray key cannot fail a whole update.
 *
 * This list must agree with SheetPatch in src/lib/sheetPatch.ts, which does the
 * applying — a field accepted here and unknown there is silently discarded
 * after a successful-looking 200. Conditions and notes are absent because
 * `Character` has no conditions field and its notes are structured entries
 * rather than a string; adding either means teaching the applier that shape.
 */
export const SHEET_PATCH_FIELDS = ['hpCurrent', 'hpTemp'] as const

export type SheetPatch = Partial<{
  hpCurrent: number
  hpTemp: number
}>

export interface SheetMessage {
  characterId: string
  patch: SheetPatch
}

export function parseSheetPatch(raw: unknown): SheetMessage | null {
  if (!isRecord(raw)) return null
  const characterId = parseArticleId(raw.characterId)
  if (!characterId) return null
  if (!isRecord(raw.patch)) return null

  const patch: SheetPatch = {}
  const p = raw.patch
  const hpCurrent = num(p.hpCurrent)
  if (hpCurrent !== null) patch.hpCurrent = Math.max(0, Math.floor(hpCurrent))
  const hpTemp = num(p.hpTemp)
  if (hpTemp !== null) patch.hpTemp = Math.max(0, Math.floor(hpTemp))
  // An empty patch is a no-op write; refuse it so the caller never touches disk
  // for nothing and the guest gets a clear 400 rather than a silent success.
  return Object.keys(patch).length > 0 ? { characterId, patch } : null
}

/**
 * Scrub an error before it crosses the wire.
 *
 * worldRoot() throws with the full absolute path in the message, and several fs
 * errors carry one too. A guest must never learn the DM's directory layout, so
 * anything that is not a plain hand-written phrase becomes a flat string.
 */
export function safeError(err: unknown): string {
  if (err instanceof Error && /^[A-Za-z ]+$/.test(err.message)) {
    return err.message
  }
  return 'Request failed'
}
