import { describe, expect, it } from 'vitest'
import {
  ALLY_COLOUR,
  FOE_COLOUR,
  freeCell,
  isOrphaned,
  sizeFromSubtitle,
  linkToken,
  placeCombatant,
  tokenArticle,
  tokenForCombatant,
  tokenVitals,
  unlinkToken,
  unplacedCombatants,
} from './mapTokens'
import { addToken, newMap } from './mapStore'
import type { BattleMap, Token } from './mapStore'
import type { Combatant } from './api'

/**
 * The two rules worth guarding here are both about not destroying someone's
 * work: a dangling link (combatant removed, token still on the table) must
 * degrade to "no live stats" rather than throwing or pruning the token, and
 * placing combatants must never move or replace a token the DM already put
 * somewhere.
 *
 * `tokenArticle`'s `worldId ?? fallback` is the third: a library monster
 * resolves against the library world, and getting it wrong opens the wrong
 * article silently.
 */

function combatant(over: Partial<Combatant> = {}): Combatant {
  return {
    id: 'c1',
    name: 'Goblin',
    initiative: 12,
    hp: 7,
    maxHp: 7,
    ac: 15,
    note: '',
    ...over,
  }
}

function token(over: Partial<Token> = {}): Token {
  return {
    id: 't1',
    label: 'Goblin',
    x: 0,
    y: 0,
    size: 'medium',
    colour: FOE_COLOUR,
    ...over,
  }
}

function map(over: Partial<BattleMap> = {}): BattleMap {
  return newMap({
    id: 'm1',
    name: 'Cave',
    imageWidth: 700,
    imageHeight: 700, // 70px grid => 10x10
    ...over,
  })
}

describe('tokenVitals', () => {
  it('reports hp, down and active for a linked token', () => {
    const c = combatant({ hp: 3, maxHp: 12 })
    const vitals = tokenVitals(token({ combatantId: 'c1' }), [c], 'c1')
    expect(vitals?.hpFraction).toBeCloseTo(0.25)
    expect(vitals?.down).toBe(false)
    expect(vitals?.active).toBe(true)
  })

  it('is null for an unlinked token', () => {
    expect(tokenVitals(token(), [combatant()], null)).toBeNull()
  })

  it('is null — not an error — when the link dangles', () => {
    // The DM removed the row but left the miniature on the table.
    expect(
      tokenVitals(token({ combatantId: 'gone' }), [combatant()], null),
    ).toBeNull()
  })

  it('marks a combatant at zero hit points as down', () => {
    const c = combatant({ hp: 0 })
    expect(tokenVitals(token({ combatantId: 'c1' }), [c], null)?.down).toBe(
      true,
    )
  })

  it('has no hp fraction when there is no max to measure against', () => {
    const c = combatant({ maxHp: null })
    expect(
      tokenVitals(token({ combatantId: 'c1' }), [c], null)?.hpFraction,
    ).toBeNull()
  })

  it('clamps a fraction that overshoots either end', () => {
    const over = combatant({ hp: 99, maxHp: 10 })
    expect(
      tokenVitals(token({ combatantId: 'c1' }), [over], null)?.hpFraction,
    ).toBe(1)
    const under = combatant({ hp: -5, maxHp: 10 })
    expect(
      tokenVitals(token({ combatantId: 'c1' }), [under], null)?.hpFraction,
    ).toBe(0)
  })
})

describe('sizeFromSubtitle', () => {
  it('reads the size a stat block already states', () => {
    // The whole point: "Large giant, chaotic evil" is on disk, so a token
    // should not default to medium and wait to be corrected by hand.
    expect(sizeFromSubtitle('Large giant, chaotic evil')).toBe('large')
    expect(sizeFromSubtitle('Small humanoid, neutral evil')).toBe('small')
    expect(sizeFromSubtitle('Gargantuan dragon')).toBe('gargantuan')
    expect(sizeFromSubtitle('tiny beast, unaligned')).toBe('tiny')
  })

  it('is null when the text does not say', () => {
    // A guess is only worth making when the source actually says so.
    expect(sizeFromSubtitle(null)).toBeNull()
    expect(sizeFromSubtitle('')).toBeNull()
    expect(sizeFromSubtitle('humanoid, any alignment')).toBeNull()
  })

  it('only reads the leading word', () => {
    // "Large" inside a name or an alignment is not a size category.
    expect(sizeFromSubtitle('beast of Large Renown')).toBeNull()
  })
})

describe('isOrphaned', () => {
  it('is true only for a link that points at nothing', () => {
    expect(isOrphaned(token({ combatantId: 'gone' }), [combatant()])).toBe(true)
    expect(isOrphaned(token({ combatantId: 'c1' }), [combatant()])).toBe(false)
    expect(isOrphaned(token(), [combatant()])).toBe(false)
  })
})

