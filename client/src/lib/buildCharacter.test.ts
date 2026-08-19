import { describe, expect, it } from 'vitest'
import {
  abilityMod,
  hitDiceArePinned,
  parseCharacter,
  serializeCharacter,
  ABILITIES,
} from './character'
import { WEAPON_STATS, featuresUpToLevel, weaponCategory } from './srd'
import type { FeatInfo } from './srd'
import { PHB_CLASSES } from './classes'
import type { ClassInfo } from './classes'
import { buildCharacter, computeAc, finalScores } from './buildCharacter'
import { emptyDraft } from './characterDraft'
import type { CharacterDraft } from './characterDraft'
import { assign, emptyAbilityDraft } from './abilityMethods'
import { parseHomebrew } from './homebrew'
import { SRD_TABLES, mergeTables } from './tables'
import type { Ability } from './character'

/** A draft with directly-set ability scores, bypassing the assignment UI. */
function withScores(
  draft: CharacterDraft,
  scores: Record<Ability, number>,
): CharacterDraft {
  return {
    ...draft,
    abilities: { ...emptyAbilityDraft(), method: 'manual', direct: scores },
  }
}

/** The Hill Dwarf Cleric / Acolyte the plan calls for, fully specified. */
function hillDwarfCleric(): CharacterDraft {
  let draft = emptyDraft(SRD_TABLES)
  draft = {
    ...draft,
    name: 'Thrain Stonebrook',
    raceName: 'Dwarf',
    subraceName: 'Hill Dwarf',
    className: 'Cleric',
    subclassName: 'Life Domain',
    backgroundName: 'Acolyte',
    alignment: 'LG',
    picks: {
      'dwarf-tools': ['Smith’s tools'],
      'acolyte-languages': ['Dwarvish', 'Celestial'],
      'cleric-skills': ['medicine', 'religion'],
    },
    equipment: {
      'cleric-weapon': 0, // mace
      'cleric-armor': 0, // scale mail
      'cleric-ranged': 0, // light crossbow
      'cleric-pack': 0, // priest's pack
    },
    cantrips: ['Sacred Flame', 'Guidance', 'Light'],
    personality: {
      trait: 'I see omens in every event.',
      ideal: 'Charity.',
      bond: 'I would die to recover a relic.',
      flaw: 'I judge others harshly.',
    },
    backstory: 'Raised in the temple beneath the mountain.',
  }
  return withScores(draft, {
    str: 13,
    dex: 10,
    con: 14,
    int: 10,
    wis: 15,
    cha: 12,
  })
}

describe('round trip', () => {
  it('survives serialize then parse unchanged', () => {
    // The house pattern from character.test.ts: one assertion guarding every
    // field mapping at once.
    const { character, body } = buildCharacter(hillDwarfCleric())
    const round = parseCharacter(serializeCharacter(character, body))
    expect(round.character).toEqual(character)
  })

  it('keeps the body prose', () => {
    const { character, body } = buildCharacter(hillDwarfCleric())
    const round = parseCharacter(serializeCharacter(character, body))
    expect(round.body).toContain('Raised in the temple beneath the mountain.')
  })
})

