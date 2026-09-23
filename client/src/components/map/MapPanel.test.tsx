import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MapPanel } from './MapPanel'
import { ConfirmProvider } from '#/components/ConfirmProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { shortcutsSuspended } from '#/lib/useShortcut'

/**
 * The panel holds the *list*; opening a map hands over to a full-window
 * overlay, because a battlemap in the 340px session rail has no room to show a
 * room. These tests pin that split, and the two things about the overlay that
 * would be quietly wrong otherwise: that it really is `fixed inset-0` rather
 * than something laid out inside the rail, and that it suspends the app's
 * shortcuts while it is up.
 */

const VIEW = { width: 1000, height: 700 }

vi.mock('#/lib/api', () => ({
  api: {
    maps: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
    images: { tree: vi.fn().mockResolvedValue({ folders: [], images: [] }) },
    worlds: {
      tree: vi.fn().mockResolvedValue({ folders: [], articles: [] }),
      query: vi.fn().mockResolvedValue([]),
    },
    characters: { list: vi.fn().mockResolvedValue([]) },
    session: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
    table: { combat: vi.fn().mockResolvedValue(undefined) },
    articles: { get: vi.fn().mockResolvedValue({ content: '' }) },
    player: { show: vi.fn().mockResolvedValue(undefined) },
  },
}))

// The drawer reads the world's ruleset and the shared library through hooks
// that would otherwise reach for IPC.
vi.mock('#/lib/useWorldSettings', () => ({
  useWorldRuleset: () => 'all',
}))
vi.mock('#/lib/useGlobalLibrary', () => ({
  useLibraryEntries: () => ({
    entries: [],
    articles: [],
    info: null,
    isPending: false,
  }),
}))

beforeAll(() => {
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

afterEach(() => {
  // The overlay suspends shortcuts on mount; a test that leaves one mounted
  // would leak a suspend into the next one.
  vi.restoreAllMocks()
})

/** MapEditor calls useConfirm for its delete, which throws outside a provider. */
function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ConfirmProvider>
        <MapPanel worldId="w1" />
      </ConfirmProvider>
    </QueryClientProvider>,
  )
}

describe('MapPanel', () => {
  it('starts as an empty list, with no overlay', () => {
    renderPanel()
    expect(screen.getByText(/No maps yet/)).toBeTruthy()
    expect(document.querySelector('.fixed.inset-0')).toBeNull()
  })

  it('opens a new map in a full-window overlay', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /New map/i }))

    const overlay = document.querySelector('.fixed.inset-0')
    expect(overlay).not.toBeNull()
    // The whole point of the change: the map surface is not laid out inside the
    // fixed-width rail.
    expect(overlay?.className).toContain('fixed')
    expect(overlay?.className).toContain('inset-0')
    expect(screen.getByLabelText('Map name')).toBeTruthy()
  })

  it('suspends app shortcuts while the overlay is open, and restores them', () => {
    expect(shortcutsSuspended()).toBe(false)

    const { unmount } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /New map/i }))
    // Otherwise Ctrl+K would open the command palette behind a map being drawn.
    expect(shortcutsSuspended()).toBe(true)

    unmount()
    expect(shortcutsSuspended()).toBe(false)
  })

  it('offers a place tool and a link dropdown, not a spawn-at-origin button', async () => {
    // The two complaints this fixes: tokens always appearing at 0,0, and there
    // being no way to point an existing token at a creature.
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /New map/i }))

    // The place tool exists...
    const place = screen.getByTitle(/Click the map to place a token/i)
    expect(place).toBeTruthy()

    // ...and choosing it offers what to place, rather than assuming blank.
    fireEvent.click(place)
    await waitFor(() => expect(screen.getByLabelText('Place as')).toBeTruthy())
  })

  it('opens a creature drawer with bestiary, party and placed tokens', async () => {
    // The complaint this fixes: linking only offered creatures already in the
    // fight, through a select box that cannot search hundreds of monsters.
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /New map/i }))

    fireEvent.click(screen.getByTitle(/Bestiary, party and the tokens/i))

    await waitFor(() => expect(screen.getByText('Bestiary')).toBeTruthy())
    expect(screen.getByText('Party')).toBeTruthy()
    expect(screen.getByText('Scene')).toBeTruthy()
    // Searchable, which a select box is not.
    expect(screen.getByPlaceholderText('Search…')).toBeTruthy()
  })

  it('names who is waiting to be placed, rather than just counting them', async () => {
    // The old "Place 3" button said how many but never who, and placed them
    // all whether you wanted that or not.
    const { combatActions } = await import('#/lib/sessionStore')
    combatActions.reset()
    combatActions.add({
      name: 'Hobgoblin Captain',
      initiative: 14,
      hp: 39,
      maxHp: 39,
      ac: 17,
      note: '',
    })

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /New map/i }))
    fireEvent.click(screen.getByTitle(/Bestiary, party and the tokens/i))
    fireEvent.click(await screen.findByText('Scene'))

    // By name, and clickable to place just that one.
    expect(await screen.findByText('Hobgoblin Captain')).toBeTruthy()
    expect(screen.getByText('place')).toBeTruthy()

    fireEvent.click(screen.getByText('Hobgoblin Captain'))
    await waitFor(() => expect(screen.getByText('on map')).toBeTruthy())
    combatActions.reset()
  })

  it('takes a combatant out of the fight, leaving its token behind', async () => {
    // Removing a row from initiative must not sweep the miniature off the
    // table — the body may well still be lying there.
    const { combatActions } = await import('#/lib/sessionStore')
    combatActions.reset()

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /New map/i }))
    fireEvent.click(screen.getByTitle(/Bestiary, party and the tokens/i))
    fireEvent.click(await screen.findByText('Scene'))

    combatActions.add({
      name: 'Ogre',
      initiative: 9,
      hp: 59,
      maxHp: 59,
      ac: 11,
      note: '',
    })

    // Place it, then take it out of the fight.
    fireEvent.click(await screen.findByText('Ogre'))
    await waitFor(() => expect(screen.getByText('on map')).toBeTruthy())
    fireEvent.click(screen.getByTitle(/Take Ogre out of the fight/i))

    // Out of the fight, but the token stays: the row is still listed and now
    // reads as belonging to the map alone.
    await waitFor(() => expect(screen.getByText('token only')).toBeTruthy())
    combatActions.reset()
  })

  it('closes the overlay on Escape and comes back to the list', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /New map/i }))
    expect(document.querySelector('.fixed.inset-0')).not.toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() =>
      expect(document.querySelector('.fixed.inset-0')).toBeNull(),
    )
    expect(shortcutsSuspended()).toBe(false)
    // The map still exists — Escape closes the editor, it does not discard work.
    expect(screen.getByText('Map 1')).toBeTruthy()
  })
})
