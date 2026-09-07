import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import { BrowserWindow } from 'electron'
import { resolveInImages } from './images'
import { IMAGES_DIR, getArticle, worldRoot } from './worldStore'
import { listCharacters } from './search'
import { startBeacon, stopBeacon } from './beacon'
import {
  codeMatches,
  emptyTable,
  parseArticleId,
  parseJoin,
  parseRoll,
  parseSheetPatch,
  safeError,
  seatOwns,
  withCharacterClaimed,
  withCharacterNamed,
  withSeatAdded,
  withSeatRemoved,
} from './table'
import type { TableState } from './table'

/**
 * LAN session host: one DM serves N guests over plain HTTP.
 *
 * Transport is Server-Sent Events downstream and ordinary POSTs upstream, on
 * node:http with NO new dependency. The traffic is asymmetric and low rate — a
 * broadcast one way, occasional discrete actions the other — so a websocket
 * would buy little and cost a runtime dep plus esbuild and electron-builder
 * native-rebuild config. EventSource also brings reconnection with backoff for
 * free, which is the part you would otherwise hand-roll.
 *
 * Electron-coupled and IO-bound, so untested; every decision it makes lives in
 * table.ts, which is pure and covered. The same split watcher.ts follows.
 *
 * SECURITY. Two rules hold this together and both are easy to break:
 *   1. A world id NEVER crosses the wire. It is hex of the DM's absolute path
 *      (sanitize.ts), so it would leak the directory layout and be meaningless
 *      on the guest's machine anyway. Guests see `tableId`; the mapping back to
 *      a real root lives only in this module.
 *   2. Every inbound value is `unknown` until table.ts narrows it, and every
 *      path funnels through resolveInWorld. That guard used to defend against a
 *      buggy local renderer; here it defends against a remote caller.
 */

/**
 * The default port. `hostTable` takes an override so tests can bind an
 * ephemeral one — a fixed port makes back-to-back hosts race, because a closed
 * listener lingers in TIME_WAIT for a moment after close().
 */
const DEFAULT_PORT = 7777

/** How many bad room codes one address may try before it is refused outright. */
const MAX_CODE_ATTEMPTS = 10
const ATTEMPT_WINDOW_MS = 60_000

interface Guest {
  seatId: string
  token: string
  /**
   * The open SSE response, once the guest connects to /events. Undefined
   * between /join and that connection — a seat exists in that gap, so every
   * write must check rather than assume.
   */
  res?: http.ServerResponse
}

interface Session {
  server: http.Server
  worldId: string
  port: number
  state: TableState
  guests: Map<string, Guest>
  /** Last thing the DM showed, replayed to a guest the moment it connects. */
  shown: unknown
  /** The shared roll log, replayed on connect. Newest last. */
  rolls: Array<unknown>
  /** Initiative, replayed on connect. */
  combat: unknown
}

let session: Session | null = null
const attempts = new Map<string, { n: number; until: number }>()

/** Fan out one event to every connected guest. */
function broadcast(kind: string, payload: unknown): void {
  if (!session) return
  const frame = `data: ${JSON.stringify({ v: 1, kind, at: Date.now(), payload })}\n\n`
  for (const guest of session.guests.values()) {
    if (!guest.res) continue // joined but not yet streaming
    // A guest that has gone away without closing cleanly throws here; dropping
    // it is handled by the 'close' handler, so failures are ignored.
    try {
      guest.res.write(frame)
    } catch {
      /* the close handler will reap it */
    }
  }
}

/** Tell the DM window the seat list changed, so its UI can show who is here. */
function notifyHost(): void {
  if (!session) return
  const payload = {
    tableId: session.state.tableId,
    code: session.state.code,
    seats: session.state.seats,
    // What the guests are looking at, so the DM's panel can say so and offer
    // to take it down. Only the identity travels, never the content — the DM
    // window already has the article.
    shown: shownRef(),
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('table:seats', payload)
  }
}

