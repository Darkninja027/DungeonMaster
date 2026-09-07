import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { RollHistory } from './RollHistory'
import { clearRollLog, mergeRoll } from '#/lib/rollLog'
import type { RollEntry } from '#/lib/rollLog'

/**
 * The roll history renders entries from THIS machine and from other machines
 * at a LAN table, and they are not equally trustworthy.
 *
 * A relayed roll's source names an article in the host's world. The ids are
 * stripped at the wire, so rendering a Link for one builds a route with
 * undefined params — which dead-ends on a real guest and, when host and guest
 * are the same machine, actually navigates the DM's own window. That was a
 * real bug; these pin the fix.
 */

const rootRoute = createRootRoute({ component: () => <RollHistory /> })
const articleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/worlds/$worldId/articles/$articleId',
  component: () => <div>article</div>,
})

function renderHistory() {
  const router = createRouter({
    routeTree: rootRoute.addChildren([articleRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  // The router's own types demand a registered tree; this one is synthetic.
  return render(<RouterProvider router={router as never} />)
}

const entry = (over: Partial<RollEntry>): RollEntry => ({
  id: 'r1',
  notation: '1d20',
  total: 15,
  detail: '15',
  at: Date.now(),
  ...over,
})

describe('RollHistory source links', () => {
  beforeEach(() => clearRollLog())

  it('links a local roll to its article', async () => {
    mergeRoll(
      entry({
        source: {
          worldId: 'abc123',
          articleId: 'NPCs/Strahd',
          title: 'Strahd',
        },
      }),
    )
    renderHistory()
    const link = await screen.findByText('Strahd')
    expect(link.tagName).toBe('A')
  })

  it('renders a relayed roll as plain text, not a link', async () => {
    // What forGuests actually delivers: a title and nothing else.
    mergeRoll(
      entry({
        id: 'relayed',
        source: { title: 'Strahd' } as never,
        seat: { id: 's1', name: 'Sarah' },
      }),
    )
    renderHistory()
    const label = await screen.findByText('Strahd')
    expect(label.tagName).not.toBe('A')
  })

  it("does not link the DM's own relayed roll either, which carries no seat", async () => {
    // The seat is absent on a roll the DM made, so a seat-based guard would
    // have missed exactly this case.
    mergeRoll(entry({ id: 'dmroll', source: { title: 'Ireena' } as never }))
    renderHistory()
    const label = await screen.findByText('Ireena')
    expect(label.tagName).not.toBe('A')
  })

  it('shows who rolled it when a seat is attached', async () => {
    mergeRoll(
      entry({
        id: 'seated',
        seat: { id: 's1', name: 'Sarah', character: 'Thalia' },
      }),
    )
    renderHistory()
    expect(await screen.findByText('Sarah as Thalia')).toBeTruthy()
  })

  it('falls back to the seat name when no character is claimed', async () => {
    mergeRoll(entry({ id: 'bare', seat: { id: 's1', name: 'Brok' } }))
    renderHistory()
    expect(await screen.findByText('Brok')).toBeTruthy()
  })
})
