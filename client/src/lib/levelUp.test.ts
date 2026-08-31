import { describe, expect, it } from 'vitest'
import {
  abilityMod,
  alwaysPreparedCount,
  emptyCharacter,
  preparedCount,
  skillBonus,
  spellAttackBonus,
  spellSaveDc,
  hitDiceArePinned,
  parseCharacter,
  serializeCharacter,
} from './character'
import type { Character } from './character'
import { SRD_TABLES, findKit } from './tables'
import { buildCharacter } from './buildCharacter'
import { asiChoicePickId, emptyDraft } from './characterDraft'
import type { ClassKit, FeatInfo } from './srd'
import {
  ASI_HYBRID_POINTS,
  ASI_POINTS,
  abilitiesBefore,
  applyLevelUp,
  asiComplete,
  asiHeadroom,
  asiLevelsCrossed,
  asiPointsFor,
  asiUnlocked,
  averageHitDie,
  featsAvailable,
  firstIncompleteAsi,
  cantripsAtLevel,
  canAdvance,
  chooseSubclass,
  eligibleExpertiseAt,
  emptyLevelUpDraft,
  featuresGained,
  grantedAlreadyAt,
  halfProficiencyGained,
  levelUpPicks,
  resourcesOffered,
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
  const base = { ...emptyLevelUpDraft(c, to, kitFor(c.class)), ...patch }
  // Through `chooseSubclass` when the patch names one, exactly as the dialog
  // does: choosing an archetype is what puts its features on offer, and a
  // draft that only had the name assigned would leave them unticked.
  return patch.subclassName !== undefined && patch.subclassName !== c.subclass
    ? chooseSubclass(base, patch.subclassName)
    : base
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
  })

  it('is still needed after the level that should have granted it', () => {
    // A subclass owed is owed however late it is noticed. This used to be
    // `at > from`, which asked only on the crossing level-up and so could
    // never fire at all for a class picking at level 1 — a Cleric's `at` is 1
    // and every level-up starts at 1 or above, leaving a domainless cleric
    // stuck that way forever.
    const fighter = characterAt(4, 'Fighter')
    expect(needsSubclass(fighter, 4, 5, kitFor('Fighter'))).toBe(true)
    const cleric = characterAt(1, 'Cleric')
    expect(needsSubclass(cleric, 1, 2, kitFor('Cleric'))).toBe(true)
  })

  it('is not needed before the class picks one', () => {
    const c = characterAt(1, 'Fighter')
    expect(needsSubclass(c, 1, 2, kitFor('Fighter'))).toBe(false)
  })

  it('is not needed when the character already has one', () => {
    const c = { ...characterAt(2, 'Fighter'), subclass: 'Champion' }
    expect(needsSubclass(c, 2, 3, kitFor('Fighter'))).toBe(false)
    // Including well past the level it was due, which is what stops the fix
    // above from re-asking a character who answered long ago.
    const later = { ...characterAt(9, 'Fighter'), subclass: 'Champion' }
    expect(needsSubclass(later, 9, 10, kitFor('Fighter'))).toBe(false)
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
    // Action Surge at 2nd level offers a Superiority-Dice-style counter, so the
    // choices step comes with it — the features step is what puts it on offer.
    expect(levelUpSteps(draftFor(c, 2))).toEqual([
      'hp',
      'features',
      'picks',
      'review',
    ])
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

  it('adds a feat’s fixed spell to the sheet', () => {
    // Unlike `picks` and `traits`, a granted spell needs no UI to resolve — it
    // is known from the feat — so it applies at level-up as well as creation.
    const c = characterAt(3, 'Fighter')
    const after = applyLevelUp(
      c,
      draftFor(c, 4, {
        feats: SRD_TABLES.feats,
        asi: { 4: { kind: 'feat', abilities: {}, featName: 'Fey Touched' } },
      }),
    )
    expect(after.spells).toContainEqual({ name: 'Misty Step', level: 2 })
  })

  it('does not replace a spell the character already has', () => {
    // Append-only: a caster who already knows Misty Step keeps their own row,
    // with whatever they set on it, rather than getting a second blanker one.
    const base = characterAt(3, 'Fighter')
    const c = {
      ...base,
      spells: [{ name: 'Misty Step', level: 2, prepared: true }],
    }
    const after = applyLevelUp(
      c,
      draftFor(c, 4, {
        feats: SRD_TABLES.feats,
        asi: { 4: { kind: 'feat', abilities: {}, featName: 'Fey Touched' } },
      }),
    )
    expect(after.spells.filter((s) => s.name === 'Misty Step')).toHaveLength(1)
    expect(after.spells[0].prepared).toBe(true)
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

describe('picks resolved at level-up', () => {
  /**
   * The bug this whole step exists for: a feat's choices were dropped at
   * commit, so the same feat granted three proficiencies at level 1 and nothing
   * at level 4. These assert the two are now the same feat.
   */
  const featsWith = (...ids: Array<string>): Array<FeatInfo> =>
    SRD_TABLES.feats.filter((f) => ids.includes(f.id))

  function tookFeat(
    c: Character,
    at: number,
    featName: string,
    picks: Record<string, Array<string>>,
  ): LevelUpDraft {
    const draft = draftFor(c, at, {
      feats: featsWith('skilled', 'skill-expert'),
    })
    return {
      ...draft,
      asi: { [at]: { kind: 'feat', abilities: {}, featName } },
      picks,
    }
  }

  it('grants a Skilled feat its three chosen proficiencies', () => {
    const c = characterAt(3, 'Fighter')
    const after = applyLevelUp(
      c,
      tookFeat(c, 4, 'Skilled', {
        'skilled-skills': ['athletics', 'stealth', 'Smith tools'],
      }),
    )
    expect(after.skills).toContain('athletics')
    expect(after.skills).toContain('stealth')
    // Routed per value, exactly as the creation path does it.
    expect(after.tools).toContain('Smith tools')
  })

  it('files a Skill Expert expertise pick as expertise, not proficiency', () => {
    const c = { ...characterAt(3, 'Fighter'), skills: ['athletics'] }
    const after = applyLevelUp(
      c,
      tookFeat(c, 4, 'Skill Expert', {
        'skill-expert-skill': ['stealth'],
        'skill-expert-expertise': ['athletics'],
      }),
    )
    expect(after.skills).toContain('stealth')
    expect(after.expertise).toEqual(['athletics'])
    // The proficiency it doubles stays a proficiency too.
    expect(after.skills).toContain('athletics')
  })

  it('asks nothing for a feat the character already has', () => {
    const c = { ...characterAt(3, 'Fighter'), feats: [{ name: 'Skilled' }] }
    // Re-taking grants nothing, so it must not pose its picks either.
    expect(levelUpPicks(tookFeat(c, 4, 'Skilled', {}))).toEqual([])
  })

  it('gates the step until every pick is answered', () => {
    const c = characterAt(3, 'Fighter')
    const draft = tookFeat(c, 4, 'Skilled', { 'skilled-skills': ['athletics'] })
    expect(canAdvance(draft, 'picks')).toBe(false)
    expect(
      canAdvance(
        {
          ...draft,
          picks: { 'skilled-skills': ['athletics', 'stealth', 'arcana'] },
        },
        'picks',
      ),
    ).toBe(true)
  })

  it('offers expertise only over skills the character actually has', () => {
    const c = { ...characterAt(3, 'Fighter'), skills: ['athletics'] }
    const draft = tookFeat(c, 4, 'Skill Expert', {
      'skill-expert-skill': ['stealth'],
    })
    const owned = levelUpPicks(draft).find(
      (p) => p.pick.id === 'skill-expert-expertise',
    )
    const offered = eligibleExpertiseAt(c, draft, owned!.pick)
    // The skill they had, and the one this very feat just granted.
    expect(offered).toContain('athletics')
    expect(offered).toContain('stealth')
    expect(offered).not.toContain('arcana')
  })

  it('is additive: a chosen language never displaces one already known', () => {
    const c = { ...characterAt(3, 'Fighter'), languages: ['Common'] }
    const after = applyLevelUp(
      c,
      draftFor(c, 4, {
        feats: SRD_TABLES.feats.filter((f) => f.id === 'linguist'),
        asi: { 4: { kind: 'feat', abilities: {}, featName: 'Linguist' } },
        picks: { 'linguist-languages': ['Dwarvish', 'Elvish', 'Orc'] },
      }),
    )
    expect(after.languages[0]).toBe('Common')
    expect(after.languages).toContain('Dwarvish')
  })
})

describe('archetype features', () => {
  it('grants the subclass its features when the archetype is chosen', () => {
    const c = characterAt(2, 'Fighter')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Battle Master' }),
    )
    expect(after.subclass).toBe('Battle Master')
    const names = after.features.map((f) => f.name)
    // Its own 3rd-level features, not just the class's Martial Archetype row.
    expect(names).toContain('Combat Superiority')
    expect(names).toContain('Student of War')
  })

  it('keeps granting them at later levels', () => {
    const c = { ...characterAt(6, 'Fighter'), subclass: 'Battle Master' }
    const after = applyLevelUp(c, draftFor(c, 7))
    expect(after.features.map((f) => f.name)).toContain('Know Your Enemy')
  })

  it('grants nothing extra for an archetype the tables do not know', () => {
    const c = characterAt(2, 'Fighter')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Bladesinger of the Ninth Hell' }),
    )
    expect(after.subclass).toBe('Bladesinger of the Ninth Hell')
    // The class's own level-3 feature still lands; homebrew just adds nothing.
    expect(after.features.map((f) => f.name)).toContain('Martial Archetype')
  })

  it('scales Extra Attack with its own row rather than prose', () => {
    const c = { ...characterAt(10, 'Fighter'), subclass: 'Champion' }
    const after = applyLevelUp(c, draftFor(c, 11))
    expect(after.features.map((f) => f.name)).toContain('Extra Attack (2)')
  })
})

describe('rogue archetype features', () => {
  it('grants the archetype its features when it is chosen', () => {
    const c = characterAt(2, 'Rogue')
    const after = applyLevelUp(c, draftFor(c, 3, { subclassName: 'Thief' }))
    expect(after.subclass).toBe('Thief')
    const names = after.features.map((f) => f.name)
    expect(names).toContain('Fast Hands')
    expect(names).toContain('Second-Story Work')
  })

  it('keeps granting them at later levels', () => {
    const c = { ...characterAt(8, 'Rogue'), subclass: 'Thief' }
    const after = applyLevelUp(c, draftFor(c, 9))
    expect(after.features.map((f) => f.name)).toContain('Supreme Sneak')
  })

  it('grants an Assassin its two tool proficiencies', () => {
    // The rare subclass `grant`, and the only one on a Rogue: two tools the
    // sheet has a real field for, rather than a combat rule it cannot model.
    const c = characterAt(2, 'Rogue')
    const after = applyLevelUp(c, draftFor(c, 3, { subclassName: 'Assassin' }))
    expect(after.tools).toContain('Disguise kit')
    expect(after.tools).toContain('Poisoner’s kit')
  })

  it('applies the archetype grant once and never again', () => {
    // `plan.subclassName` is null on every level-up after the choosing one, so
    // the grant cannot re-apply — but nothing else stops it, and a proficiency
    // list that grows by two rows per level would be a slow, quiet corruption.
    const c = characterAt(2, 'Rogue')
    const at3 = applyLevelUp(c, draftFor(c, 3, { subclassName: 'Assassin' }))
    expect(at3.tools.filter((t) => t === 'Disguise kit')).toHaveLength(1)
    const at4 = applyLevelUp(at3, draftFor(at3, 4))
    expect(at4.tools.filter((t) => t === 'Disguise kit')).toHaveLength(1)
  })

  it('grants nothing extra for an archetype the tables do not know', () => {
    const c = characterAt(2, 'Rogue')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Cutpurse of the Broken Coin' }),
    )
    expect(after.subclass).toBe('Cutpurse of the Broken Coin')
    expect(after.features.map((f) => f.name)).toContain('Roguish Archetype')
  })
})

describe('an archetype that casts when its class does not', () => {
  /**
   * The Arcane Trickster is the reason `SubclassInfo.spellcasting` exists. A
   * Rogue has no class-level block — putting one there to reach these slots
   * would hand every Thief a spell step at level 1 — so the whole point of
   * these tests is that the slots follow the *archetype*, not the class.
   */
  const rogueAt = (level: number, subclass: string): Character => ({
    ...characterAt(level, 'Rogue'),
    subclass,
  })

  it('gains slots and cantrips on the level-up that makes it a caster', () => {
    const c = characterAt(2, 'Rogue')
    const plan = levelUpPlan(
      c,
      draftFor(c, 3, { subclassName: 'Arcane Trickster' }),
    )
    expect(plan.slots).toEqual([{ level: 1, from: 0, to: 2 }])
    expect(plan.cantripsTo).toBe(2)
  })

  it('reports the slot rows the step renders, not the class table', () => {
    // `SpellsStep` derives its rows from `slotsAtLevel` with the archetype
    // threaded through. Without it the step gates open on the subclass table
    // and then renders the class's — which for a Rogue is nothing at all, so
    // the player reached a spells step that listed no slots.
    const c = characterAt(2, 'Rogue')
    const draft = draftFor(c, 3, { subclassName: 'Arcane Trickster' })
    const castingAs = draft.subclassName || draft.base.subclass
    expect(slotsAtLevel(draft.kit, draft.to, castingAs)).toEqual([2])
    expect(cantripsAtLevel(draft.kit, draft.to, castingAs)).toBe(2)
    // The bug, pinned: no archetype means no table.
    expect(slotsAtLevel(draft.kit, draft.to)).toBeUndefined()
  })

  it('grants Mage Hand outright, since it is not a choice', () => {
    // The book's "Mage Hand + 2" is three cantrips of which one is fixed, so
    // the two the wizard asks for are the only real choices. If this fails the
    // player is either short a cantrip or being asked a question with one
    // answer.
    const c = characterAt(2, 'Rogue')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Arcane Trickster' }),
    )
    expect(after.spells.map((sp) => sp.name)).toContain('Mage Hand')
  })

  it('gives a Thief neither, at exactly the same levels', () => {
    // The test that proves the change is scoped to the archetype. If this ever
    // fails, a class-wide block has crept back onto the Rogue kit.
    const c = characterAt(2, 'Rogue')
    const plan = levelUpPlan(c, draftFor(c, 3, { subclassName: 'Thief' }))
    expect(plan.slots).toEqual([])
    expect(plan.cantripsTo).toBeUndefined()
  })

  it('gives a Rogue with no archetype nothing', () => {
    const c = characterAt(2, 'Rogue')
    expect(levelUpPlan(c, draftFor(c, 3)).slots).toEqual([])
  })

  it('offers the spells step to a Trickster and not to a Thief', () => {
    const trickster = characterAt(2, 'Rogue')
    expect(
      levelUpSteps(
        draftFor(trickster, 3, { subclassName: 'Arcane Trickster' }),
      ),
    ).toContain('spells')
    expect(
      levelUpSteps(draftFor(trickster, 3, { subclassName: 'Thief' })),
    ).not.toContain('spells')
  })

  it('keeps scaling slots at later levels', () => {
    const c = rogueAt(6, 'Arcane Trickster')
    const plan = levelUpPlan(c, draftFor(c, 7))
    // A second-level slot arrives at 7th.
    expect(plan.slots).toContainEqual({ level: 2, from: 0, to: 2 })
  })

  it('never lowers slots the sheet already has', () => {
    // The additive invariant, which this change must not have touched.
    const c = {
      ...rogueAt(6, 'Arcane Trickster'),
      spellSlots: { 1: { total: 9, used: 0 } },
    }
    const after = applyLevelUp(c, draftFor(c, 7))
    expect(after.spellSlots[1].total).toBe(9)
  })

  it('round-trips a Trickster’s slots through the sheet', () => {
    // The slots are only useful if they survive the disk. `subclass` is free
    // text on the sheet, so the archetype comes back as its name and the table
    // is found again by that name on the next level-up.
    const c = characterAt(2, 'Rogue')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Arcane Trickster' }),
    )
    const { character: back } = parseCharacter(serializeCharacter(after, ''))
    expect(back.subclass).toBe('Arcane Trickster')
    expect(back.spellSlots[1].total).toBe(2)
  })
})

