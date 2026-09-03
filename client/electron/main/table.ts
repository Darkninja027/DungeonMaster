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
): TableState {
  const takenBy = state.seats.find(
    (s) => s.characterId === characterId && s.id !== seatId,
  )
  if (takenBy) return state
  return {
    ...state,
    seats: state.seats.map((s) =>
      s.id === seatId ? { ...s, characterId } : s,
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
}

export function parseJoin(raw: unknown): JoinRequest | null {
  if (!isRecord(raw)) return null
  const code = str(raw.code)
  const name = str(raw.name)
  if (!code || !name) return null
  return { code, name: name.slice(0, 40) }
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
