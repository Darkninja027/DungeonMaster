import { describe, expect, it } from 'vitest'
import { PHB_CLASSES } from './classes'
import type { ClassInfo } from './classes'
import {
  canAdvance,
  completedThrough,
  draftClassInfo,
  draftPickLists,
  emptyDraft,
  flexibleAsiComplete,
  grantedSkills,
  nameProblem,
  pickSatisfied,
  racialAsi,
  stepsFor,
} from './characterDraft'
import type { CharacterDraft } from './characterDraft'
import { emptyAbilityDraft } from './abilityMethods'
import type { Ability } from './character'

function manual(
  draft: CharacterDraft,
  direct: Record<Ability, number> = {
    str: 12,
    dex: 12,
    con: 12,
    int: 12,
    wis: 12,
    cha: 12,
  },
): CharacterDraft {
  return {
    ...draft,
    abilities: { ...emptyAbilityDraft(), method: 'manual', direct },
  }
}

describe('emptyDraft', () => {
  it('starts blank with the world class list attached', () => {
    const draft = emptyDraft(PHB_CLASSES)
    expect(draft.name).toBe('')
    expect(draft.raceName).toBe('')
    expect(draft.classes).toBe(PHB_CLASSES)
    expect(draft.picks).toEqual({})
    expect(draft.equipment).toEqual({})
  })
})

describe('nameProblem', () => {
  it('rejects a blank name', () => {
    expect(nameProblem('')).toBeTruthy()
    expect(nameProblem('   ')).toBeTruthy()
  })

  it('rejects filename-hostile characters', () => {
    // The character becomes Characters/<Title>.md, so the name is a filename.
    for (const bad of [
      'a/b',
      'a\\b',
      'a:b',
      'a*b',
      'a?b',
      'a"b',
      'a<b',
      'a|b',
    ]) {
      expect(nameProblem(bad), bad).toBeTruthy()
    }
  })

  it('rejects a leading dot', () => {
    expect(nameProblem('.hidden')).toBeTruthy()
  })

  it('accepts ordinary names', () => {
    expect(nameProblem('Thrain Stonebrook')).toBeNull()
    expect(nameProblem("Kk'tk the Third")).toBeNull()
  })
})

describe('draftClassInfo', () => {
  it('finds a class case-insensitively', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), className: 'cleric' }
    expect(draftClassInfo(draft)?.hitDie).toBe(8)
  })

  it('returns undefined for homebrew not in the world list', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), className: 'Blood Hunter' }
    expect(draftClassInfo(draft)).toBeUndefined()
  })

  it('finds a homebrew class that IS in the world list', () => {
    const homebrew: ClassInfo = {
      id: 'blood-hunter',
      name: 'Blood Hunter',
      hitDie: 10,
      subclassLabel: 'Order',
      subclasses: [],
    }
    const draft = {
      ...emptyDraft([...PHB_CLASSES, homebrew]),
      className: 'Blood Hunter',
    }
    expect(draftClassInfo(draft)?.hitDie).toBe(10)
  })
})

describe('racialAsi', () => {
  it('merges race and subrace increases', () => {
    const draft = {
      ...emptyDraft(PHB_CLASSES),
      raceName: 'Dwarf',
      subraceName: 'Hill Dwarf',
    }
    expect(racialAsi(draft)).toEqual({ con: 2, wis: 1 })
  })

  it('adds flexible picks on top', () => {
    const draft = {
      ...emptyDraft(PHB_CLASSES),
      raceName: 'Half-Elf',
      flexibleAsi: { dex: 1, con: 1 },
    }
    expect(racialAsi(draft)).toEqual({ cha: 2, dex: 1, con: 1 })
  })

  it('is empty for an unknown race', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), raceName: 'Thri-kreen' }
    expect(racialAsi(draft)).toEqual({})
  })
})