describe('picking spells at level-up', () => {
  const trickster = (level: number): Character => ({
    ...characterAt(level, 'Rogue'),
    subclass: 'Arcane Trickster',
  })

  it('opens the step on a level that grants only a spell', () => {
    // The gate used to be slots alone. An Arcane Trickster learns a spell at
    // 8th, 11th, 14th and 20th with no slot change, so four of their ten spell
    // gains never prompted — the regression test for that hole.
    // Slots already matching the table at 7th, so 7 -> 8 genuinely changes none
    // of them — the sheet a real character would have.
    const c = {
      ...trickster(7),
      spellSlots: { 1: { total: 4, used: 0 }, 2: { total: 2, used: 0 } },
    }
    expect(levelUpSteps(draftFor(c, 8))).toContain('spells')
    const plan = levelUpPlan(c, draftFor(c, 8))
    expect(plan.slots).toEqual([])
    expect(plan.spellsToPick).toBe(1)
  })

  it('names the archetype spells the player already has', () => {
    // Mage Hand is granted, not chosen, and does not land until Apply — so the
    // step has to say so, or a "0 / 2" beside a sheet that lists no Mage Hand
    // reads as though it were still owed.
    const c = characterAt(2, 'Rogue')
    const plan = levelUpPlan(
      c,
      draftFor(c, 3, { subclassName: 'Arcane Trickster' }),
    )
    expect(plan.spellsGranted.map((sp) => sp.name)).toEqual(['Mage Hand'])
    // And it is not counted against what they get to pick.
    expect(plan.cantripsToPick).toBe(2)
  })

  it('grants nothing extra on a later level-up', () => {
    // `spellsGranted` follows `subclassName`, which is null once the archetype
    // is already on the sheet — otherwise the step would keep re-announcing it.
    const c = { ...characterAt(3, 'Rogue'), subclass: 'Arcane Trickster' }
    expect(levelUpPlan(c, draftFor(c, 4)).spellsGranted).toEqual([])
  })

  it('lists nothing for an archetype that grants no spells', () => {
    const c = characterAt(2, 'Rogue')
    expect(
      levelUpPlan(c, draftFor(c, 3, { subclassName: 'Thief' })).spellsGranted,
    ).toEqual([])
  })

  it('sets the casting ability when a level-up makes you a caster', () => {
    // Only creation ever set this, which was fine while every caster cast from
    // level 1. An Arcane Trickster becomes one at 3rd and was left with null —
    // so the sheet could compute neither a save DC nor an attack bonus.
    const c = {
      ...characterAt(2, 'Rogue'),
      abilities: { ...characterAt(2, 'Rogue').abilities, int: 16 },
    }
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Arcane Trickster' }),
    )
    expect(after.spellAbility).toBe('int')
    // 8 + proficiency 2 + INT modifier 3.
    expect(spellSaveDc(after)).toBe(13)
    expect(spellAttackBonus(after)).toBe(5)
  })

  it('gives an Eldritch Knight the same', () => {
    const c = {
      ...characterAt(2, 'Fighter'),
      abilities: { ...characterAt(2, 'Fighter').abilities, int: 16 },
    }
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Eldritch Knight' }),
    )
    expect(after.spellAbility).toBe('int')
  })

  it('leaves a non-caster without one', () => {
    const c = characterAt(2, 'Rogue')
    expect(
      applyLevelUp(c, draftFor(c, 3, { subclassName: 'Thief' })).spellAbility,
    ).toBeNull()
  })

  it('never overwrites an ability the sheet already names', () => {
    // A homebrew archetype or a DM ruling wins, like every other number here.
    const c = { ...characterAt(2, 'Rogue'), spellAbility: 'cha' as const }
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Arcane Trickster' }),
    )
    expect(after.spellAbility).toBe('cha')
  })

  it('counts what a level-up entitles you to', () => {
    const c = characterAt(2, 'Rogue')
    const plan = levelUpPlan(
      c,
      draftFor(c, 3, { subclassName: 'Arcane Trickster' }),
    )
    expect(plan.cantripsToPick).toBe(2)
    expect(plan.spellsToPick).toBe(3)
  })

  it('sums a multi-level jump into one total', () => {
    // 3 -> 7 is spells known 3 -> 5, so two, not one per level crossed.
    const c = trickster(3)
    const plan = levelUpPlan(c, draftFor(c, 7))
    expect(plan.spellsToPick).toBe(2)
  })

  it('asks a non-caster for nothing', () => {
    const thief = { ...characterAt(2, 'Rogue'), subclass: 'Thief' }
    const plan = levelUpPlan(thief, draftFor(thief, 3))
    expect(plan.cantripsToPick).toBe(0)
    expect(plan.spellsToPick).toBe(0)
    expect(levelUpSteps(draftFor(thief, 3))).not.toContain('spells')
  })

  it('writes the chosen names onto the sheet', () => {
    const c = characterAt(2, 'Rogue')
    const after = applyLevelUp(c, {
      ...draftFor(c, 3, { subclassName: 'Arcane Trickster' }),
      cantrips: ['Prestidigitation', 'Minor Illusion'],
      spells: ['Charm Person', 'Disguise Self', 'Sleep'],
    })
    const byName = new Map(after.spells.map((sp) => [sp.name, sp]))
    expect(byName.get('Prestidigitation')?.level).toBe(0)
    expect(byName.get('Minor Illusion')?.level).toBe(0)
    expect(byName.get('Charm Person')?.level).toBe(1)
    expect(byName.get('Sleep')?.level).toBe(1)
    // Never prepared: what is prepared is a daily decision the sheet owns.
    expect(byName.get('Charm Person')?.prepared).toBeUndefined()
  })

  it('never writes a second row for a spell already known', () => {
    const c = {
      ...trickster(3),
      spells: [{ name: 'Charm Person', level: 1 }],
    }
    const after = applyLevelUp(c, {
      ...draftFor(c, 4),
      spells: ['charm person'],
    })
    // Matched case-insensitively — these names were typed by hand.
    expect(
      after.spells.filter((sp) => /charm person/i.test(sp.name)),
    ).toHaveLength(1)
  })

  it('keeps a cantrip and a levelled spell of the same name apart', () => {
    const c = { ...trickster(3), spells: [{ name: 'Shillelagh', level: 0 }] }
    const after = applyLevelUp(c, {
      ...draftFor(c, 4),
      spells: ['Shillelagh'],
    })
    expect(after.spells.filter((sp) => sp.name === 'Shillelagh')).toHaveLength(
      2,
    )
  })

  it('ignores blanks and duplicates within one level-up', () => {
    const c = characterAt(2, 'Rogue')
    const after = applyLevelUp(c, {
      ...draftFor(c, 3, { subclassName: 'Arcane Trickster' }),
      cantrips: ['  ', 'Mage Hand'],
      spells: ['Sleep', 'sleep', ''],
    })
    expect(after.spells.filter((sp) => /^sleep$/i.test(sp.name))).toHaveLength(
      1,
    )
    // Mage Hand is already granted by the archetype; typing it adds no second row.
    expect(after.spells.filter((sp) => sp.name === 'Mage Hand')).toHaveLength(1)
  })

  it('removes nothing the character already had', () => {
    const c = {
      ...trickster(3),
      spells: [
        { name: 'Shield', level: 1, prepared: true },
        { name: 'Fire Bolt', level: 0 },
      ],
    }
    const after = applyLevelUp(c, { ...draftFor(c, 4), spells: ['Sleep'] })
    expect(after.spells).toEqual(expect.arrayContaining(c.spells))
  })

  it('never blocks Next on an unanswered count', () => {
    // Guidance, not a bill. Deliberately unlike the picks step.
    const c = characterAt(2, 'Rogue')
    const draft = draftFor(c, 3, { subclassName: 'Arcane Trickster' })
    expect(canAdvance(draft, 'spells')).toBe(true)
  })

  it('round-trips chosen spells through the sheet', () => {
    const c = characterAt(2, 'Rogue')
    const after = applyLevelUp(c, {
      ...draftFor(c, 3, { subclassName: 'Arcane Trickster' }),
      cantrips: ['Minor Illusion'],
      spells: ['Charm Person'],
    })
    const { character: back } = parseCharacter(serializeCharacter(after, ''))
    expect(back.spells.map((sp) => sp.name)).toContain('Minor Illusion')
    expect(back.spells.map((sp) => sp.name)).toContain('Charm Person')
  })
})

describe('a rogue’s second Expertise', () => {
  it('poses a fresh pick at level 6', () => {
    const c = { ...characterAt(5, 'Rogue'), skills: ['stealth', 'perception'] }
    const pick = levelUpPicks(draftFor(c, 6)).find(
      (p) => p.pick.id === 'rogue-expertise-6',
    )
    expect(pick).toBeDefined()
    expect(pick!.pick.kind).toBe('expertise')
    expect(pick!.pick.count).toBe(2)
  })

  it('narrows to the skills the character is actually proficient in', () => {
    const c = { ...characterAt(5, 'Rogue'), skills: ['stealth', 'perception'] }
    const draft = draftFor(c, 6)
    const eligible = eligibleExpertiseAt(c, draft, {
      ...levelUpPicks(draft).find((p) => p.pick.id === 'rogue-expertise-6')!
        .pick,
    })
    expect(eligible).toContain('stealth')
    expect(eligible).not.toContain('athletics')
  })

  it('greys a skill already doubled at level 1', () => {
    const c = {
      ...characterAt(5, 'Rogue'),
      skills: ['stealth', 'perception'],
      expertise: ['stealth'],
    }
    const draft = draftFor(c, 6)
    const pick = levelUpPicks(draft).find(
      (p) => p.pick.id === 'rogue-expertise-6',
    )!.pick
    expect(grantedAlreadyAt(c, draft, pick).get('stealth')).toBe('your sheet')
  })

  it('lands the chosen skills in expertise', () => {
    const c = { ...characterAt(5, 'Rogue'), skills: ['stealth', 'perception'] }
    const after = applyLevelUp(
      c,
      draftFor(c, 6, {
        picks: { 'rogue-expertise-6': ['stealth', 'perception'] },
      }),
    )
    expect(after.expertise).toContain('stealth')
    expect(after.expertise).toContain('perception')
  })
})

describe('hit points respond to Constitution and Tough', () => {
  it('pays retroactively when an ASI raises the CON modifier', () => {
    // CON 14 -> 16 is one modifier point, owed for all four levels already had.
    const c = characterAt(4, 'Fighter')
    const draft = draftFor(c, 5, {
      asi: { 4: { kind: 'abilities', abilities: { con: 2 }, featName: '' } },
    })
    const plan = levelUpPlan(c, draft)
    expect(plan.hpRetroactive).toBe(4)
    expect(applyLevelUp(c, draft).hp.max).toBe(plan.hpTo)
  })

  it('owes nothing when the points do not cross a modifier boundary', () => {
    // CON 14 -> 15 is still +2, so nothing is owed and nothing is taken away.
    const c = characterAt(4, 'Fighter')
    const draft = draftFor(c, 5, {
      asi: {
        4: { kind: 'abilities', abilities: { con: 1, str: 1 }, featName: '' },
      },
    })
    expect(levelUpPlan(c, draft).hpRetroactive).toBe(0)
  })

  it('applies the new CON to the level being gained, not the old one', () => {
    const c = characterAt(4, 'Fighter')
    const withCon = draftFor(c, 5, {
      asi: { 4: { kind: 'abilities', abilities: { con: 2 }, featName: '' } },
    })
    const without = draftFor(c, 5, {
      asi: { 4: { kind: 'abilities', abilities: { str: 2 }, featName: '' } },
    })
    expect(hpGained(c, withCon)).toBe(hpGained(c, without) + 1)
  })

  it('gives Tough 2 hit points for every level, behind and ahead', () => {
    const c = characterAt(7, 'Fighter')
    const draft = draftFor(c, 8, {
      feats: SRD_TABLES.feats.filter((f) => f.id === 'tough'),
      asi: { 8: { kind: 'feat', abilities: {}, featName: 'Tough' } },
    })
    const plan = levelUpPlan(c, draft)
    expect(plan.hpFromFeats).toBe(16)
    expect(applyLevelUp(c, draft).hp.max).toBe(plan.hpTo)
  })

  it('never lowers the maximum, and never touches current', () => {
    const c = characterAt(4, 'Fighter')
    const after = applyLevelUp(
      c,
      draftFor(c, 5, {
        asi: { 4: { kind: 'abilities', abilities: { con: 2 }, featName: '' } },
      }),
    )
    expect(after.hp.max).toBeGreaterThan(c.hp.max)
    expect(after.hp.current).toBe(c.hp.current)
  })
})

