import { describe, expect, it } from 'vitest'
import {
  abilityMod,
  alwaysPreparedCount,
  hitDiceArePinned,
  parseCharacter,
  preparedCount,
  serializeCharacter,
  ABILITIES,
} from './character'
import { WEAPON_STATS, featuresUpToLevel, weaponCategory } from './srd'
import type { FeatInfo, RaceInfo } from './srd'
import { PHB_CLASSES } from './classes'
import type { ClassInfo } from './classes'
import { buildCharacter, computeAc, finalScores } from './buildCharacter'
import {
  asiChoicePickId,
  canAdvance,
  draftOwnedPickLists,
  emptyDraft,
} from './characterDraft'
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
    // A preparer chooses no spells at creation, so nothing here was *picked*
    // above cantrip level. The domain's own rows are the one exception and
    // arrive always-prepared — see 'a subclass chosen at creation' below.
    expect(
      character.spells.every((s) => s.level === 0 || s.alwaysPrepared),
    ).toBe(true)
    expect(
      character.spells.filter((s) => s.level > 0 && !s.alwaysPrepared),
    ).toEqual([])
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

  it('adds a feat’s initiative bonus to the misc initiative slot', () => {
    const ALERT: FeatInfo = {
      id: 'alert',
      name: 'Alert',
      summary: '+5 to initiative.',
      grant: { initiativeBonus: 5 },
    }
    const { character } = buildCharacter(variantHuman('Alert', [ALERT]))
    expect(character.initiativeBonus).toBe(5)
  })

  it('leaves the initiative slot at zero when no feat touches it', () => {
    const { character } = buildCharacter(variantHuman('Resilient', [RESILIENT]))
    expect(character.initiativeBonus).toBe(0)
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
  it('applies a chosen +2 and +1, with the rest of the race', () => {
    // A race with no fixed `asi` at all, so the whole increase is the choice —
    // and mixed sizes reach the sheet without `racialAsi` knowing about modes.
    // Defined here rather than leaning on a table, so this stays a test of the
    // mechanism.
    const twoShapes: RaceInfo = {
      id: 'two-shapes',
      name: 'Two Shapes',
      summary: 'Chooses between +2/+1 and three +1s.',
      asi: {},
      speed: 30,
      flexibleAsi: [{ increases: [2, 1] }, { increases: [1, 1, 1] }],
      grant: {
        languages: ['Common', 'Giant'],
        skills: ['athletics'],
        resistances: ['cold'],
        traits: [
          { name: 'Powerful Build', text: 'Counts as one size larger.' },
        ],
      },
    }
    const base = emptyDraft(SRD_TABLES)
    const draft = {
      ...base,
      races: [...base.races, twoShapes],
      name: 'Kavaki',
      raceName: twoShapes.name,
      flexibleAsi: { str: 2, con: 1 },
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
    expect(character.abilities.str).toBe(17)
    expect(character.abilities.con).toBe(15)
    expect(character.abilities.dex).toBe(12)
    expect(character.speed).toBe(30)
    expect(character.skills).toContain('athletics')
    expect(character.resistances).toContain('cold')
    expect(character.languages).toEqual(
      expect.arrayContaining(['Common', 'Giant']),
    )
    expect(character.traits.map((t) => t.name)).toContain('Powerful Build')
  })

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

describe('skill and tool picks', () => {
  const withPicks = (
    featName: string,
    picks: Record<string, Array<string>>,
  ) => {
    const base = emptyDraft(SRD_TABLES)
    return withScores(
      {
        ...base,
        name: 'Aldric',
        raceName: 'Variant Human',
        flexibleAsi: { str: 1, dex: 1 },
        featName,
        picks,
      },
      { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
    )
  }

  it('Skilled routes each of the three picks to skills or tools', () => {
    // The bug this pins: every value went through `kind: 'skill'`, so the tool
    // and the display-name skill were both dropped by the scrub at the end of
    // `buildCharacter` — the player spent three picks and kept one.
    const { character } = buildCharacter(
      withPicks('Skilled', {
        'skilled-skills': ['stealth', 'Smith’s tools', 'Animal Handling'],
      }),
    )
    expect(character.skills).toContain('stealth')
    expect(character.skills).toContain('animal-handling')
    expect(character.tools).toContain('Smith’s tools')
    // The tool must not sit in the skills list under any spelling.
    expect(character.skills).not.toContain('Smith’s tools')
  })

  it('keeps all three Skilled picks even when every one is a tool', () => {
    const { character } = buildCharacter(
      withPicks('Skilled', {
        'skilled-skills': ['Smith’s tools', 'Dice set', 'Lute'],
      }),
    )
    expect(character.tools).toEqual(
      expect.arrayContaining(['Smith’s tools', 'Dice set', 'Lute']),
    )
  })

  it('resolves a typed skill name to its id in a plain skill pick', () => {
    // Not just the new kind: an open skill pick anywhere accepts what a person
    // types, and "Animal Handling" is what a person types.
    const { character } = buildCharacter(
      withPicks('Prodigy', {
        'prodigy-skill': ['Sleight of Hand'],
        'prodigy-tool': ['Smith’s tools'],
        'prodigy-language': ['Dwarvish'],
        'prodigy-expertise': ['Sleight of Hand'],
      }),
    )
    expect(character.skills).toContain('sleight-of-hand')
  })

  it('files an expertise pick as expertise, not as a plain proficiency', () => {
    // `skillBonus` doubles proficiency for these; routing them into `skills`
    // handed back a proficiency the character already had.
    const { character } = buildCharacter(
      withPicks('Skill Expert', {
        'skill-expert-skill': ['stealth'],
        'skill-expert-expertise': ['stealth'],
      }),
    )
    expect(character.expertise).toContain('stealth')
  })

  it('never leaves a non-skill in the expertise list', () => {
    const { character } = buildCharacter(
      withPicks('Skill Expert', {
        'skill-expert-skill': ['stealth'],
        'skill-expert-expertise': ['Smith’s tools'],
      }),
    )
    expect(character.expertise).not.toContain('Smith’s tools')
  })

  /** A rogue with its four skills and its two expertise choices. */
  const rogueWithPicks = (picks: Record<string, Array<string>>) =>
    withScores(
      { ...emptyDraft(SRD_TABLES), name: 'Vex', className: 'Rogue', picks },
      { str: 10, dex: 15, con: 13, int: 12, wis: 12, cha: 8 },
    )

  it('files a rogue’s expertise pick as expertise, not a plain proficiency', () => {
    const { character } = buildCharacter(
      rogueWithPicks({
        'rogue-skills': ['stealth', 'perception', 'deception', 'insight'],
        'rogue-expertise': ['stealth', 'perception'],
      }),
    )
    expect(character.expertise).toEqual(
      expect.arrayContaining(['stealth', 'perception']),
    )
    // Still proficient: the four came from `rogue-skills`, and the expertise
    // pick must not be what granted them — nor may it have moved them out.
    expect(character.skills).toEqual(
      expect.arrayContaining(['stealth', 'perception', 'deception', 'insight']),
    )
  })

  it('puts a feat’s chosen spell on the sheet as a 1st-level spell', () => {
    // The bug this pins: `kind: 'spell'` fell through to the `default` arm and
    // was thrown away, so a Variant Human who took Fey Touched and picked a
    // spell got a feat that granted nothing. Five feats route through here —
    // Fey Touched, Shadow Touched, Magic Initiate, Ritual Caster and Artificer
    // Initiate.
    const { character } = buildCharacter(
      withPicks('Fey Touched', { 'fey-touched-spell': ['Bane'] }),
    )
    expect(character.spells).toContainEqual({ name: 'Bane', level: 1 })
  })

  it('gives a non-caster a feat spell, with no slots to cast it from', () => {
    // A rogue has no `spellcasting` block, so the branch that files the wizard's
    // own spell choices never runs for them. The feat's spell still has to land:
    // it is cast once per long rest without a slot, which is exactly why someone
    // with no slots can take it.
    const draft = withScores(
      {
        ...emptyDraft(SRD_TABLES),
        name: 'Vex',
        className: 'Rogue',
        raceName: 'Variant Human',
        featName: 'Fey Touched',
        picks: {
          'rogue-skills': ['stealth', 'perception', 'deception', 'insight'],
          'rogue-expertise': ['stealth', 'perception'],
          'fey-touched-spell': ['Bane'],
        },
      },
      { str: 10, dex: 15, con: 13, int: 12, wis: 12, cha: 8 },
    )
    const { character } = buildCharacter(draft)
    expect(character.spells).toContainEqual({ name: 'Bane', level: 1 })
    expect(character.spellSlots[1]).toBeUndefined()
  })

  it('never marks a feat spell prepared', () => {
    // It costs no slot and no preparation. Marking it prepared would spend a
    // caster's limit on a spell that never needed it.
    const { character } = buildCharacter(
      withPicks('Fey Touched', { 'fey-touched-spell': ['Bane'] }),
    )
    expect(character.spells.find((s) => s.name === 'Bane')?.prepared).toBe(
      undefined,
    )
  })

  it('keeps both the cantrip and the spell of the same name', () => {
    // Magic Initiate hands out two cantrips and a 1st-level spell, and the
    // overlap is real: a name can be both. The cantrip arm matches on name
    // alone, so the spell arm has to match on name *and* level or the second
    // one is silently swallowed.
    const { character } = buildCharacter(
      withPicks('Magic Initiate', {
        'magic-initiate-cantrips': ['Guidance'],
        'magic-initiate-spell': ['Guidance'],
      }),
    )
    expect(character.spells).toContainEqual({ name: 'Guidance', level: 0 })
    expect(character.spells).toContainEqual({ name: 'Guidance', level: 1 })
  })

  it('grants the fixed spell that comes with a feat, not just the chosen one', () => {
    // The other half of the Fey Touched bug: misty step comes with the feat and
    // was named only in the summary, so a player got the spell they picked and
    // silently lost the one they were owed. Shadow Touched (invisibility) and
    // Fey Teleportation (misty step) had the same gap.
    const { character } = buildCharacter(
      withPicks('Fey Touched', { 'fey-touched-spell': ['Bane'] }),
    )
    expect(character.spells).toContainEqual({ name: 'Misty Step', level: 2 })
    expect(character.spells).toContainEqual({ name: 'Bane', level: 1 })
  })

  it('never marks a granted spell prepared', () => {
    // Free once per long rest, so it costs no slot and no preparation.
    const { character } = buildCharacter(
      withPicks('Shadow Touched', { 'shadow-touched-spell': ['Bane'] }),
    )
    const invis = character.spells.find((s) => s.name === 'Invisibility')
    expect(invis).toEqual({ name: 'Invisibility', level: 2 })
    expect(invis?.prepared).toBe(undefined)
    expect(invis?.alwaysPrepared).toBe(undefined)
  })

  it('gives a non-caster the feat’s fixed spell too', () => {
    const draft = withScores(
      {
        ...emptyDraft(SRD_TABLES),
        name: 'Vex',
        className: 'Rogue',
        raceName: 'Variant Human',
        featName: 'Fey Touched',
        picks: {
          'rogue-skills': ['stealth', 'perception', 'deception', 'insight'],
          'rogue-expertise': ['stealth', 'perception'],
          'fey-touched-spell': ['Bane'],
        },
      },
      { str: 10, dex: 15, con: 13, int: 12, wis: 12, cha: 8 },
    )
    const { character } = buildCharacter(draft)
    expect(character.spells).toContainEqual({ name: 'Misty Step', level: 2 })
  })

  it('keeps a stale expertise choice rather than dropping it', () => {
    // Swapping a skill out after taking expertise in it leaves a choice the
    // narrowed list no longer offers. The wizard shows it as a removable chip
    // instead of pruning the draft, because silently deleting a player's choice
    // on an unrelated edit is the thing this codebase doesn't do — so a commit
    // in that state has to keep it.
    const { character } = buildCharacter(
      rogueWithPicks({
        'rogue-skills': ['acrobatics', 'perception', 'deception', 'insight'],
        'rogue-expertise': ['stealth', 'perception'],
      }),
    )
    expect(character.expertise).toContain('stealth')
    expect(character.skills).not.toContain('stealth')
  })
})

describe('a chooseable half-feat increase at creation', () => {
  const variantHumanWith = (
    featName: string,
    picks: Record<string, Array<string>>,
  ) =>
    withScores(
      {
        ...emptyDraft(SRD_TABLES),
        name: 'Aldric',
        raceName: 'Variant Human',
        flexibleAsi: { str: 1, dex: 1 },
        featName,
        picks,
      },
      { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
    )

  it('raises the ability the player chose, not a hardcoded one', () => {
    const { character } = buildCharacter(
      variantHumanWith('Skill Expert', {
        [asiChoicePickId('skill-expert')]: ['Wisdom'],
        'skill-expert-skill': ['stealth'],
        'skill-expert-expertise': ['stealth'],
      }),
    )
    // 10 base + 1 from the feat. Dexterity gets only its flexible racial +1.
    expect(character.abilities.wis).toBe(11)
    expect(character.abilities.dex).toBe(13)
  })

  it('grants nothing until the ability is placed', () => {
    const { character } = buildCharacter(
      variantHumanWith('Skill Expert', {
        'skill-expert-skill': ['stealth'],
        'skill-expert-expertise': ['stealth'],
      }),
    )
    // Guessing on the player's behalf is the bug this replaced.
    expect(character.abilities.wis).toBe(10)
    expect(character.abilities.dex).toBe(13)
  })

  it('ties a Resilient save to the ability chosen', () => {
    const { character } = buildCharacter(
      variantHumanWith('Resilient', {
        [asiChoicePickId('resilient')]: ['Wisdom'],
      }),
    )
    expect(character.abilities.wis).toBe(11)
    expect(character.saves).toContain('wis')
  })

  it('gates the skills step until the ability is placed', () => {
    // Variant Human's own free skill and language have to be answered too, or
    // the gate would be measuring those rather than the feat's choice.
    const otherPicks = {
      'variant-human-skill': ['stealth'],
      'variant-human-language': ['Dwarvish'],
    }
    expect(
      canAdvance(variantHumanWith('Observant', otherPicks), 'skills'),
    ).toBe(false)
    expect(
      canAdvance(
        variantHumanWith('Observant', {
          ...otherPicks,
          [asiChoicePickId('observant')]: ['Wisdom'],
        }),
        'skills',
      ),
    ).toBe(true)
  })
})

describe('fighting style at creation', () => {
  const fighter = (picks: Record<string, Array<string>> = {}) =>
    withScores(
      {
        ...emptyDraft(SRD_TABLES),
        name: 'Aldric',
        className: 'Fighter',
        picks,
      },
      { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
    )

  it('offers the choice on the class step', () => {
    const ids = draftOwnedPickLists(fighter()).map((o) => o.pick.id)
    expect(ids).toContain('fighter-fighting-style')
  })

  it('writes the chosen style onto the sheet with its rules text', () => {
    const { character } = buildCharacter(
      fighter({ 'fighter-fighting-style': ['Defense'] }),
    )
    const row = character.features.find(
      (f) => f.name === 'Fighting Style: Defense',
    )
    expect(row).toBeDefined()
    expect(row?.text).toContain('+1 AC')
  })

  it('gates the skills step until a style is chosen', () => {
    expect(
      canAdvance(
        fighter({ 'fighter-skills': ['athletics', 'survival'] }),
        'skills',
      ),
    ).toBe(false)
    expect(
      canAdvance(
        fighter({
          'fighter-skills': ['athletics', 'survival'],
          'fighter-fighting-style': ['Archery'],
        }),
        'skills',
      ),
    ).toBe(true)
  })

  it('never asks about a feature gained above level 1', () => {
    // Extra Attack is 5th level and Champion's second style 10th; neither is a
    // question a level-1 character should be answering.
    const ids = draftOwnedPickLists(fighter()).map((o) => o.pick.id)
    expect(ids).not.toContain('champion-second-fighting-style')
    expect(ids.some((id) => id.includes('maneuvers'))).toBe(false)
  })

  it('leaves a class with no level-1 feature picks alone', () => {
    const wizard = withScores(
      { ...emptyDraft(SRD_TABLES), className: 'Wizard' },
      { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 },
    )
    const ids = draftOwnedPickLists(wizard).map((o) => o.pick.id)
    expect(ids.some((id) => id.includes('fighting-style'))).toBe(false)
  })
})

describe('fighting style grants', () => {
  /** A fighter in chain mail — option 0 of the kit's armour choice. */
  const fighter = (picks: Record<string, Array<string>> = {}) =>
    withScores(
      {
        ...emptyDraft(SRD_TABLES),
        name: 'Aldric',
        className: 'Fighter',
        equipment: { 'fighter-armor': 0 },
        picks,
      },
      { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
    )

  const acOf = (style?: string) =>
    buildCharacter(fighter(style ? { 'fighter-fighting-style': [style] } : {}))
      .character.ac

  it('gives Defense its +1 AC on top of the armour worn', () => {
    const withDefense = buildCharacter(
      fighter({ 'fighter-fighting-style': ['Defense'] }),
    ).character
    const without = buildCharacter(
      fighter({ 'fighter-fighting-style': ['Archery'] }),
    ).character
    expect(withDefense.ac).toBe(without.ac + 1)
  })

  it('grants nothing for a style whose effect this app does not model', () => {
    // Archery's "+2 to ranged attack rolls" is a combat rule, not a sheet
    // number. An empty grant is correct rather than incomplete.
    expect(acOf('Archery')).toBe(acOf(undefined))
  })

  it('applies the bonus once, however the row is de-duped', () => {
    const { character } = buildCharacter(
      fighter({ 'fighter-fighting-style': ['Defense', 'Defense'] }),
    )
    const rows = character.features.filter(
      (f) => f.name === 'Fighting Style: Defense',
    )
    expect(rows).toHaveLength(1)
    expect(character.ac).toBe(
      buildCharacter(fighter({ 'fighter-fighting-style': ['Defense'] }))
        .character.ac,
    )
  })
})

describe('AC is derived once at creation', () => {
  it('counts a Defense bonus exactly once, not once per apply path', () => {
    // `applyGrant` increments `c.ac` for the level-up path's benefit, and
    // `buildCharacter` then assigns the derived value over it. If that ordering
    // is ever broken the fighter silently starts with +2.
    const withDefense = buildCharacter(
      withScores(
        {
          ...emptyDraft(SRD_TABLES),
          className: 'Fighter',
          equipment: { 'fighter-armor': 0 },
          picks: { 'fighter-fighting-style': ['Defense'] },
        },
        { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
      ),
    ).character
    // Chain mail is AC 16 flat, no Dexterity. Defense makes it 17 — never 18.
    expect(withDefense.ac).toBe(17)
  })
})

/**
 * A class that picks its subclass at level 1 — Cleric, Sorcerer, Warlock.
 *
 * No class before the Cleric exercised this at all: every archetype done
 * previously is chosen at 3rd, so the level-up wizard owned the whole path and
 * creation could ignore subclasses entirely. It did, and a Life Domain cleric
 * built here got Spellcasting, Divine Domain, and nothing else.
 */
describe('a subclass chosen at creation', () => {
  it('grants the domain’s own level-1 features', () => {
    const c = buildCharacter(hillDwarfCleric()).character
    const names = c.features.map((f) => f.name)
    expect(names).toContain('Disciple of Life')
    expect(names).toContain('Bonus Proficiency')
    // The class's own are still there and still first.
    expect(names).toContain('Divine Domain')
  })

  it('grants nothing from a later level', () => {
    // The same line `featuresUpToLevel` draws for the class. Blessed Healer is
    // 6th; a level-1 cleric has not earned it.
    const c = buildCharacter(hillDwarfCleric()).character
    const names = c.features.map((f) => f.name)
    expect(names).not.toContain('Blessed Healer')
    expect(names).not.toContain('Divine Strike')
  })

  it('applies the domain’s grant', () => {
    // Life Domain's heavy armour — the case `SubclassInfo.grant`'s own doc
    // comment names. It rides `draftGrants`, so it lands the same way a race's
    // does rather than through a special case.
    const c = buildCharacter(hillDwarfCleric()).character
    expect(c.armor).toContain('heavy')
    // The class's own proficiencies survive it.
    expect(c.armor).toContain('light')
    expect(c.armor).toContain('medium')
  })

  it('puts the 1st-level domain spells on the sheet, always prepared', () => {
    const c = buildCharacter(hillDwarfCleric()).character
    const bless = c.spells.find((sp) => sp.name === 'Bless')
    const cure = c.spells.find((sp) => sp.name === 'Cure Wounds')
    expect(bless?.level).toBe(1)
    expect(bless?.alwaysPrepared).toBe(true)
    expect(cure?.alwaysPrepared).toBe(true)
  })

  it('grants only the rows a level-1 character has reached', () => {
    // `grantedAt` is the character level, not the spell level. A level-1
    // cleric has the 1st-level row and none of the four above it.
    const c = buildCharacter(hillDwarfCleric()).character
    const names = c.spells.map((sp) => sp.name)
    expect(names).not.toContain('Spiritual Weapon') // grantedAt 3
    expect(names).not.toContain('Revivify') // grantedAt 5
  })

  it('keeps domain spells outside the prepared limit', () => {
    // The whole reason `alwaysPrepared` exists. A cleric prepares Wisdom
    // modifier + level spells; the domain's two are on top of that, not part
    // of it, so they must not be counted by `preparedCount`.
    const c = buildCharacter(hillDwarfCleric()).character
    expect(alwaysPreparedCount(c)).toBe(2)
    expect(preparedCount(c)).toBe(0)
    expect(c.preparedLimit).toBe(Math.max(1, abilityMod(c.abilities.wis) + 1))
  })

  it('leaves a class that picks its archetype later alone', () => {
    // A Fighter names an archetype at 3rd. Typing one during creation still
    // records the name, and still grants nothing — the level-up wizard owns
    // that, and creation must not front-run it.
    const draft = {
      ...hillDwarfCleric(),
      className: 'Fighter',
      subclassName: 'Champion',
      picks: {},
      equipment: {},
      cantrips: [],
    }
    const c = buildCharacter(draft).character
    expect(c.subclass).toBe('Champion')
    expect(c.features.map((f) => f.name)).not.toContain('Improved Critical')
  })

  it('records a domain the tables have never heard of', () => {
    // The standing bargain: a name the tables don't know reaches the sheet and
    // grants nothing, rather than erroring.
    const c = buildCharacter({
      ...hillDwarfCleric(),
      subclassName: 'Domain of the Screaming Moon',
    }).character
    expect(c.subclass).toBe('Domain of the Screaming Moon')
    expect(c.features.map((f) => f.name)).not.toContain('Disciple of Life')
    expect(c.armor).not.toContain('heavy')
  })
})

/**
 * The Sorcerer's origins, also chosen at level 1.
 *
 * The Cleric proved the path; these cover what is different about it. A
 * Draconic Bloodline's grant is `hpPerLevel` rather than armour, and its
 * level-1 feature poses a *pick* — which only reaches the wizard if the
 * subclass rides `draftOwnedPickLists` as well as `draftGrants`.
 */
describe('a sorcerous origin chosen at creation', () => {
  function draconicSorcerer(): CharacterDraft {
    let draft = emptyDraft(SRD_TABLES)
    draft = {
      ...draft,
      name: 'Vaerys Emberkin',
      raceName: 'Human',
      className: 'Sorcerer',
      subclassName: 'Draconic Bloodline',
      backgroundName: 'Acolyte',
      alignment: 'CN',
      picks: {
        'acolyte-languages': ['Draconic', 'Celestial'],
        'sorcerer-skills': ['arcana', 'persuasion'],
        'draconic-bloodline-ancestor': ['Fire'],
      },
      equipment: {
        'sorcerer-weapon': 0,
        'sorcerer-focus': 0,
        'sorcerer-pack': 0,
      },
      cantrips: ['Fire Bolt', 'Prestidigitation', 'Light', 'Shocking Grasp'],
    }
    return withScores(draft, {
      str: 8,
      dex: 14,
      con: 14,
      int: 10,
      wis: 12,
      cha: 16,
    })
  }

  it('grants the origin’s level-1 features', () => {
    const names = buildCharacter(draconicSorcerer()).character.features.map(
      (f) => f.name,
    )
    expect(names).toContain('Dragon Ancestor')
    expect(names).toContain('Draconic Resilience')
    // The class's own survive.
    expect(names).toContain('Sorcerous Origin')
  })

  it('grants nothing from a later level', () => {
    const names = buildCharacter(draconicSorcerer()).character.features.map(
      (f) => f.name,
    )
    expect(names).not.toContain('Elemental Affinity') // 6th
    expect(names).not.toContain('Dragon Wings') // 14th
  })

  it('offers the ancestry pick during creation', () => {
    // The pick lives on a subclass *feature*, so it only reaches the wizard
    // if the subclass rides `draftOwnedPickLists` — the documented mirror of
    // `draftGrants`. A source added to one and not the other is a draft that
    // grants something it never asked about.
    const owned = draftOwnedPickLists(draconicSorcerer())
    const ids = owned.map((o) => o.pick.id)
    expect(ids).toContain('draconic-bloodline-ancestor')
    // Owner is the subclass's own name, not the class's — two origins of one
    // class can each pose a choice.
    const ancestry = owned.find(
      (o) => o.pick.id === 'draconic-bloodline-ancestor',
    )
    expect(ancestry?.owner).toBe('Dragon Ancestor')
  })

  it('writes the chosen ancestry as its own labelled row', () => {
    const names = buildCharacter(draconicSorcerer()).character.features.map(
      (f) => f.name,
    )
    expect(names).toContain('Draconic Ancestry: Fire')
  })

  it('applies Draconic Resilience’s extra hit point per level', () => {
    // `hpPerLevel: 1` on the subclass grant. At level 1 that is exactly one
    // hit point over the same sorcerer without the origin.
    const withOrigin = buildCharacter(draconicSorcerer()).character
    const without = buildCharacter({
      ...draconicSorcerer(),
      subclassName: '',
      picks: {
        'acolyte-languages': ['Draconic', 'Celestial'],
        'sorcerer-skills': ['arcana', 'persuasion'],
      },
    }).character
    expect(withOrigin.hp.max).toBe(without.hp.max + 1)
  })

  it('records an origin the tables have never heard of', () => {
    const c = buildCharacter({
      ...draconicSorcerer(),
      subclassName: 'Bloodline of the Screaming Moon',
    }).character
    expect(c.subclass).toBe('Bloodline of the Screaming Moon')
    expect(c.features.map((f) => f.name)).not.toContain('Draconic Resilience')
  })

  it('leaves Wild Magic with no grant to apply', () => {
    // No grant and no picks is the authored shape; the features still land.
    const c = buildCharacter({
      ...draconicSorcerer(),
      subclassName: 'Wild Magic',
      picks: {
        'acolyte-languages': ['Draconic', 'Celestial'],
        'sorcerer-skills': ['arcana', 'persuasion'],
      },
    }).character
    const names = c.features.map((f) => f.name)
    expect(names).toContain('Wild Magic Surge')
    expect(names).toContain('Tides of Chaos')
  })
})
