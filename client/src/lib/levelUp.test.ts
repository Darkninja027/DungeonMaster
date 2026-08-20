import { describe, expect, it } from 'vitest'
import {
  abilityMod,
  emptyCharacter,
  hitDiceArePinned,
  parseCharacter,
  serializeCharacter,
} from './character'
import type { Character } from './character'
import { SRD_TABLES, findKit } from './tables'
import type { ClassKit, FeatInfo } from './srd'
import {
  ASI_HYBRID_POINTS,
  ASI_POINTS,
  asiPointsFor,
  applyLevelUp,
  asiComplete,
  asiLevelsCrossed,
  averageHitDie,
  featsAvailable,
  cantripsAtLevel,
  canAdvance,
  emptyLevelUpDraft,
  featuresGained,
  hpGained,
  levelUpPlan,
  levelUpSteps,
  levelsGained,
  needsSubclass,
  slotsAtLevel,
} from './levelUp'
import type { AsiChoice, LevelUpDraft } from './levelUp'

const kitFor = (name: string): ClassKit | undefined =>
  findKit(SRD_TABLES.kits, name)

/** A level-1 character of a given class, with a CON worth a +2. */
function characterAt(level: number, className: string): Character {
  const kit = kitFor(className)
  return {
    ...emptyCharacter(),
    class: className,
    level,
    abilities: { str: 12, dex: 12, con: 14, int: 12, wis: 12, cha: 12 },
    hp: { current: 20, max: 30, temp: 0 },
    hitDice: { size: kit?.hitDie ?? 8, total: level, used: 0 },
  }
}

function draftFor(
  c: Character,
  to: number,
  patch: Partial<LevelUpDraft> = {},
): LevelUpDraft {
  return { ...emptyLevelUpDraft(c, to, kitFor(c.class)), ...patch }
}