describe('a fully specified Hill Dwarf Cleric', () => {
  const { character } = buildCharacter(hillDwarfCleric())

  it('takes the subrace name as its race', () => {
    expect(character.race).toBe('Hill Dwarf')
  })

  it('applies race and subrace ability increases', () => {
    // Dwarf +2 CON, Hill Dwarf +1 WIS.
    expect(character.abilities.con).toBe(16)
    expect(character.abilities.wis).toBe(16)
    expect(character.abilities.str).toBe(13)
  })

  it('computes HP as hit die + CON + Dwarven Toughness', () => {
    // d8 cleric, CON 16 (+3), Hill Dwarf +1 per level.
    expect(character.hp.max).toBe(8 + 3 + 1)
    expect(character.hp.current).toBe(character.hp.max)
  })

  it('takes the dwarf speed', () => {
    expect(character.speed).toBe(25)
  })

  it('computes AC from scale mail and shield', () => {
    // Scale mail 14, DEX 10 (+0) capped at 2, shield +2.
    expect(character.ac).toBe(16)
  })

  it('takes the cleric saving throws', () => {
    expect(character.saves.sort()).toEqual(['cha', 'wis'])
  })

  it('merges skills from the class picks and the background', () => {
    expect(character.skills).toContain('medicine')
    expect(character.skills).toContain('religion')
    // Acolyte grants Insight and Religion outright.
    expect(character.skills).toContain('insight')
  })

  it('sets up spellcasting', () => {
    expect(character.spellAbility).toBe('wis')
    expect(character.spellSlots).toEqual({ 1: { total: 2, used: 0 } })
    // Preparers get mod + level.
    expect(character.preparedLimit).toBe(abilityMod(16) + 1)
    expect(character.spells.map((s) => s.name)).toContain('Sacred Flame')
    expect(character.spells.every((s) => s.level === 0)).toBe(true)
  })

  it('collects languages from race and background without duplicates', () => {
    expect(character.languages).toContain('Common')
    expect(character.languages).toContain('Dwarvish')
    expect(character.languages).toContain('Celestial')
    const lower = character.languages.map((l) => l.toLowerCase())
    expect(new Set(lower).size).toBe(lower.length)
  })

  it('carries dwarven poison resistance', () => {
    expect(character.resistances).toContain('poison')
  })

  it('records level 1 class features and the background feature', () => {
    expect(character.features.map((f) => f.name)).toContain('Spellcasting')
    expect(character.features.every((f) => f.level === 1)).toBe(true)
    expect(character.traits.map((t) => t.name)).toContain(
      'Shelter of the Faithful',
    )
    expect(character.traits.map((t) => t.name)).toContain('Darkvision')
  })

  it('fills the pack from the chosen equipment options', () => {
    const names = character.inventory.map((i) => i.text.toLowerCase())
    expect(names).toContain('mace')
    expect(names).toContain('scale mail')
    expect(names).toContain('shield')
    expect(names.some((n) => n.includes('priest'))).toBe(true)
  })

  it('gives starting coin from the background', () => {
    expect(character.currency.gp).toBe(15)
  })

  it('derives an attack for the granted mace', () => {
    const mace = character.attacks.find((a) => /mace/i.test(a.name))
    expect(mace).toBeDefined()
    // STR 13 (+1) plus proficiency +2.
    expect(mace?.bonus).toBe(3)
    expect(mace?.damage).toBe('1d6+1')
  })

  it('leaves hit dice unpinned so the sheet keeps tracking them', () => {
    expect(hitDiceArePinned(character)).toBe(false)
    expect(character.hitDice.size).toBe(8)
  })
})

describe('free text guarantee', () => {
  it('never writes an SRD id to a character field', () => {
    const { character } = buildCharacter(hillDwarfCleric())
    expect(character.race).toBe('Hill Dwarf')
    expect(character.race).not.toBe('hill-dwarf')
    expect(character.background).toBe('Acolyte')
    expect(character.class).toBe('Cleric')
    for (const field of [
      character.race,
      character.class,
      character.subclass,
      character.background,
    ]) {
      expect(typeof field).toBe('string')
      expect(field).not.toMatch(/-/)
    }
  })
})