/**
 * Headers that let a guest's renderer actually READ the response.
 *
 * A guest is a browser context on another machine, so every call here is
 * cross-origin and the browser discards the response unless told otherwise.
 * Without these, joining fails as an opaque "failed to fetch" while the server
 * logs a perfectly successful request — which is exactly as confusing to debug
 * as it sounds, and is invisible to a Node-based test because Node's fetch does
 * not enforce CORS.
 *
 * '*' is the right origin here. The room code and the per-seat token are what
 * gate access; the origin of a desktop app's renderer is not a meaningful
 * identity to check, being a dev-server URL in development and file:// in a
 * build.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
} as const

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...CORS,
  })
  res.end(text)
}

/** Read a JSON body with a hard cap, so a guest cannot exhaust host memory. */
async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const MAX = 64 * 1024
  const chunks: Array<Buffer> = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX) throw new Error('Payload too large')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new Error('Malformed request')
  }
}

/** The seat behind a request, or null if the token is unknown. */
function seatFor(req: http.IncomingMessage, url: URL): Guest | null {
  if (!session) return null
  const token =
    url.searchParams.get('token') ??
    req.headers.authorization?.replace(/^Bearer\s+/i, '') ??
    ''
  if (!token) return null
  for (const guest of session.guests.values()) {
    if (guest.token === token) return guest
  }
  return null
}

function rateLimited(addr: string): boolean {
  const now = Date.now()
  const rec = attempts.get(addr)
  if (!rec || rec.until < now) return false
  return rec.n >= MAX_CODE_ATTEMPTS
}