describe('freeCell', () => {
  it('returns the asked-for cell when it is empty', () => {
    expect(freeCell(map(), { x: 3, y: 3 }, 10, 10)).toEqual({ x: 3, y: 3 })
  })

  it('steps past an occupied cell in reading order', () => {
    const m = addToken(map(), token({ x: 3, y: 3 }))
    expect(freeCell(m, { x: 3, y: 3 }, 10, 10)).toEqual({ x: 4, y: 3 })
  })

  it('steps past the whole footprint of a big token', () => {
    const m = addToken(map(), token({ x: 3, y: 3, size: 'huge' })) // 3x3
    expect(freeCell(m, { x: 4, y: 4 }, 10, 10)).toEqual({ x: 6, y: 4 })
  })

  it('wraps to the next row at the edge', () => {
    let m = map()
    for (let x = 8; x < 10; x += 1)
      m = addToken(m, token({ id: `t${x}`, x, y: 2 }))
    expect(freeCell(m, { x: 8, y: 2 }, 10, 10)).toEqual({ x: 0, y: 3 })
  })

  it('gives back the asked-for cell rather than refusing when the grid is full', () => {
    let m = map()
    let i = 0
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 2; x += 1) {
        m = addToken(m, token({ id: `t${i++}`, x, y }))
      }
    }
    // A 2x2 grid with 4 tokens: nowhere free, so it overlaps rather than fails.
    expect(freeCell(m, { x: 0, y: 0 }, 2, 2)).toEqual({ x: 0, y: 0 })
  })
})

describe('tokenForCombatant', () => {
  it('carries the name and the link', () => {
    const t = tokenForCombatant(combatant(), { x: 2, y: 3 })
    expect(t).toMatchObject({
      label: 'Goblin',
      x: 2,
      y: 3,
      combatantId: 'c1',
      colour: FOE_COLOUR,
    })
  })

  it('colours the party differently from the monsters', () => {
    expect(
      tokenForCombatant(combatant(), { x: 0, y: 0 }, { ally: true }).colour,
    ).toBe(ALLY_COLOUR)
  })

  it('omits an image rather than storing an empty one', () => {
    expect(tokenForCombatant(combatant(), { x: 0, y: 0 })).not.toHaveProperty(
      'image',
    )
  })
})

describe('placeCombatant', () => {
  it('places on the map, avoiding an occupied square', () => {
    const m = addToken(map(), token({ x: 1, y: 1 }))
    const next = placeCombatant(m, combatant(), { x: 1, y: 1 }, 10, 10)
    expect(next.tokens).toHaveLength(2)
    expect(next.tokens[1]).toMatchObject({ x: 2, y: 1, combatantId: 'c1' })
  })
})

describe('unplacedCombatants', () => {
  const roster = [
    combatant({ id: 'c1', name: 'Goblin' }),
    combatant({ id: 'c2', name: 'Hobgoblin' }),
    combatant({ id: 'c3', name: 'Verron' }),
  ]

  it('lists only the ones with no token', () => {
    // This is what the Fight tab's badge counts: who is in the fight but not
    // yet on this map.
    const m = addToken(map(), token({ combatantId: 'c2' }))
    expect(unplacedCombatants(m, roster).map((c) => c.id)).toEqual(['c1', 'c3'])
  })

  it('is empty when everyone is placed', () => {
    let m = map()
    for (const c of roster) {
      m = addToken(m, token({ id: `t-${c.id}`, combatantId: c.id }))
    }
    expect(unplacedCombatants(m, roster)).toEqual([])
  })
})

describe('linkToken / unlinkToken', () => {
  it('links and unlinks without touching anything else', () => {
    const m = addToken(map(), token({ x: 4, y: 5, label: 'Mystery' }))
    const linked = linkToken(m, 't1', 'c1')
    expect(linked.tokens[0]).toMatchObject({
      combatantId: 'c1',
      x: 4,
      y: 5,
      label: 'Mystery',
    })

    const unlinked = unlinkToken(linked, 't1')
    expect(unlinked.tokens[0].combatantId).toBeUndefined()
    expect(unlinked.tokens[0]).toMatchObject({ x: 4, y: 5, label: 'Mystery' })
  })
})

describe('tokenArticle', () => {
  it('resolves a library monster against its own world, not the open one', () => {
    // The trap: a global-library monster shares an articleId with a world one.
    const c = combatant({
      articleId: 'Monsters/Goblin',
      worldId: 'libraryworld',
    })
    expect(
      tokenArticle(token({ combatantId: 'c1' }), [c], 'openworld'),
    ).toEqual({
      worldId: 'libraryworld',
      articleId: 'Monsters/Goblin',
    })
  })

  it('falls back to the open world when the combatant predates worldId', () => {
    const c = combatant({ articleId: 'Monsters/Goblin' })
    expect(
      tokenArticle(token({ combatantId: 'c1' }), [c], 'openworld'),
    ).toEqual({
      worldId: 'openworld',
      articleId: 'Monsters/Goblin',
    })
  })

  it('is null when there is nothing to open', () => {
    expect(tokenArticle(token(), [combatant()], 'w')).toBeNull()
    expect(
      tokenArticle(
        token({ combatantId: 'c1' }),
        [combatant({ articleId: undefined })],
        'w',
      ),
    ).toBeNull()
    expect(
      tokenArticle(token({ combatantId: 'gone' }), [combatant()], 'w'),
    ).toBeNull()
  })
})