describe('homebrew degradation', () => {
  const homebrew: ClassInfo = {
    id: 'blood-hunter',
    name: 'Blood Hunter',
    hitDie: 10,
    subclassLabel: 'Blood Hunter Order',
    subclasses: ['Order of the Ghostslayer'],
  }

  it('takes the hit die from the world list and does not throw', () => {
    let draft = emptyDraft([...PHB_CLASSES, homebrew])
    draft = {
      ...draft,
      name: 'Mara',
      className: 'Blood Hunter',
      subclassName: 'Order of the Ghostslayer',
    }
    const { character } = buildCharacter(
      withScores(draft, {
        str: 14,
        dex: 15,
        con: 13,
        int: 12,
        wis: 10,
        cha: 8,
      }),
    )
    expect(character.class).toBe('Blood Hunter')
    expect(character.subclass).toBe('Order of the Ghostslayer')
    expect(character.hitDice.size).toBe(10)
    // No SRD kit, so no saves and no features — but a perfectly valid sheet.
    expect(character.saves).toEqual([])
    expect(character.features).toEqual([])
    expect(character.hp.max).toBe(10 + abilityMod(13))
  })

  it('an unknown race passes through with no increases', () => {
    let draft = emptyDraft(SRD_TABLES)
    draft = { ...draft, name: 'Kk’tk', raceName: 'Thri-kreen' }
    const { character } = buildCharacter(
      withScores(draft, {
        str: 12,
        dex: 12,
        con: 12,
        int: 12,
        wis: 12,
        cha: 12,
      }),
    )
    expect(character.race).toBe('Thri-kreen')
    expect(character.speed).toBe(30)
    expect(character.traits).toEqual([])
    for (const ability of ABILITIES) {
      expect(character.abilities[ability]).toBe(12)
    }
  })
})

describe('totality', () => {
  it('builds a valid character from a completely empty draft', () => {
    // The property the live summary panel depends on: this runs on every
    // keystroke against a half-filled draft and must never throw.
    const { character, body } = buildCharacter(emptyDraft(SRD_TABLES))
    expect(character.level).toBe(1)
    expect(character.race).toBe('')
    expect(character.class).toBe('')
    expect(character.hp.max).toBeGreaterThan(0)
    expect(character.ac).toBeGreaterThan(0)
    expect(body).toContain('# Unnamed character')
  })

  it('survives a round trip from an empty draft', () => {
    const { character, body } = buildCharacter(emptyDraft(SRD_TABLES))
    const round = parseCharacter(serializeCharacter(character, body))
    expect(round.character).toEqual(character)
  })

  it('builds with a race chosen but nothing else', () => {
    const draft = { ...emptyDraft(SRD_TABLES), raceName: 'Elf' }
    const { character } = buildCharacter(draft)
    expect(character.race).toBe('Elf')
    expect(character.abilities.dex).toBe(12)
    expect(character.skills).toContain('perception')
  })

  it('builds with an empty class list', () => {
    const { character } = buildCharacter(emptyDraft([]))
    expect(character.hitDice.size).toBe(8)
  })
})

