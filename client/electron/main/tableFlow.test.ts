import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The whole feature end to end, driven exactly as a guest drives it: join,
 * open the event stream, then check that what the DM shows and what a guest
 * rolls reach the other side.
 *
 * tableHost.test.ts covers each endpoint's guards in isolation. This covers the
 * WIRING between them — the part unit tests structurally cannot see, and the
 * part most likely to break when a payload shape changes on one side only.
 */

const sent: Array<{ channel: string; payload: unknown }> = []

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          id: 1,
          send: (channel: string, payload: unknown) =>
            sent.push({ channel, payload }),
        },
      },
    ],
  },
}))

const { encodeWorldId } = await import('./sanitize')
const { hostTable, stopTable, tableInfo, showAtTable, pushRollToTable } =
  await import('./tableHost')

let root: string
let base: string

/** Read SSE frames off a live stream until `want` of them have arrived. */
async function collect(
  res: Response,
  want: number,
  timeoutMs = 3000,
): Promise<Array<{ kind: string; payload: unknown }>> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  const frames: Array<{ kind: string; payload: unknown }> = []
  let buffer = ''
  const deadline = Date.now() + timeoutMs
  try {
    while (frames.length < want && Date.now() < deadline) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      for (const chunk of buffer.split('\n\n')) {
        const line = chunk.trim()
        if (!line.startsWith('data:')) continue
        try {
          frames.push(
            JSON.parse(line.slice(5).trim()) as {
              kind: string
              payload: unknown
            },
          )
        } catch {
          /* partial frame; the next read completes it */
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf('\n\n') + 2)
    }
  } finally {
    await reader.cancel()
  }
  return frames
}

