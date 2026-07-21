import { describe, expect, it } from 'vitest'
import {
  emptyCombat,
  parseCombatState,
  turnOrder,
  withCombatantAdded,
  withCombatantRemoved,
  withCombatantUpdated,
  withNextTurn,
} from './sessionStore'
import type { CombatState } from './sessionStore'

const combatant = (id: string, name: string, initiative: number, hp = 10) => ({
  id,
  name,
  initiative,
  hp,
  maxHp: hp,
  ac: null,
  note: '',
})

function stateWith(...cs: Array<ReturnType<typeof combatant>>): CombatState {
  return { ...emptyCombat(), combatants: cs }
}

describe('turn order', () => {
  it('sorts by initiative desc, ties keep insertion order', () => {
    const s = stateWith(
      combatant('a', 'A', 12),
      combatant('b', 'B', 20),
      combatant('c', 'C', 12),
    )
    expect(turnOrder(s).map((c) => c.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('withNextTurn', () => {
  it('is a no-op with no combatants', () => {
    expect(withNextTurn(emptyCombat())).toEqual(emptyCombat())
  })

  it('starts with the highest initiative and wraps with a round increment', () => {
    let s = stateWith(combatant('a', 'A', 5), combatant('b', 'B', 15))
    s = withNextTurn(s)
    expect(s.activeId).toBe('b')
    expect(s.round).toBe(1)
    s = withNextTurn(s)
    expect(s.activeId).toBe('a')
    s = withNextTurn(s)
    expect(s.activeId).toBe('b')
    expect(s.round).toBe(2)
  })

  it('recovers when the active combatant no longer exists', () => {
    const s = { ...stateWith(combatant('a', 'A', 5)), activeId: 'gone' }
    expect(withNextTurn(s).activeId).toBe('a')
  })
})

describe('withCombatantRemoved', () => {
  it('hands the turn to the next combatant when removing the active one', () => {
    let s = stateWith(combatant('a', 'A', 20), combatant('b', 'B', 10))
    s = { ...s, activeId: 'a' }
    s = withCombatantRemoved(s, 'a')
    expect(s.activeId).toBe('b')
    expect(s.combatants.map((c) => c.id)).toEqual(['b'])
  })

  it('resets active and round when the roster empties', () => {
    let s: CombatState = {
      ...stateWith(combatant('a', 'A', 20)),
      activeId: 'a',
      round: 4,
    }
    s = withCombatantRemoved(s, 'a')
    expect(s.activeId).toBeNull()
    expect(s.round).toBe(1)
  })
})

describe('withCombatantUpdated / added', () => {
  it('clamps HP at zero', () => {
    let s = stateWith(combatant('a', 'A', 10, 3))
    s = withCombatantUpdated(s, 'a', { hp: -5 })
    expect(s.combatants[0].hp).toBe(0)
  })

  it('auto-suffixes duplicate names', () => {
    let s = emptyCombat()
    s = withCombatantAdded(s, combatant('', 'Goblin', 12), 'g1')
    s = withCombatantAdded(s, combatant('', 'goblin', 9), 'g2')
    s = withCombatantAdded(s, combatant('', 'Goblin', 7), 'g3')
    expect(s.combatants.map((c) => c.name)).toEqual([
      'Goblin',
      'goblin 2',
      'Goblin 3',
    ])
  })
})

describe('parseCombatState', () => {
  it('round-trips a valid state', () => {
    const s = { ...stateWith(combatant('a', 'A', 10)), activeId: 'a', round: 3 }
    expect(parseCombatState(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })

  it('falls back to empty on garbage', () => {
    for (const garbage of [
      null,
      'x',
      42,
      {},
      { version: 2 },
      { version: 1, combatants: 'no' },
    ]) {
      expect(parseCombatState(garbage)).toEqual(emptyCombat())
    }
  })

  it('drops a dangling activeId', () => {
    const s = { ...stateWith(combatant('a', 'A', 10)), activeId: 'ghost' }
    expect(parseCombatState(JSON.parse(JSON.stringify(s))).activeId).toBeNull()
  })
})