describe('flexibleAsiComplete', () => {
  it('is satisfied when a race has no flexible increases', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), raceName: 'Dwarf' }
    expect(flexibleAsiComplete(draft)).toBe(true)
  })

  it('requires both +1s to be placed', () => {
    const base = { ...emptyDraft(PHB_CLASSES), raceName: 'Half-Elf' }
    expect(flexibleAsiComplete(base)).toBe(false)
    expect(flexibleAsiComplete({ ...base, flexibleAsi: { dex: 1 } })).toBe(
      false,
    )
    expect(
      flexibleAsiComplete({ ...base, flexibleAsi: { dex: 1, con: 1 } }),
    ).toBe(true)
  })
})

describe('grantedSkills', () => {
  it('reports which source granted each skill', () => {
    const draft = {
      ...emptyDraft(PHB_CLASSES),
      raceName: 'Elf',
      backgroundName: 'Acolyte',
    }
    const granted = grantedSkills(draft)
    expect(granted.get('perception')).toBe('Elf')
    expect(granted.get('insight')).toBe('Acolyte')
    expect(granted.get('religion')).toBe('Acolyte')
  })

  it('is empty for a homebrew race and background', () => {
    const draft = {
      ...emptyDraft(PHB_CLASSES),
      raceName: 'Thri-kreen',
      backgroundName: 'Wandering Cook',
    }
    expect(grantedSkills(draft).size).toBe(0)
  })
})

describe('draftPickLists', () => {
  it('includes the class skill choice', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), className: 'Cleric' }
    expect(draftPickLists(draft).map((p) => p.id)).toContain('cleric-skills')
  })

  it('adds picks nested inside a chosen equipment option', () => {
    const base = { ...emptyDraft(PHB_CLASSES), className: 'Barbarian' }
    // Option 0 is a fixed greataxe — no nested pick.
    const fixed = { ...base, equipment: { 'barbarian-weapon-1': 0 } }
    expect(draftPickLists(fixed).map((p) => p.id)).not.toContain(
      'barbarian-martial-choice',
    )
    // Option 1 is "any martial melee weapon", which does add one.
    const choice = { ...base, equipment: { 'barbarian-weapon-1': 1 } }
    expect(draftPickLists(choice).map((p) => p.id)).toContain(
      'barbarian-martial-choice',
    )
  })
})

describe('pickSatisfied', () => {
  it('requires exactly the requested count', () => {
    const draft = {
      ...emptyDraft(PHB_CLASSES),
      className: 'Cleric',
      picks: { 'cleric-skills': ['medicine'] },
    }
    const pick = draftPickLists(draft).find((p) => p.id === 'cleric-skills')!
    expect(pickSatisfied(draft, pick)).toBe(false)
    const done = {
      ...draft,
      picks: { 'cleric-skills': ['medicine', 'religion'] },
    }
    expect(pickSatisfied(done, pick)).toBe(true)
  })
})

describe('stepsFor', () => {
  it('omits the spells step for a non-caster', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), className: 'Fighter' }
    expect(stepsFor(draft)).not.toContain('spells')
  })

  it('includes the spells step for a caster', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), className: 'Wizard' }
    expect(stepsFor(draft)).toContain('spells')
  })

  it('omits it for a homebrew class with no kit', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), className: 'Blood Hunter' }
    expect(stepsFor(draft)).not.toContain('spells')
  })

  it('always ends at review', () => {
    expect(stepsFor(emptyDraft(PHB_CLASSES)).at(-1)).toBe('review')
  })
})