describe('feats taken at level-up', () => {
  const RESILIENT: FeatInfo = {
    id: 'resilient',
    name: 'Resilient',
    summary: 'Tougher than you look.',
    asi: { con: 1 },
    grant: { saves: ['con'], skills: ['athletics'] },
  }

  const MOBILE: FeatInfo = {
    id: 'mobile',
    name: 'Mobile',
    summary: 'Faster than you look.',
    grant: { speedBonus: 10 },
  }

  const ALERT: FeatInfo = {
    id: 'alert',
    name: 'Alert',
    summary: '+5 to initiative.',
    grant: { initiativeBonus: 5 },
  }

  const takingFeat = (c: Character, to: number, featName: string) => {
    const draft = draftFor(c, to, { feats: [RESILIENT, MOBILE, ALERT] })
    const level = Object.keys(draft.asi)[0]
    return {
      ...draft,
      asi: {
        [Number(level)]: { kind: 'feat' as const, abilities: {}, featName },
      },
    }
  }

  it('applies the feat grant and its half-feat +1', () => {
    const before = characterAt(3, 'Fighter')
    const after = applyLevelUp(before, takingFeat(before, 4, 'Resilient'))

    expect(after.feats.map((f) => f.name)).toContain('Resilient')
    expect(after.saves).toContain('con')
    expect(after.skills).toContain('athletics')
    // 14 + 1 from the half-feat.
    expect(after.abilities.con).toBe(15)
  })

  it('adds a feat’s speed bonus to the character’s speed', () => {
    const before = characterAt(3, 'Fighter')
    const after = applyLevelUp(before, takingFeat(before, 4, 'Mobile'))

    expect(after.speed).toBe(before.speed + 10)
  })

  it('does not re-apply a speed bonus for a feat already on the sheet', () => {
    const before: Character = {
      ...characterAt(3, 'Fighter'),
      feats: [{ name: 'Mobile' }],
    }
    const after = applyLevelUp(before, takingFeat(before, 4, 'Mobile'))

    expect(after.speed).toBe(before.speed)
  })

  it('carries the feat’s summary onto the sheet as its description', () => {
    const before = characterAt(3, 'Fighter')
    const after = applyLevelUp(before, takingFeat(before, 4, 'Resilient'))

    // Without this the Features tab lists the feat as "No description yet."
    expect(after.feats).toContainEqual({
      name: 'Resilient',
      text: 'Tougher than you look.',
    })
  })

  it('adds a feat’s initiative bonus to the sheet', () => {
    const before = characterAt(3, 'Fighter')
    const after = applyLevelUp(before, takingFeat(before, 4, 'Alert'))

    expect(after.initiativeBonus).toBe(before.initiativeBonus + 5)
  })

  it('does not re-apply an initiative bonus for a feat already on the sheet', () => {
    const before: Character = {
      ...characterAt(3, 'Fighter'),
      feats: [{ name: 'Alert' }],
    }
    const after = applyLevelUp(before, takingFeat(before, 4, 'Alert'))

    expect(after.initiativeBonus).toBe(before.initiativeBonus)
  })

  it('leaves an unknown feat as a bare name, granting nothing', () => {
    const before = characterAt(3, 'Fighter')
    const after = applyLevelUp(before, takingFeat(before, 4, 'Sharpshooter'))

    expect(after.feats.map((f) => f.name)).toContain('Sharpshooter')
    expect(
      after.feats.find((f) => f.name === 'Sharpshooter')?.text,
    ).toBeUndefined()
    expect(after.saves).toEqual(before.saves)
    expect(after.skills).toEqual(before.skills)
    expect(after.abilities.con).toBe(before.abilities.con)
  })

  it('does not re-apply a grant for a feat already on the sheet', () => {
    const before: Character = {
      ...characterAt(3, 'Fighter'),
      feats: [{ name: 'Resilient' }],
    }
    const after = applyLevelUp(before, takingFeat(before, 4, 'Resilient'))

    // Listed once...
    expect(after.feats.filter((f) => f.name === 'Resilient')).toHaveLength(1)
    // ...and the half-feat bump doesn't stack on a re-take.
    expect(after.saves).toEqual(before.saves)
    expect(after.abilities.con).toBe(before.abilities.con)
  })

  it('respects the 20 cap on a half-feat bump', () => {
    const before: Character = {
      ...characterAt(3, 'Fighter'),
      abilities: { str: 12, dex: 12, con: 20, int: 12, wis: 12, cha: 12 },
    }
    const after = applyLevelUp(before, takingFeat(before, 4, 'Resilient'))
    expect(after.abilities.con).toBe(20)
  })

  it('never lowers or removes anything when a feat grants', () => {
    const before: Character = {
      ...characterAt(3, 'Fighter'),
      saves: ['str'],
      skills: ['stealth'],
    }
    const after = applyLevelUp(before, takingFeat(before, 4, 'Resilient'))

    expect(after.saves).toEqual(expect.arrayContaining(['str', 'con']))
    expect(after.skills).toEqual(
      expect.arrayContaining(['stealth', 'athletics']),
    )
  })
})