describe('creation and level-up grant the same feat', () => {
  /**
   * The asymmetry that motivated the picks step: a Variant Human taking Skilled
   * at level 1 got three proficiencies, and the same character taking it at an
   * ASI got a name on the sheet and nothing else. Whatever else changes, these
   * two paths must not disagree about what a feat is worth.
   */
  it('lands the same proficiencies whichever path took Skilled', () => {
    const answers = ['stealth', 'animal-handling', 'Lute']

    const atCreation = buildCharacter({
      ...emptyDraft(SRD_TABLES),
      name: 'Parity',
      raceName: 'Variant Human',
      flexibleAsi: { str: 1, dex: 1 },
      featName: 'Skilled',
      picks: { 'skilled-skills': answers },
    }).character

    const before = characterAt(3, 'Fighter')
    const atLevelUp = applyLevelUp(before, {
      ...draftFor(before, 4, {
        feats: SRD_TABLES.feats.filter((f) => f.id === 'skilled'),
      }),
      asi: { 4: { kind: 'feat', abilities: {}, featName: 'Skilled' } },
      picks: { 'skilled-skills': answers },
    })

    for (const skill of ['stealth', 'animal-handling']) {
      expect(atCreation.skills).toContain(skill)
      expect(atLevelUp.skills).toContain(skill)
    }
    expect(atCreation.tools).toContain('Lute')
    expect(atLevelUp.tools).toContain('Lute')
  })
})

describe('half-feats whose increase is the player choice', () => {
  /**
   * Six feats say "+1 to an ability of your choice" and, until the picks step
   * existed, quietly picked one for you — Skill Expert always handed out
   * Dexterity. The summary promised a choice the app did not offer.
   */
  const featNamed = (id: string) => SRD_TABLES.feats.filter((f) => f.id === id)

  function took(c: Character, featId: string, name: string, ability?: string) {
    return draftFor(c, 4, {
      feats: featNamed(featId),
      asi: { 4: { kind: 'feat', abilities: {}, featName: name } },
      picks: ability ? { [asiChoicePickId(featId)]: [ability] } : {},
    })
  }

  it('raises the ability the player actually chose', () => {
    const c = characterAt(3, 'Fighter')
    const after = applyLevelUp(
      c,
      took(c, 'skill-expert', 'Skill Expert', 'Wisdom'),
    )
    expect(after.abilities.wis).toBe(c.abilities.wis + 1)
    // And emphatically not the one the old hardcoded record named.
    expect(after.abilities.dex).toBe(c.abilities.dex)
  })

  it('offers the choice as a pick on the feat', () => {
    const c = characterAt(3, 'Fighter')
    const offered = levelUpPicks(took(c, 'skill-expert', 'Skill Expert'))
    const choice = offered.find(
      (p) => p.pick.id === asiChoicePickId('skill-expert'),
    )
    expect(choice?.owner).toBe('Skill Expert')
    expect(choice?.pick.count).toBe(1)
    expect(choice?.pick.options).toContain('Wisdom')
  })

  it('gates the step until the ability is placed', () => {
    const c = characterAt(3, 'Fighter')
    expect(canAdvance(took(c, 'observant', 'Observant'), 'picks')).toBe(false)
    expect(
      canAdvance(took(c, 'observant', 'Observant', 'Intelligence'), 'picks'),
    ).toBe(true)
  })

  it('grants nothing for an ability the feat never offered', () => {
    // Observant is Intelligence or Wisdom. A hand-typed Strength widens the
    // feat, so it is ignored rather than honoured.
    const c = characterAt(3, 'Fighter')
    const after = applyLevelUp(c, took(c, 'observant', 'Observant', 'Strength'))
    expect(after.abilities.str).toBe(c.abilities.str)
  })

  it('gives Resilient the saving throw for the ability chosen', () => {
    const c = characterAt(3, 'Fighter')
    const after = applyLevelUp(c, took(c, 'resilient', 'Resilient', 'Wisdom'))
    expect(after.abilities.wis).toBe(c.abilities.wis + 1)
    expect(after.saves).toContain('wis')
    // The old fixed grant handed out Constitution regardless of the choice.
    expect(after.saves).not.toContain('con')
  })

  it('adds the point once, not once per ASI level crossed', () => {
    const c = characterAt(3, 'Fighter')
    const draft = {
      ...took(c, 'skill-expert', 'Skill Expert', 'Wisdom'),
      to: 8,
      asi: {
        4: { kind: 'feat' as const, abilities: {}, featName: 'Skill Expert' },
        6: { kind: 'feat' as const, abilities: {}, featName: 'Skill Expert' },
      },
    }
    expect(applyLevelUp(c, draft).abilities.wis).toBe(c.abilities.wis + 1)
  })
})

describe('a fixed half-feat named twice in one level-up', () => {
  it('adds its increase once, matching the single feat row applied', () => {
    // `applyLevelUp` adds a feat once however many ASI levels name it, so the
    // bump must be added once too — otherwise a 4 -> 8 level-up that picked
    // Athlete at two levels raised Strength by 2 for one row on the sheet.
    const c = characterAt(3, 'Fighter')
    const draft = draftFor(c, 8, {
      feats: SRD_TABLES.feats.filter((f) => f.id === 'athlete'),
      asi: {
        4: { kind: 'feat', abilities: {}, featName: 'Athlete' },
        6: { kind: 'feat', abilities: {}, featName: 'Athlete' },
      },
    })
    const after = applyLevelUp(c, draft)
    expect(after.abilities.str).toBe(c.abilities.str + 1)
    expect(after.feats.filter((f) => f.name === 'Athlete')).toHaveLength(1)
  })
})

describe('manoeuvres already known', () => {
  /**
   * A Battle Master learns more manoeuvres at 7th, 10th and 15th. Each is its
   * own pick, so without knowing what is already on the sheet the 7th-level
   * pick offered all eighteen — including the three taken at 3rd. Choosing one
   * twice was silently swallowed by `applyFeaturePick`'s de-dupe, so the player
   * spent a choice on nothing and was never told.
   */
  const bm = (level: number, features: Array<string>): Character => ({
    ...characterAt(level, 'Fighter'),
    subclass: 'Battle Master',
    features: features.map((name) => ({ level: 3, name })),
  })

  it('never writes a second row for a manoeuvre already taken', () => {
    const c = bm(6, ['Manoeuvre: Riposte'])
    const draft = draftFor(c, 7, { picks: {} })
    const pick = levelUpPicks(draft).find((p) =>
      p.pick.id.startsWith('battle-master-7'),
    )!.pick
    const after = applyLevelUp(c, {
      ...draft,
      picks: { [pick.id]: ['Riposte', 'Parry'] },
    })
    const ripostes = after.features.filter(
      (f) => f.name === 'Manoeuvre: Riposte',
    )
    expect(ripostes).toHaveLength(1)
    expect(after.features.map((f) => f.name)).toContain('Manoeuvre: Parry')
  })

  it('still offers every manoeuvre in the authored list', () => {
    // The table stays the class's whole ceiling; narrowing happens at render.
    const c = bm(6, ['Manoeuvre: Riposte'])
    const draft = draftFor(c, 7)
    const pick = levelUpPicks(draft).find((p) =>
      p.pick.id.startsWith('battle-master-7'),
    )!.pick
    expect(pick.options).toContain('Riposte')
    expect(pick.options.length).toBeGreaterThan(2)
  })

  it('poses a separate pick for each level that grants manoeuvres', () => {
    // 6 -> 10 crosses both the 7th and 10th level grants.
    const c = bm(6, [])
    const ids = levelUpPicks(draftFor(c, 10))
      .map((p) => p.pick.id)
      .filter((id) => id.includes('maneuvers'))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(2)
  })
})

describe('greying out choices already spent', () => {
  const bm = (level: number, features: Array<string>): Character => ({
    ...characterAt(level, 'Fighter'),
    subclass: 'Battle Master',
    features: features.map((name) => ({ level: 3, name })),
  })

  const maneuverPick = (draft: LevelUpDraft, at: string) =>
    levelUpPicks(draft).find((p) => p.pick.id.startsWith(at))!.pick

  it('greys a manoeuvre already on the sheet, naming the source', () => {
    const c = bm(6, ['Manoeuvre: Riposte', 'Manoeuvre: Parry'])
    const draft = draftFor(c, 7)
    const greyed = grantedAlreadyAt(
      c,
      draft,
      maneuverPick(draft, 'battle-master-7'),
    )
    expect(greyed.get('Riposte')).toBe('your sheet')
    expect(greyed.get('Parry')).toBe('your sheet')
    expect(greyed.has('Trip Attack')).toBe(false)
  })

  it('greys one taken by a sibling pick in the same level-up', () => {
    // 6 -> 10 crosses the 7th and 10th grants together.
    const c = bm(6, [])
    const base = draftFor(c, 10)
    const seventh = maneuverPick(base, 'battle-master-7')
    const tenth = maneuverPick(base, 'battle-master-10')
    const draft = { ...base, picks: { [seventh.id]: ['Riposte'] } }
    const greyed = grantedAlreadyAt(c, draft, tenth)
    // Named by the feature that took it, not merely marked unavailable.
    expect(greyed.get('Riposte')).toBeDefined()
    expect(greyed.has('Trip Attack')).toBe(false)
  })

  it('never greys out a pick against its own answers', () => {
    const c = bm(6, [])
    const base = draftFor(c, 7)
    const pick = maneuverPick(base, 'battle-master-7')
    const draft = { ...base, picks: { [pick.id]: ['Riposte'] } }
    // Otherwise a chosen chip could not be clicked again to remove it.
    expect(grantedAlreadyAt(c, draft, pick).has('Riposte')).toBe(false)
  })

  it('greys a language the character already speaks', () => {
    const c = { ...characterAt(3, 'Fighter'), languages: ['Dwarvish'] }
    const draft = draftFor(c, 4, {
      feats: SRD_TABLES.feats.filter((f) => f.id === 'linguist'),
      asi: { 4: { kind: 'feat', abilities: {}, featName: 'Linguist' } },
    })
    const pick = levelUpPicks(draft).find(
      (p) => p.pick.id === 'linguist-languages',
    )!.pick
    expect(grantedAlreadyAt(c, draft, pick).get('Dwarvish')).toBe('your sheet')
  })
})

describe('a tracked resource that grows with the class', () => {
  const bm = (level: number, resources: Character['resources']): Character => ({
    ...characterAt(level, 'Fighter'),
    subclass: 'Battle Master',
    resources,
  })

  /** Accept every resource the level-up offers, as the step's UI would. */
  const accepting = (draft: LevelUpDraft): LevelUpDraft => ({
    ...draft,
    resources: Object.fromEntries(
      resourcesOffered(draft).map((o) => [
        o.name,
        o.resets ? { total: o.total, resets: o.resets } : { total: o.total },
      ]),
    ),
  })

  it('raises a counter already on the sheet rather than ignoring it', () => {
    // A Battle Master gains a fifth die at 7th; a row stuck at four is the
    // sheet disagreeing with the feature printed directly above it.
    const c = bm(6, [
      { name: 'Superiority Dice', used: 0, total: 4, resets: 'short' },
    ])
    const after = applyLevelUp(c, accepting(draftFor(c, 7)))
    const dice = after.resources.find((r) => r.name === 'Superiority Dice')
    expect(dice?.total).toBe(5)
    // And it stays one row, not two.
    expect(after.resources).toHaveLength(1)
  })

  it('shows the raise as a change from what the sheet says', () => {
    const c = bm(6, [
      { name: 'Superiority Dice', used: 0, total: 4, resets: 'short' },
    ])
    const offer = resourcesOffered(draftFor(c, 7)).find(
      (o) => o.name === 'Superiority Dice',
    )
    expect(offer?.from).toBe(4)
    expect(offer?.total).toBe(5)
  })

  it('keeps spent dice spent — a new die is not a regained one', () => {
    const c = bm(6, [
      { name: 'Superiority Dice', used: 2, total: 4, resets: 'short' },
    ])
    const after = applyLevelUp(c, accepting(draftFor(c, 7)))
    expect(after.resources[0]?.used).toBe(2)
    expect(after.resources[0]?.total).toBe(5)
  })

  it('never lowers a total the player tuned higher than the table', () => {
    // Same rule as a spell slot: a house rule or a magic item wins.
    const c = bm(6, [
      { name: 'Superiority Dice', used: 0, total: 8, resets: 'short' },
    ])
    const after = applyLevelUp(c, accepting(draftFor(c, 7)))
    expect(after.resources[0]?.total).toBe(8)
    // And nothing is offered at all, so the step does not show a downgrade.
    expect(
      resourcesOffered(draftFor(c, 7)).some(
        (o) => o.name === 'Superiority Dice',
      ),
    ).toBe(false)
  })

  it('offers nothing when the number has not changed', () => {
    // 8 -> 9 gains no dice; an unchanged number is not worth a row in the step.
    const c = bm(8, [
      { name: 'Superiority Dice', used: 0, total: 5, resets: 'short' },
    ])
    expect(
      resourcesOffered(draftFor(c, 9)).some(
        (o) => o.name === 'Superiority Dice',
      ),
    ).toBe(false)
  })
})