function noteAttempt(addr: string): void {
  const now = Date.now()
  const rec = attempts.get(addr)
  if (!rec || rec.until < now) {
    attempts.set(addr, { n: 1, until: now + ATTEMPT_WINDOW_MS })
  } else {
    rec.n += 1
  }
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  // Preflight is answered before EVERY other check, auth included: the browser
  // sends it without credentials, so a 401 here would block the real request
  // that was about to carry them.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }
  if (!session) return json(res, 503, { error: 'No table is running' })
  const url = new URL(
    req.url ?? '/',
    `http://${req.headers.host ?? 'localhost'}`,
  )
  const addr = req.socket.remoteAddress ?? 'unknown'

  // --- join -----------------------------------------------------------------
  if (req.method === 'POST' && url.pathname === '/join') {
    if (rateLimited(addr)) return json(res, 429, { error: 'Too many attempts' })
    const body = parseJoin(await readJson(req))
    if (!body) return json(res, 400, { error: 'Malformed request' })
    if (!codeMatches(session.state.code, body.code)) {
      noteAttempt(addr)
      return json(res, 403, { error: 'Wrong room code' })
    }
    const seatId = crypto.randomUUID()
    const token = crypto.randomBytes(24).toString('hex')
    session.state = withSeatAdded(session.state, body.name, seatId, Date.now())
    session.guests.set(seatId, { seatId, token })
    notifyHost()
    const seat = session.state.seats.find((s) => s.id === seatId)
    return json(res, 200, {
      tableId: session.state.tableId,
      seatId,
      token,
      name: seat?.name,
    })
  }

  // --- event stream ---------------------------------------------------------
  if (req.method === 'GET' && url.pathname === '/events') {
    const guest = seatFor(req, url)
    if (!guest) return json(res, 401, { error: 'Unknown seat' })
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      ...CORS,
    })
    guest.res = res

    // Replay is not an optimisation. A guest joining mid-session would
    // otherwise stare at a blank screen until the DM's next action.
    const hello = {
      v: 1,
      kind: 'hello',
      at: Date.now(),
      payload: {
        seats: session.state.seats,
        shown: session.shown,
        rolls: session.rolls,
        combat: session.combat,
      },
    }
    res.write(`data: ${JSON.stringify(hello)}\n\n`)

    // Comment frames keep proxies and aggressive NAT tables from closing an
    // idle stream; EventSource ignores them.
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n')
      } catch {
        /* reaped below */
      }
    }, 25_000)

    req.on('close', () => {
      clearInterval(ping)
      if (!session) return
      session.guests.delete(guest.seatId)
      session.state = withSeatRemoved(session.state, guest.seatId)
      notifyHost()
      broadcast('seats', session.state.seats)
    })
    broadcast('seats', session.state.seats)
    return
  }

  // Everything past here needs a seat.
  const guest = seatFor(req, url)
  if (!guest) return json(res, 401, { error: 'Unknown seat' })

  // --- the characters a guest may claim ---------------------------------------
  // Without this the claim endpoint is unusable: a guest would have to already
  // know an article id it has no way to discover. Only the id, title and who
  // holds it — never the sheet, which is the next call and needs the claim.
  if (req.method === 'GET' && url.pathname === '/characters') {
    const held = new Map(
      session.state.seats
        .filter((seat) => seat.characterId)
        .map((seat) => [seat.characterId!, seat.name]),
    )
    return json(res, 200, {
      characters: listCharacters(session.worldId).map((c) => ({
        id: c.id,
        title: c.title,
        claimedBy: held.get(c.id) ?? null,
      })),
    })
  }

  // --- the sheet this seat claimed --------------------------------------------
  // Gated on the claim, not merely on having a seat: a character sheet is the
  // one piece of world content a guest can read in full, and only their own.
  if (req.method === 'GET' && url.pathname === '/sheet') {
    const characterId = parseArticleId(url.searchParams.get('characterId'))
    if (!characterId) return json(res, 400, { error: 'Malformed request' })
    if (!seatOwns(session.state, guest.seatId, characterId)) {
      return json(res, 403, { error: 'Not your character' })
    }
    try {
      const article = getArticle(session.worldId, characterId)
      return json(res, 200, {
        id: characterId,
        title: article.title,
        content: article.content,
      })
    } catch (err) {
      return json(res, 404, { error: safeError(err) })
    }
  }

  // --- claim a character ----------------------------------------------------
  if (req.method === 'POST' && url.pathname === '/claim') {
    const raw = await readJson(req)
    const characterId = parseArticleId(
      (raw as Record<string, unknown> | null)?.characterId,
    )
    if (!characterId) return json(res, 400, { error: 'Malformed request' })
    let claimedName: string | undefined
    try {
      claimedName = getArticle(session.worldId, characterId).title
    } catch {
      // A claim for an article that has since gone is refused below by
      // seatOwns failing, so a missing title is not worth failing here.
    }
    session.state = withCharacterClaimed(
      session.state,
      guest.seatId,
      characterId,
      claimedName,
    )
    const ok = seatOwns(session.state, guest.seatId, characterId)
    notifyHost()
    broadcast('seats', session.state.seats)
    return ok
      ? json(res, 200, { characterId })
      : json(res, 409, { error: 'Already claimed' })
  }

  // --- a guest is playing a character the host does not hold --------------------
  // For a character brought from the guest's own vault. Nothing is claimed,
  // because the host holds no file — this only makes rolls readable as
  // "Sarah (Thalia)".
  if (req.method === 'POST' && url.pathname === '/playing') {
    const raw = await readJson(req)
    const name = (raw as Record<string, unknown> | null)?.characterName
    if (typeof name !== 'string') {
      return json(res, 400, { error: 'Malformed request' })
    }
    session.state = withCharacterNamed(session.state, guest.seatId, name)
    notifyHost()
    broadcast('seats', session.state.seats)
    return json(res, 200, { ok: true })
  }

  // --- a guest rolled -------------------------------------------------------
  if (req.method === 'POST' && url.pathname === '/roll') {
    const roll = parseRoll(await readJson(req))
    if (!roll) return json(res, 400, { error: 'Malformed request' })
    const seat = session.state.seats.find((s) => s.id === guest.seatId)
    // The seat is stamped HOST-side. A guest naming its own seat could
    // attribute a roll to someone else. The character name rides along so the
    // DM's roll history can read "Sarah (Thalia)" — it is a label the guest
    // supplied for a vault character, so it is never used to authorise
    // anything; seatOwns still gates every write.
    const entry = {
      ...roll,
      seat: seat
        ? { id: seat.id, name: seat.name, character: seat.characterName }
        : undefined,
    }
    const safe = forGuests(entry)
    session.rolls = [...session.rolls, safe].slice(-200)
    broadcast('roll', safe)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('table:roll', entry)
    }
    return json(res, 200, { ok: true })
  }

  // --- a guest edited their own sheet ---------------------------------------
  if (req.method === 'POST' && url.pathname === '/sheet') {
    const msg = parseSheetPatch(await readJson(req))
    if (!msg) return json(res, 400, { error: 'Malformed request' })
    // The claim gates the write; the room code only gates the connection.
    if (!seatOwns(session.state, guest.seatId, msg.characterId)) {
      return json(res, 403, { error: 'Not your character' })
    }
    // Applied in the renderer, which owns character parse/serialize — main
    // stays free of sheet knowledge, the same way it stays free of homebrew.
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('table:sheet', {
          seatId: guest.seatId,
          ...msg,
        })
      }
    }
    return json(res, 200, { ok: true })
  }

  // --- images ---------------------------------------------------------------
  // The world:// protocol is Electron-only and per-machine, so a guest cannot
  // use it. This is its second front door and reuses the SAME guard chain as
  // handleWorldProtocol: _images/ prefix first, then resolveInWorld.
  if (req.method === 'GET' && url.pathname.startsWith('/img/')) {
    const rel = decodeURIComponent(url.pathname.slice('/img/'.length))
    if (!rel.startsWith(`${IMAGES_DIR}/`))
      return json(res, 403, { error: 'Forbidden' })
    try {
      // resolveInImages, NOT resolveInWorld. The latter only blocks escaping
      // the WORLD, so '_images/../secret.md' passes the prefix check above,
      // stays inside the world, and would be served. That is the exact trap
      // images.ts documents, and it is a file-read hole when the caller is
      // remote. Verified by a test in tableHost.test.ts.
      const abs = resolveInImages(
        worldRoot(session.worldId),
        rel.slice(IMAGES_DIR.length + 1),
      )
      if (!fs.existsSync(abs)) return json(res, 404, { error: 'Not found' })
      res.writeHead(200, { 'cache-control': 'max-age=300', ...CORS })
      fs.createReadStream(abs).pipe(res)
    } catch (err) {
      json(res, 400, { error: safeError(err) })
    }
    return
  }

  json(res, 404, { error: 'Not found' })
}

