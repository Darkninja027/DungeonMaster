import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The remote-access path, against a real http server.
 *
 * Its own file rather than more cases in tableHost.test.ts, because the whole
 * point is that hostTable behaves differently when remoteAccess is ON — and
 * that setting is read from config at host time, so it has to be mocked before
 * the module is imported rather than toggled per test.
 *
 * Every request here arrives from 127.0.0.1, which isPrivateAddress treats as
 * local and therefore EXEMPT from both the secret and DM approval. That is the
 * behaviour we want in production and an obstacle in a test, so the address
 * classifier is mocked per-case to say what a real remote peer would say. The
 * classifier itself is covered directly in table.test.ts.
 */

let remoteAccess = true

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}))

vi.mock('./recents', () => ({
  readRemoteAccess: () => remoteAccess,
  readRemoteOrigin: () => null,
}))

const table = await import('./table')
const { encodeWorldId } = await import('./sanitize')
const { hostTable, stopTable, tableInfo, answerJoin } =
  await import('./tableHost')

let root: string
let base: string

/** Make every inbound request look like it came from the internet. */
function pretendRemote() {
  vi.spyOn(table, 'isPrivateAddress').mockReturnValue(false)
}

const post = (p: string, body: unknown, token?: string) =>
  fetch(`${base}${p}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

function start() {
  const info = hostTable(encodeWorldId(root), 0)
  base = `http://127.0.0.1:${info.port}`
  return info
}