describe('the additive invariant', () => {
  /**
   * The test that makes the whole feature safe to trust. A character is
   * somebody's work — a level-up may add to it and may never quietly disagree
   * with it.
   */
  it('never removes or edits anything already on the sheet', () => {
    const before: Character = {
      ...characterAt(4, 'Fighter'),
      subclass: 'Champion',
      traits: [{ name: 'Darkvision', text: 'See in the dark.' }],
      feats: [{ name: 'Alert' }],
      features: [{ level: 1, name: 'Second Wind', text: 'Regain hp.' }],
      inventory: [{ text: 'Longsword', qty: 1, weight: 3, slot: null }],
      notes: [{ at: '2026-01-01', text: 'Met the duke.' }],
      skills: ['athletics'],
      languages: ['Common'],
      attacks: [{ name: 'Longsword', bonus: 5, damage: '1d8+3' }],
      currency: { cp: 1, sp: 2, ep: 3, gp: 4, pp: 5 },
    }
    const after = applyLevelUp(before, draftFor(before, 6))

    // Every pre-existing array element survives, in order, unchanged.
    expect(after.traits).toEqual(before.traits)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.notes).toEqual(before.notes)
    expect(after.skills).toEqual(before.skills)
    expect(after.languages).toEqual(before.languages)
    expect(after.attacks).toEqual(before.attacks)
    expect(after.currency).toEqual(before.currency)
    expect(after.features.slice(0, before.features.length)).toEqual(
      before.features,
    )
    expect(after.feats.slice(0, before.feats.length)).toEqual(before.feats)
    // Numbers only ever rise.
    expect(after.hp.max).toBeGreaterThan(before.hp.max)
    expect(after.level).toBeGreaterThan(before.level)
  })

  it('leaves current hit points alone', () => {
    // How hurt you are is a fact about the fiction. Healing to full on level-up
    // would be the app overruling the table.
    const before = characterAt(3, 'Fighter')
    const after = applyLevelUp(before, draftFor(before, 4))
    expect(after.hp.current).toBe(before.hp.current)
    expect(after.hp.max).toBeGreaterThan(before.hp.max)
  })

  it('never lowers a spell slot the sheet already has', () => {
    // A house rule or a magic item may have granted more than the table says.
    const before: Character = {
      ...characterAt(1, 'Wizard'),
      spellSlots: { 1: { total: 9, used: 0 } },
    }
    const after = applyLevelUp(before, draftFor(before, 3))
    expect(after.spellSlots[1].total).toBe(9)
    // But a level the sheet didn't have still arrives.
    expect(after.spellSlots[2].total).toBe(2)
  })

  it('does not duplicate a feature the sheet already lists', () => {
    // Planning a build ahead is legal — see ClassFeature's doc comment.
    const before: Character = {
      ...characterAt(1, 'Fighter'),
      features: [{ level: 2, name: 'Action Surge', text: 'Planned ahead.' }],
    }
    const after = applyLevelUp(before, draftFor(before, 2))
    const surges = after.features.filter((f) => f.name === 'Action Surge')
    expect(surges).toHaveLength(1)
    expect(surges[0].text).toBe('Planned ahead.')
  })

  it('is a no-op when the level does not rise', () => {
    const before = characterAt(5, 'Fighter')
    expect(applyLevelUp(before, draftFor(before, 5))).toBe(before)
    expect(applyLevelUp(before, draftFor(before, 3))).toBe(before)
  })

  it('does not mutate its input', () => {
    const before = characterAt(1, 'Fighter')
    const snapshot = JSON.parse(JSON.stringify(before)) as Character
    applyLevelUp(before, draftFor(before, 5))
    expect(before).toEqual(snapshot)
  })
})

describe('hit points', () => {
  it('averages the hit die by default', () => {
    // A d10 averages 6 in 5e: half, round up.
    expect(averageHitDie(10)).toBe(6)
    expect(averageHitDie(8)).toBe(5)
    expect(averageHitDie(6)).toBe(4)
    expect(averageHitDie(12)).toBe(7)
  })

  it('adds the CON modifier per level', () => {
    const c = characterAt(1, 'Fighter') // d10, CON 14 (+2)
    const draft = draftFor(c, 2)
    expect(hpGained(c, draft)).toBe(averageHitDie(10) + 2)
  })

  it('uses rolled values when rolling', () => {
    const c = characterAt(1, 'Fighter')
    const draft = draftFor(c, 3, {
      hp: { method: 'roll', rolls: [9, 3], manual: 0 },
    })
    // (9 + 2) + (3 + 2)
    expect(hpGained(c, draft)).toBe(16)
  })

  it('never gains less than 1 hit point per level, even on a punishing CON', () => {
    const c: Character = {
      ...characterAt(1, 'Wizard'),
      abilities: { ...characterAt(1, 'Wizard').abilities, con: 1 }, // -5
    }
    const draft = draftFor(c, 3, {
      hp: { method: 'roll', rolls: [1, 1], manual: 0 },
    })
    // 1 - 5 would be negative; floored at 1 each.
    expect(hpGained(c, draft)).toBe(2)
  })

  it('takes a manual total as given, floored at one per level', () => {
    const c = characterAt(1, 'Fighter')
    expect(
      hpGained(
        c,
        draftFor(c, 4, { hp: { method: 'manual', rolls: [], manual: 25 } }),
      ),
    ).toBe(25)
    expect(
      hpGained(
        c,
        draftFor(c, 4, { hp: { method: 'manual', rolls: [], manual: 0 } }),
      ),
    ).toBe(3)
  })

  it('averages every level of a multi-level jump', () => {
    const c = characterAt(1, 'Fighter')
    expect(hpGained(c, draftFor(c, 5))).toBe(4 * (averageHitDie(10) + 2))
  })
})