describe('canAdvance', () => {
  it('gates the name step on a legal filename', () => {
    const draft = emptyDraft(PHB_CLASSES)
    expect(canAdvance(draft, 'name')).toBe(false)
    expect(canAdvance({ ...draft, name: 'Mara' }, 'name')).toBe(true)
    expect(canAdvance({ ...draft, name: 'Ma/ra' }, 'name')).toBe(false)
  })

  it('requires a subrace when the race has them', () => {
    const dwarf = { ...emptyDraft(PHB_CLASSES), raceName: 'Dwarf' }
    expect(canAdvance(dwarf, 'race')).toBe(false)
    expect(canAdvance({ ...dwarf, subraceName: 'Hill Dwarf' }, 'race')).toBe(
      true,
    )
  })

  it('does not require a subrace for a race without them', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), raceName: 'Half-Orc' }
    expect(canAdvance(draft, 'race')).toBe(true)
  })

  it('lets a homebrew race through with just a name', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), raceName: 'Thri-kreen' }
    expect(canAdvance(draft, 'race')).toBe(true)
  })

  it('blocks the race step until flexible increases are placed', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), raceName: 'Half-Elf' }
    expect(canAdvance(draft, 'race')).toBe(false)
    expect(
      canAdvance({ ...draft, flexibleAsi: { dex: 1, con: 1 } }, 'race'),
    ).toBe(true)
  })

  it('accepts any non-empty class name', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), className: 'Blood Hunter' }
    expect(canAdvance(draft, 'class')).toBe(true)
  })

  it('gates skills on every non-weapon pick being satisfied', () => {
    const base = manual({
      ...emptyDraft(PHB_CLASSES),
      className: 'Cleric',
      backgroundName: 'Acolyte',
      raceName: 'Half-Orc',
    })
    expect(canAdvance(base, 'skills')).toBe(false)
    const filled = {
      ...base,
      picks: {
        'cleric-skills': ['medicine', 'religion'],
        'acolyte-languages': ['Dwarvish', 'Celestial'],
      },
    }
    expect(canAdvance(filled, 'skills')).toBe(true)
  })

  it('gates equipment on every choice and weapon pick', () => {
    const base = manual({
      ...emptyDraft(PHB_CLASSES),
      className: 'Barbarian',
    })
    expect(canAdvance(base, 'equipment')).toBe(false)
    const chosen = {
      ...base,
      equipment: { 'barbarian-weapon-1': 0, 'barbarian-weapon-2': 0 },
    }
    expect(canAdvance(chosen, 'equipment')).toBe(true)
    // Choosing the "any martial weapon" branch adds a pick that must be filled.
    const needsPick = {
      ...base,
      equipment: { 'barbarian-weapon-1': 1, 'barbarian-weapon-2': 0 },
    }
    expect(canAdvance(needsPick, 'equipment')).toBe(false)
    const picked = {
      ...needsPick,
      picks: { 'barbarian-martial-choice': ['Greatsword'] },
    }
    expect(canAdvance(picked, 'equipment')).toBe(true)
  })

  it('a homebrew class has no equipment to gate on', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), className: 'Blood Hunter' }
    expect(canAdvance(draft, 'equipment')).toBe(true)
  })

  it('gates spells on the exact known counts', () => {
    const base = { ...emptyDraft(PHB_CLASSES), className: 'Wizard' }
    expect(canAdvance(base, 'spells')).toBe(false)
    const filled = {
      ...base,
      cantrips: ['Fire Bolt', 'Mage Hand', 'Prestidigitation'],
      spells: [
        'Magic Missile',
        'Shield',
        'Sleep',
        'Burning Hands',
        'Detect Magic',
        'Mage Armor',
      ],
    }
    expect(canAdvance(filled, 'spells')).toBe(true)
  })

  it('review is always reachable', () => {
    expect(canAdvance(emptyDraft(PHB_CLASSES), 'review')).toBe(true)
  })
})

describe('completedThrough', () => {
  it('is false while an earlier step is unsatisfied', () => {
    const draft = { ...emptyDraft(PHB_CLASSES), raceName: 'Half-Orc' }
    // Race is fine, but the name step before it is not.
    expect(completedThrough(draft, 'race')).toBe(false)
  })

  it('is true once every step up to that point is satisfied', () => {
    const draft = manual({
      ...emptyDraft(PHB_CLASSES),
      name: 'Grosh',
      raceName: 'Half-Orc',
      className: 'Barbarian',
    })
    expect(completedThrough(draft, 'class')).toBe(true)
  })
})