describe('feats at creation', () => {
  const RESILIENT: FeatInfo = {
    id: 'resilient',
    name: 'Resilient',
    summary: 'Tougher than you look.',
    asi: { con: 1 },
    grant: { saves: ['con'], skills: ['athletics'] },
  }

  const variantHuman = (featName: string, feats: Array<FeatInfo>) => {
    const base = emptyDraft({ ...SRD_TABLES, feats })
    return withScores(
      {
        ...base,
        name: 'Aldric',
        raceName: 'Variant Human',
        flexibleAsi: { str: 1, dex: 1 },
        featName,
      },
      { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
    )
  }

  it('applies a known feat’s grant and half-feat bump', () => {
    const { character } = buildCharacter(variantHuman('Resilient', [RESILIENT]))
    expect(character.feats.map((f) => f.name)).toEqual(['Resilient'])
    expect(character.saves).toContain('con')
    expect(character.skills).toContain('athletics')
    // 14 base + 1 from the half-feat; the flexible +1s went to str and dex.
    expect(character.abilities.con).toBe(15)
  })

  it('adds a feat’s speed bonus on top of the racial base', () => {
    const MOBILE: FeatInfo = {
      id: 'mobile',
      name: 'Mobile',
      summary: 'Faster than you look.',
      grant: { speedBonus: 10 },
    }
    const { character } = buildCharacter(variantHuman('Mobile', [MOBILE]))
    // Human's 30, plus the feat.
    expect(character.speed).toBe(40)
  })

  it('carries the feat’s summary onto the sheet as its description', () => {
    const { character } = buildCharacter(variantHuman('Resilient', [RESILIENT]))
    // Without this the Features tab lists the feat as "No description yet."
    expect(character.feats).toEqual([
      { name: 'Resilient', text: 'Tougher than you look.' },
    ])
  })

  it('keeps an unknown feat as a bare name and grants nothing', () => {
    const { character } = buildCharacter(
      variantHuman('Sharpshooter', [RESILIENT]),
    )
    expect(character.feats.map((f) => f.name)).toEqual(['Sharpshooter'])
    // Nothing to describe, so no text key at all rather than an empty one.
    expect(character.feats[0].text).toBeUndefined()
    expect(character.saves).not.toContain('con')
    expect(character.abilities.con).toBe(14)
  })

  it('ignores a feat name when the race does not grant one', () => {
    const base = emptyDraft({ ...SRD_TABLES, feats: [RESILIENT] })
    const { character } = buildCharacter(
      withScores(
        { ...base, name: 'Dain', raceName: 'Dwarf', featName: 'Resilient' },
        { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
      ),
    )
    expect(character.feats).toEqual([])
    expect(character.saves).not.toContain('con')
  })

  it('matches the feat name case-insensitively', () => {
    const { character } = buildCharacter(
      variantHuman('  resilient  ', [RESILIENT]),
    )
    // The typed spelling is what reaches the sheet; the grant still resolves.
    expect(character.feats.map((f) => f.name)).toEqual(['resilient'])
    expect(character.saves).toContain('con')
  })
})

describe('flexible ability increases', () => {
  it('applies Variant Human two +1s', () => {
    let draft = emptyDraft(SRD_TABLES)
    draft = {
      ...draft,
      name: 'Aldric',
      raceName: 'Variant Human',
      flexibleAsi: { str: 1, con: 1 },
      featName: 'Alert',
      picks: { 'variant-human-skill': ['athletics'] },
    }
    const { character } = buildCharacter(
      withScores(draft, {
        str: 15,
        dex: 12,
        con: 14,
        int: 10,
        wis: 10,
        cha: 8,
      }),
    )
    expect(character.abilities.str).toBe(16)
    expect(character.abilities.con).toBe(15)
    expect(character.abilities.dex).toBe(12)
    expect(character.feats.map((f) => f.name)).toEqual(['Alert'])
    expect(character.skills).toContain('athletics')
  })

  it('clamps a raised score to 30', () => {
    const draft: CharacterDraft = {
      ...emptyDraft(SRD_TABLES),
      raceName: 'Dwarf',
      abilities: {
        ...emptyAbilityDraft(),
        method: 'manual',
        direct: { str: 30, dex: 10, con: 30, int: 10, wis: 10, cha: 10 },
      },
    }
    expect(finalScores(draft).con).toBe(30)
  })
})

describe('computeAc', () => {
  const base = buildCharacter(emptyDraft(SRD_TABLES)).character

  it('is 10 + DEX unarmored', () => {
    const c = {
      ...base,
      abilities: { ...base.abilities, dex: 16 },
      inventory: [],
    }
    expect(computeAc(c)).toBe(13)
  })

  it('caps DEX in medium armor', () => {
    const c = {
      ...base,
      abilities: { ...base.abilities, dex: 18 },
      inventory: [{ text: 'Scale mail', qty: 1, weight: 45, slot: null }],
    }
    // Scale mail 14 + min(DEX +4, cap 2).
    expect(computeAc(c)).toBe(16)
  })

  it('ignores DEX entirely in heavy armor', () => {
    const c = {
      ...base,
      abilities: { ...base.abilities, dex: 18 },
      inventory: [{ text: 'Chain mail', qty: 1, weight: 55, slot: null }],
    }
    expect(computeAc(c)).toBe(16)
  })

  it('adds a shield', () => {
    const c = {
      ...base,
      abilities: { ...base.abilities, dex: 12 },
      inventory: [{ text: 'Shield', qty: 1, weight: 6, slot: null }],
    }
    expect(computeAc(c)).toBe(13)
  })

  it('uses barbarian unarmored defense', () => {
    const c = {
      ...base,
      abilities: { ...base.abilities, dex: 14, con: 16 },
      inventory: [],
    }
    expect(computeAc(c, 'con')).toBe(10 + 2 + 3)
  })

  it('uses monk unarmored defense and ignores a shield', () => {
    const c = {
      ...base,
      abilities: { ...base.abilities, dex: 16, wis: 14 },
      inventory: [{ text: 'Shield', qty: 1, weight: 6, slot: null }],
    }
    expect(computeAc(c, 'wis')).toBe(10 + 3 + 2)
  })

  it('picks the best armor when several are carried', () => {
    const c = {
      ...base,
      abilities: { ...base.abilities, dex: 10 },
      inventory: [
        { text: 'Leather armor', qty: 1, weight: 10, slot: null },
        { text: 'Chain mail', qty: 1, weight: 55, slot: null },
      ],
    }
    expect(computeAc(c)).toBe(16)
  })

  it('does not mistake studded leather for leather', () => {
    const c = {
      ...base,
      abilities: { ...base.abilities, dex: 14 },
      inventory: [
        { text: 'Studded leather armor', qty: 1, weight: 13, slot: null },
      ],
    }
    expect(computeAc(c)).toBe(12 + 2)
  })
})

describe('the fighter kit', () => {
  it('resolves a martial weapon pick into inventory and attacks', () => {
    let draft = emptyDraft(SRD_TABLES)
    draft = {
      ...draft,
      name: 'Berrin',
      raceName: 'Human',
      className: 'Fighter',
      backgroundName: 'Soldier',
      picks: {
        'human-language': ['Orc'],
        'fighter-skills': ['athletics', 'perception'],
        'fighter-martial-single': ['Longsword'],
        'soldier-gaming-set': ['Dice set'],
      },
      equipment: {
        'fighter-armor': 0, // chain mail
        'fighter-weapon': 0, // martial weapon + shield
        'fighter-ranged': 1, // two handaxes
        'fighter-pack': 0,
      },
    }
    const { character } = buildCharacter(
      withScores(draft, {
        str: 16,
        dex: 12,
        con: 14,
        int: 10,
        wis: 12,
        cha: 8,
      }),
    )
    const names = character.inventory.map((i) => i.text.toLowerCase())
    expect(names).toContain('longsword')
    expect(names).toContain('chain mail')
    expect(names).toContain('shield')
    // Chain mail 16, no DEX, +2 shield.
    expect(character.ac).toBe(18)
    // Human's +1 to everything.
    expect(character.abilities.str).toBe(17)
    const sword = character.attacks.find((a) => /longsword/i.test(a.name))
    expect(sword?.bonus).toBe(2 + abilityMod(17))
    // NOT listed as its own proficiency: a fighter already has "martial", and
    // repeating the specific weapon beside the category is noise. The attack
    // row and the inventory row above are what carry the longsword.
    expect(character.weapons).toEqual(['simple', 'martial'])
  })
})

describe('assignment-driven scores', () => {
  it('reads scores through the pool assignment', () => {
    let abilities = emptyAbilityDraft()
    // STANDARD_ARRAY is [15,14,13,12,10,8].
    ABILITIES.forEach((ability, i) => {
      abilities = assign(abilities, ability, i)
    })
    const draft: CharacterDraft = {
      ...emptyDraft(SRD_TABLES),
      name: 'Test',
      abilities,
    }
    const { character } = buildCharacter(draft)
    expect(character.abilities.str).toBe(15)
    expect(character.abilities.cha).toBe(8)
  })
})

describe('homebrew races and backgrounds', () => {
  /** A draft built against tables that include a homebrew race. */
  function thriKreenDraft(): CharacterDraft {
    const global = parseHomebrew({
      races: [
        {
          name: 'Thri-kreen',
          summary: 'Insectile wanderers.',
          asi: { dex: 2, wis: 1 },
          speed: 35,
          grant: {
            languages: ['Thri-kreen'],
            skills: ['stealth'],
            resistances: ['poison'],
            traits: [
              { name: 'Chameleon Carapace', text: 'Change your colour.' },
            ],
          },
        },
      ],
      backgrounds: [
        {
          name: 'Smuggler',
          feature: { name: 'Safe Harbour', text: 'You know a quiet dock.' },
          grant: {
            skills: ['deception', 'sleight-of-hand'],
            currency: { gp: 12 },
            items: [{ text: 'Crowbar', weight: 5 }],
          },
        },
      ],
    })
    const tables = mergeTables(global)
    let draft = emptyDraft(tables)
    draft = {
      ...draft,
      name: 'Kk’tk',
      raceName: 'Thri-kreen',
      className: 'Rogue',
      backgroundName: 'Smuggler',
      picks: {
        'rogue-skills': ['acrobatics', 'perception', 'insight', 'athletics'],
      },
    }
    return withScores(draft, {
      str: 10,
      dex: 15,
      con: 13,
      int: 12,
      wis: 12,
      cha: 8,
    })
  }

  it('applies a homebrew race exactly like an SRD one', () => {
    const { character } = buildCharacter(thriKreenDraft())
    expect(character.race).toBe('Thri-kreen')
    // +2 DEX, +1 WIS from the homebrew race.
    expect(character.abilities.dex).toBe(17)
    expect(character.abilities.wis).toBe(13)
    expect(character.speed).toBe(35)
    expect(character.languages).toContain('Thri-kreen')
    expect(character.resistances).toContain('poison')
    expect(character.traits.map((t) => t.name)).toContain('Chameleon Carapace')
  })

  it('applies a homebrew background, feature included', () => {
    const { character } = buildCharacter(thriKreenDraft())
    expect(character.background).toBe('Smuggler')
    expect(character.skills).toContain('deception')
    expect(character.currency.gp).toBe(12)
    expect(character.traits.map((t) => t.name)).toContain('Safe Harbour')
  })

  it('still writes plain strings — no homebrew id reaches the sheet', () => {
    // The free-text guarantee has to hold for homebrew too, or a deleted race
    // would leave an unreadable slug on an existing character.
    const { character, body } = buildCharacter(thriKreenDraft())
    const frontmatter = serializeCharacter(character, body).split('---')[1]
    expect(character.race).toBe('Thri-kreen')
    expect(frontmatter).not.toContain('thri-kreen')
    expect(frontmatter).not.toContain('smuggler')
    expect(frontmatter).toContain('race: Thri-kreen')
  })

  it('round-trips a fully homebrew character', () => {
    const { character, body } = buildCharacter(thriKreenDraft())
    const round = parseCharacter(serializeCharacter(character, body))
    expect(round.character).toEqual(character)
  })

  it('a homebrew race overriding an SRD one wins', () => {
    const global = parseHomebrew({
      races: [{ name: 'Dwarf', speed: 40, asi: { str: 3 } }],
    })
    let draft = emptyDraft(mergeTables(global))
    draft = { ...draft, name: 'Odd Dwarf', raceName: 'Dwarf' }
    const { character } = buildCharacter(
      withScores(draft, {
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10,
      }),
    )
    expect(character.speed).toBe(40)
    expect(character.abilities.str).toBe(13)
    // The SRD dwarf's +2 CON is gone — shadowing replaces, it does not merge.
    expect(character.abilities.con).toBe(10)
  })

  it('a homebrew subrace uses its own parent race speed', () => {
    // The shadowing hazard, checked end to end rather than only in tables.ts.
    const global = parseHomebrew({
      races: [
        {
          name: 'Deep Dwarf',
          speed: 20,
          subraces: [{ name: 'Grey Dwarf', asi: { con: 1 }, hpPerLevel: 2 }],
        },
      ],
    })
    let draft = emptyDraft(mergeTables(global))
    draft = {
      ...draft,
      name: 'Murk',
      raceName: 'Deep Dwarf',
      subraceName: 'Grey Dwarf',
      className: 'Fighter',
    }
    const { character } = buildCharacter(
      withScores(draft, {
        str: 14,
        dex: 10,
        con: 14,
        int: 10,
        wis: 10,
        cha: 10,
      }),
    )
    expect(character.race).toBe('Grey Dwarf')
    expect(character.speed).toBe(20)
    // d10 fighter + CON 15 (+2) + 2 per level.
    expect(character.hp.max).toBe(10 + 2 + 2)
  })
})

describe('a picked weapon is not re-listed as a proficiency', () => {
  it('knows every WEAPON_STATS weapon by category', () => {
    // The two tables have to agree, or a weapon silently falls through to
    // "not covered" and gets listed individually again.
    for (const name of Object.keys(WEAPON_STATS)) {
      expect(weaponCategory(name), name).not.toBeNull()
    }
  })

  it('categorises the weapons the bug was reported against', () => {
    expect(weaponCategory('Battleaxe')).toBe('martial')
    expect(weaponCategory('Spear')).toBe('simple')
  })

  it('matches inside a free-text equipment row', () => {
    expect(weaponCategory('a battleaxe and a shield')).toBe('martial')
  })

  it('leaves a homebrew weapon uncategorised so it is still named', () => {
    expect(weaponCategory('Moonglaive of Nine Sorrows')).toBeNull()
  })
})

describe('a new character gets level 1 features only', () => {
  it('a paladin starts with two features, not thirteen', () => {
    // The bug: ClassKit.features carries the whole 1-20 progression for the
    // level-up wizard, and buildCharacter copied all of it — so a brand-new
    // paladin's sheet listed Extra Attack, Aura of Protection and Cleansing
    // Touch, all stamped level 1.
    let draft = emptyDraft(SRD_TABLES)
    draft = { ...draft, name: 'Sir Test', className: 'Paladin' }
    const { character } = buildCharacter(draft)
    const names = character.features.map((f) => f.name)
    expect(names).toContain('Divine Sense')
    expect(names).toContain('Lay on Hands')
    expect(names).not.toContain('Extra Attack')
    expect(names).not.toContain('Aura of Protection')
    expect(names).not.toContain('Divine Smite')
  })

  it('every SRD class gets exactly its level 1 features', () => {
    for (const kit of SRD_TABLES.kits) {
      let draft = emptyDraft(SRD_TABLES)
      draft = { ...draft, name: 'T', className: kit.name }
      const { character } = buildCharacter(draft)
      const expected = kit.features.filter((f) => f.level === 1).length
      expect(character.features.length, kit.name).toBe(expected)
      for (const feature of character.features) {
        expect(feature.level, `${kit.name}/${feature.name}`).toBe(1)
      }
    }
  })

  it('featuresUpToLevel keeps each feature at its own level', () => {
    // Not all stamped 1: featuresGained dedupes on `level:name`, so a wrong
    // level here would stop the level-up wizard granting it later.
    const features = [
      { level: 1, name: 'A' },
      { level: 5, name: 'B' },
      { level: 3, name: 'C' },
    ]
    expect(featuresUpToLevel(features, 3)).toEqual([
      { level: 1, name: 'A' },
      { level: 3, name: 'C' },
    ])
  })
})