describe('hit dice', () => {
  it('follow the level when unpinned', () => {
    const c = characterAt(3, 'Fighter')
    expect(hitDiceArePinned(c)).toBe(false)
    const after = applyLevelUp(c, draftFor(c, 5))
    expect(after.hitDice.total).toBe(5)
  })

  it('are left alone when pinned', () => {
    // A pinned total is a deliberate override — multiclass, homebrew.
    const c: Character = {
      ...characterAt(3, 'Fighter'),
      hitDice: { size: 10, total: 7, used: 0 },
    }
    expect(hitDiceArePinned(c)).toBe(true)
    const after = applyLevelUp(c, draftFor(c, 5))
    expect(after.hitDice.total).toBe(7)
    expect(after.level).toBe(5)
  })
})

describe('features', () => {
  it('grants only what falls in the range crossed', () => {
    const c = characterAt(1, 'Fighter')
    const gained = featuresGained(c, 1, 3, kitFor('Fighter'))
    expect(gained.map((f) => f.name)).toEqual([
      'Action Surge',
      'Martial Archetype',
    ])
  })

  it('grants everything across a multi-level jump', () => {
    const c = characterAt(1, 'Fighter')
    const after = applyLevelUp(c, draftFor(c, 5))
    const names = after.features.map((f) => f.name)
    expect(names).toContain('Action Surge')
    expect(names).toContain('Martial Archetype')
    expect(names).toContain('Extra Attack')
  })

  it('records the level each was gained at', () => {
    const c = characterAt(1, 'Fighter')
    const after = applyLevelUp(c, draftFor(c, 5))
    expect(after.features.find((f) => f.name === 'Extra Attack')?.level).toBe(5)
  })

  it('only takes the features the player kept', () => {
    const c = characterAt(1, 'Fighter')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { takeFeatures: ['Action Surge'] }),
    )
    const names = after.features.map((f) => f.name)
    expect(names).toContain('Action Surge')
    expect(names).not.toContain('Martial Archetype')
  })

  it('grants nothing for a class with no kit', () => {
    expect(
      featuresGained(characterAt(1, 'Blood Hunter'), 1, 5, undefined),
    ).toEqual([])
  })
})

describe('ability score improvements', () => {
  it('finds the levels crossed', () => {
    expect(asiLevelsCrossed(1, 5, kitFor('Fighter'))).toEqual([4])
    expect(asiLevelsCrossed(3, 9, kitFor('Fighter'))).toEqual([4, 6, 8])
    expect(asiLevelsCrossed(1, 3, kitFor('Fighter'))).toEqual([])
    expect(asiLevelsCrossed(1, 20, undefined)).toEqual([])
  })

  it('applies two points to the chosen abilities', () => {
    const c = characterAt(3, 'Fighter')
    const after = applyLevelUp(
      c,
      draftFor(c, 4, {
        asi: {
          4: { kind: 'abilities', abilities: { str: 2 }, featName: '' },
        },
      }),
    )
    expect(after.abilities.str).toBe(14)
    expect(after.abilities.dex).toBe(12)
  })

  it('splits points across two abilities', () => {
    const c = characterAt(3, 'Fighter')
    const after = applyLevelUp(
      c,
      draftFor(c, 4, {
        asi: {
          4: { kind: 'abilities', abilities: { str: 1, con: 1 }, featName: '' },
        },
      }),
    )
    expect(after.abilities.str).toBe(13)
    expect(after.abilities.con).toBe(15)
  })

  it('caps an ability at 20', () => {
    const c: Character = {
      ...characterAt(3, 'Fighter'),
      abilities: { ...characterAt(3, 'Fighter').abilities, str: 19 },
    }
    const after = applyLevelUp(
      c,
      draftFor(c, 4, {
        asi: { 4: { kind: 'abilities', abilities: { str: 2 }, featName: '' } },
      }),
    )
    expect(after.abilities.str).toBe(20)
  })

  it('takes a feat instead, appended to the existing list', () => {
    const c: Character = {
      ...characterAt(3, 'Fighter'),
      feats: [{ name: 'Alert' }],
    }
    const after = applyLevelUp(
      c,
      draftFor(c, 4, {
        asi: {
          4: { kind: 'feat', abilities: {}, featName: 'Sharpshooter' },
        },
      }),
    )
    expect(after.feats.map((f) => f.name)).toEqual(['Alert', 'Sharpshooter'])
    expect(after.abilities.str).toBe(12)
  })

  it('does not add a feat the character already has', () => {
    const c: Character = {
      ...characterAt(3, 'Fighter'),
      feats: [{ name: 'Alert' }],
    }
    const after = applyLevelUp(
      c,
      draftFor(c, 4, {
        asi: { 4: { kind: 'feat', abilities: {}, featName: 'alert' } },
      }),
    )
    expect(after.feats).toHaveLength(1)
  })

  it('knows when a choice is finished', () => {
    expect(
      asiComplete({ kind: 'abilities', abilities: {}, featName: '' }),
    ).toBe(false)
    expect(
      asiComplete({ kind: 'abilities', abilities: { str: 1 }, featName: '' }),
    ).toBe(false)
    expect(
      asiComplete({
        kind: 'abilities',
        abilities: { str: ASI_POINTS },
        featName: '',
      }),
    ).toBe(true)
    expect(asiComplete({ kind: 'feat', abilities: {}, featName: '' })).toBe(
      false,
    )
    expect(
      asiComplete({ kind: 'feat', abilities: {}, featName: 'Alert' }),
    ).toBe(true)
  })
})

