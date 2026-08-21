import { describe, expect, it } from 'vitest'
import { PHB_CLASSES } from './classes'
import { SRD_TABLES } from './tables'
import type { ClassInfo } from './classes'
import {
  canAdvance,
  completedThrough,
  draftClassInfo,
  draftPickLists,
  eligibleExpertise,
  emptyDraft,
  assignFlexibleSlot,
  chosenFlexibleMode,
  flexibleAsiComplete,
  flexibleSlotAbilities,
  draftOwnedPickLists,
  refitFlexibleAsi,
  grantedSkills,
  nameProblem,
  pickSatisfied,
  racialAsi,
  stepsFor,
} from './characterDraft'
import type { CharacterDraft } from './characterDraft'
import { emptyAbilityDraft } from './abilityMethods'
import type { Ability } from './character'
import type { RaceInfo } from './srd'

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

  it('gates a rogue on the expertise pick as well as the four skills', () => {
    // Expertise is a pick like any other. A rogue allowed past with it unmade
    // would commit a sheet whose Expertise feature text describes a choice
    // nobody made.
    const base = manual({
      ...emptyDraft(SRD_TABLES),
      className: 'Rogue',
      raceName: 'Half-Orc',
    })
    const skillsOnly = {
      ...base,
      picks: {
        'rogue-skills': ['stealth', 'perception', 'deception', 'insight'],
      },
    }
    expect(canAdvance(skillsOnly, 'skills')).toBe(false)
    const filled = {
      ...skillsOnly,
      picks: {
        ...skillsOnly.picks,
        'rogue-expertise': ['stealth', 'perception'],
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

  it('says what kind of thing owns each pick', () => {
    // The name alone can't be classified after the fact \u2014 "Skilled" is a feat
    // and "Soldier" is a background, and neither string says so. This is what
    // lets the skills step print "From the Skilled feat" rather than a bare
    // name that reads like it could be anything.
    const kinds = new Map(
      draftOwnedPickLists(vhSkilled()).map((o) => [o.pick.id, o.ownerKind]),
    )
    expect(kinds.get('skilled-skills')).toBe('feat')
    expect(kinds.get('variant-human-skill')).toBe('race')
    expect(kinds.get('soldier-gaming-set')).toBe('background')
    expect(kinds.get('fighter-skills')).toBe('class')
  })

  it('calls a subrace\u2019s own pick a race pick', () => {
    // Collapsed on purpose: "Hill Dwarf race" is what a player would call it,
    // and a separate 'subrace' kind buys nothing they'd recognise.
    const draft = {
      ...emptyDraft(SRD_TABLES),
      raceName: 'Elf',
      subraceName: 'High Elf',
    }
    const owned = draftOwnedPickLists(draft).find(
      (o) => o.pick.id === 'high-elf-language',
    )
    expect(owned?.ownerKind).toBe('race')
    expect(owned?.owner).toBe('High Elf')
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

  it('offers a rogue’s expertise pick after the skills it doubles', () => {
    // `kit.grant.picks` is collected before `kit.skillChoices` is pushed, so in
    // source order the rogue is asked which skills to double before being asked
    // which skills it has.
    const ids = draftOwnedPickLists({
      ...emptyDraft(SRD_TABLES),
      className: 'Rogue',
    }).map((o) => o.pick.id)
    expect(ids.indexOf('rogue-expertise')).toBeGreaterThan(
      ids.indexOf('rogue-skills'),
    )
  })

  it('keeps expertise last for a feat too, not just a class', () => {
    // The ordering is a property of the kind, so it doesn't depend on how a
    // feat's `picks` array happens to be authored.
    const ids = draftOwnedPickLists({
      ...emptyDraft(SRD_TABLES),
      raceName: 'Variant Human',
      featName: 'Skill Expert',
    }).map((o) => o.pick.id)
    expect(ids.indexOf('skill-expert-expertise')).toBeGreaterThan(
      ids.indexOf('skill-expert-skill'),
    )
  })

  it('leaves the non-expertise order alone', () => {
    // A stable partition: everything that isn't expertise keeps the fixed
    // race / background / feat / class order `draftGrants` mirrors.
    const ids = draftOwnedPickLists(vhSkilled()).map((o) => o.pick.id)
    expect(ids).toEqual([
      'variant-human-language',
      'variant-human-skill',
      'soldier-gaming-set',
      'skilled-skills',
      'fighter-skills',
    ])
  })
})

describe('eligibleExpertise', () => {
  const rogue = (picks: Record<string, Array<string>> = {}) => ({
    ...emptyDraft(SRD_TABLES),
    className: 'Rogue',
    picks,
  })
  const expertisePick = () =>
    draftOwnedPickLists(rogue()).find((o) => o.pick.id === 'rogue-expertise')!
      .pick

  it('offers nothing before the skills are chosen', () => {
    // Empty rather than a throw: the step renders the shortfall as a hint, and
    // filling the skill picks above resolves it.
    expect(eligibleExpertise(rogue(), expertisePick())).toEqual([])
  })

  it('counts skills chosen in another pick, not just granted ones', () => {
    const draft = rogue({
      'rogue-skills': ['stealth', 'perception', 'deception', 'insight'],
    })
    expect(eligibleExpertise(draft, expertisePick()).sort()).toEqual(
      ['deception', 'insight', 'perception', 'stealth'].sort(),
    )
  })

  it('counts a skill granted outright by a background', () => {
    // Athletics and Intimidation come from Soldier, not from any pick.
    const draft = { ...rogue(), backgroundName: 'Soldier' }
    expect(eligibleExpertise(draft, expertisePick())).toContain('athletics')
    expect(eligibleExpertise(draft, expertisePick())).toContain('intimidation')
  })

  it('never widens past the pick’s authored options', () => {
    // Soldier grants Athletics and Intimidation; a rogue offering neither in
    // its own eleven would still not have them doubled here. Both happen to be
    // in the rogue list, so use a background whose grant isn't: Acolyte gives
    // Insight and Religion, and Religion is not a rogue skill.
    const draft = { ...rogue(), backgroundName: 'Acolyte' }
    const eligible = eligibleExpertise(draft, expertisePick())
    expect(eligible).toContain('insight')
    expect(eligible).not.toContain('religion')
  })

  it('does not count a skill only taken as expertise', () => {
    // Expertise doubles a proficiency; it doesn't grant one. A value chosen in
    // the expertise pick must not make itself eligible.
    const draft = rogue({ 'rogue-expertise': ['stealth'] })
    expect(eligibleExpertise(draft, expertisePick())).toEqual([])
  })
})

describe('flexible ASI modes', () => {
  /**
   * A race whose whole increase is the player's, in one of two shapes — the
   * case `{ count, amount }` could not express. Defined here rather than
   * leaning on a built-in: this suite is testing the mechanism, and it should
   * not start failing because a table changed.
   */
  const TWO_SHAPES: RaceInfo = {
    id: 'two-shapes',
    name: 'Two Shapes',
    summary: 'Chooses between +2/+1 and three +1s.',
    asi: {},
    speed: 30,
    flexibleAsi: [{ increases: [2, 1] }, { increases: [1, 1, 1] }],
    grant: {},
  }

  function modal(
    flexibleAsi: Partial<Record<Ability, number>> = {},
    flexibleAsiMode = 0,
  ): CharacterDraft {
    const base = emptyDraft()
    return {
      ...base,
      races: [...base.races, TWO_SHAPES],
      raceName: TWO_SHAPES.name,
      flexibleAsi,
      flexibleAsiMode,
    }
  }

  it('offers both shapes, and takes the first by default', () => {
    const draft = modal()
    expect(chosenFlexibleMode(draft)?.increases).toEqual([2, 1])
    expect(
      chosenFlexibleMode({ ...draft, flexibleAsiMode: 1 })?.increases,
    ).toEqual([1, 1, 1])
  })

  it('completes "+2 and +1" only on that exact spread', () => {
    expect(flexibleAsiComplete(modal({ str: 2, dex: 1 }))).toBe(true)
    expect(flexibleAsiComplete(modal({ str: 1, dex: 1 }))).toBe(false)
    // Both shapes total 3, so a sum check would have passed this. The amounts
    // are a multiset, not a budget.
    expect(flexibleAsiComplete(modal({ str: 3 }))).toBe(false)
    expect(flexibleAsiComplete(modal({ str: 1, dex: 1, con: 1 }))).toBe(false)
  })

  it('completes "three +1s" only on that exact spread', () => {
    const three = (asi: Partial<Record<Ability, number>>) =>
      flexibleAsiComplete(modal(asi, 1))
    expect(three({ str: 1, dex: 1, con: 1 })).toBe(true)
    expect(three({ str: 2, dex: 1 })).toBe(false)
  })

  it('falls back to the first mode when the index is out of range', () => {
    // The index is a plain number on a draft; a race swapped underneath it must
    // not leave the wizard reading past the end of the list.
    expect(chosenFlexibleMode(modal({}, 7))?.increases).toEqual([2, 1])
  })

  it('reaches the sheet as a plain racial increase', () => {
    // The race has no fixed `asi` at all, so this is the whole of it — and it
    // proves mixed sizes need nothing from `racialAsi`.
    expect(racialAsi(modal({ str: 2, con: 1 }))).toEqual({ str: 2, con: 1 })
  })

  it('keeps the abilities you chose when you switch shapes', () => {
    // Not cleared: the amounts were the mode's to dictate, the abilities were
    // the player's.
    expect(
      refitFlexibleAsi({ str: 2, dex: 1 }, { increases: [1, 1, 1] }),
    ).toEqual({ str: 1, dex: 1 })
    expect(
      refitFlexibleAsi({ str: 1, dex: 1, con: 1 }, { increases: [2, 1] }),
    ).toEqual({ str: 2, dex: 1 })
  })

  it('leaves a race with no flexible increases alone', () => {
    expect(flexibleAsiComplete({ ...emptyDraft(), raceName: 'Dwarf' })).toBe(
      true,
    )
    expect(
      chosenFlexibleMode({ ...emptyDraft(), raceName: 'Dwarf' }),
    ).toBeUndefined()
  })
})

describe('flexible ASI slots', () => {
  const MIXED = { increases: [2, 1] }
  const THREE = { increases: [1, 1, 1] }

  it('shows which ability sits in each slot', () => {
    expect(flexibleSlotAbilities({ str: 2, dex: 1 }, MIXED)).toEqual([
      'str',
      'dex',
    ])
    expect(flexibleSlotAbilities({ dex: 1, str: 2 }, MIXED)).toEqual([
      'str',
      'dex',
    ])
    expect(flexibleSlotAbilities({ str: 2 }, MIXED)).toEqual(['str', undefined])
    expect(flexibleSlotAbilities({}, MIXED)).toEqual([undefined, undefined])
  })

  it('never puts one ability in two same-sized slots', () => {
    // The draft is keyed by ability, so three +1s look alike; the slot view has
    // to hand each its own or the UI would show Str three times.
    expect(flexibleSlotAbilities({ str: 1, dex: 1 }, THREE)).toEqual([
      'str',
      'dex',
      undefined,
    ])
  })

  it('assigns an ability to a slot', () => {
    expect(assignFlexibleSlot({}, MIXED, 0, 'str')).toEqual({ str: 2 })
    expect(assignFlexibleSlot({ str: 2 }, MIXED, 1, 'dex')).toEqual({
      str: 2,
      dex: 1,
    })
  })

  it('moves an ability rather than duplicating it', () => {
    // Picking Str for the +1 when it already holds the +2 has to vacate the +2,
    // because one ability cannot be raised twice.
    expect(assignFlexibleSlot({ str: 2, dex: 1 }, MIXED, 1, 'str')).toEqual({
      str: 1,
    })
  })

  it('clears a slot', () => {
    expect(assignFlexibleSlot({ str: 2, dex: 1 }, MIXED, 0, undefined)).toEqual(
      {
        dex: 1,
      },
    )
  })

  it('round-trips through the slot view', () => {
    const placed = assignFlexibleSlot(
      assignFlexibleSlot({}, MIXED, 0, 'cha'),
      MIXED,
      1,
      'wis',
    )
    expect(placed).toEqual({ cha: 2, wis: 1 })
    expect(flexibleSlotAbilities(placed, MIXED)).toEqual(['cha', 'wis'])
  })
})
