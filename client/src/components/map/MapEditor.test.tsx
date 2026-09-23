import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Characterization tests for the editor: what it does TODAY, pinned before the
 * 899-line component is split into a toolbar, an inspector and grid controls.
 *
 * Written first on purpose. The file had no tests of its own — the old
 * MapPanel suite reached it only because it rendered inline — so a split done
 * on the strength of the typechecker alone could move a handler to the wrong
 * side of a props boundary and nothing would say so.
 *
 * Two things here are covered nowhere else: the HP +/- buttons, which the
 * handover flagged as "covered only by types", and the grid commit-on-blur,
 * whose whole point is that it does NOT fire per keystroke.
 */

const VIEW = { width: 1000, height: 700 }

vi.mock('#/lib/api', () => ({
  // The stores check this before subscribing at module load.
  bridged: () => true,
  api: {
    maps: {
      get: vi.fn().mockResolvedValue({ file: null, rev: 0 }),
      apply: vi.fn().mockResolvedValue({ rev: 1 }),
      flush: vi.fn().mockResolvedValue(undefined),
      onChanged: vi.fn().mockReturnValue(() => {}),
    },
    mapView: {
      show: vi.fn().mockResolvedValue(undefined),
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
    images: { tree: vi.fn().mockResolvedValue({ folders: [], images: [] }) },
    worlds: {
      tree: vi.fn().mockResolvedValue({ folders: [], articles: [] }),
      query: vi.fn().mockResolvedValue([]),
    },
    characters: { list: vi.fn().mockResolvedValue([]) },
    table: { combat: vi.fn().mockResolvedValue(undefined) },
    // Stubbing the bridge above makes the roll log subscribe for real.
    rolls: {
      onEntry: vi.fn().mockReturnValue(() => {}),
      broadcast: vi.fn().mockResolvedValue(undefined),
    },
    articles: { get: vi.fn().mockResolvedValue({ content: '' }) },
    player: { show: vi.fn().mockResolvedValue(undefined) },
  },
}))

vi.mock('#/lib/useWorldSettings', () => ({ useWorldRuleset: () => 'all' }))
vi.mock('#/lib/useGlobalLibrary', () => ({
  useLibraryEntries: () => ({
    entries: [],
    articles: [],
    info: null,
    isPending: false,
  }),
}))

const { MapEditor } = await import('./MapEditor')
const { ConfirmProvider } = await import('#/components/ConfirmProvider')
const { mapActions, mapsSnapshot, hydrateMaps } = await import('#/lib/useMaps')
const { combatActions } = await import('#/lib/sessionStore')
const { newMap } = await import('#/lib/mapStore')

beforeAll(() => {
  // The canvas draws nothing in jsdom without these, so every render test
  // would pass for free. The same stub the MapCanvas suite relies on.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => VIEW.width,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => VIEW.height,
  })
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const MAP_ID = 'm1'

beforeEach(async () => {
  await hydrateMaps('w1', { force: true })
  combatActions.reset()
  mapActions.save(newMap({ id: MAP_ID, name: 'Cave' }))
})

afterEach(() => {
  combatActions.reset()
})

const currentMap = () => mapsSnapshot().maps.find((m) => m.id === MAP_ID)

/** Render against the live store copy, as the map window does. */
function renderEditor() {
  const onClose = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={client}>
      <ConfirmProvider>
        <MapEditor worldId="w1" map={currentMap()!} onClose={onClose} />
      </ConfirmProvider>
    </QueryClientProvider>,
  )
  return { ...result, onClose }
}