describe('spell slots', () => {
  it('reads the row for a level, walking back to the last defined one', () => {
    const wizard = kitFor('Wizard')
    expect(slotsAtLevel(wizard, 1)).toEqual([2])
    expect(slotsAtLevel(wizard, 3)).toEqual([4, 2])
    expect(slotsAtLevel(wizard, 20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1])
    expect(slotsAtLevel(undefined, 5)).toBeUndefined()
  })

  it('raises slots to the table', () => {
    const c: Character = {
      ...characterAt(1, 'Wizard'),
      spellAbility: 'int',
      spellSlots: { 1: { total: 2, used: 1 } },
    }
    const after = applyLevelUp(c, draftFor(c, 3))
    expect(after.spellSlots[1].total).toBe(4)
    expect(after.spellSlots[2].total).toBe(2)
    // Spent slots stay spent — a level-up is not a long rest.
    expect(after.spellSlots[1].used).toBe(1)
  })

  it('leaves a non-caster alone', () => {
    const c = characterAt(1, 'Fighter')
    const after = applyLevelUp(c, draftFor(c, 5))
    expect(after.spellSlots).toEqual({})
  })

  it('reads cantrips known', () => {
    expect(cantripsAtLevel(kitFor('Wizard'), 1)).toBe(3)
    expect(cantripsAtLevel(kitFor('Wizard'), 5)).toBe(4)
    expect(cantripsAtLevel(kitFor('Wizard'), 10)).toBe(5)
    expect(cantripsAtLevel(kitFor('Fighter'), 5)).toBeUndefined()
  })

  it('raises the prepared limit for a preparer', () => {
    const c: Character = {
      ...characterAt(1, 'Cleric'),
      spellAbility: 'wis',
      abilities: { ...characterAt(1, 'Cleric').abilities, wis: 16 },
      preparedLimit: 1 + abilityMod(16),
    }
    const after = applyLevelUp(c, draftFor(c, 5))
    expect(after.preparedLimit).toBe(abilityMod(16) + 5)
  })
})

describe('subclass', () => {
  it('is needed when crossing level 3 without one', () => {
    const c = characterAt(2, 'Fighter')
    expect(needsSubclass(c, 2, 3, kitFor('Fighter'))).toBe(true)
    expect(needsSubclass(c, 2, 2, kitFor('Fighter'))).toBe(false)
    expect(needsSubclass(c, 4, 5, kitFor('Fighter'))).toBe(false)
  })

  it('is not needed when the character already has one', () => {
    const c = { ...characterAt(2, 'Fighter'), subclass: 'Champion' }
    expect(needsSubclass(c, 2, 3, kitFor('Fighter'))).toBe(false)
  })

  it('is set when chosen', () => {
    const c = characterAt(2, 'Fighter')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Battle Master' }),
    )
    expect(after.subclass).toBe('Battle Master')
  })

  it('is never overwritten', () => {
    const c = { ...characterAt(2, 'Fighter'), subclass: 'Champion' }
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Battle Master' }),
    )
    expect(after.subclass).toBe('Champion')
  })
})

