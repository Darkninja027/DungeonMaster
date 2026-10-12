import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The store's own rules, which only became worth testing when the disk moved to
 * the main process. Before that this file was glue; now it arbitrates
 * revisions and throttles the live push, and both are the kind of logic that
 * fails silently — a dropped update leaves a window quietly stale rather than
 * throwing.
 *
 * Three things are pinned here, all of them things a wrong implementation would
 * still *look* right for:
 *
 *   1. a relayed change is never sent back and never saved (the echo rule);
 *   2. the last edit of a drag always reaches the table (the trailing edge);
 *   3. what crosses the bridge has no hidden tokens in it (the secrecy rule).
 */

const onChangedCbs: Array<(c: unknown) => void> = []

const maps = {
  get: vi.fn().mockResolvedValue({ file: null, rev: 0 }),
  apply: vi.fn().mockResolvedValue({ rev: 1 }),
  flush: vi.fn().mockResolvedValue(undefined),
  onChanged: vi.fn((cb: (c: unknown) => void) => {
    onChangedCbs.push(cb)
    return () => {}
  }),
}
const mapView = {
  show: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  push: vi.fn().mockResolvedValue(undefined),
  onLive: vi.fn().mockReturnValue(() => {}),
}

// The live push reads combat and the roll log, so both stores load too.
const session = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue({ rev: 1 }),
  flush: vi.fn().mockResolvedValue(undefined),
  onChanged: vi.fn().mockReturnValue(() => {}),
}
const rolls = {
  broadcast: vi.fn().mockResolvedValue(undefined),
  onEntry: vi.fn().mockReturnValue(() => {}),
  history: vi.fn().mockResolvedValue([]),
  clear: vi.fn().mockResolvedValue(undefined),
  onCleared: vi.fn().mockReturnValue(() => {}),
}
const table = {
  onRoll: vi.fn().mockReturnValue(() => {}),
  onMove: vi.fn().mockReturnValue(() => {}),
  map: vi.fn().mockResolvedValue(undefined),
}

vi.mock('#/lib/api', () => ({
  // The stores check this before subscribing at module load.
  bridged: () => true,
  api: { maps, mapView, session, rolls, table },
}))

const {
  applyGuestMove,
  hydrateMaps,
  mapActions,
  mapsSnapshot,
  setLanMap,
  setLiveMap,
  setShareDmRolls,
  flushMaps,
} = await import('./useMaps')
const { combatActions, hydrateSession } = await import('./sessionStore')
const { clearRollLog, logRoll } = await import('./rollLog')
const { newMap, addToken } = await import('./mapStore')

/** Deliver a relayed change to the store, as main would. */
function relay(change: Record<string, unknown>) {
  for (const cb of onChangedCbs) cb(change)
}

const WORLD = 'abc'