describe('the toolbar', () => {
  it('edits the map name', () => {
    renderEditor()
    fireEvent.change(screen.getByLabelText('Map name'), {
      target: { value: 'The Deep Cave' },
    })
    expect(currentMap()?.name).toBe('The Deep Cave')
  })

  it('switches tools, and the measure tool brings its own controls', () => {
    renderEditor()
    fireEvent.click(screen.getByTitle(/Measure distance/i))
    // The template picker exists only for the measure tool, so its presence is
    // the observable proof that the tool changed.
    expect(screen.getByLabelText('Template')).toBeTruthy()

    fireEvent.click(screen.getByTitle(/Select and move tokens/i))
    expect(screen.queryByLabelText('Template')).toBeNull()
  })

  it('places a blank token at the clicked cell, not at 0,0', () => {
    renderEditor()
    fireEvent.click(screen.getByTitle(/Click the map to place a token/i))

    // The canvas host, and its pointer-capture stubs — the same approach
    // MapCanvas.test uses, because jsdom implements neither.
    const host = document.querySelector<HTMLElement>(
      '.relative.overflow-hidden',
    )
    expect(host).not.toBeNull()
    host!.setPointerCapture = () => {}
    host!.releasePointerCapture = () => {}

    const before = currentMap()?.tokens.length ?? 0
    fireEvent.pointerDown(host!, { clientX: 400, clientY: 300, button: 0 })

    const tokens = currentMap()?.tokens ?? []
    expect(tokens).toHaveLength(before + 1)
    const placed = tokens.at(-1)!
    // The whole complaint about the old Add button was that everything landed
    // in the corner and had to be dragged out.
    expect(placed.x === 0 && placed.y === 0).toBe(false)
    expect(placed.label).toBe('')
    expect(placed.combatantId).toBeUndefined()
  })

  it('offers no second creature picker beside the place tool', () => {
    // There was a "place as" dropdown here. The creature drawer (B) does the
    // same job and does it better — searchable, shows who is already on the
    // map, and rolls a new creature into initiative as it places it — so a
    // worse copy in the toolbar was only somewhere for the answer to be wrong.
    renderEditor()
    fireEvent.click(screen.getByTitle(/Click the map to place a token/i))
    expect(screen.queryByLabelText('Place as')).toBeNull()
  })

  it('offers a size in feet only once a template is chosen', () => {
    renderEditor()
    fireEvent.click(screen.getByTitle(/Measure distance/i))
    expect(screen.queryByLabelText('Template size in feet')).toBeNull()

    fireEvent.change(screen.getByLabelText('Template'), {
      target: { value: 'circle' },
    })
    expect(screen.getByLabelText('Template size in feet')).toBeTruthy()
  })
})

describe('the grid controls', () => {
  it('commits a typed column count on blur, not per keystroke', () => {
    renderEditor()
    const cols = screen.getByLabelText('Columns')

    // Typing "30" over "20" passes through "3", and re-gridding on that would
    // resize the fog twice and fight the cursor.
    fireEvent.change(cols, { target: { value: '3' } })
    expect(currentMap()?.grid.cols).toBe(20)

    fireEvent.change(cols, { target: { value: '30' } })
    fireEvent.blur(cols)
    expect(currentMap()?.grid.cols).toBe(30)
  })

  it('commits each axis independently, so a tall grid is expressible', () => {
    renderEditor()
    const cols = screen.getByLabelText('Columns')
    const rows = screen.getByLabelText('Rows')

    fireEvent.change(cols, { target: { value: '15' } })
    fireEvent.blur(cols)
    fireEvent.change(rows, { target: { value: '30' } })
    fireEvent.blur(rows)

    // 15 x 30 means 15 x 30 — neither axis disturbs the other.
    expect(currentMap()?.grid).toMatchObject({ cols: 15, rows: 30 })
  })

  it('snaps a nonsense value back rather than accepting it', () => {
    renderEditor()
    const cols = screen.getByLabelText<HTMLInputElement>('Columns')
    fireEvent.change(cols, { target: { value: '0' } })
    fireEvent.blur(cols)
    expect(currentMap()?.grid.cols).toBe(20)
    expect(cols.value).toBe('20')
  })
})