describe('a class with no kit', () => {
  it('still levels, and does nothing else', () => {
    const c = characterAt(3, 'Blood Hunter')
    const after = applyLevelUp(c, draftFor(c, 5))
    expect(after.level).toBe(5)
    expect(after.hitDice.total).toBe(5)
    expect(after.hp.max).toBeGreaterThan(c.hp.max)
    expect(after.features).toEqual([])
    expect(after.spellSlots).toEqual({})
  })

  it('offers only hit points and review', () => {
    const c = characterAt(3, 'Blood Hunter')
    expect(levelUpSteps(draftFor(c, 5))).toEqual(['hp', 'review'])
  })
})

describe('steps', () => {
  it('adds a features step when the class grants any', () => {
    const c = characterAt(1, 'Fighter')
    expect(levelUpSteps(draftFor(c, 2))).toEqual(['hp', 'features', 'review'])
  })

  it('adds subclass and ASI steps at the right levels', () => {
    const c = characterAt(2, 'Fighter')
    const steps = levelUpSteps(draftFor(c, 4))
    expect(steps).toContain('subclass')
    expect(steps).toContain('asi')
  })

  it('adds a spells step for a caster whose slots change', () => {
    const c = { ...characterAt(1, 'Wizard'), spellAbility: 'int' as const }
    expect(levelUpSteps(draftFor(c, 2))).toContain('spells')
  })

  it('gates hit points on every die being rolled', () => {
    const c = characterAt(1, 'Fighter')
    const rolling = draftFor(c, 3, {
      hp: { method: 'roll', rolls: [7, null], manual: 0 },
    })
    expect(canAdvance(rolling, 'hp')).toBe(false)
    const rolled = draftFor(c, 3, {
      hp: { method: 'roll', rolls: [7, 4], manual: 0 },
    })
    expect(canAdvance(rolled, 'hp')).toBe(true)
    // Averaging needs nothing.
    expect(canAdvance(draftFor(c, 3), 'hp')).toBe(true)
  })

  it('gates the ASI step on every choice being complete', () => {
    const c = characterAt(3, 'Fighter')
    expect(canAdvance(draftFor(c, 4), 'asi')).toBe(false)
    const done = draftFor(c, 4, {
      asi: { 4: { kind: 'abilities', abilities: { str: 2 }, featName: '' } },
    })
    expect(canAdvance(done, 'asi')).toBe(true)
  })

  it('lets the features step through with nothing taken', () => {
    const c = characterAt(1, 'Fighter')
    expect(canAdvance(draftFor(c, 2, { takeFeatures: [] }), 'features')).toBe(
      true,
    )
  })
})

describe('the plan', () => {
  it('reports every change it is going to make', () => {
    const c = characterAt(4, 'Fighter')
    const plan = levelUpPlan(c, draftFor(c, 5))
    expect(plan.from).toBe(4)
    expect(plan.to).toBe(5)
    expect(plan.hpFrom).toBe(30)
    expect(plan.hpTo).toBe(30 + averageHitDie(10) + 2)
    expect(plan.hitDiceFrom).toBe(4)
    expect(plan.hitDiceTo).toBe(5)
    expect(plan.proficiencyFrom).toBe(2)
    expect(plan.proficiencyTo).toBe(3)
    expect(plan.features.map((f) => f.name)).toEqual(['Extra Attack'])
  })

  it('agrees with what applying actually does', () => {
    // The panel shows the plan; the button applies the draft. If these ever
    // disagree the preview is a lie.
    const c = characterAt(1, 'Wizard')
    const draft = draftFor(c, 5, {
      asi: { 4: { kind: 'abilities', abilities: { int: 2 }, featName: '' } },
    })
    const plan = levelUpPlan(c, draft)
    const after = applyLevelUp(c, draft)
    expect(after.hp.max).toBe(plan.hpTo)
    expect(after.abilities.int).toBe(c.abilities.int + 2)
    for (const change of plan.slots) {
      expect(after.spellSlots[change.level].total).toBe(change.to)
    }
    for (const feature of plan.features) {
      expect(after.features).toContainEqual(feature)
    }
  })

  it('lists levels gained', () => {
    expect(levelsGained(4, 6)).toEqual([5, 6])
    expect(levelsGained(4, 4)).toEqual([])
  })
})

describe('round trip', () => {
  it('a levelled character survives serialize then parse', () => {
    const c = characterAt(1, 'Wizard')
    const after = applyLevelUp(
      c,
      draftFor(c, 5, {
        asi: { 4: { kind: 'abilities', abilities: { int: 2 }, featName: '' } },
      }),
    )
    const round = parseCharacter(serializeCharacter(after, '# Test\n'))
    expect(round.character).toEqual(after)
  })
})

