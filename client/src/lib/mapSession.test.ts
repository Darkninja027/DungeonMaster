import { describe, expect, it } from 'vitest'
import type { Combatant } from './api'
import { forPlayers, newMap } from './mapStore'
import type { Token } from './mapStore'
import type { RollEntry } from './rollLog'
import type { CombatState } from './sessionStore'
import {
  TABLE_ROLL_LIMIT,
  forPlayersSession,
  mayControl,
  parseTableSession,
  parseTokenControl,
  tokenControl,
} from './mapSession'

function combatant(over: Partial<Combatant> = {}): Combatant {
  return {
    id: 'c1',
    name: 'Goblin',
    initiative: 12,
    hp: 7,
    maxHp: 7,
    ac: 15,
    note: 'has the key',
    articleId: 'Monsters/Goblin',
    worldId: 'deadbeef',
    ...over,
  }
}

function token(over: Partial<Token> = {}): Token {
  return {
    id: 't1',
    label: '',
    x: 0,
    y: 0,
    size: 'medium',
    colour: '#f00',
    ...over,
  }
}

function roll(over: Partial<RollEntry> = {}): RollEntry {
  return {
    id: 'r1',
    notation: '1d20+3',
    total: 17,
    detail: '[14] + 3',
    at: 1000,
    source: {
      worldId: 'deadbeef',
      articleId: 'Monsters/Dragon',
      title: 'Dragon',
    },
    ...over,
  }
}

function combat(
  combatants: Array<Combatant>,
  activeId: string | null = null,
): CombatState {
  return { version: 1, combatants, activeId, round: 3 }
}

describe('forPlayersSession', () => {
  it('leaves out a combatant whose token is hidden, and hides that it is their turn', () => {
    const map = newMap({
      tokens: [
        token({ id: 'a', combatantId: 'seen' }),
        token({ id: 'b', combatantId: 'lurker', hidden: true }),
      ],
    })
    const session = forPlayersSession(
      forPlayers(map),
      combat(
        [
          combatant({ id: 'seen', name: 'Goblin' }),
          combatant({ id: 'lurker', name: 'Assassin' }),
        ],
        'lurker',
      ),
      [],
      { showDmRolls: false },
    )
    expect(session.combatants.map((c) => c.id)).toEqual(['seen'])
    expect(session.activeId).toBeNull()
    expect(JSON.stringify(session)).not.toContain('Assassin')
    expect(JSON.stringify(session)).not.toContain('lurker')
  })

  it('leaves out an unplaced monster but keeps an unplaced party member', () => {
    const session = forPlayersSession(
      newMap(),
      combat([
        combatant({ id: 'm', name: 'Ogre' }),
        combatant({ id: 'p', name: 'Thalia', articleId: 'Characters/Thalia' }),
      ]),
      [],
      { showDmRolls: false },
    )
    expect(session.combatants.map((c) => c.name)).toEqual(['Thalia'])
  })

  it('carries the round and a visible active turn', () => {
    const map = newMap({ tokens: [token({ combatantId: 'c1' })] })
    const session = forPlayersSession(map, combat([combatant()], 'c1'), [], {
      showDmRolls: false,
    })
    expect(session.round).toBe(3)
    expect(session.activeId).toBe('c1')
  })

  it('strips HP, AC, notes and article ids, keeping only whether they are down', () => {
    const map = newMap({
      tokens: [
        token({ id: 'a', combatantId: 'up' }),
        token({ id: 'b', combatantId: 'dead' }),
      ],
    })
    const session = forPlayersSession(
      map,
      combat([
        combatant({ id: 'up', hp: 37, maxHp: 120 }),
        combatant({ id: 'dead', hp: 0 }),
      ]),
      [],
      { showDmRolls: false },
    )
    for (const c of session.combatants) {
      expect(c.maxHp).toBeNull()
      expect(c.ac).toBeNull()
      expect(c.note).toBe('')
      expect(c.articleId).toBeUndefined()
      expect(c.worldId).toBeUndefined()
    }
    expect(session.combatants.map((c) => c.hp)).toEqual([1, 0])
    const wire = JSON.stringify(session)
    expect(wire).not.toContain('120')
    expect(wire).not.toContain('has the key')
    expect(wire).not.toContain('deadbeef')
  })

  it("keeps the DM's own rolls behind the screen unless shared", () => {
    const rolls = [
      roll({ id: 'dm' }),
      roll({ id: 'guest', seat: { id: 's1', name: 'Sarah' } }),
    ]
    const hidden = forPlayersSession(newMap(), combat([]), rolls, {
      showDmRolls: false,
    })
    expect(hidden.rolls.map((r) => r.id)).toEqual(['guest'])

    const shared = forPlayersSession(newMap(), combat([]), rolls, {
      showDmRolls: true,
    })
    expect(shared.rolls.map((r) => r.id)).toEqual(['dm', 'guest'])
  })

  it('strips roll sources to a title, and caps the list', () => {
    const rolls = Array.from({ length: TABLE_ROLL_LIMIT + 10 }, (_, i) =>
      roll({ id: `r${i}` }),
    )
    const session = forPlayersSession(newMap(), combat([]), rolls, {
      showDmRolls: true,
    })
    expect(session.rolls).toHaveLength(TABLE_ROLL_LIMIT)
    expect(session.rolls[0].source).toEqual({ title: 'Dragon' })
    expect(JSON.stringify(session)).not.toContain('deadbeef')
    expect(JSON.stringify(session)).not.toContain('Monsters/Dragon')
  })
})

