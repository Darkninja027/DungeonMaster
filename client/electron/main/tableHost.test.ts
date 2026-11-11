import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Integration coverage for the LAN host, against a REAL http server on a real
 * temp world folder.
 *
 * tableHost.ts imports electron for its window fan-out, which does not exist
 * under vitest, so BrowserWindow is stubbed to no windows — the host-side
 * webContents.send calls then no-op and everything else runs for real.
 *
 * The point of testing this rather than only table.ts is that the guards which
 * matter most are compositions: an unauthenticated request must be refused
 * BEFORE any parsing, and an image request must clear both the _images/ prefix
 * check and resolveInWorld. A pure test cannot see a missing wire.
 */

// No windows by default. The move tests put one fake DM window here to see
// what the host forwards to it.
const windows: Array<{
  isDestroyed: () => boolean
  webContents: { id: number; send: ReturnType<typeof vi.fn> }
}> = []

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => windows },
}))

const { encodeWorldId } = await import('./sanitize')
const { hostTable, stopTable, tableInfo, showAtTable, shareMapAtTable } =
  await import('./tableHost')

let root: string
let worldId: string
let base: string

const post = (p: string, body: unknown, token?: string) =>
  fetch(`${base}${p}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

async function join(name = 'Sarah') {
  const info = tableInfo()!
  const res = await post('/join', { code: info.code, name })
  return (await res.json()) as { seatId: string; token: string; name: string }
}

describe('table host over real HTTP', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-table-'))
    fs.writeFileSync(path.join(root, 'world.json'), '{"name":"Test"}')
    fs.mkdirSync(path.join(root, '_images', 'Maps'), { recursive: true })
    fs.writeFileSync(path.join(root, '_images', 'Maps', 'town.png'), 'PNGDATA')
    fs.writeFileSync(path.join(root, 'secret.md'), 'THE DM SECRET')
    fs.mkdirSync(path.join(root, 'Characters'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'Characters', 'Thalia.md'),
      [
        '---',
        'type: character',
        'class: Rogue',
        'level: 3',
        'hp:',
        '  current: 24',
        '  max: 27',
        '  temp: 0',
        '---',
        '',
        'Rooftops.',
        '',
      ].join('\n'),
    )
    worldId = encodeWorldId(root)
    // Port 0: the OS picks a free one, so back-to-back tests cannot collide
    // on a listener still in TIME_WAIT from the previous case.
    const info = hostTable(worldId, 0)
    base = `http://127.0.0.1:${info.port}`
  })

  afterEach(() => {
    windows.length = 0
    stopTable()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('rejects a wrong room code and accepts the right one', async () => {
    const bad = await post('/join', { code: 'ZZZ-999', name: 'Mallory' })
    expect(bad.status).toBe(403)

    const info = tableInfo()!
    const good = await post('/join', { code: info.code, name: 'Sarah' })
    expect(good.status).toBe(200)
    const seat = (await good.json()) as { token: string; seatId: string }
    expect(seat.token).toBeTruthy()
    expect(seat.seatId).toBeTruthy()
  })

  it('accepts the code lowercased and without its dash', async () => {
    const info = tableInfo()!
    const res = await post('/join', {
      code: info.code.toLowerCase().replace('-', ''),
      name: 'Sarah',
    })
    expect(res.status).toBe(200)
  })

  it('never returns the world id to a guest', async () => {
    const info = tableInfo()!
    const res = await post('/join', { code: info.code, name: 'Sarah' })
    const text = await res.text()
    expect(text).not.toContain(worldId)
    expect(text).not.toContain(root)
    // The handle a guest does get must not decode to a path.
    expect(info.tableId).not.toBe(worldId)
  })

  it('refuses every authenticated route without a token', async () => {
    for (const p of ['/roll', '/sheet', '/claim']) {
      const res = await post(p, {})
      expect(res.status, `${p} must require a seat`).toBe(401)
    }
  })

  it('refuses a made-up token', async () => {
    const res = await post('/roll', {}, 'deadbeef')
    expect(res.status).toBe(401)
  })

  it('accepts a roll from a seated guest and stamps the seat host-side', async () => {
    const seat = await join('Sarah')
    const res = await post(
      '/roll',
      {
        id: 'r1',
        notation: '1d20+5',
        total: 22,
        detail: '17 + 5',
        at: Date.now(),
        // A guest claiming to be someone else must not be believed.
        seat: { id: 'forged', name: 'The DM' },
      },
      seat.token,
    )
    expect(res.status).toBe(200)
  })

  it('rejects a malformed roll', async () => {
    const seat = await join()
    const res = await post('/roll', { notation: 'lots' }, seat.token)
    expect(res.status).toBe(400)
  })

  it('refuses a sheet write for a character the seat has not claimed', async () => {
    const seat = await join()
    const res = await post(
      '/sheet',
      { characterId: 'Characters/Thalia', patch: { hpCurrent: 5 } },
      seat.token,
    )
    expect(res.status).toBe(403)
  })

  it('allows a sheet write after the character is claimed', async () => {
    const seat = await join()
    const claim = await post(
      '/claim',
      { characterId: 'Characters/Thalia' },
      seat.token,
    )
    expect(claim.status).toBe(200)
    const res = await post(
      '/sheet',
      { characterId: 'Characters/Thalia', patch: { hpCurrent: 5 } },
      seat.token,
    )
    expect(res.status).toBe(200)
  })

  it('refuses a second guest claiming a taken character', async () => {
    const a = await join('Sarah')
    const b = await join('Brok')
    await post('/claim', { characterId: 'Characters/Thalia' }, a.token)
    const res = await post(
      '/claim',
      { characterId: 'Characters/Thalia' },
      b.token,
    )
    expect(res.status).toBe(409)
  })

  it('serves an image under _images/', async () => {
    const seat = await join()
    const res = await fetch(
      `${base}/img/${encodeURIComponent('_images/Maps/town.png')}?token=${seat.token}`,
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('PNGDATA')
  })

  it('refuses a file outside _images/ even though it is inside the world', async () => {
    const seat = await join()
    const res = await fetch(
      `${base}/img/${encodeURIComponent('secret.md')}?token=${seat.token}`,
    )
    expect(res.status).toBe(403)
  })

  it('refuses traversal out of the world folder', async () => {
    const seat = await join()
    for (const attempt of [
      '_images/../secret.md',
      '_images/../../etc/passwd',
      '../../../etc/passwd',
    ]) {
      const res = await fetch(
        `${base}/img/${encodeURIComponent(attempt)}?token=${seat.token}`,
      )
      expect([403, 400, 404], `${attempt} must not be served`).toContain(
        res.status,
      )
      const body = await res.text()
      expect(body).not.toContain('THE DM SECRET')
    }
  })

  it('never leaks a filesystem path in an error body', async () => {
    const seat = await join()
    const res = await fetch(
      `${base}/img/${encodeURIComponent('_images/nope.png')}?token=${seat.token}`,
    )
    const body = await res.text()
    expect(body).not.toContain(root)
    expect(body).not.toContain(os.tmpdir())
  })

  it('replays what the DM last showed to a guest that connects later', async () => {
    showAtTable({
      articleId: 'NPCs/Strahd',
      content: '# Strahd',
      title: 'Strahd',
    })
    const seat = await join()
    const res = await fetch(`${base}/events?token=${seat.token}`)
    const reader = res.body!.getReader()
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)
    expect(text).toContain('hello')
    expect(text).toContain('Strahd')
    await reader.cancel()
  })

  it('replays the shared map to a late guest, and never raw initiative', async () => {
    shareMapAtTable({
      mapId: 'm1',
      map: { name: 'Crypt' },
      session: {},
      control: {},
    })
    const seat = await join()
    const res = await fetch(`${base}/events?token=${seat.token}`)
    const reader = res.body!.getReader()
    const { value } = await reader.read()
    const hello = JSON.parse(
      // The first frame; a seats frame can arrive in the same chunk.
      new TextDecoder()
        .decode(value)
        .split('\n\n')[0]
        .replace(/^data: /, ''),
    ) as { payload: Record<string, unknown> }
    expect(hello.payload.map).toMatchObject({ mapId: 'm1' })
    // The DM's whole fight used to ride here, HP and hidden monsters included.
    expect('combat' in hello.payload).toBe(false)
    await reader.cancel()
  })

  describe('token moves', () => {
    function dmWindow() {
      const send = vi.fn()
      windows.push({ isDestroyed: () => false, webContents: { id: 1, send } })
      return send
    }

    const share = () =>
      shareMapAtTable({
        mapId: 'm1',
        map: {},
        session: {},
        control: {
          thalia: { characterId: 'Characters/Thalia' },
          wolf: { player: 'Brok' },
        },
      })

    const move = (token: string, tokenId: string, mapId = 'm1') =>
      post('/move', { mapId, tokenId, x: 3, y: 4 }, token)

    it('lets a seat move its claimed character token, forwarded with the host view of the seat', async () => {
      const send = dmWindow()
      share()
      const sarah = await join('Sarah')
      await post('/claim', { characterId: 'Characters/Thalia' }, sarah.token)

      const res = await post(
        '/move',
        // A forged seat in the body must not be believed.
        { mapId: 'm1', tokenId: 'thalia', x: 3, y: 4, seat: { name: 'Brok' } },
        sarah.token,
      )
      expect(res.status).toBe(200)
      const forwarded = send.mock.calls.find((c) => c[0] === 'table:move')
      expect(forwarded?.[1]).toEqual({
        mapId: 'm1',
        tokenId: 'thalia',
        x: 3,
        y: 4,
        seat: { name: 'Sarah', characterId: 'Characters/Thalia' },
      })
    })

    it('lets a player move a token the DM handed them by name', async () => {
      share()
      const brok = await join('Brok')
      expect((await move(brok.token, 'wolf')).status).toBe(200)
    })

    it('refuses another seat token, an unlisted token, and an unclaimed seat', async () => {
      const send = dmWindow()
      share()
      const sarah = await join('Sarah')
      const brok = await join('Brok')
      // Sarah has not claimed Thalia, so Thalia is not hers either.
      expect((await move(sarah.token, 'thalia')).status).toBe(403)
      expect((await move(sarah.token, 'wolf')).status).toBe(403)
      // A DM-only token is simply absent from the control table.
      expect((await move(brok.token, 'dragon')).status).toBe(403)
      expect(send.mock.calls.some((c) => c[0] === 'table:move')).toBe(false)
    })

    it('does not accept a self-declared character name as a claim', async () => {
      share()
      const sarah = await join('Sarah')
      await post('/playing', { characterName: 'Thalia' }, sarah.token)
      expect((await move(sarah.token, 'thalia')).status).toBe(403)
    })

    it('refuses a move on a map that is not on the table', async () => {
      const brok = await join('Brok')
      expect((await move(brok.token, 'wolf')).status).toBe(409)
      share()
      expect((await move(brok.token, 'wolf', 'other')).status).toBe(409)
      shareMapAtTable(null)
      expect((await move(brok.token, 'wolf')).status).toBe(409)
    })

    it('refuses a move without a seat, and a malformed one', async () => {
      share()
      const anon = await post('/move', {
        mapId: 'm1',
        tokenId: 'wolf',
        x: 1,
        y: 1,
      })
      expect(anon.status).toBe(401)
      const brok = await join('Brok')
      const bad = await post(
        '/move',
        { mapId: 'm1', tokenId: 'wolf' },
        brok.token,
      )
      expect(bad.status).toBe(400)
    })
  })

  // A guest renderer is a browser on another machine, so every call is
  // cross-origin. Node's fetch does not enforce CORS, so these assert on the
  // HEADERS rather than on whether the request succeeds — the first version of
  // this server passed every other test here and still failed every real join
  // with "failed to fetch".
  it('allows a cross-origin read of the join response', async () => {
    const info = tableInfo()!
    const res = await post('/join', { code: info.code, name: 'Sarah' })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('answers a preflight without demanding credentials', async () => {
    // The browser sends OPTIONS with no Authorization header, so a 401 here
    // would block the very request that was about to carry the token.
    const res = await fetch(`${base}/roll`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://127.0.0.1:4280',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, authorization',
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-headers')).toContain(
      'authorization',
    )
  })

  it('allows a cross-origin read of an error, not just a success', async () => {
    // A guest must be able to SEE "wrong room code" rather than a generic
    // network failure.
    const res = await post('/join', { code: 'ZZZ-999', name: 'Mallory' })
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('allows a cross-origin read of the event stream', async () => {
    const seat = await join()
    const res = await fetch(`${base}/events?token=${seat.token}`)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    await res.body?.cancel()
  })

  it('offers the world characters a guest may claim', async () => {
    const seat = await join()
    const res = await fetch(`${base}/characters?token=${seat.token}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      characters: Array<{ id: string; title: string; claimedBy: string | null }>
    }
    const thalia = body.characters.find((c) => c.id === 'Characters/Thalia')
    expect(thalia).toBeTruthy()
    expect(thalia!.claimedBy).toBeNull()
  })

  it('shows who holds a character once claimed', async () => {
    const seat = await join('Sarah')
    await post('/claim', { characterId: 'Characters/Thalia' }, seat.token)
    const res = await fetch(`${base}/characters?token=${seat.token}`)
    const body = (await res.json()) as {
      characters: Array<{ id: string; claimedBy: string | null }>
    }
    expect(
      body.characters.find((c) => c.id === 'Characters/Thalia')!.claimedBy,
    ).toBe('Sarah')
  })

  it('requires a seat to list characters', async () => {
    expect((await fetch(`${base}/characters`)).status).toBe(401)
  })

  it('serves the claimed sheet, and only to the seat holding it', async () => {
    const sarah = await join('Sarah')
    const brok = await join('Brok')
    await post('/claim', { characterId: 'Characters/Thalia' }, sarah.token)

    const mine = await fetch(
      `${base}/sheet?characterId=Characters%2FThalia&token=${sarah.token}`,
    )
    expect(mine.status).toBe(200)
    expect(((await mine.json()) as { content: string }).content).toContain(
      'type: character',
    )

    // Someone else's sheet is not readable, even with a valid seat.
    const theirs = await fetch(
      `${base}/sheet?characterId=Characters%2FThalia&token=${brok.token}`,
    )
    expect(theirs.status).toBe(403)
  })

  it('refuses a sheet read for an unclaimed character', async () => {
    const seat = await join()
    const res = await fetch(
      `${base}/sheet?characterId=Characters%2FThalia&token=${seat.token}`,
    )
    expect(res.status).toBe(403)
  })

  it('refuses a traversing sheet read', async () => {
    const seat = await join()
    const res = await fetch(
      `${base}/sheet?characterId=${encodeURIComponent('../../secret')}&token=${seat.token}`,
    )
    expect([400, 403]).toContain(res.status)
    expect(await res.text()).not.toContain('THE DM SECRET')
  })

  it('reports no table once stopped', async () => {
    stopTable()
    expect(tableInfo()).toBeNull()
  })
})
