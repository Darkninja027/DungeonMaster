import { describe, expect, it } from 'vitest'
import { placeCard } from './mapCardPlacement'
import type { TokenAnchor } from '#/components/map/MapCanvas'

/**
 * The whole risk of a floating card is the edges: it works in the middle of the
 * map and falls off where people actually put things. So the rules are pinned
 * here rather than trusted to a few clamps in a component.
 */

const CARD = { width: 256, height: 220 }

function anchor(over: Partial<TokenAnchor> = {}): TokenAnchor {
  return {
    left: 400,
    top: 300,
    width: 40,
    height: 40,
    view: { width: 1000, height: 700 },
    ...over,
  }
}

describe('placeCard', () => {
  it('puts the card below the token and centred on it', () => {
    const { left, top } = placeCard(anchor(), CARD)
    // Below, clear of the token.
    expect(top).toBeGreaterThan(300 + 40)
    // Centred: token centre 420, card centre should match.
    expect(left + CARD.width / 2).toBe(420)
  })

  it('flips above when there is no room below', () => {
    const { top } = placeCard(anchor({ top: 640 }), CARD)
    // Above the token, not overlapping it.
    expect(top + CARD.height).toBeLessThanOrEqual(640)
  })

  it('never overlaps the token when it flips', () => {
    // A token low enough that below is impossible.
    const a = anchor({ top: 600, height: 60 })
    const { top } = placeCard(a, CARD)
    expect(top + CARD.height).toBeLessThanOrEqual(a.top)
  })

  describe('staying on screen', () => {
    it('pushes in from the right edge', () => {
      const { left } = placeCard(anchor({ left: 980 }), CARD)
      expect(left + CARD.width).toBeLessThanOrEqual(1000)
    })

    it('pushes in from the left edge', () => {
      const { left } = placeCard(anchor({ left: -20 }), CARD)
      expect(left).toBeGreaterThanOrEqual(0)
    })

    it('keeps the header visible when the card is taller than the window', () => {
      // A short window: neither below nor above fits, so it pins — low rather
      // than high, because the header carries the name and the close button.
      const tall = { width: 256, height: 600 }
      const { top } = placeCard(
        anchor({ top: 100, view: { width: 1000, height: 400 } }),
        tall,
      )
      expect(top).toBeGreaterThanOrEqual(0)
      expect(top).toBeLessThanOrEqual(8)
    })

    it('aligns left when the card is wider than the window', () => {
      const wide = { width: 1200, height: 220 }
      const { left } = placeCard(anchor(), wide)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left).toBeLessThanOrEqual(8)
    })
  })

  it('follows a large token, sitting below its full span', () => {
    // A gargantuan token is 4 cells; the card must clear all of it rather than
    // the one cell its origin sits in.
    const { top } = placeCard(anchor({ height: 160 }), CARD)
    expect(top).toBeGreaterThanOrEqual(300 + 160)
  })
})