describe('monastic tradition features', () => {
  const monk = (level: number, subclass?: string): Character => ({
    ...characterAt(level, 'Monk'),
    ...(subclass ? { subclass } : {}),
  })

  const named = (c: Character, to: number, subclassName?: string) =>
    featuresGained(
      c,
      c.level,
      to,
      kitFor('Monk'),
      subclassName ?? c.subclass,
    ).map((f) => f.name)

  it('grants the tradition its features when it is chosen', () => {
    expect(named(monk(2), 3, 'Way of the Open Hand')).toContain(
      'Open Hand Technique',
    )
  })

  it('keeps granting them at later levels', () => {
    expect(named(monk(10, 'Way of Shadow'), 11)).toContain('Cloak of Shadows')
  })

  it('distinguishes the three traditions at the same level', () => {
    const c = monk(2)
    const classOnly = named(c, 3)
    const at3 = (name: string) =>
      named(c, 3, name).filter((n) => !classOnly.includes(n))
    expect(at3('Way of the Open Hand')).toEqual(['Open Hand Technique'])
    expect(at3('Way of Shadow')).toEqual(['Shadow Arts'])
    expect(at3('Way of the Four Elements')).toEqual([
      'Disciple of the Elements',
    ])
  })

  it('poses a discipline pick at each level that grants one', () => {
    // A 6 -> 17 jump crosses three of the four, each a distinct pick id — the
    // ids carry the level precisely so they stay unique in one global keyspace.
    const c = monk(6, 'Way of the Four Elements')
    const picks = levelUpPicks(draftFor(c, 17)).filter((p) =>
      p.pick.id.startsWith('four-elements-'),
    )
    expect(picks.map((p) => p.pick.id)).toEqual([
      'four-elements-11-discipline',
      'four-elements-17-discipline',
    ])
  })

  it('greys out a discipline already on the sheet', () => {
    // The shared `featureLabel` doing its job. A discipline cannot be taken
    // twice, and `grantedAlreadyAt` matches on the row name a pick *would*
    // write — so "Elemental Discipline: Water Whip" from 3rd is what makes
    // Water Whip unselectable at 6th. Were the label per-level, as the totem's
    // is, the option would be offered again and `applyFeaturePick` would
    // silently swallow the duplicate row.
    const c: Character = {
      ...monk(5, 'Way of the Four Elements'),
      features: [
        { level: 3, name: 'Elemental Discipline: Water Whip', text: '' },
      ],
    }
    const draft = draftFor(c, 6)
    const picks = levelUpPicks(draft)
    const pick = picks.find(
      (p) => p.pick.id === 'four-elements-6-discipline',
    )!.pick
    const already = grantedAlreadyAt(c, draft, pick, picks)
    expect(already.get('Water Whip')).toBe('your sheet')
    expect(already.get('Gong of the Summit')).toBeUndefined()
  })

  it('offers Ki on the level-up that grants it', () => {
    // The counter the whole class spends, and prose until this pass. It arrives
    // at 2nd, which is inside `levelsGained(1, 2)` — a level-1 resource would
    // have needed creation to deliver it instead.
    const c = monk(1)
    const offer = resourcesOffered(draftFor(c, 2)).find((o) => o.name === 'Ki')
    expect(offer?.total).toBe(2)
    expect(offer?.resets).toBe('short')
    // Not a raise: there is nothing on the sheet to raise from.
    expect(offer?.from).toBeUndefined()
  })

  it('puts Ki on the sheet unspent when accepted', () => {
    const c = monk(1)
    const draft = draftFor(c, 2)
    const after = applyLevelUp(c, {
      ...draft,
      resources: { Ki: { total: 2, resets: 'short' } },
    })
    expect(after.resources).toEqual([
      { name: 'Ki', used: 0, total: 2, resets: 'short' },
    ])
  })

  it('never lowers a Ki total the player tuned higher', () => {
    // `total` is the monk *level*, which no static table tracks, so the counter
    // ships at 2 and the player raises it as they go. A later level-up must not
    // undo that — and there is no second Ki row to offer anyway.
    const c: Character = {
      ...monk(5),
      resources: [{ name: 'Ki', used: 3, total: 5, resets: 'short' }],
    }
    expect(resourcesOffered(draftFor(c, 6)).some((o) => o.name === 'Ki')).toBe(
      false,
    )
    const after = applyLevelUp(c, draftFor(c, 6))
    expect(after.resources).toEqual([
      { name: 'Ki', used: 3, total: 5, resets: 'short' },
    ])
  })

  it('scales the martial arts die as its own rows, not prose', () => {
    // 5/11/17, and each its own row: `featuresGained` de-dupes on `level:name`,
    // so an upgrade folded into the level-1 text would never be granted.
    expect(named(monk(4), 5)).toContain('Martial Arts (d6)')
    expect(named(monk(10), 11)).toContain('Martial Arts (d8)')
    expect(named(monk(16), 17)).toContain('Martial Arts (d10)')
  })

  it('scales unarmored movement as its own rows', () => {
    expect(named(monk(5), 6)).toContain('Unarmored Movement (+15 ft)')
    expect(named(monk(17), 18)).toContain('Unarmored Movement (+30 ft)')
  })

  it('opens no spells step, and grants no spells to announce', () => {
    // A monk casts nothing, so the spells step never opens — which is exactly
    // why Way of Shadow's minor illusion is prose rather than `grant.spells`.
    // A granted spell is visible in the summary panel now, but a sheet with no
    // spell ability, DC or slots still has nowhere honest to put one.
    const c = monk(2)
    const draft = draftFor(c, 3, { subclassName: 'Way of Shadow' })
    expect(levelUpSteps(draft)).not.toContain('spells')
    expect(levelUpPlan(c, draft).spellsGranted).toEqual([])
    expect(applyLevelUp(c, draft).spells).toEqual([])
  })
})

describe('fighting style', () => {
  it('offers every style the class may take, PHB and Tasha alike', () => {
    const c = characterAt(1, 'Fighter')
    const pick = levelUpPicks({
      ...draftFor(c, 2),
      takeFeatures: ['Fighting Style'],
      from: 0,
    }).find((p) => p.pick.id === 'fighter-fighting-style')?.pick
    expect(pick?.options).toEqual(
      expect.arrayContaining([
        'Archery',
        'Blind Fighting',
        'Defense',
        'Interception',
        'Superior Technique',
        'Unarmed Fighting',
      ]),
    )
  })

  it('writes the chosen style as a named feature row with its rules text', () => {
    const c = { ...characterAt(1, 'Fighter'), features: [] }
    const draft = {
      ...draftFor(c, 2),
      from: 0,
      takeFeatures: ['Fighting Style'],
      picks: { 'fighter-fighting-style': ['Defense'] },
    }
    const row = applyLevelUp(c, draft).features.find(
      (f) => f.name === 'Fighting Style: Defense',
    )
    expect(row).toBeDefined()
    expect(row?.text).toContain('+1 AC')
  })

  it('never offers a style the character already has', () => {
    // "You can't take a Fighting Style option more than once, even if you later
    // get to choose again" — a Champion's second style at 10th.
    const c: Character = {
      ...characterAt(9, 'Fighter'),
      subclass: 'Champion',
      features: [{ level: 1, name: 'Fighting Style: Defense' }],
    }
    const draft = draftFor(c, 10)
    const pick = levelUpPicks(draft).find(
      (p) => p.pick.id === 'champion-second-fighting-style',
    )!.pick
    expect(grantedAlreadyAt(c, draft, pick).get('Defense')).toBe('your sheet')
    // The rest are still on offer.
    expect(grantedAlreadyAt(c, draft, pick).has('Archery')).toBe(false)
  })

  it('gives Paladin and Ranger their own narrower lists', () => {
    const styles = (className: string, id: string) => {
      const c = characterAt(1, className)
      return levelUpPicks({
        ...draftFor(c, 2),
        takeFeatures: ['Fighting Style'],
      }).find((p) => p.pick.id === id)?.pick.options
    }
    // A Paladin has never had Archery; a Ranger has never had Protection.
    expect(styles('Paladin', 'paladin-fighting-style')).not.toContain('Archery')
    expect(styles('Ranger', 'ranger-fighting-style')).not.toContain(
      'Protection',
    )
    expect(styles('Ranger', 'ranger-fighting-style')).toContain('Archery')
  })
})

describe('a fighting style chosen at level-up', () => {
  it('raises AC when the style is Defense', () => {
    const c = { ...characterAt(1, 'Fighter'), ac: 16, features: [] }
    const after = applyLevelUp(c, {
      ...draftFor(c, 2),
      from: 0,
      takeFeatures: ['Fighting Style'],
      picks: { 'fighter-fighting-style': ['Defense'] },
    })
    expect(after.ac).toBe(17)
  })

  it('leaves AC alone for a style this app does not model', () => {
    const c = { ...characterAt(1, 'Fighter'), ac: 16, features: [] }
    const after = applyLevelUp(c, {
      ...draftFor(c, 2),
      from: 0,
      takeFeatures: ['Fighting Style'],
      picks: { 'fighter-fighting-style': ['Archery'] },
    })
    expect(after.ac).toBe(16)
  })
})

describe('ability scores across several ASI levels', () => {
  /**
   * A Fighter levelling 1 -> 20 crosses five ASIs. Each used to read the
   * *starting* character, so all five showed Strength 16, each offered to raise
   * it to 18, and the summary totalled 20 while every stepper claimed 18.
   */
  const fighterTo20 = (asi: Record<number, AsiChoice>): LevelUpDraft => {
    const c = {
      ...characterAt(1, 'Fighter'),
      abilities: { ...characterAt(1, 'Fighter').abilities, str: 16 },
    }
    return { ...draftFor(c, 20), asi }
  }

  const raiseStr = (n: number): AsiChoice => ({
    kind: 'abilities',
    abilities: { str: n },
    featName: '',
  })

  it('shows the running score, not the starting one', () => {
    const draft = fighterTo20({ 4: raiseStr(2) })
    // The first ASI raises from what the character actually has.
    expect(abilitiesBefore(draft, 4).str).toBe(16)
    // Every later one sees the point already spent.
    expect(abilitiesBefore(draft, 6).str).toBe(18)
    expect(abilitiesBefore(draft, 19).str).toBe(18)
  })

  it('accumulates across every earlier ASI level', () => {
    const draft = fighterTo20({ 4: raiseStr(2), 6: raiseStr(2) })
    expect(abilitiesBefore(draft, 8).str).toBe(20)
  })

  it('never reports above the RAW cap of 20', () => {
    // Three ASIs of +2 from 16 is 22 on paper; `applyLevelUp` caps at 20, so
    // the stepper must not promise a 21st point it would then decline.
    const draft = fighterTo20({
      4: raiseStr(2),
      6: raiseStr(2),
      8: raiseStr(2),
    })
    expect(abilitiesBefore(draft, 12).str).toBe(20)
    expect(applyLevelUp(draft.base, draft).abilities.str).toBe(20)
  })

  it('excludes the level being chosen, so the stepper shows what it raises from', () => {
    const draft = fighterTo20({ 4: raiseStr(2), 6: raiseStr(2) })
    // At 6 the answer is 18 — the point spent at 4 counts, its own does not.
    expect(abilitiesBefore(draft, 6).str).toBe(18)
  })

  it('counts a half-feat bump taken at an earlier level', () => {
    const draft = fighterTo20({
      4: { kind: 'feat', abilities: {}, featName: 'Athlete' },
    })
    const withFeats = {
      ...draft,
      feats: SRD_TABLES.feats.filter((f) => f.id === 'athlete'),
    }
    // Athlete is +1 Strength, so the next ASI starts from 17.
    expect(abilitiesBefore(withFeats, 6).str).toBe(17)
  })

  it('counts a chooseable half-feat once the ability is placed', () => {
    const base = fighterTo20({
      4: { kind: 'feat', abilities: {}, featName: 'Skill Expert' },
    })
    const draft = {
      ...base,
      feats: SRD_TABLES.feats.filter((f) => f.id === 'skill-expert'),
      picks: { [asiChoicePickId('skill-expert')]: ['Strength'] },
    }
    expect(abilitiesBefore(draft, 6).str).toBe(17)
    // And nothing before it is placed — no guessing on the player's behalf.
    expect(abilitiesBefore({ ...draft, picks: {} }, 6).str).toBe(16)
  })

  it('agrees with what applying actually does', () => {
    // The stepper and the commit must not disagree: that was the whole bug.
    const draft = fighterTo20({
      4: raiseStr(2),
      6: raiseStr(2),
      8: raiseStr(1),
    })
    const after = applyLevelUp(draft.base, draft)
    // 16 + 2 + 2 + 1 = 21, capped to 20 by the commit; the last stepper is
    // told 20 and so cannot offer that fifth point in the first place.
    expect(after.abilities.str).toBe(20)
    expect(abilitiesBefore(draft, 12).str).toBe(20)
  })
})

describe('an ASI with nowhere to put the points', () => {
  const maxed = (): Character => ({
    ...characterAt(4, 'Fighter'),
    abilities: { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 },
  })

  it('does not leave the wizard stuck on a gate nothing can satisfy', () => {
    // Every score at 20 means the two points cannot be placed anywhere. The
    // old gate demanded them regardless, so Next went dead with nothing the
    // player could click — a trap rather than a prompt.
    const c = maxed()
    expect(asiHeadroom(draftFor(c, 6), 6)).toBe(0)
    expect(canAdvance(draftFor(c, 6), 'asi')).toBe(true)
  })

  it('still demands the points when there is room for them', () => {
    const c = characterAt(4, 'Fighter')
    expect(canAdvance(draftFor(c, 6), 'asi')).toBe(false)
  })

  it('asks only for the points that will fit', () => {
    // One point of room across the whole spread: ask for one, not two.
    const c: Character = {
      ...maxed(),
      abilities: { str: 19, dex: 20, con: 20, int: 20, wis: 20, cha: 20 },
    }
    expect(asiHeadroom(draftFor(c, 6), 6)).toBe(1)
    const draft = draftFor(c, 6, {
      asi: { 6: { kind: 'abilities', abilities: { str: 1 }, featName: '' } },
    })
    expect(canAdvance(draft, 'asi')).toBe(true)
  })

  it('still requires a feat name when the ASI is spent on one', () => {
    // Headroom says nothing about the feat half of the choice.
    const c = maxed()
    const draft = draftFor(c, 6, {
      asi: { 6: { kind: 'feat', abilities: {}, featName: '' } },
    })
    expect(canAdvance(draft, 'asi')).toBe(false)
  })
})

describe('ASI levels are answered in order', () => {
  const fighter = (asi: Record<number, AsiChoice> = {}) => {
    const c = characterAt(3, 'Fighter')
    return { ...draftFor(c, 20), asi }
  }
  const raiseStr = (n: number): AsiChoice => ({
    kind: 'abilities',
    abilities: { str: n },
    featName: '',
  })

  it('locks every level after the first unfinished one', () => {
    const draft = fighter()
    // Fighter's ASIs are 4, 6, 8, 12, 14, 16, 19.
    expect(firstIncompleteAsi(draft)).toBe(4)
    expect(asiUnlocked(draft, 4)).toBe(true)
    expect(asiUnlocked(draft, 6)).toBe(false)
    expect(asiUnlocked(draft, 19)).toBe(false)
  })

  it('opens the next one as each is completed', () => {
    const draft = fighter({ 4: raiseStr(2) })
    expect(firstIncompleteAsi(draft)).toBe(6)
    expect(asiUnlocked(draft, 4)).toBe(true)
    expect(asiUnlocked(draft, 6)).toBe(true)
    expect(asiUnlocked(draft, 8)).toBe(false)
  })

  it('keeps earlier levels editable, not just the current one', () => {
    // Locking forward must not lock backward: changing your mind about the
    // first ASI is exactly the thing the running-score display is for.
    const draft = fighter({ 4: raiseStr(2), 6: raiseStr(2) })
    expect(asiUnlocked(draft, 4)).toBe(true)
    expect(asiUnlocked(draft, 6)).toBe(true)
  })

  it('unlocks everything once they are all answered', () => {
    const draft = fighter({
      4: raiseStr(2),
      6: raiseStr(2),
      8: raiseStr(2),
      12: raiseStr(2),
      14: raiseStr(2),
      16: raiseStr(2),
      19: raiseStr(2),
    })
    expect(firstIncompleteAsi(draft)).toBeUndefined()
    expect(asiUnlocked(draft, 19)).toBe(true)
  })

  it('treats a feat with no name as unfinished', () => {
    const draft = fighter({
      4: { kind: 'feat', abilities: {}, featName: '' },
    })
    expect(firstIncompleteAsi(draft)).toBe(4)
    expect(asiUnlocked(draft, 6)).toBe(false)
  })

  it('counts a maxed-out level as finished rather than blocking forever', () => {
    // Nowhere to put the points is a completed level, not a stuck one — the
    // same rule `canAdvance` uses, or the lock would trap the whole step.
    const c: Character = {
      ...characterAt(3, 'Fighter'),
      abilities: { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 },
    }
    const draft = draftFor(c, 20)
    expect(firstIncompleteAsi(draft)).toBeUndefined()
    expect(asiUnlocked(draft, 19)).toBe(true)
  })

  it('agrees with the step gate about what is finished', () => {
    // Next lights up exactly when nothing is locked; two answers to one
    // question would be worse than either.
    const draft = fighter({ 4: raiseStr(2) })
    expect(canAdvance(draft, 'asi')).toBe(
      firstIncompleteAsi(draft) === undefined,
    )
  })
})

