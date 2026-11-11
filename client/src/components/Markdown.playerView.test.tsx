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
  const rootRoute = createRootRoute({
    component: () => <BookView {...props} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const result = render(<RouterProvider router={router as any} />)
  // The router resolves its first match asynchronously; without this the
  // container is still empty and every assertion below passes vacuously.
  await waitFor(() => expect(result.container.textContent).not.toBe(''))
  return result
}

/**
 * A stat block is its own renderer inside the book page — StatBlockCard, with
 * an InlineMarkdown per attribute plus one for its prose. It shipped taking
 * `readOnly` at the call site and dropping it in the destructure, so a
 * monster's damage rolls stayed clickable on a projector while the rest of the
 * page was inert. The BODY fixture above has no fence, which is exactly why
 * nothing caught it.
 */
const STATBLOCK_BODY = [
  '# Goblin',
  '',
  '```statblock',
  'name: Goblin',
  'subtitle: Small humanoid, neutral evil',
  'ac: 15',
  'hp: 7 (2d6)',
  'str: 8',
  'dex: 14',
  'prose: |',
  '  **Scimitar.** Melee attack, 1d6+2 slashing. See [[Strahd]].',
  '```',
].join('\n')

describe('BookView for a player window', () => {
  // A long statblock in a fixed sheet overflows onto a second sheet — and
  // each sheet re-renders the WHOLE document, windowing its own slice with a
  // negative margin. So every dice chip exists once per sheet, and the later
  // copies sit outside the visible box: present in the DOM, impossible to
  // click. That is what 'flow' exists to prevent.
  it('renders one growing sheet in flow layout, with no duplicated chips', async () => {
    const long = ['# Aboleth', '']
      .concat(
        Array.from({ length: 60 }, (_, i) => `Paragraph ${i} rolls 2d6+3.`),
      )
      .join('\n')

    const sheets = await renderBook({ children: long, worldId: 'abc' })
    const sheetPages = sheets.container.querySelectorAll('.dnd-page').length
    const sheetChips = sheets.container.querySelectorAll('.dnd-dice').length

    const flow = await renderBook({
      children: long,
      worldId: 'abc',
      layout: 'flow',
    })
    const flowPages = flow.container.querySelectorAll('.dnd-page').length
    const flowChips = flow.container.querySelectorAll('.dnd-dice').length

    // One sheet, and the marker class the stylesheet keys off.
    expect(flowPages).toBe(1)
    expect(flow.container.querySelector('.dnd-book-flow')).not.toBeNull()
    // Exactly one chip per roll in the source — no windowed duplicates.
    expect(flowChips).toBe(60)
    // And flow never renders MORE copies than the sheet layout would.
    expect(flowChips).toBeLessThanOrEqual(sheetChips)
    expect(flowPages).toBeLessThanOrEqual(sheetPages)
  })

  it('makes a stat block inert too', async () => {
    const { container } = await renderBook({
      children: STATBLOCK_BODY,
      articles: ARTICLES,
      worldId: 'abc',
      audience: 'player',
      readOnly: true,
    })
    // The card renders...
    expect(container.textContent).toContain('Goblin')
    // ...but nothing inside it is clickable.
    expect(container.querySelectorAll('button').length).toBe(0)
    expect(container.querySelectorAll('a').length).toBe(0)
  })

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

  // A :::wrap inside a DM block must not end it early: the wrap's closer is
  // not the DM block's, and the text after it is still secret.
  it('strips a DM block that contains a wrap block, all of it', async () => {
    const { container } = await renderBook({
      children: [
        'Visible.',
        '',
        ':::dm',
        ':::wrap',
        'Inner secret.',
        ':::',
        'Secret after the wrap.',
        ':::',
        '',
        'Tail.',
      ].join('\n'),
      worldId: 'abc',
      audience: 'player',
      readOnly: true,
    })
    expect(container.textContent).not.toMatch(/secret/i)
    expect(container.textContent).not.toContain(':::')
    expect(container.textContent).toContain('Tail.')
  })

  /**
   * A note: link is the vault's answer to a broken [[link]] — a button that
   * jumps to the Notes tab. On a projector it must be inert like every other
   * link: the readOnly guard sits above both the note: and missing: branches,
   * and this pins that it stays there.
   */
  it('renders a note: link as inert text on a projector', async () => {
    const props = {
      children: 'The barkeep mentions [[Waterdeep]].',
      worldId: 'abc',
      noteTitles: ['Waterdeep'],
      onOpenNote: () => {
        throw new Error('a projector must never open a note')
      },
    }

    const dm = await renderBook(props)
    // The DM gets a real button, or the fixture proves nothing.
    expect(dm.container.querySelectorAll('button').length).toBeGreaterThan(0)

    const player = await renderBook({ ...props, readOnly: true })
    expect(player.container.querySelectorAll('button').length).toBe(0)
    expect(player.container.querySelectorAll('a').length).toBe(0)
    expect(player.container.textContent).toContain('Waterdeep')
  })
})

describe('BookView wrap blocks', () => {
  it('puts the wrapped content in a .dnd-wrap box and the rest after it', async () => {
    const { container } = await renderBook({
      children: [
        ':::wrap',
        '![Seal](_images/seal.png#left&w=20%)',
        '',
        '# The Apothicarium',
        '**Symbol:** two vials',
        ':::',
        '',
        '## Purpose',
      ].join('\n'),
      worldId: 'abc',
    })
    const box = container.querySelector('.dnd-wrap')
    expect(box).not.toBeNull()
    expect(box!.querySelector('img')).not.toBeNull()
    expect(box!.textContent).toContain('The Apothicarium')
    expect(box!.textContent).not.toContain('Purpose')
    // No marker or fence text leaks into the page.
    expect(container.textContent).not.toContain('[!')
    expect(container.textContent).not.toContain(':::')
    expect(container.textContent).toContain('Purpose')
  })

  it('keeps a wrap inside a DM callout inside it for the DM', async () => {
    const { container } = await renderBook({
      children: [':::dm', ':::wrap', 'Hidden seal.', ':::', ':::'].join('\n'),
      worldId: 'abc',
    })
    const box = container.querySelector('.dnd-dm-block .dnd-wrap')
    expect(box?.textContent).toContain('Hidden seal.')
  })

  it('drops the markers of an unclosed box', async () => {
    const { container } = await renderBook({
      children: ':::wrap\nOpen box.',
      worldId: 'abc',
    })
    expect(container.querySelector('.dnd-wrap')?.textContent).toContain(
      'Open box.',
    )
    expect(container.textContent).not.toContain('[!')
  })
})