/** LAN addresses this host can be reached on, for the DM's UI. */
export function lanAddresses(): Array<string> {
  const out: Array<string> = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}

/**
 * Mirrors TableInfo in src/lib/api.ts — a separate declaration, since main and
 * the renderer share no types, so a field added here needs adding there too.
 */
export interface TableInfo {
  tableId: string
  code: string
  port: number
  addresses: Array<string>
  seats: TableState['seats']
  /** What the guests are looking at. Identity only, never the content. */
  shown: { articleId: string; title: string } | null
}

export function hostTable(worldId: string, port = DEFAULT_PORT): TableInfo {
  if (session) stopTable()
  const state = emptyTable()
  const server = http.createServer((req, res) => {
    void handle(req, res).catch((err) => {
      // safeError, not the raw message: worldRoot throws with the DM's full
      // path in it and this response crosses the wire.
      if (!res.headersSent) json(res, 400, { error: safeError(err) })
      else res.end()
    })
  })
  session = {
    server,
    worldId,
    port,
    state,
    guests: new Map(),
    shown: null,
    rolls: [],
    combat: null,
  }
  // Binds every interface, which includes loopback (so one machine can host and
  // join itself) and every LAN adapter. It ALSO includes any public or VPN
  // adapter the machine has, and there is no attempt to hide that: the room
  // code plus the per-seat token are what actually gate access, not the bind
  // address. tableInfo() reports only the LAN addresses, so that is what the
  // DM's panel shows and reads out.
  server.listen(port)
  // With port 0 the OS picks one, so read back what it actually bound.
  const bound = server.address()
  session.port = typeof bound === 'object' && bound ? bound.port : port
  // Announce on the LAN so a guest needs only the room code. Best effort: a
  // network that drops broadcast leaves the manual address field as the way in.
  startBeacon(state.code, session.port)
  return {
    tableId: state.tableId,
    code: state.code,
    port: session.port,
    addresses: lanAddresses(),
    seats: state.seats,
    shown: null,
  }
}