describe('a table reachable from outside the LAN', () => {
  beforeEach(() => {
    remoteAccess = true
    vi.restoreAllMocks()
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-remote-'))
    fs.writeFileSync(path.join(root, 'world.json'), '{"name":"Test"}')
  })

  afterEach(() => {
    stopTable()
    vi.restoreAllMocks()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('mints a remote secret only when remote access is on', () => {
    expect(start().remoteSecret).toHaveLength(16)
    stopTable()

    // An inert secret must not be shown in the UI, where it would look like it
    // was doing something.
    remoteAccess = false
    const off = start()
    expect(off.remoteSecret).toBe('')
    expect(off.remote).toBe(false)
  })

  it('refuses a remote join that has the code but not the secret', async () => {
    const info = start()
    pretendRemote()

    const bare = await post('/join', { code: info.code, name: 'Mallory' })
    expect(bare.status).toBe(403)

    const wrong = await post('/join', {
      code: info.code,
      name: 'Mallory',
      secret: 'WRONGWRONGWRONG1',
    })
    expect(wrong.status).toBe(403)

    // No seat was created by either attempt.
    expect(tableInfo()!.seats).toEqual([])
  })

  it('does not reveal whether the code or the secret was wrong', async () => {
    const info = start()
    pretendRemote()
    const badCode = await post('/join', {
      code: 'ZZZ-999',
      name: 'M',
      secret: info.remoteSecret,
    })
    const badSecret = await post('/join', {
      code: info.code,
      name: 'M',
      secret: 'WRONGWRONGWRONG1',
    })
    expect(badCode.status).toBe(badSecret.status)
    expect(await badCode.text()).toBe(await badSecret.text())
  })

  it('queues a correct remote join instead of seating it', async () => {
    const info = start()
    pretendRemote()

    const res = await post('/join', {
      code: info.code,
      name: 'Sarah',
      secret: info.remoteSecret,
    })
    expect(res.status).toBe(202)
    const body = (await res.json()) as { status: string; ticket: string }
    expect(body.status).toBe('waiting')
    expect(body.ticket).toBeTruthy()

    // Waiting is not seated: nothing reaches the table until the DM says so.
    expect(tableInfo()!.seats).toEqual([])
    expect(tableInfo()!.waiting.map((w) => w.name)).toEqual(['Sarah'])
  })

  it('hands over a seat once the DM approves', async () => {
    const info = start()
    pretendRemote()
    const join = await post('/join', {
      code: info.code,
      name: 'Sarah',
      secret: info.remoteSecret,
    })
    const { ticket } = (await join.json()) as { ticket: string }

    // Before the answer, polling says keep waiting.
    const early = await fetch(`${base}/join/status?ticket=${ticket}`)
    expect(early.status).toBe(202)

    expect(answerJoin(ticket, true)).toBe(true)

    const after = await fetch(`${base}/join/status?ticket=${ticket}`)
    expect(after.status).toBe(200)
    const seat = (await after.json()) as { token: string; name: string }
    expect(seat.name).toBe('Sarah')

    // And the token actually works.
    const chars = await fetch(`${base}/characters?token=${seat.token}`)
    expect(chars.status).toBe(200)
    expect(tableInfo()!.seats.map((s) => s.name)).toEqual(['Sarah'])
    // Answered, so no longer waiting.
    expect(tableInfo()!.waiting).toEqual([])
  })

  it('turns away a denied guest and gives them no token', async () => {
    const info = start()
    pretendRemote()
    const join = await post('/join', {
      code: info.code,
      name: 'Mallory',
      secret: info.remoteSecret,
    })
    const { ticket } = (await join.json()) as { ticket: string }

    expect(answerJoin(ticket, false)).toBe(true)
    const after = await fetch(`${base}/join/status?ticket=${ticket}`)
    expect(after.status).toBe(403)
    expect(tableInfo()!.seats).toEqual([])
  })

  it('never mints two seats from one ticket', async () => {
    // The DM double-clicks, or approve races the guest's poll.
    const info = start()
    pretendRemote()
    const join = await post('/join', {
      code: info.code,
      name: 'Sarah',
      secret: info.remoteSecret,
    })
    const { ticket } = (await join.json()) as { ticket: string }

    expect(answerJoin(ticket, true)).toBe(true)
    expect(answerJoin(ticket, true)).toBe(false)
    expect(answerJoin(ticket, false)).toBe(false)

    expect(tableInfo()!.seats).toHaveLength(1)

    // And polling repeatedly returns the same seat rather than a new one.
    const a = (await (
      await fetch(`${base}/join/status?ticket=${ticket}`)
    ).json()) as { seatId: string }
    const b = (await (
      await fetch(`${base}/join/status?ticket=${ticket}`)
    ).json()) as { seatId: string }
    expect(a.seatId).toBe(b.seatId)
  })

  it('reports an unknown or expired ticket rather than hanging', async () => {
    start()
    pretendRemote()
    const res = await fetch(`${base}/join/status?ticket=nosuchticket`)
    expect(res.status).toBe(404)
  })

  it('lets a local guest in with no secret and no approval', async () => {
    // Remote access is ON, but this request is from the LAN. The point of the
    // address check is to leave the table at home working exactly as it did.
    const info = start()
    const res = await post('/join', { code: info.code, name: 'Brok' })
    expect(res.status).toBe(200)
    expect(tableInfo()!.seats.map((s) => s.name)).toEqual(['Brok'])
    expect(tableInfo()!.waiting).toEqual([])
  })

  it('refuses a seat past the cap', async () => {
    const info = start()
    for (let i = 0; i < table.MAX_SEATS; i++) {
      const ok = await post('/join', { code: info.code, name: `G${i}` })
      expect(ok.status).toBe(200)
    }
    const full = await post('/join', { code: info.code, name: 'OneTooMany' })
    expect(full.status).toBe(503)
    expect(tableInfo()!.seats).toHaveLength(table.MAX_SEATS)
  })

  it('rate limits a seat that floods, per seat and not per table', async () => {
    const info = start()
    const a = (await (
      await post('/join', { code: info.code, name: 'Sarah' })
    ).json()) as { token: string }
    const b = (await (
      await post('/join', { code: info.code, name: 'Brok' })
    ).json()) as { token: string }

    // Spend Sarah's whole burst and then some.
    let sawLimit = false
    for (let i = 0; i < table.SEAT_BURST + 5; i++) {
      const res = await fetch(`${base}/characters?token=${a.token}`)
      if (res.status === 429) {
        sawLimit = true
        break
      }
    }
    expect(sawLimit).toBe(true)

    // Brok is untouched: the allowance follows the seat.
    const brok = await fetch(`${base}/characters?token=${b.token}`)
    expect(brok.status).toBe(200)
  })

  it('caps how many can queue at once', async () => {
    const info = start()
    pretendRemote()
    for (let i = 0; i < table.MAX_PENDING; i++) {
      const res = await post('/join', {
        code: info.code,
        name: `W${i}`,
        secret: info.remoteSecret,
      })
      expect(res.status).toBe(202)
    }
    const over = await post('/join', {
      code: info.code,
      name: 'Extra',
      secret: info.remoteSecret,
    })
    expect(over.status).toBe(503)
  })

  it('does not demand a secret when remote access is off', async () => {
    // The address says remote, but the feature is off, so the table behaves
    // exactly as it always did — this is the LAN default and must not regress.
    remoteAccess = false
    const info = start()
    pretendRemote()
    const res = await post('/join', { code: info.code, name: 'Sarah' })
    expect(res.status).toBe(200)
  })

  it('drops the queue when the table stops', async () => {
    const info = start()
    pretendRemote()
    const join = await post('/join', {
      code: info.code,
      name: 'Sarah',
      secret: info.remoteSecret,
    })
    const { ticket } = (await join.json()) as { ticket: string }
    stopTable()
    // A ticket outliving its session would otherwise be answerable against the
    // next one.
    expect(answerJoin(ticket, true)).toBe(false)
  })
})
