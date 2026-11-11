import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The panel is the *list* and nothing else. Opening a map opens a WINDOW.
 *
 * It used to hand over to a full-window overlay rendered as its own sibling,
 * so these tests reached into the editor and asserted on `.fixed.inset-0` and
 * on shortcut suspension. Both were artefacts of where the editor was mounted
 * rather than anything about the panel, and the editor's own behaviour now
 * lives in MapEditor.test.tsx where it can be tested directly.
 *
 * What is left here is the seam: the panel must ask main for a window, and it
 * must stay live while that window edits — which is the thing the move to a
 * separate process could most easily have broken.
 */

const show = vi.fn((_worldId: string, _mapId: string) => Promise.resolve())
const onChangedCbs: Array<(c: unknown) => void> = []

/**
 * One revision counter shared by the fake main process.
 *
 * Both a local patch and a relayed change advance it, exactly as the real main
 * does — a test that saves a map and then relays one must see the second as
 * NEWER, and a per-test counter would make it look like an echo and be dropped.
 * The store is a module global and keeps its rev between tests, so this has to
 * keep counting too.
 */
let rev = 0
const apply = vi.fn((_worldId: string, _patch: unknown) =>
  Promise.resolve({ rev: ++rev }),
)

vi.mock('#/lib/api', () => ({
  // The stores check this before subscribing at module load.
  bridged: () => true,
  api: {
    maps: {
      get: vi.fn().mockResolvedValue({ file: null, rev: 0 }),
      apply: (worldId: string, patch: unknown) => apply(worldId, patch),
      flush: vi.fn().mockResolvedValue(undefined),
      onChanged: (cb: (c: unknown) => void) => {
        onChangedCbs.push(cb)
        return () => {}
      },
    },
    mapView: {
      show: (worldId: string, mapId: string) => show(worldId, mapId),
      close: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
      onLive: vi.fn().mockReturnValue(() => {}),
    },
    session: {
      get: vi.fn().mockResolvedValue({ file: null, rev: 0 }),
      set: vi.fn().mockResolvedValue({ rev: 1 }),
      apply: vi.fn().mockResolvedValue({ rev: 1 }),
      flush: vi.fn().mockResolvedValue(undefined),
      onChanged: vi.fn().mockReturnValue(() => {}),
    },
    table: {
      combat: vi.fn().mockResolvedValue(undefined),
      onRoll: vi.fn().mockReturnValue(() => {}),
      onMove: vi.fn().mockReturnValue(() => {}),
      onSeats: vi.fn().mockReturnValue(() => {}),
      onStatus: vi.fn().mockReturnValue(() => {}),
      info: vi.fn().mockResolvedValue(null),
      map: vi.fn().mockResolvedValue(undefined),
    },
    // useMaps imports the roll log, which subscribes at module load.
    rolls: {
      onEntry: vi.fn().mockReturnValue(() => {}),
      broadcast: vi.fn().mockResolvedValue(undefined),
      history: vi.fn().mockResolvedValue([]),
      clear: vi.fn().mockResolvedValue(undefined),
      onCleared: vi.fn().mockReturnValue(() => {}),
    },
  },
}))

beforeEach(async () => {
  // The store is a module global, so maps made by an earlier test are still in
  // it. Re-hydrating from an empty file is the only way back to a clean list.
  const { hydrateMaps } = await import('#/lib/useMaps')
  await hydrateMaps('w1', { force: true })
  // Hydration resets the store's revision to whatever main reported, so the
  // fake main's counter has to agree or the next relay looks like an echo.
  rev = 0
})

const { MapPanel } = await import('./MapPanel')

afterEach(() => {
  show.mockClear()
  apply.mockClear()
})

/**
 * Relay a change as main would, from a window that is not this one.
 *
 * The rev counts up across the whole file rather than per test, because the
 * store is a module global and keeps its revision between them — the same
 * reason it keeps its world.
 */
function relay(change: Record<string, unknown>) {
  const next = ++rev
  for (const cb of onChangedCbs) cb({ rev: next, ...change })
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MapPanel worldId="w1" />
    </QueryClientProvider>,
  )
}

describe('MapPanel', () => {
  it('starts as an empty list', async () => {
    renderPanel()
    expect(await screen.findByText(/No maps yet/)).toBeTruthy()
  })

  it('creates a map and opens it in a window', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /New map/i }))

    // The map is saved...
    await waitFor(() => expect(apply).toHaveBeenCalled())
    // ...and a window is asked for, rather than an overlay mounted in here.
    expect(show).toHaveBeenCalledTimes(1)
    const [worldId, mapId] = show.mock.calls[0]
    expect(worldId).toBe('w1')
    expect(typeof mapId).toBe('string')

    // No editor in this process: the rail keeps only the list.
    expect(screen.queryByLabelText('Map name')).toBeNull()
  })

  it('opens an existing map by clicking its row', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /New map/i }))
    const row = await screen.findByText('Map 1')
    show.mockClear()

    fireEvent.click(row)

    expect(show).toHaveBeenCalledWith('w1', expect.any(String))
  })

  it('lists a map created in another window', async () => {
    renderPanel()
    await screen.findByText(/No maps yet/)

    relay({
      worldId: 'w1',
      entry: { id: 'elsewhere', name: 'Made next door', savedAt: '2026-01-01' },
    })

    expect(await screen.findByText('Made next door')).toBeTruthy()
  })

  it('drops a map deleted in another window', async () => {
    renderPanel()
    relay({
      worldId: 'w1',
      entry: { id: 'doomed', name: 'Briefly here', savedAt: '2026-01-01' },
    })
    expect(await screen.findByText('Briefly here')).toBeTruthy()

    relay({ worldId: 'w1', removeId: 'doomed' })

    await waitFor(() => expect(screen.queryByText('Briefly here')).toBeNull())
  })
})