describe('the token inspector', () => {
  function placeToken(over: Record<string, unknown> = {}) {
    mapActions.update(MAP_ID, (m) => ({
      ...m,
      tokens: [
        {
          id: 't1',
          label: 'Goblin',
          x: 1,
          y: 1,
          size: 'medium' as const,
          colour: '#8b1a1a',
          ...over,
        },
      ],
    }))
  }

  /**
   * Select a token through the creature drawer.
   *
   * Clicking the token itself is what a person does, but jsdom will not land a
   * pointer event on it reliably — the reason an end-to-end version of this
   * was abandoned before. The drawer reaches the same selection.
   */
  async function selectViaDrawer(name: string) {
    fireEvent.click(screen.getByTitle(/Bestiary, party and the tokens/i))
    fireEvent.click(await screen.findByText('Scene'))
    // Scoped to a button: the token also paints its label onto the canvas SVG,
    // so a bare text match finds two nodes.
    const rows = await screen.findAllByRole('button', {
      name: new RegExp(name),
    })
    fireEvent.click(rows[0])
  }

  it('shows no inspector until a token is selected', () => {
    placeToken()
    renderEditor()
    expect(screen.queryByLabelText('Hit points')).toBeNull()
  })

  it('damages and heals a linked combatant with the +/- buttons', async () => {
    const id = combatActions.addReturningId({
      name: 'Goblin',
      initiative: 12,
      hp: 7,
      maxHp: 7,
      ac: 15,
      note: '',
    })
    placeToken({ combatantId: id })
    renderEditor()
    await selectViaDrawer('Goblin')

    fireEvent.click(await screen.findByTitle('Damage 1'))
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Hit points').value).toBe(
        '6',
      ),
    )

    fireEvent.click(screen.getByTitle('Heal 1'))
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Hit points').value).toBe(
        '7',
      ),
    )
  })

  it('renames a token without touching the combatant', async () => {
    placeToken()
    renderEditor()
    await selectViaDrawer('Goblin')

    const label = await screen.findByDisplayValue('Goblin')
    fireEvent.change(label, { target: { value: 'Goblin Boss' } })
    expect(currentMap()?.tokens[0].label).toBe('Goblin Boss')
  })

  it('hides a token from the players without removing it', async () => {
    placeToken()
    renderEditor()
    await selectViaDrawer('Goblin')

    fireEvent.click(await screen.findByLabelText(/Hidden/i))
    expect(currentMap()?.tokens[0].hidden).toBe(true)
    // Still on the map for the DM: hiding is not deleting.
    expect(currentMap()?.tokens).toHaveLength(1)
  })
})

describe('showing the map to the players', () => {
  it('opens a table window and arms the live push', async () => {
    const { api } = await import('#/lib/api')
    renderEditor()

    fireEvent.click(screen.getByRole('button', { name: /^Show$/ }))

    expect(api.mapView.show).toHaveBeenCalledWith('w1', MAP_ID, 'table')
    // Armed only after the window exists, so its first frame is current.
    await waitFor(() => expect(api.mapView.push).toHaveBeenCalled())
  })

  it('closes the table window when switched off, rather than freezing it', async () => {
    const { api } = await import('#/lib/api')
    renderEditor()

    fireEvent.click(screen.getByRole('button', { name: /^Show$/ }))
    const off = await screen.findByRole('button', { name: /Showing/ })
    fireEvent.click(off)

    // A view left open but no longer updating still shows token positions that
    // have since moved, which is worse than no view at all.
    expect(api.mapView.close).toHaveBeenCalledWith('w1', MAP_ID, 'table')
  })
})

describe('closing and the keyboard', () => {
  it('calls onClose on Escape', () => {
    const { onClose } = renderEditor()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('switches tool on a bare letter key', () => {
    renderEditor()
    fireEvent.keyDown(window, { key: 'm' })
    expect(screen.getByLabelText('Template')).toBeTruthy()
  })

  it('does not treat typing in a field as a shortcut', () => {
    renderEditor()
    const name = screen.getByLabelText('Map name')
    // 'm' would switch to the measure tool if the text-entry guard were gone.
    fireEvent.keyDown(name, { key: 'm' })
    expect(screen.queryByLabelText('Template')).toBeNull()
  })
})