beforeEach(async () => {
  vi.clearAllMocks()
  maps.get.mockResolvedValue({ file: null, rev: 0 })
  maps.apply.mockResolvedValue({ rev: 1 })
  setLiveMap(null)
  // force, because the store keeps the world between tests in this module.
  await hydrateMaps(WORLD, { force: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('hydration', () => {
  it('takes the revision from main along with the file', async () => {
    maps.get.mockResolvedValue({
      file: { version: 1, maps: [{ id: 'm1', name: 'Cave' }] },
      rev: 7,
    })
    await hydrateMaps(WORLD, { force: true })

    // rev 7 is now held, so a relayed rev 7 is an echo and must not apply.
    relay({ worldId: WORLD, rev: 7, removeId: 'm1' })
    expect(maps.apply).not.toHaveBeenCalled()
  })
})

describe('a local edit', () => {
  it('sends ONE map as a patch, never the whole file', async () => {
    mapActions.save(newMap({ id: 'm1', name: 'Cave' }))

    expect(maps.apply).toHaveBeenCalledTimes(1)
    const [worldId, patch] = maps.apply.mock.calls[0]
    expect(worldId).toBe(WORLD)
    // The whole point of the patch protocol: no `maps` array crosses the wire,
    // so two windows editing different maps cannot overwrite each other.
    expect(patch).not.toHaveProperty('maps')
    expect((patch as { entry: { id: string } }).entry.id).toBe('m1')
  })

  it('sends a removal as an id rather than a rewritten list', () => {
    mapActions.save(newMap({ id: 'm1', name: 'Cave' }))
    maps.apply.mockClear()
    mapActions.remove('m1')

    expect(maps.apply).toHaveBeenCalledWith(WORLD, { removeId: 'm1' })
  })
})

describe('a change relayed from another window', () => {
  it('is applied without being sent back', () => {
    relay({
      worldId: WORLD,
      rev: 1,
      entry: { id: 'm2', name: 'Tavern' },
    })
    // Applied...
    expect(maps.apply).not.toHaveBeenCalled()
    // ...and never re-saved: there is no save in this store to call.
    expect(maps.flush).not.toHaveBeenCalled()
  })

  it('ignores a revision it already has (the echo)', () => {
    relay({ worldId: WORLD, rev: 1, entry: { id: 'm2', name: 'Tavern' } })
    // The same rev again, carrying different content: this is what an echo of
    // our own patch looks like coming back, and applying it would let a stale
    // copy of a map overwrite a newer one.
    relay({ worldId: WORLD, rev: 1, entry: { id: 'm2', name: 'CHANGED' } })

    const m2 = mapsSnapshot().maps.find((m) => m.id === 'm2')
    expect(m2?.name).toBe('Tavern')
  })

  it('ignores a change for a different world', () => {
    relay({ worldId: 'other', rev: 1, entry: { id: 'm9', name: 'Elsewhere' } })
    relay({ worldId: WORLD, rev: 1, entry: { id: 'm2', name: 'Tavern' } })
    expect(maps.get).toHaveBeenCalledTimes(1)
  })

  it('re-reads the whole file when it missed one', () => {
    // rev jumps 0 -> 5: four messages never arrived, so applying this patch
    // onto our copy would build on a file we know is already wrong.
    relay({ worldId: WORLD, rev: 5, entry: { id: 'm2', name: 'Tavern' } })
    expect(maps.get).toHaveBeenCalledTimes(2)
  })

  it('ignores a failed-write report rather than treating it as state', () => {
    relay({ worldId: WORLD, rev: 1, error: 'too large' })
    expect(maps.get).toHaveBeenCalledTimes(1)
  })
})

describe('the live push to the table', () => {
  it('sends nothing until a map is being shown', () => {
    mapActions.save(newMap({ id: 'm1', name: 'Cave' }))
    expect(mapView.push).not.toHaveBeenCalled()
  })

  it('strips hidden tokens before the payload crosses the bridge', () => {
    const m = addToken(
      addToken(newMap({ id: 'm1', name: 'Cave' }), {
        id: 'seen',
        label: 'Guard',
        x: 1,
        y: 1,
        size: 'medium',
        colour: '#fff',
      }),
      {
        id: 'ambush',
        label: 'Assassin',
        x: 2,
        y: 2,
        size: 'medium',
        colour: '#000',
        hidden: true,
      },
    )
    mapActions.save(m)
    setLiveMap('m1')

    expect(mapView.push).toHaveBeenCalled()
    const pushed = mapView.push.mock.calls.at(-1)?.[2] as {
      tokens: Array<{ id: string }>
    }
    // The secrecy rule at the boundary: not dimmed, not flagged — absent.
    expect(pushed.tokens.map((t) => t.id)).toEqual(['seen'])
    expect(JSON.stringify(pushed)).not.toContain('ambush')
  })

  it('throttles a burst but always delivers the LAST edit', async () => {
    vi.useFakeTimers()
    mapActions.save(newMap({ id: 'm1', name: 'Cave' }))
    setLiveMap('m1')
    mapView.push.mockClear()

    // A drag: many changes inside one throttle window.
    for (let i = 1; i <= 10; i++) {
      mapActions.update('m1', (m) => ({ ...m, name: `frame ${i}` }))
    }
    expect(mapView.push.mock.calls.length).toBeLessThan(10)

    // The trailing call is the whole point: without it the table keeps the
    // second-to-last frame and the token sits visibly short of where it was
    // dropped.
    await vi.advanceTimersByTimeAsync(50)
    const last = mapView.push.mock.calls.at(-1)?.[2] as { name: string }
    expect(last.name).toBe('frame 10')
  })

  it('stops pushing once the map is no longer shown', () => {
    mapActions.save(newMap({ id: 'm1', name: 'Cave' }))
    setLiveMap('m1')
    mapView.push.mockClear()
    setLiveMap(null)

    mapActions.update('m1', (m) => ({ ...m, name: 'after' }))
    expect(mapView.push).not.toHaveBeenCalled()
  })
})

describe('the session pushed beside the map', () => {
  /** A map with one visible and one hidden token, each in the fight. */
  async function liveFight() {
    session.get.mockResolvedValue({
      file: {
        version: 1,
        round: 2,
        activeId: 'lurker',
        combatants: [
          {
            id: 'guard',
            name: 'Guard',
            initiative: 10,
            hp: 11,
            maxHp: 11,
            ac: 16,
            note: '',
          },
          {
            id: 'lurker',
            name: 'Assassin',
            initiative: 18,
            hp: 78,
            maxHp: 78,
            ac: 15,
            note: '',
          },
        ],
      },
      rev: 1,
    })
    await hydrateSession(WORLD, { force: true })
    const base = newMap({ id: 'm1', name: 'Cave' })
    const m = addToken(
      addToken(base, {
        id: 't1',
        label: 'Guard',
        x: 1,
        y: 1,
        size: 'medium',
        colour: '#fff',
        combatantId: 'guard',
      }),
      {
        id: 't2',
        label: 'Assassin',
        x: 2,
        y: 2,
        size: 'medium',
        colour: '#000',
        hidden: true,
        combatantId: 'lurker',
      },
    )
    mapActions.save(m)
  }

  const lastSession = () =>
    mapView.push.mock.calls.at(-1)?.[3] as {
      activeId: string | null
      combatants: Array<{ name: string }>
      rolls: Array<{ label?: string }>
    }

  // The throttle reads Date.now, and an earlier test's fake clock can leave
  // the last push in the future. Each test starts an hour past the previous.
  let clock = Date.now()
  beforeEach(() => {
    vi.useFakeTimers()
    clock += 3_600_000
    vi.setSystemTime(clock)
  })

  afterEach(() => {
    setShareDmRolls(false)
    setLanMap(null)
    clearRollLog()
  })

  it('carries initiative redacted against the stripped map', async () => {
    await liveFight()
    setLiveMap('m1')
    await vi.advanceTimersByTimeAsync(50)
    const pushed = lastSession()
    expect(pushed.combatants.map((c) => c.name)).toEqual(['Guard'])
    // The hidden assassin's turn reads as nobody's, not as theirs.
    expect(pushed.activeId).toBeNull()
    expect(JSON.stringify(mapView.push.mock.calls.at(-1))).not.toContain(
      'Assassin',
    )
  })

  it('re-pushes when a turn passes, and stops when the map is taken down', async () => {
    await liveFight()
    setLiveMap('m1')
    await vi.advanceTimersByTimeAsync(50)
    mapView.push.mockClear()

    combatActions.nextTurn()
    await vi.advanceTimersByTimeAsync(50)
    expect(mapView.push).toHaveBeenCalled()

    setLiveMap(null)
    mapView.push.mockClear()
    combatActions.nextTurn()
    await vi.advanceTimersByTimeAsync(50)
    expect(mapView.push).not.toHaveBeenCalled()
  })

  it("keeps the DM's rolls off the players' screen until shared", async () => {
    await liveFight()
    setLiveMap('m1')
    logRoll({ notation: '1d20', total: 19, detail: '[19]', label: 'Stealth' })
    await vi.advanceTimersByTimeAsync(50)
    expect(lastSession().rolls).toEqual([])

    setShareDmRolls(true)
    await vi.advanceTimersByTimeAsync(50)
    expect(lastSession().rolls.map((r) => r.label)).toEqual(['Stealth'])
  })
})

describe('sharing with the LAN table', () => {
  let clock = Date.now() + 1_000_000_000
  beforeEach(() => {
    vi.useFakeTimers()
    clock += 3_600_000
    vi.setSystemTime(clock)
  })

  afterEach(() => {
    setLanMap(null)
    setLiveMap(null)
  })

  /** Thalia is a party member; the wolf is handed to Brok; the orc is hidden. */
  async function board() {
    session.get.mockResolvedValue({
      file: {
        version: 1,
        round: 1,
        activeId: null,
        combatants: [
          {
            id: 'pc',
            name: 'Thalia',
            initiative: 15,
            hp: 20,
            maxHp: 27,
            ac: 14,
            note: '',
            articleId: 'Characters/Thalia',
          },
          {
            id: 'orc',
            name: 'Orc',
            initiative: 12,
            hp: 15,
            maxHp: 15,
            ac: 13,
            note: 'ambush',
          },
        ],
      },
      rev: 1,
    })
    await hydrateSession(WORLD, { force: true })
    let m = newMap({ id: 'm1', name: 'Crypt' })
    m = addToken(m, {
      id: 't-pc',
      label: 'Thalia',
      x: 1,
      y: 1,
      size: 'medium',
      colour: '#0f0',
      combatantId: 'pc',
    })
    m = addToken(m, {
      id: 't-wolf',
      label: 'Wolf',
      x: 2,
      y: 2,
      size: 'medium',
      colour: '#999',
      controlledBy: 'Brok',
    })
    m = addToken(m, {
      id: 't-orc',
      label: 'Orc',
      x: 5,
      y: 5,
      size: 'medium',
      colour: '#f00',
      combatantId: 'orc',
      hidden: true,
      controlledBy: 'Brok',
    })
    mapActions.save(m)
  }

  const token = (id: string) =>
    mapsSnapshot()
      .maps.find((m) => m.id === 'm1')!
      .tokens.find((t) => t.id === id)!

  it('sends a redacted board, turn order and who controls what — and nothing hidden', async () => {
    await board()
    setLanMap('m1')
    await vi.advanceTimersByTimeAsync(50)
    const share = table.map.mock.calls.at(-1)?.[0] as {
      mapId: string
      map: { tokens: Array<{ id: string }> }
      session: {
        combatants: Array<{ name: string; hp: number; maxHp: unknown }>
        rolls: Array<unknown>
      }
      control: Record<string, unknown>
    }
    expect(share.mapId).toBe('m1')
    expect(share.map.tokens.map((t) => t.id)).toEqual(['t-pc', 't-wolf'])
    expect(share.session.combatants.map((c) => c.name)).toEqual(['Thalia'])
    expect(share.session.combatants[0].maxHp).toBeNull()
    expect(share.session.rolls).toEqual([])
    expect(share.control).toEqual({
      't-pc': { characterId: 'Characters/Thalia' },
      't-wolf': { player: 'Brok' },
    })
    const wire = JSON.stringify(share)
    expect(wire).not.toContain('t-orc')
    expect(wire).not.toContain('ambush')
    expect(wire).not.toContain('27')
  })

  it('takes the board down on the guests when sharing stops', async () => {
    await board()
    setLanMap('m1')
    table.map.mockClear()
    setLanMap(null)
    expect(table.map).toHaveBeenCalledWith(null)
  })

  it('applies a move from the seat that controls the token, clamped to the grid', async () => {
    await board()
    setLanMap('m1')
    applyGuestMove({
      mapId: 'm1',
      tokenId: 't-wolf',
      x: 999,
      y: 3,
      seat: { name: 'brok' },
    })
    expect(token('t-wolf')).toMatchObject({ x: 19, y: 3 })
    applyGuestMove({
      mapId: 'm1',
      tokenId: 't-pc',
      x: 4,
      y: 4,
      seat: { name: 'Sarah', characterId: 'Characters/Thalia' },
    })
    expect(token('t-pc')).toMatchObject({ x: 4, y: 4 })
  })

  it('refuses a move the host let through on a stale frame', async () => {
    await board()
    setLanMap('m1')
    // Not Brok's any more — the DM changed it after the host's last frame.
    mapActions.update('m1', (m) => ({
      ...m,
      tokens: m.tokens.map((t) =>
        t.id === 't-wolf' ? { ...t, controlledBy: 'Sarah' } : t,
      ),
    }))
    applyGuestMove({
      mapId: 'm1',
      tokenId: 't-wolf',
      x: 9,
      y: 9,
      seat: { name: 'Brok' },
    })
    expect(token('t-wolf')).toMatchObject({ x: 2, y: 2 })
    // Hidden, even though Brok is named on it.
    applyGuestMove({
      mapId: 'm1',
      tokenId: 't-orc',
      x: 0,
      y: 0,
      seat: { name: 'Brok' },
    })
    expect(token('t-orc')).toMatchObject({ x: 5, y: 5 })
  })

  it('ignores a move for a map this window is not sharing', async () => {
    await board()
    applyGuestMove({
      mapId: 'm1',
      tokenId: 't-wolf',
      x: 9,
      y: 9,
      seat: { name: 'Brok' },
    })
    expect(token('t-wolf')).toMatchObject({ x: 2, y: 2 })
    setLanMap('m1')
    applyGuestMove({
      mapId: 'other',
      tokenId: 't-wolf',
      x: 9,
      y: 9,
      seat: { name: 'Brok' },
    })
    expect(token('t-wolf')).toMatchObject({ x: 2, y: 2 })
  })
})

describe('flush', () => {
  it('asks main to write rather than writing itself', async () => {
    await flushMaps()
    expect(maps.flush).toHaveBeenCalledWith(WORLD)
  })
})
