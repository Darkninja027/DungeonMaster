import type { TokenAnchor } from '#/components/map/MapCanvas'

/**
 * Where to put a floating card so it sits beside its token and stays on screen.
 *
 * The whole risk of a floating panel is that it works in the middle of the map
 * and falls off at the edges — where, inconveniently, people put things. So
 * this is a pure function with its own tests rather than a few clamps inlined
 * into a component.
 *
 * The rules, in order:
 *
 *   1. **Below the token** by preference, because that is where the eye goes
 *      after clicking and it does not cover the token itself.
 *   2. **Above** when there is no room below — never overlapping, so you can
 *      still see what you selected.
 *   3. Horizontally **centred on the token**, then pushed inside the viewport.
 *   4. If the card cannot fit either way (a very short window), it is pinned
 *      inside the viewport and allowed to overlap, because a card half off
 *      screen is worse than one that covers a token you can move.
 */

export interface CardSize {
  width: number
  height: number
}

export interface CardPlacement {
  left: number
  top: number
}

/** Gap between the token and the card, and from the viewport edge. */
const GAP = 10
const MARGIN = 8

export function placeCard(anchor: TokenAnchor, card: CardSize): CardPlacement {
  const { view } = anchor

  const below = anchor.top + anchor.height + GAP
  const above = anchor.top - card.height - GAP

  const fitsBelow = below + card.height + MARGIN <= view.height
  const fitsAbove = above >= MARGIN

  let top: number
  if (fitsBelow) {
    top = below
  } else if (fitsAbove) {
    top = above
  } else {
    // Neither: pin inside the viewport. Clamped low rather than high so a card
    // taller than the window still shows its header, which is where the name
    // and the close button are.
    top = Math.max(MARGIN, Math.min(below, view.height - card.height - MARGIN))
  }

  // Centre on the token, then push inside. Math.max last so a card wider than
  // the viewport aligns to the left edge rather than off the right one.
  const centred = anchor.left + anchor.width / 2 - card.width / 2
  const left = Math.max(
    MARGIN,
    Math.min(centred, view.width - card.width - MARGIN),
  )

  return { left, top }
}