export function stopTable(): void {
  if (!session) return
  for (const guest of session.guests.values()) {
    try {
      guest.res?.end()
    } catch {
      /* already gone */
    }
  }
  stopBeacon()
  session.server.close()
  session = null
  notifyHost()
}

/** Whether a table is running, for callers that only need the yes/no. */
export function isHosting(): boolean {
  return session !== null
}

export function tableInfo(): TableInfo | null {
  if (!session) return null
  return {
    tableId: session.state.tableId,
    code: session.state.code,
    port: session.port,
    addresses: lanAddresses(),
    seats: session.state.seats,
    shown: shownRef(),
  }
}

/** Identity of whatever is on the table, for the DM's own UI. */
function shownRef(): { articleId: string; title: string } | null {
  const shown = session?.shown
  if (typeof shown !== 'object' || shown === null) return null
  const { articleId, title } = shown as Record<string, unknown>
  return typeof articleId === 'string' && typeof title === 'string'
    ? { articleId, title }
    : null
}

/** The DM showed an article. Stored for replay, then fanned out. */
export function showAtTable(payload: {
  articleId: string
  content: string
  title: string
}): void {
  if (!session) return
  session.shown = payload
  broadcast('shown', payload)
  // The DM's own window needs to know too, or its panel cannot show what is
  // on the table.
  notifyHost()
}

/**
 * Take whatever is on the table down.
 *
 * Broadcast as null rather than as empty content, so a guest can say "nothing
 * on the table" instead of rendering a blank article — and so a guest that
 * joins afterwards replays nothing rather than the last thing shown.
 */
export function clearTable(): void {
  if (!session) return
  session.shown = null
  broadcast('shown', null)
  notifyHost()
}

/**
 * Strip a roll of anything a guest must not see, or cannot use.
 *
 * A RollSource carries the world id it came from, and that is hex of the DM's
 * absolute path (sanitize.ts). Two things go wrong if it crosses the wire: it
 * leaks the DM's directory layout, and the guest's roll history renders it as
 * a link into a world that exists only on the host — which on one machine
 * actually navigates the DM's window, and on a real guest dead-ends.
 *
 * The title survives, because "who or what rolled this" is the useful part and
 * is not a path. The link target does not.
 */
function forGuests(entry: unknown): unknown {
  if (typeof entry !== 'object' || entry === null) return entry
  const roll = entry as Record<string, unknown>
  const source = roll.source
  if (typeof source !== 'object' || source === null) return entry
  const { title } = source as Record<string, unknown>
  return {
    ...roll,
    // Deliberately no worldId and no articleId: a guest can neither resolve
    // nor be trusted with either.
    source: typeof title === 'string' ? { title } : undefined,
  }
}

/** A roll made in a DM window, mirrored to the guests. */
export function pushRollToTable(entry: unknown): void {
  if (!session) return
  const safe = forGuests(entry)
  session.rolls = [...session.rolls, safe].slice(-200)
  broadcast('roll', safe)
}

/** Initiative changed on the host. */
export function pushCombatToTable(state: unknown): void {
  if (!session) return
  session.combat = state
  broadcast('combat', state)
}