describe('barbarian archetype features', () => {
  it('grants the Path its features when the archetype is chosen', () => {
    const c = characterAt(2, 'Barbarian')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Path of the Berserker' }),
    )
    expect(after.subclass).toBe('Path of the Berserker')
    expect(after.features.map((f) => f.name)).toContain('Frenzy')
  })

  it('keeps granting them at later levels', () => {
    const c = {
      ...characterAt(5, 'Barbarian'),
      subclass: 'Path of the Berserker',
    }
    const after = applyLevelUp(c, draftFor(c, 6))
    expect(after.features.map((f) => f.name)).toContain('Mindless Rage')
  })

  it('grants a Totem Warrior its ritual feature alongside the totem choice', () => {
    const c = characterAt(2, 'Barbarian')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Path of the Totem Warrior' }),
    )
    expect(after.features.map((f) => f.name)).toContain('Spirit Seeker')
  })

  it('grants nothing extra for a Path the tables do not know', () => {
    const c = characterAt(2, 'Barbarian')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Path of the Screaming Gopher' }),
    )
    expect(after.subclass).toBe('Path of the Screaming Gopher')
    // The class's own level-3 row still lands; homebrew just adds nothing.
    expect(after.features.map((f) => f.name)).toContain('Primal Path')
  })

  it('scales Brutal Critical with its own row rather than prose', () => {
    const c = {
      ...characterAt(12, 'Barbarian'),
      subclass: 'Path of the Berserker',
    }
    const after = applyLevelUp(c, draftFor(c, 13))
    expect(after.features.map((f) => f.name)).toContain(
      'Brutal Critical (2 dice)',
    )
  })
})

describe('totem spirits already chosen', () => {
  /**
   * A Totem Warrior chooses at 3rd, 6th and 14th, and 5e lets the same animal
   * be taken every time. Each level therefore writes its own row name — a
   * shared "Totem Spirit" label would grey Bear out at 6th for anyone who took
   * Bear at 3rd, and `applyFeaturePick` would swallow the row if they chose it
   * regardless, losing the level-6 benefit silently.
   */
  const totem = (level: number, features: Array<string>): Character => ({
    ...characterAt(level, 'Barbarian'),
    subclass: 'Path of the Totem Warrior',
    features: features.map((name) => ({ level: 3, name })),
  })

  const totemPick = (draft: LevelUpDraft, at: string) =>
    levelUpPicks(draft).find((p) => p.pick.id.startsWith(at))!.pick

  it('poses a separate pick for each level that grants one', () => {
    const c = totem(2, [])
    const ids = levelUpPicks(
      draftFor(c, 14, { subclassName: 'Path of the Totem Warrior' }),
    )
      .map((p) => p.pick.id)
      .filter((id) => id.includes('totem'))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(3)
  })

  it('lets the same animal be taken again at a later level', () => {
    // The whole reason the labels differ per level. Bear at 3rd must not block
    // Bear at 6th, and the 6th-level benefit must actually reach the sheet.
    const c = totem(5, ['Totem Spirit: Bear'])
    const draft = draftFor(c, 6)
    const pick = totemPick(draft, 'totem-warrior-6')
    expect(grantedAlreadyAt(c, draft, pick).has('Bear')).toBe(false)
    const after = applyLevelUp(c, {
      ...draft,
      picks: { [pick.id]: ['Bear'] },
    })
    const names = after.features.map((f) => f.name)
    expect(names).toContain('Totem Spirit: Bear')
    expect(names).toContain('Aspect of the Beast: Bear')
  })

  it('never writes a second row for the same choice at the same level', () => {
    const c = totem(5, ['Aspect of the Beast: Wolf'])
    const draft = draftFor(c, 6)
    const pick = totemPick(draft, 'totem-warrior-6')
    // Already on the sheet under the row this very pick would write.
    expect(grantedAlreadyAt(c, draft, pick).get('Wolf')).toBe('your sheet')
    const after = applyLevelUp(c, { ...draft, picks: { [pick.id]: ['Wolf'] } })
    expect(
      after.features.filter((f) => f.name === 'Aspect of the Beast: Wolf'),
    ).toHaveLength(1)
  })

  it('accepts an animal outside the SRD three', () => {
    // `open` is the point: three closed options across three picks would leave
    // the 14th-level choice with exactly one legal answer.
    const c = totem(2, [])
    const draft = draftFor(c, 3, {
      subclassName: 'Path of the Totem Warrior',
    })
    const pick = totemPick(draft, 'totem-warrior-3')
    expect(pick.open).toBe(true)
    const after = applyLevelUp(c, { ...draft, picks: { [pick.id]: ['Tiger'] } })
    expect(after.features.map((f) => f.name)).toContain('Totem Spirit: Tiger')
  })
})

describe('rage as a counter that grows with the class', () => {
  const barb = (
    level: number,
    resources: Character['resources'],
  ): Character => ({
    ...characterAt(level, 'Barbarian'),
    subclass: 'Path of the Berserker',
    resources,
  })

  /** Accept every resource the level-up offers, as the step's UI would. */
  const accepting = (draft: LevelUpDraft): LevelUpDraft => ({
    ...draft,
    resources: Object.fromEntries(
      resourcesOffered(draft).map((o) => [
        o.name,
        o.resets ? { total: o.total, resets: o.resets } : { total: o.total },
      ]),
    ),
  })

  it('offers a Rage counter to a barbarian who has none', () => {
    const c = barb(2, [])
    const after = applyLevelUp(
      c,
      accepting(draftFor(c, 3, { subclassName: 'Path of the Berserker' })),
    )
    const rage = after.resources.find((r) => r.name === 'Rage')
    expect(rage?.total).toBe(3)
    expect(rage?.resets).toBe('long')
  })

  it('raises a counter already on the sheet rather than adding a second', () => {
    const c = barb(5, [{ name: 'Rage', used: 0, total: 3, resets: 'long' }])
    const after = applyLevelUp(c, accepting(draftFor(c, 6)))
    expect(after.resources.find((r) => r.name === 'Rage')?.total).toBe(4)
    expect(after.resources).toHaveLength(1)
  })

  it('shows the raise as a change from what the sheet says', () => {
    const c = barb(5, [{ name: 'Rage', used: 0, total: 3, resets: 'long' }])
    const offer = resourcesOffered(draftFor(c, 6)).find(
      (o) => o.name === 'Rage',
    )
    expect(offer?.from).toBe(3)
    expect(offer?.total).toBe(4)
  })

  it('keeps spent rages spent — a new one is not a regained one', () => {
    const c = barb(5, [{ name: 'Rage', used: 2, total: 3, resets: 'long' }])
    const after = applyLevelUp(c, accepting(draftFor(c, 6)))
    const rage = after.resources.find((r) => r.name === 'Rage')
    expect(rage?.used).toBe(2)
    expect(rage?.total).toBe(4)
  })

  it('never lowers a total the player tuned higher than the table', () => {
    const c = barb(5, [{ name: 'Rage', used: 0, total: 9, resets: 'long' }])
    const after = applyLevelUp(c, accepting(draftFor(c, 6)))
    expect(after.resources[0]?.total).toBe(9)
    expect(
      resourcesOffered(draftFor(c, 6)).some((o) => o.name === 'Rage'),
    ).toBe(false)
  })

  it('offers nothing when the number has not changed', () => {
    // 7 -> 8 gains no rages; an unchanged number is not worth a row.
    const c = barb(7, [{ name: 'Rage', used: 0, total: 4, resets: 'long' }])
    expect(
      resourcesOffered(draftFor(c, 8)).some((o) => o.name === 'Rage'),
    ).toBe(false)
  })

  it('offers the highest step when several levels are crossed at once', () => {
    // 2 -> 12 crosses the grants at 3, 6 and 12. The player should be offered
    // five rages, not three.
    const c = barb(2, [])
    const offer = resourcesOffered(
      draftFor(c, 12, { subclassName: 'Path of the Berserker' }),
    ).find((o) => o.name === 'Rage')
    expect(offer?.total).toBe(5)
  })

  it('matches the printed rage count at every level', () => {
    // The table is sparse — only levels where the number changes carry a row —
    // so an off-by-one is invisible unless every level is walked.
    const printed: Record<number, number> = {
      1: 2,
      2: 2,
      3: 3,
      4: 3,
      5: 3,
      6: 4,
      7: 4,
      8: 4,
      9: 4,
      10: 4,
      11: 4,
      12: 5,
      13: 5,
      14: 5,
      15: 5,
      16: 5,
      17: 6,
      18: 6,
      19: 6,
      20: 6,
    }
    const kit = kitFor('Barbarian')!
    for (let level = 1; level <= 20; level++) {
      // The highest Rage row at or below this level, the same walk-back every
      // progression lookup in the app performs.
      let best: number | undefined
      let bestLevel = 0
      for (const f of kit.features) {
        if (f.resource?.name !== 'Rage') continue
        if (f.level <= level && f.level > bestLevel) {
          bestLevel = f.level
          best = f.resource.total
        }
      }
      expect(best, `rages at level ${level}`).toBe(printed[level])
    }
  })
})

describe('totem text completeness', () => {
  it('every totem option carries the text its row will show', () => {
    // The generic invariant in srd.test.ts skips `open` picks, and these are
    // open on purpose — so the check has to exist somewhere, and this is it.
    const kit = kitFor('Barbarian')!
    const sub = kit.subclasses.find(
      (s) => s.name === 'Path of the Totem Warrior',
    )!
    let picks = 0
    for (const feature of sub.features) {
      for (const pick of feature.picks ?? []) {
        picks++
        expect(pick.options.length, `${feature.name} options`).toBeGreaterThan(
          0,
        )
        for (const option of pick.options) {
          expect(
            pick.featureText?.[option],
            `${feature.name}: option "${option}" has no text`,
          ).toBeTruthy()
        }
      }
    }
    // The loop above passes vacuously if the picks ever stop being authored.
    expect(picks).toBe(3)
  })

  it('writes a distinct row name for each level that chooses a totem', () => {
    // Shared labels would collide in `Character.features` and lose a benefit.
    const kit = kitFor('Barbarian')!
    const sub = kit.subclasses.find(
      (s) => s.name === 'Path of the Totem Warrior',
    )!
    const labels = sub.features
      .flatMap((f) => f.picks ?? [])
      .map((p) => p.featureLabel)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('bard college features', () => {
  it('grants the College its features when it is chosen', () => {
    const c = characterAt(2, 'Bard')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'College of Lore' }),
    )
    expect(after.subclass).toBe('College of Lore')
    const names = after.features.map((f) => f.name)
    expect(names).toContain('Cutting Words')
    expect(names).toContain('Bonus Proficiencies')
  })

  it('keeps granting them at later levels', () => {
    const c = { ...characterAt(5, 'Bard'), subclass: 'College of Lore' }
    const after = applyLevelUp(c, draftFor(c, 6))
    expect(after.features.map((f) => f.name)).toContain(
      'Additional Magical Secrets',
    )
  })

  it('grants a Valor bard its armour and weapon proficiencies', () => {
    // The subclass `grant`, applied on the level-up that chooses the archetype.
    // College of Valor comes from the published tier, so this also proves that
    // tier reaches the level-up path and not just the settings list.
    const c = characterAt(2, 'Bard')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'College of Valor' }),
    )
    expect(after.armor).toContain('medium')
    expect(after.armor).toContain('shields')
    expect(after.weapons).toContain('martial')
    expect(after.features.map((f) => f.name)).toContain('Combat Inspiration')
  })

  it('applies the Valor grant once and never again', () => {
    const c = characterAt(2, 'Bard')
    const at3 = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'College of Valor' }),
    )
    expect(at3.armor.filter((a) => a === 'medium')).toHaveLength(1)
    const at4 = applyLevelUp(at3, draftFor(at3, 4))
    expect(at4.armor.filter((a) => a === 'medium')).toHaveLength(1)
  })

  it('gives a Valor bard Extra Attack at 6, where the class has none', () => {
    const c = { ...characterAt(5, 'Bard'), subclass: 'College of Valor' }
    const after = applyLevelUp(c, draftFor(c, 6))
    expect(after.features.map((f) => f.name)).toContain('Extra Attack')
  })

  it('grants nothing extra for a College the tables do not know', () => {
    const c = characterAt(2, 'Bard')
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'College of the Unpaid Bar Tab' }),
    )
    expect(after.subclass).toBe('College of the Unpaid Bar Tab')
    expect(after.features.map((f) => f.name)).toContain('Bard College')
  })
})