describe('parseTableSession', () => {
  it('round-trips what forPlayersSession builds', () => {
    const map = newMap({ tokens: [token({ combatantId: 'c1' })] })
    const built = forPlayersSession(
      map,
      combat([combatant()], 'c1'),
      [roll({ seat: { id: 's', name: 'Sam', character: 'Bree' } })],
      { showDmRolls: false },
    )
    expect(parseTableSession(JSON.parse(JSON.stringify(built)))).toEqual(built)
  })

  it('does not carry through fields a push should never have had', () => {
    const parsed = parseTableSession({
      round: 2,
      activeId: 'x',
      combatants: [
        {
          id: 'x',
          name: 'Dragon',
          initiative: 20,
          hp: 250,
          maxHp: 256,
          ac: 19,
          note: 'lair',
        },
      ],
      rolls: [
        {
          id: 'r',
          notation: 'd20',
          total: 4,
          at: 1,
          detail: '',
          source: { worldId: 'deadbeef', articleId: 'Secret', title: 'Dragon' },
        },
      ],
    })
    expect(parsed.combatants[0]).toEqual({
      id: 'x',
      name: 'Dragon',
      initiative: 20,
      hp: 1,
      maxHp: null,
      ac: null,
      note: '',
    })
    expect(parsed.rolls[0].source).toEqual({ title: 'Dragon' })
  })

  it('drops malformed rows and a dangling active id rather than blanking', () => {
    const parsed = parseTableSession({
      round: 0,
      activeId: 'ghost',
      combatants: [null, { id: 'a' }, { id: 'b', name: 'Bree', initiative: 9 }],
      rolls: [{ id: 'r' }, 'nope'],
    })
    expect(parsed.combatants.map((c) => c.id)).toEqual(['b'])
    expect(parsed.activeId).toBeNull()
    expect(parsed.round).toBe(1)
    expect(parsed.rolls).toEqual([])
    expect(parseTableSession('garbage').combatants).toEqual([])
  })
})

describe('tokenControl', () => {
  const fight = combat([
    combatant({ id: 'pc', name: 'Thalia', articleId: 'Characters/Thalia' }),
    combatant({ id: 'orc', name: 'Orc', articleId: 'Monsters/Orc' }),
  ])

  it('gives a party token to its character, and a named token to that player', () => {
    const map = newMap({
      tokens: [
        token({ id: 't-pc', combatantId: 'pc' }),
        token({ id: 't-wolf', controlledBy: 'Brok' }),
        token({ id: 't-both', combatantId: 'pc', controlledBy: 'Brok' }),
      ],
    })
    expect(tokenControl(map, fight)).toEqual({
      't-pc': { characterId: 'Characters/Thalia' },
      't-wolf': { player: 'Brok' },
      't-both': { characterId: 'Characters/Thalia', player: 'Brok' },
    })
  })

  it("leaves out the DM's own tokens: monsters and unassigned ones", () => {
    const map = newMap({
      tokens: [token({ id: 't-orc', combatantId: 'orc' }), token({ id: 'x' })],
    })
    expect(tokenControl(map, fight)).toEqual({})
  })

  it('never lists a hidden token, even one a player controls', () => {
    const map = newMap({
      tokens: [
        token({ id: 't-pc', combatantId: 'pc', hidden: true }),
        token({ id: 't-wolf', controlledBy: 'Brok', hidden: true }),
      ],
    })
    expect(tokenControl(forPlayers(map), fight)).toEqual({})
  })
})

describe('mayControl', () => {
  it('matches a claimed character, or the named player in any case', () => {
    const control = { characterId: 'Characters/Thalia', player: 'Brok' }
    expect(
      mayControl(control, { name: 'Sarah', characterId: 'Characters/Thalia' }),
    ).toBe(true)
    expect(mayControl(control, { name: 'brok' })).toBe(true)
    expect(mayControl(control, { name: 'Sarah', characterId: null })).toBe(
      false,
    )
  })

  it('refuses when there is nothing to match', () => {
    expect(mayControl(undefined, { name: 'Brok' })).toBe(false)
    expect(mayControl({ player: 'Brok' }, { name: '' })).toBe(false)
  })
})

describe('parseTokenControl', () => {
  it('drops entries with nothing usable', () => {
    expect(
      parseTokenControl({
        a: { player: 'Brok' },
        b: { characterId: 42 },
        c: 'nope',
        d: {},
      }),
    ).toEqual({ a: { player: 'Brok' } })
    expect(parseTokenControl(null)).toEqual({})
    expect(parseTokenControl([1])).toEqual({})
  })
})
