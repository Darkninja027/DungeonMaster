import { describe, expect, it } from 'vitest'
import { PHB_CLASSES } from './classes'
import { SRD_TABLES } from './tables'
import type { ClassInfo } from './classes'
import {
  canAdvance,
  completedThrough,
  draftClassInfo,
  draftPickLists,
  emptyDraft,
  flexibleAsiComplete,
  draftOwnedPickLists,
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
  it('starts blank with the class list attached as kits', () => {
    const draft = emptyDraft(PHB_CLASSES)
    expect(draft.name).toBe('')
    expect(draft.raceName).toBe('')
    expect(draft.kits.map((k) => k.name)).toEqual(
      PHB_CLASSES.map((c) => c.name),
    )
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
    const draft = { ...emptyDraft(SRD_TABLES), className: 'Cleric' }
    expect(draftPickLists(draft).map((p) => p.id)).toContain('cleric-skills')
  })

  it('adds picks nested inside a chosen equipment option', () => {
    const base = { ...emptyDraft(SRD_TABLES), className: 'Barbarian' }
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
      ...emptyDraft(SRD_TABLES),
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
    const draft = { ...emptyDraft(SRD_TABLES), className: 'Fighter' }
    expect(stepsFor(draft)).not.toContain('spells')
  })

  it('includes the spells step for a caster', () => {
    const draft = { ...emptyDraft(SRD_TABLES), className: 'Wizard' }
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
      ...emptyDraft(SRD_TABLES),
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
      ...emptyDraft(SRD_TABLES),
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
    const base = { ...emptyDraft(SRD_TABLES), className: 'Wizard' }
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

describe('grantedSkills across pick lists', () => {
  const vhSkilled = (picks: Record<string, Array<string>>) => ({
    ...emptyDraft(SRD_TABLES),
    raceName: 'Variant Human',
    className: 'Fighter',
    backgroundName: 'Soldier',
    featName: 'Skilled',
    picks,
  })

  it('without a pick id, reports only skills granted outright', () => {
    // The step's "Already yours" line means handed to you, not just chosen.
    const draft = vhSkilled({ 'variant-human-skill': ['perception'] })
    const granted = grantedSkills(draft)
    expect(granted.has('athletics')).toBe(true) // Soldier
    expect(granted.has('perception')).toBe(false) // merely picked
  })

  it('with a pick id, a skill taken in another list is off the table', () => {
    // Two lists offering the same skill let the player spend two picks on one
    // proficiency; mergeList deduped them at commit and the choice vanished.
    const draft = vhSkilled({ 'variant-human-skill': ['perception'] })
    expect(grantedSkills(draft, 'skilled-skills').has('perception')).toBe(true)
  })

  it('never greys out a pick\u2019s own choices', () => {
    // They are the chips being toggled; disabling one makes it unclickable.
    const draft = vhSkilled({ 'skilled-skills': ['stealth'] })
    expect(grantedSkills(draft, 'skilled-skills').has('stealth')).toBe(false)
    expect(grantedSkills(draft, 'variant-human-skill').has('stealth')).toBe(
      true,
    )
  })

  it('counts a skill typed by name into a skillOrTool pick', () => {
    const draft = vhSkilled({ 'skilled-skills': ['Animal Handling'] })
    expect(
      grantedSkills(draft, 'variant-human-skill').has('animal-handling'),
    ).toBe(true)
  })

  it('ignores tools in a skillOrTool pick', () => {
    // A tool is not a skill, so it must not grey out anything.
    const draft = vhSkilled({ 'skilled-skills': ['Smith\u2019s tools'] })
    const granted = grantedSkills(draft, 'variant-human-skill')
    expect([...granted.keys()]).not.toContain('Smith\u2019s tools')
  })
})

describe('pick ownership', () => {
  const vhSkilled = (picks: Record<string, Array<string>> = {}) => ({
    ...emptyDraft(SRD_TABLES),
    raceName: 'Variant Human',
    className: 'Fighter',
    backgroundName: 'Soldier',
    featName: 'Skilled',
    picks,
  })

  it('names the race, background, feat and class that own each pick', () => {
    const owners = new Map(
      draftOwnedPickLists(vhSkilled()).map((o) => [o.pick.id, o.owner]),
    )
    expect(owners.get('variant-human-skill')).toBe('Variant Human')
    expect(owners.get('soldier-gaming-set')).toBe('Soldier')
    expect(owners.get('skilled-skills')).toBe('Skilled')
    expect(owners.get('fighter-skills')).toBe('Fighter')
  })

  it('offers the same picks as draftPickLists, in the same order', () => {
    // The two must not drift: one is the other with the owners dropped.
    const draft = vhSkilled()
    expect(draftOwnedPickLists(draft).map((o) => o.pick.id)).toEqual(
      draftPickLists(draft).map((p) => p.id),
    )
  })

  it('blames the feat by name, not the other pick\u2019s prompt', () => {
    // The bug this pins: the source was `pick.label`, so a skill taken with
    // Skilled greyed out as "Skill proficiency" — another pick's wording,
    // which tells the player nothing about where their choice went.
    const draft = vhSkilled({ 'skilled-skills': ['stealth'] })
    expect(grantedSkills(draft, 'variant-human-skill').get('stealth')).toBe(
      'Skilled',
    )
  })

  it('blames the race for the race\u2019s own free skill', () => {
    const draft = vhSkilled({ 'variant-human-skill': ['perception'] })
    expect(grantedSkills(draft, 'skilled-skills').get('perception')).toBe(
      'Variant Human',
    )
  })

  it('still blames a background for what it grants outright', () => {
    const draft = vhSkilled()
    expect(grantedSkills(draft, 'skilled-skills').get('athletics')).toBe(
      'Soldier',
    )
  })
})