describe('bard expertise', () => {
  it('poses a real pick at 3 rather than prose', () => {
    const c = { ...characterAt(2, 'Bard'), skills: ['performance', 'stealth'] }
    const draft = draftFor(c, 3, { subclassName: 'College of Lore' })
    const pick = levelUpPicks(draft).find(
      (p) => p.pick.id === 'bard-expertise-3',
    )
    expect(pick).toBeDefined()
    expect(pick!.pick.kind).toBe('expertise')
    expect(pick!.pick.count).toBe(2)
  })

  it('offers expertise only over skills the bard actually has', () => {
    const c = { ...characterAt(2, 'Bard'), skills: ['performance', 'stealth'] }
    const draft = draftFor(c, 3, { subclassName: 'College of Lore' })
    const pick = levelUpPicks(draft).find(
      (p) => p.pick.id === 'bard-expertise-3',
    )!.pick
    const offered = eligibleExpertiseAt(c, draft, pick)
    expect(offered).toContain('performance')
    expect(offered).toContain('stealth')
    expect(offered).not.toContain('arcana')
  })

  it('writes the chosen skills to Character.expertise', () => {
    const c = { ...characterAt(2, 'Bard'), skills: ['performance', 'stealth'] }
    const draft = draftFor(c, 3, { subclassName: 'College of Lore' })
    const after = applyLevelUp(c, {
      ...draft,
      picks: { 'bard-expertise-3': ['performance', 'stealth'] },
    })
    expect(after.expertise).toContain('performance')
    expect(after.expertise).toContain('stealth')
  })

  it('poses a second, distinct pick at 10', () => {
    // Two questions at two levels, so two ids — the level-3 answer must not be
    // mistaken for this one.
    const c = {
      ...characterAt(9, 'Bard'),
      subclass: 'College of Lore',
      skills: ['performance', 'stealth', 'arcana', 'history'],
      expertise: ['performance', 'stealth'],
    }
    const draft = draftFor(c, 10)
    const ids = levelUpPicks(draft)
      .map((p) => p.pick.id)
      .filter((id) => id.startsWith('bard-expertise'))
    expect(ids).toEqual(['bard-expertise-10'])
  })

  it('greys out a skill already doubled at 3', () => {
    const c = {
      ...characterAt(9, 'Bard'),
      subclass: 'College of Lore',
      skills: ['performance', 'stealth', 'arcana'],
      expertise: ['performance'],
    }
    const draft = draftFor(c, 10)
    const pick = levelUpPicks(draft).find(
      (p) => p.pick.id === 'bard-expertise-10',
    )!.pick
    expect(grantedAlreadyAt(c, draft, pick).get('performance')).toBe(
      'your sheet',
    )
  })
})

describe('bardic inspiration', () => {
  const bard = (
    level: number,
    resources: Character['resources'] = [],
  ): Character => ({
    ...characterAt(level, 'Bard'),
    resources,
  })

  const accepting = (draft: LevelUpDraft): LevelUpDraft => ({
    ...draft,
    resources: Object.fromEntries(
      resourcesOffered(draft).map((o) => [
        o.name,
        o.resets ? { total: o.total, resets: o.resets } : { total: o.total },
      ]),
    ),
  })

  it('is offered as a counter, since the sheet has a field for it', () => {
    const c = bard(1)
    const after = applyLevelUp(c, accepting(draftFor(c, 2)))
    // Gained at level 1, so a 1 -> 2 level-up does not re-offer it; the offer
    // belongs to creation. What matters here is that the row exists at all.
    const kit = kitFor('Bard')!
    const inspiration = kit.features.find(
      (f) => f.name === 'Bardic Inspiration',
    )
    expect(inspiration?.resource?.name).toBe('Bardic Inspiration')
    expect(inspiration?.resource?.resets).toBe('long')
    expect(after.level).toBe(2)
  })

  it('never lowers a total the player set from their own Charisma', () => {
    // The table's 3 is a suggestion — the real number is the CHA modifier, and
    // a bard with +5 must not be talked back down to 3.
    const c = {
      ...bard(2, [
        { name: 'Bardic Inspiration', used: 0, total: 5, resets: 'long' },
      ]),
    }
    const after = applyLevelUp(c, accepting(draftFor(c, 3)))
    expect(
      after.resources.find((r) => r.name === 'Bardic Inspiration')?.total,
    ).toBe(5)
  })

  it('scales its die with its own rows rather than prose', () => {
    const c = { ...characterAt(4, 'Bard'), subclass: 'College of Lore' }
    const after = applyLevelUp(c, draftFor(c, 5))
    expect(after.features.map((f) => f.name)).toContain(
      'Bardic Inspiration (d8)',
    )
  })

  it('scales again at 10 and 15', () => {
    const kit = kitFor('Bard')!
    const names = kit.features.map((f) => `${f.level}:${f.name}`)
    expect(names).toContain('10:Bardic Inspiration (d10)')
    expect(names).toContain('15:Bardic Inspiration (d12)')
  })
})

describe('bard magical secrets', () => {
  it('grants each helping as its own row', () => {
    const c = { ...characterAt(13, 'Bard'), subclass: 'College of Lore' }
    const after = applyLevelUp(c, draftFor(c, 14))
    expect(after.features.map((f) => f.name)).toContain('Magical Secrets (2)')
  })

  it('lists all three at the levels the book gives them', () => {
    const kit = kitFor('Bard')!
    const at = kit.features
      .filter((f) => f.name.startsWith('Magical Secrets'))
      .map((f) => f.level)
      .sort((a, b) => a - b)
    expect(at).toEqual([10, 14, 18])
  })
})

describe('half proficiency at level-up', () => {
  it('sets it when a Bard reaches Jack of All Trades', () => {
    const c = characterAt(1, 'Bard')
    expect(c.halfProficiency).toBeNull()
    const after = applyLevelUp(c, draftFor(c, 2))
    expect(after.halfProficiency).toBe('all')
  })

  it('sets the narrower mode for a Champion’s Remarkable Athlete', () => {
    const c = { ...characterAt(6, 'Fighter'), subclass: 'Champion' }
    const after = applyLevelUp(c, draftFor(c, 7))
    expect(after.halfProficiency).toBe('physical')
  })

  it('leaves a class without the feature alone', () => {
    const c = characterAt(1, 'Barbarian')
    expect(applyLevelUp(c, draftFor(c, 2)).halfProficiency).toBeNull()
  })

  it('does not set it when the player unticks the feature', () => {
    // Everything in this wizard is opt-in; a player who dropped the row has
    // said they do not want it, and setting the field anyway overrules them.
    const c = characterAt(1, 'Bard')
    const after = applyLevelUp(c, draftFor(c, 2, { takeFeatures: [] }))
    expect(after.halfProficiency).toBeNull()
  })

  it('never narrows a mode the character already has', () => {
    // `applyLevelUp` only ever adds. A Bard who somehow reaches Remarkable
    // Athlete keeps the broader `all` rather than being cut back to physical.
    const c = {
      ...characterAt(6, 'Fighter'),
      subclass: 'Champion',
      halfProficiency: 'all' as const,
    }
    expect(applyLevelUp(c, draftFor(c, 7)).halfProficiency).toBe('all')
  })

  it('shows up in the skill bonus straight after applying', () => {
    // The point of the whole exercise: a level-2 Bard's non-proficient skills
    // are no longer a flat ability modifier.
    const c = characterAt(1, 'Bard')
    const before = skillBonus(c, 'arcana')
    const after = applyLevelUp(c, draftFor(c, 2))
    expect(skillBonus(after, 'arcana')).toBe(before + 1)
  })

  it('is reported by halfProficiencyGained without applying anything', () => {
    const c = characterAt(1, 'Bard')
    const draft = draftFor(c, 2)
    expect(halfProficiencyGained(draft, levelUpPlan(c, draft))).toBe('all')
  })
})

/**
 * Domain, oath and circle spells — `SubclassInfo.spells`.
 *
 * The field was declared-but-inert for as long as it existed: authored in the
 * homebrew editor, parsed, previewed, validated, and read by nothing. A Life
 * Domain cleric is the reason it exists, so these assert it reaches the sheet
 * and stays outside the prepared limit once there.
 */
describe('domain spells', () => {
  /** A cleric who already has their domain, at a given level. */
  const cleric = (level: number, spells: Character['spells'] = []) => ({
    ...characterAt(level, 'Cleric'),
    subclass: 'Life Domain',
    spellAbility: 'wis' as const,
    spells,
  })

  it('arrive on the level-up that reaches their row', () => {
    // grantedAt 3: Lesser Restoration and Spiritual Weapon, both 2nd level.
    const after = applyLevelUp(cleric(2), draftFor(cleric(2), 3))
    const names = after.spells.map((sp) => sp.name)
    expect(names).toContain('Lesser Restoration')
    expect(names).toContain('Spiritual Weapon')
    const weapon = after.spells.find((sp) => sp.name === 'Spiritual Weapon')
    expect(weapon?.level).toBe(2)
    expect(weapon?.alwaysPrepared).toBe(true)
  })

  it('keep arriving long after the domain was chosen', () => {
    // The bug this guards: keying the apply off `plan.subclassName` delivers
    // the 1st-level row and silently drops every one above it, because that
    // field is null on every level-up after the archetype is picked.
    const after = applyLevelUp(cleric(4), draftFor(cleric(4), 5))
    expect(after.spells.map((sp) => sp.name)).toContain('Revivify')
    expect(
      after.spells.find((sp) => sp.name === 'Beacon of Hope')?.alwaysPrepared,
    ).toBe(true)
  })

  it('collect every row a multi-level jump passes through', () => {
    const after = applyLevelUp(cleric(2), draftFor(cleric(2), 5))
    const names = after.spells.map((sp) => sp.name)
    expect(names).toContain('Spiritual Weapon') // grantedAt 3
    expect(names).toContain('Revivify') // grantedAt 5
  })

  it('are not re-added on a later level-up', () => {
    // `Character.spells` is flat with no per-source grouping, so a domain
    // spell is indistinguishable from a hand-typed one and a second copy would
    // be silent. Idempotency is the only thing standing between the two.
    const at3 = applyLevelUp(cleric(2), draftFor(cleric(2), 3))
    const at4 = applyLevelUp(at3, draftFor(at3, 4))
    expect(
      at4.spells.filter((sp) => sp.name === 'Spiritual Weapon'),
    ).toHaveLength(1)
  })

  it('leave a spell the player already had alone', () => {
    // Somebody who prepared Bless by hand keeps the row they made. This
    // appends what is missing rather than restating the table over the top.
    const c = cleric(2, [
      { name: 'Spiritual Weapon', level: 2, prepared: true },
    ])
    const after = applyLevelUp(c, draftFor(c, 3))
    const rows = after.spells.filter((sp) => sp.name === 'Spiritual Weapon')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.prepared).toBe(true)
    expect(rows[0]?.alwaysPrepared).toBe(undefined)
  })

  it('do not count against the prepared limit', () => {
    const after = applyLevelUp(cleric(2), draftFor(cleric(2), 3))
    expect(alwaysPreparedCount(after)).toBe(2)
    expect(preparedCount(after)).toBe(0)
  })

  it('are shown in the plan before they land', () => {
    // The Rogue pass shipped a bug where a granted spell was invisible during
    // selection, so the picker read as though it were still owed.
    const plan = levelUpPlan(cleric(2), draftFor(cleric(2), 3))
    expect(plan.alwaysPreparedGained.map((sp) => sp.name)).toEqual([
      'Lesser Restoration',
      'Spiritual Weapon',
    ])
  })

  it('are not offered again once the sheet has them', () => {
    const c = cleric(4, [{ name: 'Revivify', level: 3, alwaysPrepared: true }])
    const plan = levelUpPlan(c, draftFor(c, 5))
    expect(plan.alwaysPreparedGained.map((sp) => sp.name)).toEqual([
      'Beacon of Hope',
    ])
  })

  it('grant nothing for a domain the tables do not know', () => {
    const c = { ...cleric(2), subclass: 'Domain of the Screaming Moon' }
    const plan = levelUpPlan(c, draftFor(c, 3))
    expect(plan.alwaysPreparedGained).toEqual([])
  })
})

describe('channel divinity', () => {
  const accepting = (draft: LevelUpDraft): LevelUpDraft => ({
    ...draft,
    resources: Object.fromEntries(
      resourcesOffered(draft).map((o) => [
        o.name,
        o.resets ? { total: o.total, resets: o.resets } : { total: o.total },
      ]),
    ),
  })

  const cleric = (level: number, resources: Character['resources'] = []) => ({
    ...characterAt(level, 'Cleric'),
    subclass: 'Life Domain',
    resources,
  })

  it('is offered as a counter at 2nd', () => {
    const offer = resourcesOffered(draftFor(cleric(1), 2)).find(
      (o) => o.name === 'Channel Divinity',
    )
    expect(offer?.total).toBe(1)
    expect(offer?.resets).toBe('short')
  })

  it('rises to two uses at 6th', () => {
    const c = cleric(5, [
      { name: 'Channel Divinity', used: 0, total: 1, resets: 'short' },
    ])
    const after = applyLevelUp(c, accepting(draftFor(c, 6)))
    const row = after.resources.find((r) => r.name === 'Channel Divinity')
    expect(row?.total).toBe(2)
    expect(after.resources).toHaveLength(1)
  })

  it('rises to three uses at 18th', () => {
    const c = cleric(17, [
      { name: 'Channel Divinity', used: 0, total: 2, resets: 'short' },
    ])
    const after = applyLevelUp(c, accepting(draftFor(c, 18)))
    expect(
      after.resources.find((r) => r.name === 'Channel Divinity')?.total,
    ).toBe(3)
  })

  it('keeps spent uses spent when it grows', () => {
    const c = cleric(5, [
      { name: 'Channel Divinity', used: 1, total: 1, resets: 'short' },
    ])
    const after = applyLevelUp(c, accepting(draftFor(c, 6)))
    const row = after.resources.find((r) => r.name === 'Channel Divinity')
    expect(row?.total).toBe(2)
    expect(row?.used).toBe(1)
  })

  it('offers nothing at a level that does not change the number', () => {
    const c = cleric(6, [
      { name: 'Channel Divinity', used: 0, total: 2, resets: 'short' },
    ])
    expect(
      resourcesOffered(draftFor(c, 7)).find(
        (o) => o.name === 'Channel Divinity',
      ),
    ).toBe(undefined)
  })
})

