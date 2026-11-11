/**
 * The join between battlemap tokens and the initiative tracker.
 *
 * `Token.combatantId` has existed since the map model was written but nothing
 * read it. This is what reads it — in both directions, and as pure functions so
 * the rules are testable without React:
 *
 *   - **combatant -> token**: place a row from the tracker on the map.
 *   - **token -> combatant**: put a token that is already on the map into the
 *     fight.
 *   - **token -> live stats**: HP, AC and whose turn it is, for the canvas to
 *     draw.
 *
 * The link is stored on the token rather than the combatant on purpose, and the
 * reason is load-bearing: `parseCombatState` picks its fields explicitly, so a
 * coordinate added to `Combatant` would survive one save and vanish on the next
 * load. Keeping the arrow pointing this way leaves the tracker exactly as it
 * was.
 *
 * A link can dangle — the DM removes a combatant while its token is still on the
 * map — and that is **not** cleaned up automatically. Deleting a row from
 * initiative should not delete the miniature standing on the table; the token
 * simply stops showing live stats. `isOrphaned` is for surfacing that, not for
 * pruning it.
 */

import type { Combatant } from './api'
import type { BattleMap, Token, TokenSize } from './mapStore'
import { TOKEN_CELLS, addToken, newTokenId, updateToken } from './mapStore'
import type { Point } from './mapCamera'

/** Red for monsters, blue for the party: the side you are on at a glance. */
export const FOE_COLOUR = '#8b1a1a'
export const ALLY_COLOUR = '#1d4ed8'
export const NEUTRAL_COLOUR = '#6b7280'

/**
 * Read a creature's size category out of a stat block's subtitle.
 *
 * A stat block opens with a line like `Large giant, chaotic evil`, so the size
 * is already on disk and a token should not default to medium and wait to be
 * corrected by hand. Matched as a whole word at the start, because "Large"
 * inside a name or an alignment is not a size.
 *
 * `null` when it cannot tell, which the caller turns into `medium` — a guess is
 * only worth making when the text actually says so.
 */
export function sizeFromSubtitle(subtitle: string | null): TokenSize | null {
  if (!subtitle) return null
  const first = subtitle
    .trim()
    .split(/[\s,]+/)[0]
    ?.toLowerCase()
  switch (first) {
    case 'tiny':
      return 'tiny'
    case 'small':
      return 'small'
    case 'medium':
      return 'medium'
    case 'large':
      return 'large'
    case 'huge':
      return 'huge'
    case 'gargantuan':
      return 'gargantuan'
    default:
      return null
  }
}

/** What the canvas needs to draw a token's live state. */
export interface TokenVitals {
  combatant: Combatant
  /** 0..1, or null when the combatant has no max HP to measure against. */
  hpFraction: number | null
  /** At or below zero hit points — struck through in the tracker, dimmed here. */
  down: boolean
  /** Whose turn it is. */
  active: boolean
}

/**
 * Live state for a token, or null when it is not linked (or the link dangles).
 *
 * Returning null for a dangling link rather than throwing is the whole
 * tolerance story: a token whose combatant was removed is still a perfectly
 * good miniature.
 */
export function tokenVitals(
  token: Token,
  combatants: Array<Combatant>,
  activeId: string | null,
): TokenVitals | null {
  if (!token.combatantId) return null
  const combatant = combatants.find((c) => c.id === token.combatantId)
  if (!combatant) return null
  const max = combatant.maxHp
  return {
    combatant,
    hpFraction:
      max && max > 0 ? Math.max(0, Math.min(1, combatant.hp / max)) : null,
    down: combatant.hp <= 0,
    active: activeId === combatant.id,
  }
}

/** A token that claims a combatant which is no longer in the fight. */
export function isOrphaned(
  token: Token,
  combatants: Array<Combatant>,
): boolean {
  return (
    !!token.combatantId && !combatants.some((c) => c.id === token.combatantId)
  )
}