describe('the draft is a snapshot', () => {
  /**
   * Regression guard. The dialog stays mounted while the sheet's `character`
   * keeps changing underneath it — a keystroke in another field, or the level
   * itself once Apply lands. Reading the live character made the features step
   * vanish the moment the level moved, so every derived question is answered
   * against `draft.base` instead.
   */
  it('keeps its steps when the live character moves on', () => {
    const before = characterAt(1, 'Fighter')
    const draft = draftFor(before, 2)
    expect(levelUpSteps(draft)).toContain('features')

    // The sheet is now at level 2 — as it is the instant Apply lands.
    const applied = applyLevelUp(before, draft)
    expect(applied.level).toBe(2)

    // The draft still describes the level-up it was opened for.
    expect(levelUpSteps(draft)).toContain('features')
    expect(draft.base.level).toBe(1)
  })

  it('carries the character it was seeded from', () => {
    const c = characterAt(3, 'Fighter')
    const draft = draftFor(c, 5)
    expect(draft.base).toBe(c)
    expect(draft.from).toBe(3)
  })

  it('applying twice from the same draft is idempotent in level', () => {
    // Not a supported flow, but it must not compound: the draft's `to` is
    // absolute, not a delta.
    const c = characterAt(1, 'Fighter')
    const draft = draftFor(c, 3)
    const once = applyLevelUp(c, draft)
    const twice = applyLevelUp(once, { ...draft, base: once })
    expect(once.level).toBe(3)
    expect(twice.level).toBe(3)
  })
})

describe('the "+1 and a feat" house rule', () => {
  it('budgets one ability point, not two', () => {
    expect(asiPointsFor('abilities')).toBe(ASI_POINTS)
    expect(asiPointsFor('both')).toBe(ASI_HYBRID_POINTS)
    expect(asiPointsFor('feat')).toBe(0)
  })

  it('needs both the point and the feat name to be complete', () => {
    const bare = { kind: 'both' as const, abilities: {}, featName: '' }
    expect(asiComplete(bare)).toBe(false)
    expect(asiComplete({ ...bare, featName: 'Alert' })).toBe(false)
    expect(asiComplete({ ...bare, abilities: { str: 1 } })).toBe(false)
    expect(
      asiComplete({ ...bare, abilities: { str: 1 }, featName: 'Alert' }),
    ).toBe(true)
  })

  it('rejects two points — that is the by-the-book option', () => {
    expect(
      asiComplete({
        kind: 'both',
        abilities: { str: 2 },
        featName: 'Alert',
      }),
    ).toBe(false)
  })

  it('applies the ability point and the feat together', () => {
    const c = characterAt(3, 'Fighter')
    const after = applyLevelUp(
      c,
      draftFor(c, 4, {
        asi: {
          4: {
            kind: 'both',
            abilities: { con: 1 },
            featName: 'Tough',
          },
        },
      }),
    )
    expect(after.abilities.con).toBe(c.abilities.con + 1)
    expect(after.feats.map((f) => f.name)).toContain('Tough')
  })

  it('shows both in the plan', () => {
    const c = characterAt(3, 'Fighter')
    const plan = levelUpPlan(
      c,
      draftFor(c, 4, {
        asi: {
          4: { kind: 'both', abilities: { dex: 1 }, featName: 'Alert' },
        },
      }),
    )
    expect(plan.abilityIncreases).toEqual({ dex: 1 })
    expect(plan.featsTaken).toEqual(['Alert'])
  })

  it('gates the ASI step until both halves are answered', () => {
    const c = characterAt(3, 'Fighter')
    const half = draftFor(c, 4, {
      asi: { 4: { kind: 'both', abilities: { str: 1 }, featName: '' } },
    })
    expect(canAdvance(half, 'asi')).toBe(false)
    const done = draftFor(c, 4, {
      asi: { 4: { kind: 'both', abilities: { str: 1 }, featName: 'Alert' } },
    })
    expect(canAdvance(done, 'asi')).toBe(true)
  })

  it('still caps the raised ability at 20', () => {
    const c: Character = {
      ...characterAt(3, 'Fighter'),
      abilities: { ...characterAt(3, 'Fighter').abilities, str: 20 },
    }
    const after = applyLevelUp(
      c,
      draftFor(c, 4, {
        asi: { 4: { kind: 'both', abilities: { str: 1 }, featName: 'Alert' } },
      }),
    )
    expect(after.abilities.str).toBe(20)
  })

  it('mixes with a by-the-book ASI across a multi-level jump', () => {
    const c = characterAt(3, 'Fighter') // ASIs at 4 and 6
    const after = applyLevelUp(
      c,
      draftFor(c, 6, {
        asi: {
          4: { kind: 'abilities', abilities: { str: 2 }, featName: '' },
          6: { kind: 'both', abilities: { con: 1 }, featName: 'Tough' },
        },
      }),
    )
    expect(after.abilities.str).toBe(c.abilities.str + 2)
    expect(after.abilities.con).toBe(c.abilities.con + 1)
    expect(after.feats.map((f) => f.name)).toContain('Tough')
  })
})