describe('paladin oath features', () => {
  const paladin = (level: number, subclass = '') => ({
    ...characterAt(level, 'Paladin'),
    subclass,
  })

  it('grants the oath its features when the oath is sworn', () => {
    const c = paladin(2)
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Oath of Devotion' }),
    )
    expect(after.subclass).toBe('Oath of Devotion')
    const names = after.features.map((f) => f.name)
    // Both Channel Divinity options land, as two rows rather than one.
    expect(names).toContain('Channel Divinity: Sacred Weapon')
    expect(names).toContain('Channel Divinity: Turn the Unholy')
    expect(names).toContain('Oath Spells')
  })

  it('keeps granting them at later levels', () => {
    const c = paladin(6, 'Oath of the Ancients')
    const after = applyLevelUp(c, draftFor(c, 7))
    expect(after.features.map((f) => f.name)).toContain('Aura of Warding')
  })

  it('grants nothing extra for an oath the tables do not know', () => {
    const c = paladin(2)
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Oath of the Deep Bargain' }),
    )
    expect(after.subclass).toBe('Oath of the Deep Bargain')
    // The class's own level-3 rows still land; homebrew just adds nothing.
    const names = after.features.map((f) => f.name)
    expect(names).toContain('Sacred Oath')
    expect(names).toContain('Channel Divinity')
  })

  it('distinguishes the three oaths at the same level', () => {
    // Each oath's pair of Channel Divinity options is its own; swearing one
    // must not bring another's along.
    const c = paladin(2)
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Oath of Vengeance' }),
    )
    const names = after.features.map((f) => f.name)
    expect(names).toContain('Channel Divinity: Vow of Enmity')
    expect(names).not.toContain('Channel Divinity: Sacred Weapon')
  })
})

describe('a paladin’s counters', () => {
  const accepting = (draft: LevelUpDraft): LevelUpDraft => ({
    ...draft,
    resources: Object.fromEntries(
      resourcesOffered(draft).map((o) => [
        o.name,
        o.resets ? { total: o.total, resets: o.resets } : { total: o.total },
      ]),
    ),
  })

  const paladin = (
    level: number,
    resources: Character['resources'] = [],
  ): Character => ({
    ...characterAt(level, 'Paladin'),
    resources,
  })

  it('offers Channel Divinity at 3rd, when the oath is sworn', () => {
    // The class had no counter at all before this, which mattered: every oath
    // grants Channel Divinity options at 3rd, so without the class row those
    // features would spend a resource the sheet had never heard of.
    const c = paladin(2)
    const offer = resourcesOffered(draftFor(c, 3)).find(
      (o) => o.name === 'Channel Divinity',
    )
    expect(offer?.total).toBe(1)
    expect(offer?.resets).toBe('short')
  })

  it('still offers it when several levels are crossed at once', () => {
    const c = paladin(1)
    expect(
      resourcesOffered(draftFor(c, 5)).some(
        (o) => o.name === 'Channel Divinity',
      ),
    ).toBe(true)
  })

  it('never lowers a total the player tuned higher', () => {
    const c = paladin(2, [
      { name: 'Channel Divinity', used: 1, total: 3, resets: 'short' },
    ])
    const after = applyLevelUp(c, accepting(draftFor(c, 3)))
    const row = after.resources.find((r) => r.name === 'Channel Divinity')
    expect(row?.total).toBe(3)
    expect(row?.used).toBe(1)
    expect(after.resources).toHaveLength(1)
  })

  it('never scales past one use, unlike a cleric’s', () => {
    // A cleric's Channel Divinity rises at 6 and 18; a paladin's never does,
    // so it is one row and nothing is offered at those levels.
    const c = paladin(5, [
      { name: 'Channel Divinity', used: 0, total: 1, resets: 'short' },
    ])
    for (const to of [6, 18]) {
      const from = { ...c, level: to - 1 }
      expect(
        resourcesOffered(draftFor(from, to)).some(
          (o) => o.name === 'Channel Divinity',
        ),
        'level ' + String(to),
      ).toBe(false)
    }
  })

  it('leaves Lay on Hands as prose rather than a counter', () => {
    // Its pool is 5 x the paladin level: a hit-point pool that changes every
    // level, not a use count. Nothing recomputes a total once it is on a
    // sheet, so a row offered at twenty consecutive level-ups would be noise
    // and stale the moment it was taken.
    const kit = kitFor('Paladin')!
    const lay = kit.features.find((f) => f.name === 'Lay on Hands')
    expect(lay).toBeDefined()
    expect(lay?.resource).toBeUndefined()
  })

  it('carries Divine Sense as a counter creation delivers, not level-up', () => {
    // A level-1 counter is applied by `buildCharacter` (see the creation tests)
    // rather than offered at level-up: `resourcesOffered` only looks at the
    // levels being *gained*, and nobody ever gains the level they started at.
    // Both halves are asserted, because for a long time neither happened and
    // the counter simply did not exist anywhere.
    const kit = kitFor('Paladin')!
    const sense = kit.features.find((f) => f.name === 'Divine Sense')
    expect(sense?.resource?.name).toBe('Divine Sense')
    expect(sense?.resource?.resets).toBe('long')

    const c = paladin(1)
    expect(
      resourcesOffered(draftFor(c, 2)).some((o) => o.name === 'Divine Sense'),
    ).toBe(false)
  })
})

describe('a wizard recovering slots', () => {
  it('carries Arcane Recovery as a counter creation delivers, not level-up', () => {
    // The Wizard had no counter at any level until the arcane traditions were
    // authored, while Arcane Recovery's own text told the player to spend
    // something the sheet had never heard of. Same shape as Divine Sense
    // above: level 1, so `buildCharacter` applies it and `resourcesOffered`
    // never sees it.
    const kit = kitFor('Wizard')!
    const recovery = kit.features.find((f) => f.name === 'Arcane Recovery')
    expect(recovery?.resource?.name).toBe('Arcane Recovery')
    expect(recovery?.resource?.total).toBe(1)
    // Not 'short', and this is the half that would go wrong silently. The
    // feature triggers on a short rest but refreshes by the day. Ki is
    // 'short' and Sorcery Points 'long'; copying either wholesale gets this
    // one backwards and nothing else in the suite would object.
    expect(recovery?.resource?.resets).toBe('long')

    const c = characterAt(1, 'Wizard')
    expect(
      resourcesOffered(draftFor(c, 2)).some(
        (o) => o.name === 'Arcane Recovery',
      ),
    ).toBe(false)
  })

  it('never raises the counter as the recovery grows', () => {
    // What scales is the *size* of the recovery — slots totalling half your
    // wizard level — not the number of uses, which is always one. A second
    // row at some later level would be the Barbarian's rage-damage mistake:
    // a scaling number dressed as a counter.
    const kit = kitFor('Wizard')!
    const rows = kit.features.filter(
      (f) => f.resource?.name === 'Arcane Recovery',
    )
    expect(rows.map((f) => f.level)).toEqual([1])
  })
})

describe('a paladin learning to cast', () => {
  const paladin = (level: number, subclass = '') => ({
    ...characterAt(level, 'Paladin'),
    subclass,
  })

  it('gains its first slots at 2nd, not 1st', () => {
    const c = paladin(1)
    const plan = levelUpPlan(c, draftFor(c, 2))
    const first = plan.slots.find((s) => s.level === 1)
    expect(first?.from).toBe(0)
    expect(first?.to).toBe(2)
  })

  it('sets the spell ability it never had', () => {
    // The Rogue pass shipped a bug where this was never set at level-up and
    // both the save DC and the attack bonus came out null. A half caster is
    // the same shape: nothing at creation, everything at 2nd.
    const c = paladin(1)
    expect(levelUpPlan(c, draftFor(c, 2)).spellAbilityTo).toBe('cha')
  })

  it('sets a prepared limit, which used to stay 0 forever', () => {
    // `preparedLimitTo` was gated on `c.preparedLimit > 0`, and a paladin is
    // built at level 1 with 0 because they do not cast yet — so the guard
    // could never open and the limit stayed 0 at every level. CHA 12 is a +1,
    // so 1 + 2 = 3.
    const c = { ...paladin(1), abilities: { ...paladin(1).abilities, cha: 12 } }
    const after = applyLevelUp(c, draftFor(c, 2))
    expect(after.preparedLimit).toBe(3)
  })

  it('grants the oath spells on the level-ups that reach them', () => {
    const c = paladin(2)
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Oath of Devotion' }),
    )
    const names = after.spells.map((sp) => sp.name)
    expect(names).toContain('Protection from Evil and Good')
    expect(names).toContain('Sanctuary')
    // And they are always prepared, so they cost nothing against the limit.
    expect(
      after.spells.find((sp) => sp.name === 'Sanctuary')?.alwaysPrepared,
    ).toBe(true)
    // Nothing from a later row yet.
    expect(names).not.toContain('Lesser Restoration')
  })

  it('keeps delivering oath spells after the oath is chosen', () => {
    // The trap `alwaysPreparedGained` exists for: `plan.subclassName` is null
    // on every level-up after the choosing one, so keying off it would deliver
    // the 3rd-level pair and silently drop every later row.
    const c = paladin(4, 'Oath of Devotion')
    const after = applyLevelUp(c, draftFor(c, 5))
    const names = after.spells.map((sp) => sp.name)
    expect(names).toContain('Lesser Restoration')
    expect(names).toContain('Zone of Truth')
  })

  it('does not offer a spells step before it can cast', () => {
    // A 1 -> 2 level-up gains slots, so the step belongs there; the class
    // simply has nothing at 1, which is what `castsAtLevel1` protects at
    // creation.
    const c = paladin(1)
    expect(levelUpSteps(draftFor(c, 2))).toContain('spells')
  })
})

describe('druid circles', () => {
  const druid = (level: number, subclass = 'Circle of the Land') => ({
    ...characterAt(level, 'Druid'),
    subclass,
  })

  it('is asked for at 2nd, not 3rd', () => {
    // The kit's `Druid Circle` feature has always sat at level 2, but with no
    // `subclassLevel` the default of 3 won and the wizard asked a level late.
    const c = characterAt(1, 'Druid')
    expect(needsSubclass(c, 1, 2, kitFor('Druid'))).toBe(true)
  })

  it('grants the circle its level-2 features', () => {
    const c = characterAt(1, 'Druid')
    const after = applyLevelUp(
      c,
      draftFor(c, 2, { subclassName: 'Circle of the Land' }),
    )
    const names = after.features.map((f) => f.name)
    expect(names).toContain('Bonus Cantrip')
    expect(names).toContain('Natural Recovery')
  })

  it('grants the moon circle its own level-2 features', () => {
    const c = characterAt(1, 'Druid')
    const after = applyLevelUp(
      c,
      draftFor(c, 2, { subclassName: 'Circle of the Moon' }),
    )
    const names = after.features.map((f) => f.name)
    expect(names).toContain('Combat Wild Shape')
    expect(names).toContain('Circle Forms')
  })

  it('scales Circle Forms with its own row rather than prose', () => {
    const c = druid(5, 'Circle of the Moon')
    const after = applyLevelUp(c, draftFor(c, 6))
    const names = after.features.map((f) => f.name)
    expect(names).toContain('Circle Forms (CR)')
    expect(names).toContain('Primal Strike')
  })

  it('poses the land choice at 3rd', () => {
    const c = druid(2)
    const pick = levelUpPicks(draftFor(c, 3)).find(
      (p) => p.pick.id === 'circle-of-the-land-3-terrain',
    )
    expect(pick).toBeDefined()
    expect(pick?.pick.options).toHaveLength(8)
    expect(pick?.pick.options).toContain('Underdark')
  })

  it('writes the chosen land as a feature row', () => {
    const c = druid(2)
    const draft = draftFor(c, 3)
    const after = applyLevelUp(c, {
      ...draft,
      picks: { ...draft.picks, 'circle-of-the-land-3-terrain': ['Swamp'] },
    })
    const row = after.features.find((f) => f.name === 'Land: Swamp')
    expect(row).toBeDefined()
    expect(row?.text).toContain('darkness')
  })

  it('offers the Wild Shape counter the level it is gained', () => {
    // Level 2 is when a druid can first wild shape, so that is when the
    // tracker has to appear — a counter offered later is one the player spent
    // a level unable to tick.
    const c = characterAt(1, 'Druid')
    const offer = resourcesOffered(draftFor(c, 2)).find(
      (o) => o.name === 'Wild Shape',
    )
    expect(offer?.total).toBe(2)
    expect(offer?.resets).toBe('short')
  })

  it('does not offer Wild Shape before 2nd', () => {
    const c = characterAt(1, 'Druid')
    expect(
      resourcesOffered(draftFor(c, 1)).find((o) => o.name === 'Wild Shape'),
    ).toBe(undefined)
  })

  it('puts the counter on the sheet when accepted', () => {
    const c = characterAt(1, 'Druid')
    const draft = draftFor(c, 2, { subclassName: 'Circle of the Moon' })
    const after = applyLevelUp(c, {
      ...draft,
      resources: { 'Wild Shape': { total: 2, resets: 'short' } },
    })
    const row = after.resources.find((r) => r.name === 'Wild Shape')
    expect(row?.total).toBe(2)
    expect(row?.used).toBe(0)
  })

  it('leaves the count alone at 20, where it becomes unlimited', () => {
    // Archdruid makes Wild Shape unlimited, which `total` cannot express — so
    // it stays prose rather than becoming a made-up number, exactly as the
    // Barbarian's Rage does.
    const c = {
      ...characterAt(19, 'Druid'),
      subclass: 'Circle of the Moon',
      resources: [
        { name: 'Wild Shape', used: 1, total: 2, resets: 'short' as const },
      ],
    }
    const after = applyLevelUp(c, draftFor(c, 20))
    const row = after.resources.find((r) => r.name === 'Wild Shape')
    expect(row?.total).toBe(2)
    expect(row?.used).toBe(1)
    expect(after.features.map((f) => f.name)).toContain('Archdruid')
  })

  it('grants a circle nothing the tables do not know', () => {
    const c = { ...characterAt(1, 'Druid'), subclass: '' }
    const after = applyLevelUp(
      c,
      draftFor(c, 2, { subclassName: 'Circle of the Screaming Moon' }),
    )
    expect(after.subclass).toBe('Circle of the Screaming Moon')
    expect(after.features.map((f) => f.name)).not.toContain('Circle Forms')
  })
})