/** Combatants with no token on this map yet — what the Fight tab badges. */
export function unplacedCombatants(
  map: BattleMap,
  combatants: Array<Combatant>,
): Array<Combatant> {
  const placed = new Set(
    map.tokens.map((t) => t.combatantId).filter(Boolean) as Array<string>,
  )
  return combatants.filter((c) => !placed.has(c.id))
}

/**
 * The first free cell at or after `from`, scanning in reading order.
 *
 * Used when placing several tokens at once so they do not stack into one
 * square, and when a drop lands on an occupied cell. Falls back to the
 * requested cell if the grid is full, because refusing to place a token is
 * worse than overlapping one.
 */
export function freeCell(
  map: BattleMap,
  from: Point,
  cols: number,
  rows: number,
): Point {
  const taken = new Set<string>()
  for (const t of map.tokens) {
    const span = TOKEN_CELLS[t.size]
    for (let y = 0; y < span; y += 1) {
      for (let x = 0; x < span; x += 1) {
        taken.add(`${t.x + x},${t.y + y}`)
      }
    }
  }
  if (!taken.has(`${from.x},${from.y}`)) return from

  for (let y = Math.max(0, from.y); y < rows; y += 1) {
    for (let x = y === from.y ? Math.max(0, from.x) : 0; x < cols; x += 1) {
      if (!taken.has(`${x},${y}`)) return { x, y }
    }
  }
  return from
}

/**
 * Build a token for a combatant.
 *
 * Colour comes from whether the row links to a **character** article: the party
 * is blue, everything else is red. That is a guess, and a deliberately shallow
 * one — the DM can recolour, and guessing beats every token being the same red.
 */
export function tokenForCombatant(
  combatant: Combatant,
  at: Point,
  options: { ally?: boolean; size?: TokenSize; image?: string } = {},
): Token {
  return {
    id: newTokenId(),
    label: combatant.name,
    x: at.x,
    y: at.y,
    size: options.size ?? 'medium',
    colour: options.ally ? ALLY_COLOUR : FOE_COLOUR,
    ...(options.image ? { image: options.image } : {}),
    combatantId: combatant.id,
  }
}

/** Place one combatant on the map, skipping over occupied squares. */
export function placeCombatant(
  map: BattleMap,
  combatant: Combatant,
  at: Point,
  cols: number,
  rows: number,
  options: { ally?: boolean; size?: TokenSize; image?: string } = {},
): BattleMap {
  const cell = freeCell(map, at, cols, rows)
  return addToken(map, tokenForCombatant(combatant, cell, options))
}

/** Point an existing token at a combatant. */
export function linkToken(
  map: BattleMap,
  tokenId: string,
  combatantId: string,
): BattleMap {
  return updateToken(map, tokenId, { combatantId })
}

/**
 * Break the link, leaving the token on the map.
 *
 * `combatantId: undefined` rather than deleting the key, because `updateToken`
 * spreads a patch — and `parseTokens` omits the field when it is empty, so the
 * round-trip through disk drops it properly either way.
 */
export function unlinkToken(map: BattleMap, tokenId: string): BattleMap {
  return updateToken(map, tokenId, { combatantId: undefined })
}

/**
 * Where a token's statblock lives, or null when it has none.
 *
 * `combatant.worldId ?? fallback` is the repeated idiom across the tracker: a
 * global-library monster's articleId resolves against the **library**, not the
 * open world, and the field is absent on rows written before that was possible.
 * Getting this wrong opens the wrong article, or none.
 */
export function tokenArticle(
  token: Token,
  combatants: Array<Combatant>,
  fallbackWorldId: string,
): { worldId: string; articleId: string } | null {
  if (!token.combatantId) return null
  const combatant = combatants.find((c) => c.id === token.combatantId)
  if (!combatant?.articleId) return null
  return {
    worldId: combatant.worldId ?? fallbackWorldId,
    articleId: combatant.articleId,
  }
}
