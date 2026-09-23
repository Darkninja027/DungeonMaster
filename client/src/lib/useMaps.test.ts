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

vi.mock('#/lib/api', () => ({
  // The stores check this before subscribing at module load.
  bridged: () => true, api: { maps, mapView } }))

const { hydrateMaps, mapActions, mapsSnapshot, setLiveMap, flushMaps } =
  await import('./useMaps')
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

describe('flush', () => {
  it('asks main to write rather than writing itself', async () => {
    await flushMaps()
    expect(maps.flush).toHaveBeenCalledWith(WORLD)
  })
})