describe('feats are not repeatable', () => {
  const ALERT: FeatInfo = {
    id: 'alert',
    name: 'Alert',
    summary: '+5 to initiative.',
    grant: { initiativeBonus: 5 },
  }
  const MOBILE2: FeatInfo = {
    id: 'mobile',
    name: 'Mobile',
    summary: '+10 feet of speed.',
    grant: { speedBonus: 10 },
  }

  const fighterAt = (level: number, feats: Array<{ name: string }> = []) => ({
    ...characterAt(level, 'Fighter'),
    feats,
  })

  const draftTaking = (
    c: Character,
    to: number,
    byLevel: Record<number, string>,
  ) => {
    const base = draftFor(c, to, { feats: [ALERT, MOBILE2] })
    const asi: Record<number, AsiChoice> = {}
    for (const [level, featName] of Object.entries(byLevel)) {
      asi[Number(level)] = { kind: 'feat', abilities: {}, featName }
    }
    return { ...base, asi }
  }

  it('does not offer a feat the character already has', () => {
    const c = fighterAt(3, [{ name: 'Alert' }])
    const draft = draftFor(c, 4, { feats: [ALERT, MOBILE2] })
    const offered = featsAvailable(c, draft, 4).map((f) => f.name)
    expect(offered).not.toContain('Alert')
    expect(offered).toContain('Mobile')
  })

  it('does not offer a feat already named at another ASI level', () => {
    // 3 -> 8 as a Fighter crosses 4, 6 and 8, each chosen independently.
    const c = fighterAt(3)
    const draft = draftTaking(c, 8, { 4: 'Alert' })
    expect(featsAvailable(c, draft, 6).map((f) => f.name)).not.toContain(
      'Alert',
    )
  })

  it('still offers the feat this very level already named', () => {
    // Otherwise the value in the box vanishes from its own suggestion list.
    const c = fighterAt(3)
    const draft = draftTaking(c, 8, { 4: 'Alert' })
    expect(featsAvailable(c, draft, 4).map((f) => f.name)).toContain('Alert')
  })

  it('matches case-insensitively, as the sheet is hand-editable', () => {
    const c = fighterAt(3, [{ name: 'alert' }])
    const draft = draftFor(c, 4, { feats: [ALERT, MOBILE2] })
    expect(featsAvailable(c, draft, 4).map((f) => f.name)).not.toContain(
      'Alert',
    )
  })

  it('adds a feat once when named at several ASI levels at once', () => {
    // The bug this pins: `have` was built from the starting sheet and never
    // updated, so three ASI slots taking Alert wrote three rows and applied
    // its bonus three times (+15 initiative).
    const c = fighterAt(3)
    const after = applyLevelUp(
      c,
      draftTaking(c, 8, { 4: 'Alert', 6: 'Alert', 8: 'Alert' }),
    )
    expect(after.feats.filter((f) => f.name === 'Alert')).toHaveLength(1)
    expect(after.initiativeBonus).toBe(c.initiativeBonus + 5)
  })

  it('applies each distinct feat once when several are taken together', () => {
    const c = fighterAt(3)
    const after = applyLevelUp(
      c,
      draftTaking(c, 8, { 4: 'Alert', 6: 'Mobile', 8: 'Alert' }),
    )
    expect(after.feats.map((f) => f.name).sort()).toEqual(['Alert', 'Mobile'])
    expect(after.initiativeBonus).toBe(c.initiativeBonus + 5)
    expect(after.speed).toBe(c.speed + 10)
  })
})
