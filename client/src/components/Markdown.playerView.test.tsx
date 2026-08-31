import { describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'

import { BookView } from './Markdown'

/**
 * The player window's guarantees, pinned in one test.
 *
 * All three assertions here are about what reaches a projector, and all three
 * are things a passing unit test of `transformDmBlocks` alone would not catch —
 * the data layer being right and the player being safe are different claims.
 *
 *   1. A :::dm block is ABSENT from the DOM, not merely styled away.
 *   2. No link is clickable. An internal wiki link calls router.history.push,
 *      so a click would navigate the PLAYER window into the full DM app,
 *      sidebar and all, in front of the table. That is the worst failure this
 *      feature has.
 *   3. No button exists — dice chips and rollable-table Roll bars included.
 *
 * BookView calls useRouter(), so each render needs a router; a memory history
 * keeps it off the real hash history the app runs on.
 */
const BODY = [
  '# The Tavern',
  '',
  'The barkeep polishes a glass. A [[Strahd]] rumour is going around.',
  '',
  'He swings for [Club](1d6+2) and you can roll 2d6+3 to resist.',
  '',
  ':::dm',
  'The barkeep is a doppelganger sent to follow them.',
  ':::',
  '',
  '| d100 | Rumour |',
  '| ---- | ------ |',
  '| 01-50 | The road south is closed. |',
  '| 51-100 | A child went missing. |',
].join('\n')

const ARTICLES = [{ id: 'NPCs/Strahd', title: 'Strahd' }]

async function renderBook(props: Parameters<typeof BookView>[0]) {
  const rootRoute = createRootRoute({ component: () => <BookView {...props} /> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = render(<RouterProvider router={router as any} />)
  // The router resolves its first match asynchronously; without this the
  // container is still empty and every assertion below passes vacuously.
  await waitFor(() => expect(result.container.textContent).not.toBe(''))
  return result
}

describe('BookView for a player window', () => {
  it('strips a DM block from the DOM entirely', async () => {
    const { container } = await renderBook({
      children: BODY,
      articles: ARTICLES,
      worldId: 'abc',
      audience: 'player',
      readOnly: true,
    })
    expect(container.textContent).not.toContain('doppelganger')
    // The prose around it still renders, so this is not a blank page.
    expect(container.textContent).toContain('The barkeep polishes a glass')
  })

  it('renders no clickable link and no button', async () => {
    const { container } = await renderBook({
      children: BODY,
      articles: ARTICLES,
      worldId: 'abc',
      audience: 'player',
      readOnly: true,
    })
    expect(container.querySelectorAll('a').length).toBe(0)
    expect(container.querySelectorAll('button').length).toBe(0)
    // Above all: nothing that would navigate this window into the app.
    expect(container.querySelector('[href^="/"]')).toBeNull()
  })

  it('still shows the DM everything, and keeps it interactive', async () => {
    const { container } = await renderBook({
      children: BODY,
      articles: ARTICLES,
      worldId: 'abc',
    })
    expect(container.textContent).toContain('doppelganger')
    expect(container.querySelector('.dnd-dm-block')).not.toBeNull()
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0)
  })
})