async function join(name: string) {
  const info = tableInfo()!
  const res = await fetch(`${base}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: info.code, name }),
  })
  return (await res.json()) as { seatId: string; token: string; name: string }
}

describe('a session end to end', () => {
  beforeEach(() => {
    sent.length = 0
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-flow-'))
    fs.writeFileSync(path.join(root, 'world.json'), '{"name":"Barovia"}')
    // A real sheet, so a claim can pick up its title for the roll label.
    fs.mkdirSync(path.join(root, 'Characters'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'Characters', 'Thalia.md'),
      ['---', 'type: character', 'level: 3', '---', '', 'Rooftops.', ''].join(
        String.fromCharCode(10),
      ),
    )
    const info = hostTable(encodeWorldId(root), 0)
    base = `http://127.0.0.1:${info.port}`
  })

  afterEach(() => {
    stopTable()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('replays the DM state to a guest the moment it connects', async () => {
    showAtTable({
      articleId: 'NPCs/Strahd',
      content: 'The count is expecting you.',
      title: 'Strahd',
    })
    pushRollToTable({
      id: 'dm1',
      notation: '1d20',
      total: 18,
      detail: '18',
      at: 1,
    })

    const seat = await join('Sarah')
    const res = await fetch(`${base}/events?token=${seat.token}`)
    const [hello] = await collect(res, 1)

    expect(hello.kind).toBe('hello')
    const payload = hello.payload as Record<string, unknown>
    expect((payload.shown as Record<string, unknown>).title).toBe('Strahd')
    expect(payload.rolls).toHaveLength(1)
    expect(payload.seats).toHaveLength(1)
  })

  it('delivers what the DM shows to an already connected guest', async () => {
    const seat = await join('Sarah')
    const res = await fetch(`${base}/events?token=${seat.token}`)

    const framesPromise = collect(res, 3)
    // Give the stream a tick to attach before broadcasting.
    await new Promise((r) => setTimeout(r, 50))
    showAtTable({
      articleId: 'NPCs/Ireena',
      content: 'She will not go quietly.',
      title: 'Ireena',
    })

    const frames = await framesPromise
    const shown = frames.find((f) => f.kind === 'shown')
    expect(shown).toBeTruthy()
    expect((shown!.payload as Record<string, unknown>).title).toBe('Ireena')
  })

  it("stamps a guest's roll with the seat the HOST knows, not the one it claims", async () => {
    const seat = await join('Sarah')
    await fetch(`${base}/events?token=${seat.token}`)

    await fetch(`${base}/roll`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${seat.token}`,
      },
      body: JSON.stringify({
        id: 'g1',
        notation: '1d20+5',
        total: 22,
        detail: '17 + 5',
        at: Date.now(),
        seat: { id: 'forged', name: 'The DM' },
      }),
    })

    // The DM window is told about it, with the real seat attached.
    const relayed = sent.find((m) => m.channel === 'table:roll')
    expect(relayed).toBeTruthy()
    const entry = relayed!.payload as Record<string, unknown>
    const stamped = entry.seat as Record<string, unknown>
    expect(stamped.name).toBe('Sarah')
    expect(stamped.id).not.toBe('forged')
  })

  it('forwards a claimed sheet edit to the DM window and refuses an unclaimed one', async () => {
    const seat = await join('Sarah')
    const post = (p: string, body: unknown) =>
      fetch(`${base}${p}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${seat.token}`,
        },
        body: JSON.stringify(body),
      })

    const denied = await post('/sheet', {
      characterId: 'Characters/Thalia',
      patch: { hpCurrent: 12 },
    })
    expect(denied.status).toBe(403)
    expect(sent.some((m) => m.channel === 'table:sheet')).toBe(false)

    await post('/claim', { characterId: 'Characters/Thalia' })
    const ok = await post('/sheet', {
      characterId: 'Characters/Thalia',
      patch: { hpCurrent: 12 },
    })
    expect(ok.status).toBe(200)

    const forwarded = sent.find((m) => m.channel === 'table:sheet')
    expect(forwarded).toBeTruthy()
    const msg = forwarded!.payload as Record<string, unknown>
    expect(msg.characterId).toBe('Characters/Thalia')
    expect(msg.patch).toEqual({ hpCurrent: 12 })
  })

  it("labels a roll with the claimed character's name", async () => {
    const seat = await join('Sarah')
    const post = (p: string, body: unknown) =>
      fetch(`${base}${p}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${seat.token}`,
        },
        body: JSON.stringify(body),
      })

    await post('/claim', { characterId: 'Characters/Thalia' })
    await post('/roll', {
      id: 'r9',
      notation: '1d20+5',
      total: 22,
      detail: '17 + 5',
      at: Date.now(),
    })

    const relayed = sent.filter((m) => m.channel === 'table:roll').at(-1)!
    const stamped = (relayed.payload as Record<string, unknown>).seat as Record<
      string,
      unknown
    >
    expect(stamped.name).toBe('Sarah')
    expect(stamped.character).toBe('Thalia')
  })

  it('labels a roll with a character the guest brought from their own vault', async () => {
    const seat = await join('Dave')
    const post = (p: string, body: unknown) =>
      fetch(`${base}${p}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${seat.token}`,
        },
        body: JSON.stringify(body),
      })

    // Nothing is claimed: the host holds no file for this character.
    await post('/playing', { characterName: 'Brok' })
    await post('/roll', {
      id: 'r10',
      notation: '1d8',
      total: 6,
      detail: '6',
      at: Date.now(),
    })

    const relayed = sent.filter((m) => m.channel === 'table:roll').at(-1)!
    const stamped = (relayed.payload as Record<string, unknown>).seat as Record<
      string,
      unknown
    >
    expect(stamped.name).toBe('Dave')
    expect(stamped.character).toBe('Brok')
  })

  it('a named vault character grants no write access', async () => {
    const seat = await join('Dave')
    const post = (p: string, body: unknown) =>
      fetch(`${base}${p}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${seat.token}`,
        },
        body: JSON.stringify(body),
      })

    // A display label must never become authorisation.
    await post('/playing', { characterName: 'Thalia' })
    const res = await post('/sheet', {
      characterId: 'Characters/Thalia',
      patch: { hpCurrent: 1 },
    })
    expect(res.status).toBe(403)
  })

  it("never sends the DM's world id to a guest in a roll", async () => {
    // A world id is hex of the DM's absolute path. It is also what RollSource
    // carries, so a DM's roll would leak it AND render on the guest as a link
    // into a world that only exists on the host.
    const dmWorldId = encodeWorldId(root)
    pushRollToTable({
      id: 'dm2',
      notation: '1d20',
      total: 12,
      detail: '12',
      at: 1,
      source: {
        worldId: dmWorldId,
        articleId: 'NPCs/Strahd',
        title: 'Strahd',
      },
    })

    const seat = await join('Sarah')
    const res = await fetch(`${base}/events?token=${seat.token}`)
    const [hello] = await collect(res, 1)
    const text = JSON.stringify(hello)
    expect(text).not.toContain(dmWorldId)
    expect(text).not.toContain(root)
  })

  it('tells the DM window when someone joins', async () => {
    await join('Brok')
    const seats = sent.filter((m) => m.channel === 'table:seats')
    expect(seats.length).toBeGreaterThan(0)
    const last = seats.at(-1)!.payload as Record<string, unknown>
    expect((last.seats as Array<{ name: string }>)[0].name).toBe('Brok')
  })

  it('a second guest sees the first in its seat list', async () => {
    await join('Sarah')
    const brok = await join('Brok')
    const res = await fetch(`${base}/events?token=${brok.token}`)
    const [hello] = await collect(res, 1)
    const payload = hello.payload as Record<string, unknown>
    expect((payload.seats as Array<unknown>).length).toBe(2)
  })
})