describe('sorcerous origins', () => {
  /**
   * A sorcerer picks at level 1, so unlike a Battle Master the archetype is
   * already on the sheet before any level-up happens. These cover the levels
   * where an origin's later features arrive, and the class-level counter that
   * was prose until this pass.
   */
  const sorc = (level: number, subclass?: string): Character => ({
    ...characterAt(level, 'Sorcerer'),
    ...(subclass ? { subclass } : {}),
  })

  it('grants a Draconic Bloodline its later features', () => {
    const c = sorc(5, 'Draconic Bloodline')
    const after = applyLevelUp(c, draftFor(c, 6))
    expect(after.features.map((f) => f.name)).toContain('Elemental Affinity')
  })

  it('keeps granting them at 14 and 18', () => {
    const at13 = sorc(13, 'Draconic Bloodline')
    expect(
      applyLevelUp(at13, draftFor(at13, 14)).features.map((f) => f.name),
    ).toContain('Dragon Wings')
    const at17 = sorc(17, 'Draconic Bloodline')
    expect(
      applyLevelUp(at17, draftFor(at17, 18)).features.map((f) => f.name),
    ).toContain('Draconic Presence')
  })

  it('grants a Wild Magic sorcerer its own line', () => {
    const c = sorc(13, 'Wild Magic')
    const after = applyLevelUp(c, draftFor(c, 14))
    expect(after.features.map((f) => f.name)).toContain('Controlled Chaos')
    // And not the other origin's, which shares the level.
    expect(after.features.map((f) => f.name)).not.toContain('Dragon Wings')
  })

  it('grants nothing extra for an origin the tables do not know', () => {
    const c = sorc(5, 'Bloodline of the Ninth Hell')
    const after = applyLevelUp(c, draftFor(c, 6))
    expect(after.subclass).toBe('Bloodline of the Ninth Hell')
    expect(after.features.map((f) => f.name)).not.toContain(
      'Elemental Affinity',
    )
  })

  it('scales Metamagic with its own rows rather than prose', () => {
    // Folded into the level-3 text, the 10th and 17th options were prose the
    // wizard could never grant.
    const at9 = sorc(9, 'Wild Magic')
    expect(
      applyLevelUp(at9, draftFor(at9, 10)).features.map((f) => f.name),
    ).toContain('Metamagic (3rd option)')
    const at16 = sorc(16, 'Wild Magic')
    expect(
      applyLevelUp(at16, draftFor(at16, 17)).features.map((f) => f.name),
    ).toContain('Metamagic (4th option)')
  })

  it('offers Sorcery Points as a counter on the level-up that grants it', () => {
    // The class is built around spending these and the sheet had nothing to
    // tick. `total` ships as the value at the granting level; the text tells
    // the player to raise it, because no static table can track their level.
    const c = sorc(1, 'Wild Magic')
    const offer = resourcesOffered(draftFor(c, 2)).find(
      (o) => o.name === 'Sorcery Points',
    )
    expect(offer).toBeDefined()
    expect(offer?.total).toBe(2)
    expect(offer?.resets).toBe('long')
  })

  it('lands the counter on the sheet when accepted', () => {
    const c = sorc(1, 'Wild Magic')
    const draft = draftFor(c, 2)
    const after = applyLevelUp(c, {
      ...draft,
      resources: Object.fromEntries(
        resourcesOffered(draft).map((o) => [
          o.name,
          o.resets ? { total: o.total, resets: o.resets } : { total: o.total },
        ]),
      ),
    })
    const points = after.resources.find((r) => r.name === 'Sorcery Points')
    expect(points?.total).toBe(2)
    expect(points?.used).toBe(0)
  })

  it('never lowers a total the player raised themselves', () => {
    // The whole reason the counter ships a suggestion rather than a formula: a
    // 9th-level sorcerer sets 9, and no later level-up may walk it back.
    const c: Character = {
      ...sorc(9, 'Wild Magic'),
      resources: [
        { name: 'Sorcery Points', used: 3, total: 9, resets: 'long' },
      ],
    }
    const after = applyLevelUp(c, draftFor(c, 10))
    const points = after.resources.find((r) => r.name === 'Sorcery Points')
    expect(points?.total).toBe(9)
    expect(points?.used).toBe(3)
  })
})

describe('ranger archetype features', () => {
  const ranger = (level: number, subclass = ''): Character => ({
    ...characterAt(level, 'Ranger'),
    subclass,
  })

  it('grants the archetype its features when it is chosen', () => {
    const c = ranger(2)
    const after = applyLevelUp(c, draftFor(c, 3, { subclassName: 'Hunter' }))
    expect(after.subclass).toBe('Hunter')
    expect(after.features.map((f) => f.name)).toContain('Hunter’s Prey')
  })

  it('keeps granting them at later levels', () => {
    const c = ranger(6, 'Beast Master')
    const after = applyLevelUp(c, draftFor(c, 7))
    expect(after.features.map((f) => f.name)).toContain('Exceptional Training')
  })

  it('distinguishes the two archetypes at the same level', () => {
    // Subtracting the class-only list is what makes this about the archetype
    // rather than about the Ranger's own level-3 rows.
    const c = ranger(2)
    const kit = kitFor('Ranger')
    const classOnly = featuresGained(c, 2, 3, kit).map((f) => f.name)
    const at3 = (name: string) =>
      featuresGained(c, 2, 3, kit, name)
        .map((f) => f.name)
        .filter((n) => !classOnly.includes(n))
    expect(at3('Hunter')).toEqual(['Hunter’s Prey'])
    expect(at3('Beast Master')).toEqual(['Ranger’s Companion'])
  })

  it('grants nothing extra for an archetype the tables do not know', () => {
    const c = ranger(2)
    const after = applyLevelUp(
      c,
      draftFor(c, 3, { subclassName: 'Conclave of the Long Road' }),
    )
    expect(after.subclass).toBe('Conclave of the Long Road')
    // The class's own level-3 rows still land; homebrew just adds nothing.
    const names = after.features.map((f) => f.name)
    expect(names).toContain('Ranger Archetype')
    expect(names).toContain('Primeval Awareness')
  })

  it('poses one Hunter pick at each of the four levels', () => {
    // A 2 -> 15 run crosses all four at once, each a distinct id — they carry
    // the level precisely so they stay unique in one global keyspace.
    const c = ranger(2)
    const picks = levelUpPicks(
      draftFor(c, 15, { subclassName: 'Hunter' }),
    ).filter((p) => p.pick.id.startsWith('hunter-'))
    expect(picks.map((p) => p.pick.id)).toEqual([
      'hunter-3-prey',
      'hunter-7-tactics',
      'hunter-11-multiattack',
      'hunter-15-defense',
    ])
    // Each attributed to the feature posing it, which is what the step shows
    // above the chips.
    expect(picks.map((p) => p.owner)).toEqual([
      'Hunter’s Prey',
      'Defensive Tactics',
      'Multiattack',
      'Superior Hunter’s Defense',
    ])
  })

  it('greys nothing between the Hunter’s menus, because they are disjoint', () => {
    // The inverse of the Battle Master and Four Elements cases, and the whole
    // reason the Hunter needs neither a shared label nor per-level ones for
    // correctness. `grantedAlreadyAt`'s sibling clause matches the raw option
    // string across every `feature` pick crossed in the same level-up,
    // ignoring `featureLabel` entirely — so an option shared between two of
    // these lists would start greying out. None is shared, and this proves it
    // end to end rather than by inspecting the data.
    const c = ranger(2)
    const base = draftFor(c, 15, { subclassName: 'Hunter' })
    const at = (id: string) =>
      levelUpPicks(base).find((p) => p.pick.id === id)!.pick
    const draft: LevelUpDraft = {
      ...base,
      picks: {
        'hunter-3-prey': ['Colossus Slayer'],
        'hunter-7-tactics': ['Steel Will'],
        'hunter-11-multiattack': ['Volley'],
      },
    }
    const greyed = grantedAlreadyAt(c, draft, at('hunter-15-defense'))
    for (const option of at('hunter-15-defense').options) {
      expect(
        greyed.has(option),
        `${option} greyed with nothing to grey it`,
      ).toBe(false)
    }
  })

  it('writes the chosen option under the book’s own feature name', () => {
    // `featureLabel` prefixes the row, so the sheet reads "Hunter's Prey:
    // Colossus Slayer" — and the labels differ per level because those are
    // four different feature names, not because the totem rule forces it. The
    // Rogue and the Monk each have an Evasion of their own; the prefix is what
    // keeps this one distinct.
    const c = ranger(2)
    const base = draftFor(c, 3, { subclassName: 'Hunter' })
    const after = applyLevelUp(c, {
      ...base,
      picks: { 'hunter-3-prey': ['Colossus Slayer'] },
    })
    const row = after.features.find((f) => f.name.startsWith('Hunter’s Prey:'))
    expect(row?.name).toBe('Hunter’s Prey: Colossus Slayer')
    // And the rules text rides along from `featureText`, not from nowhere.
    expect(row?.text).toBeTruthy()
  })

  it('grants no always-prepared spells at any archetype level', () => {
    // A Ranger *does* cast, so unlike the Monk case nothing structural stops a
    // table being authored here — which is exactly why this is asserted from
    // the level-up side too. The PHB gives Hunter and Beast Master no bonus
    // spells; a table invented from a Xanathar's conclave would hand the
    // character free always-prepared spells and every other test would pass.
    const c = ranger(2)
    const at3 = applyLevelUp(c, draftFor(c, 3, { subclassName: 'Hunter' }))
    expect(at3.spells.filter((sp) => sp.alwaysPrepared)).toEqual([])
    expect(
      levelUpPlan(c, draftFor(c, 3, { subclassName: 'Beast Master' }))
        .spellsGranted,
    ).toEqual([])
    // And nothing arrives on a later level-up either, which is where
    // `alwaysPreparedGained` would deliver a second and third row.
    const at5 = applyLevelUp(at3, draftFor(at3, 5))
    expect(at5.spells.filter((sp) => sp.alwaysPrepared)).toEqual([])
  })

  it('offers no counter at any level a ranger reaches', () => {
    // The class has none and neither archetype adds one — see the note in
    // subclasses.test.ts for why that is correct rather than an oversight.
    const c = ranger(1)
    expect(
      resourcesOffered(draftFor(c, 20, { subclassName: 'Hunter' })),
    ).toEqual([])
  })
})

describe('warlock patrons and pacts', () => {
  const warlock = (level: number, subclass?: string): Character => ({
    ...characterAt(level, 'Warlock'),
    ...(subclass ? { subclass } : {}),
  })

  const named = (c: Character, to: number, subclassName?: string) =>
    featuresGained(
      c,
      c.level,
      to,
      kitFor('Warlock'),
      subclassName ?? c.subclass,
    ).map((f) => f.name)

  it('brings a patron feature at each of 6, 10 and 14', () => {
    // A warlock picks at 1st, so unlike every 3rd-level archetype the patron
    // is already on the sheet by the time any level-up runs.
    const c = warlock(5, 'The Fiend')
    expect(named(c, 6)).toContain('Dark One’s Own Luck')
    expect(named(warlock(9, 'The Fiend'), 10)).toContain('Fiendish Resilience')
    expect(named(warlock(13, 'The Fiend'), 14)).toContain('Hurl Through Hell')
  })

  it('offers the pact boon as a real choice at 3rd', () => {
    // Prose until this pass, though the answer is a permanent feature row the
    // sheet has always had somewhere to put.
    const c = warlock(2, 'The Fiend')
    const picks = levelUpPicks(draftFor(c, 3))
    const boon = picks.find((p) => p.pick.id === 'warlock-3-pact-boon')
    expect(boon).toBeDefined()
    expect(boon?.pick.kind).toBe('feature')
    expect(boon?.pick.count).toBe(1)
    expect(boon?.pick.open).toBeFalsy()
    // Three, not the five one popular source lists: Pact of the Talisman is
    // Tasha's and the Star Chain is Unearthed Arcana.
    expect(boon?.pick.options).toEqual([
      'Pact of the Chain',
      'Pact of the Blade',
      'Pact of the Tome',
    ])
    for (const option of boon!.pick.options) {
      expect(boon?.pick.featureText?.[option], option).toBeTruthy()
    }
  })

  it('writes the chosen boon to the sheet under its own label', () => {
    const c = warlock(2, 'The Fiend')
    const draft = draftFor(c, 3)
    const after = applyLevelUp(c, {
      ...draft,
      picks: { ...draft.picks, 'warlock-3-pact-boon': ['Pact of the Blade'] },
    })
    expect(after.features.map((f) => f.name)).toContain(
      'Pact Boon: Pact of the Blade',
    )
  })

  it('offers Mystic Arcanum as a counter on the level-up that grants it', () => {
    // The class had no counter at any level while Mystic Arcanum, Eldritch
    // Master and every pact told the player to spend something the sheet had
    // never heard of.
    const c = warlock(10, 'The Fiend')
    const offer = resourcesOffered(draftFor(c, 11)).find((o) =>
      o.name.startsWith('Mystic Arcanum'),
    )
    expect(offer?.total).toBe(1)
    // The load-bearing half, and the easy one to get backwards: the arcanum
    // refreshes by the day. Ki is `'short'` in the same table, and copying it
    // would promise a 9th-level spell back every hour.
    expect(offer?.resets).toBe('long')
    expect(offer?.from).toBeUndefined()
  })

  it('never raises the arcanum counter at 13, 15 or 17', () => {
    // The four arcana are *independent* once-per-long-rest castings, not a
    // pool of four — so the later ones are their own feature rows and must not
    // grow the 6th-level counter. A `total` climbing to 4 would let the player
    // spend four castings of their 9th-level spell.
    const c: Character = {
      ...warlock(12, 'The Fiend'),
      resources: [
        { name: 'Mystic Arcanum (6th)', used: 0, total: 1, resets: 'long' },
      ],
    }
    for (const to of [13, 15, 17]) {
      expect(
        resourcesOffered(draftFor({ ...c, level: to - 1 }, to)).some((o) =>
          o.name.startsWith('Mystic Arcanum'),
        ),
        `raised at ${to}`,
      ).toBe(false)
    }
  })

  it('gives each later arcanum its own feature row', () => {
    // Separate rows rather than prose folded into the level-11 text, per the
    // standing rule — de-dupe is keyed on `level:name`, so an upgrade at a new
    // level is a new row.
    expect(named(warlock(12, 'The Fiend'), 13)).toContain(
      'Mystic Arcanum (7th level)',
    )
    expect(named(warlock(14, 'The Fiend'), 15)).toContain(
      'Mystic Arcanum (8th level)',
    )
    expect(named(warlock(16, 'The Fiend'), 17)).toContain(
      'Mystic Arcanum (9th level)',
    )
  })

  it('never hands a patron spell over as always prepared', () => {
    // The level-up half of the mechanism decision. `alwaysPreparedGained`
    // reads `SubclassInfo.spells`, which no patron has — their lists live in
    // `expandedSpells`, which nothing on this path reads at all. A warlock
    // levelling past every row of the Fiend's table gains none of it for free.
    for (const to of [3, 5, 7, 9]) {
      const c = warlock(to - 1, 'The Fiend')
      const plan = levelUpPlan(c, draftFor(c, to))
      expect(plan.alwaysPreparedGained, `at ${to}`).toEqual([])
      expect(plan.spellsGranted, `at ${to}`).toEqual([])
    }
  })
})
