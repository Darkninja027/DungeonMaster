import { describe, expect, it } from 'vitest'
import {
  EMPTY_HOMEBREW,
  HOMEBREW_VERSION,
  homebrewId,
  parseBackground,
  parseHomebrew,
  parseKit,
  parseRace,
  serializeHomebrew,
} from './homebrew'

describe('homebrewId', () => {
  it('slugifies the way the SRD tables are keyed', () => {
    expect(homebrewId('Hill Dwarf')).toBe('hill-dwarf')
    expect(homebrewId('  Thri-kreen  ')).toBe('thri-kreen')
    expect(homebrewId('Dark Elf (Drow)')).toBe('dark-elf-drow')
    expect(homebrewId('Sha’ir')).toBe('shair')
  })
})

describe('parseHomebrew tolerance', () => {
  it('returns empty lists for a missing or corrupt file', () => {
    expect(parseHomebrew(null)).toEqual(EMPTY_HOMEBREW)
    expect(parseHomebrew('nonsense')).toEqual(EMPTY_HOMEBREW)
    expect(parseHomebrew(42)).toEqual(EMPTY_HOMEBREW)
    expect(parseHomebrew([])).toEqual({ ...EMPTY_HOMEBREW })
  })

  it('keeps good rows when one row is malformed', () => {
    // The whole point of field-by-field tolerance: one bad hand edit must not
    // cost you the rest of the file.
    const parsed = parseHomebrew({
      races: [
        { name: 'Thri-kreen', asi: { dex: 2 } },
        null,
        'garbage',
        { name: '' },
        { name: 'Warforged', asi: { con: 2 } },
      ],
    })
    expect(parsed.races.map((r) => r.name)).toEqual(['Thri-kreen', 'Warforged'])
  })

  it('drops duplicate ids, first wins', () => {
    const parsed = parseHomebrew({
      races: [
        { name: 'Thri-kreen', speed: 35 },
        { name: 'thri-kreen', speed: 20 },
      ],
    })
    expect(parsed.races).toHaveLength(1)
    expect(parsed.races[0].speed).toBe(35)
  })

  it('defaults the version when absent', () => {
    expect(parseHomebrew({}).version).toBe(HOMEBREW_VERSION)
    expect(parseHomebrew({ version: 7 }).version).toBe(7)
  })

  it('treats a missing key and an explicit [] the same', () => {
    // Unlike world settings there is no built-in fallback to distinguish them
    // from — the SRD tables are merged separately.
    expect(parseHomebrew({}).races).toEqual([])
    expect(parseHomebrew({ races: [] }).races).toEqual([])
  })
})

describe('parseRace', () => {
  it('drops a nameless race', () => {
    expect(parseRace({ asi: { str: 2 } })).toBeNull()
    expect(parseRace({ name: '   ' })).toBeNull()
  })

  it('reads ability increases, speed and traits', () => {
    const race = parseRace({
      name: 'Thri-kreen',
      summary: 'Insectile wanderers.',
      asi: { dex: 2, wis: 1 },
      speed: 35,
      grant: {
        languages: ['Thri-kreen'],
        traits: [{ name: 'Chameleon Carapace', text: 'Change your colour.' }],
      },
    })
    expect(race).not.toBeNull()
    expect(race!.name).toBe('Thri-kreen')
    expect(race!.id).toBe('thri-kreen')
    expect(race!.asi).toEqual({ dex: 2, wis: 1 })
    expect(race!.speed).toBe(35)
    expect(race!.grant.languages).toEqual(['Thri-kreen'])
    expect(race!.grant.traits).toEqual([
      { name: 'Chameleon Carapace', text: 'Change your colour.' },
    ])
  })

  it('ignores zero and negative ability increases', () => {
    // A "+0" chip is noise, and the sheet has no concept of a racial penalty.
    const race = parseRace({ name: 'Odd', asi: { str: 0, dex: -2, con: 1 } })
    expect(race!.asi).toEqual({ con: 1 })
  })

  it('defaults a missing speed to 30', () => {
    expect(parseRace({ name: 'Plain' })!.speed).toBe(30)
    expect(parseRace({ name: 'Bad', speed: 'fast' })!.speed).toBe(30)
  })

  it('reads subraces and drops nameless ones', () => {
    const race = parseRace({
      name: 'Deep Dwarf',
      subraces: [
        { name: 'Duergar', asi: { str: 1 } },
        { name: '' },
        { name: 'Duergar' },
      ],
    })
    expect(race!.subraces).toHaveLength(1)
    expect(race!.subraces![0].name).toBe('Duergar')
  })

  it('reads hpPerLevel only when positive', () => {
    const tough = parseRace({
      name: 'Sturdy',
      subraces: [{ name: 'Very Sturdy', hpPerLevel: 2 }],
    })
    expect(tough!.subraces![0].hpPerLevel).toBe(2)
    const plain = parseRace({
      name: 'Plainish',
      subraces: [{ name: 'Plain Sub', hpPerLevel: 0 }],
    })
    expect(plain!.subraces![0].hpPerLevel).toBeUndefined()
  })

  it('reads flexible increases and the feat flag', () => {
    const race = parseRace({
      name: 'Adaptable',
      flexibleAsi: { count: 2, amount: 1 },
      grantsFeat: true,
    })
    expect(race!.flexibleAsi).toEqual({ count: 2, amount: 1 })
    expect(race!.grantsFeat).toBe(true)
  })

  it('namespaces pick ids by owner so they cannot collide', () => {
    // Every pick shares one draft.picks keyspace; a bare "tools" from two
    // different races would silently be the same choice.
    const a = parseRace({
      name: 'Alpha',
      grant: {
        picks: [
          { id: 'tools', kind: 'tool', label: 'Tool', options: ['Hammer'] },
        ],
      },
    })
    const b = parseRace({
      name: 'Beta',
      grant: {
        picks: [{ id: 'tools', kind: 'tool', label: 'Tool', options: ['Saw'] }],
      },
    })
    expect(a!.grant.picks![0].id).not.toBe(b!.grant.picks![0].id)
    expect(a!.grant.picks![0].id).toContain('alpha')
    expect(b!.grant.picks![0].id).toContain('beta')
  })

  it('drops a closed pick with no options', () => {
    // Unsatisfiable: it would trap the player on the skills step forever.
    const race = parseRace({
      name: 'Broken',
      grant: { picks: [{ kind: 'skill', label: 'Pick', options: [] }] },
    })
    expect(race!.grant.picks).toBeUndefined()
  })

  it('keeps an open pick with no options', () => {
    // "any language of your choice" is exactly this shape.
    const race = parseRace({
      name: 'Open',
      grant: {
        picks: [
          { kind: 'language', label: 'Any language', options: [], open: true },
        ],
      },
    })
    expect(race!.grant.picks).toHaveLength(1)
    expect(race!.grant.picks![0].open).toBe(true)
  })

  it('coerces an unknown pick kind to other', () => {
    const race = parseRace({
      name: 'Odd',
      grant: {
        picks: [{ kind: 'wibble', label: 'Thing', options: ['A', 'B'] }],
      },
    })
    expect(race!.grant.picks![0].kind).toBe('other')
  })

  it('keeps only real abilities in granted saves', () => {
    const race = parseRace({
      name: 'Saver',
      grant: { saves: ['str', 'nope', 'WIS'] },
    })
    expect(race!.grant.saves).toEqual(['str', 'wis'])
  })
})

describe('parseBackground', () => {
  it('drops a nameless background', () => {
    expect(parseBackground({ summary: 'x' })).toBeNull()
  })

  it('invents a feature name rather than leaving it blank', () => {
    const bg = parseBackground({ name: 'Smuggler' })
    expect(bg!.feature.name).toBe('Smuggler Feature')
  })

  it('reads skills, equipment and starting coin', () => {
    const bg = parseBackground({
      name: 'Smuggler',
      feature: { name: 'Safe Harbour', text: 'You know a quiet dock.' },
      grant: {
        skills: ['deception', 'stealth'],
        items: [{ text: 'Crowbar', weight: 5 }, 'Dark cloak'],
        currency: { gp: 12 },
      },
    })
    expect(bg!.grant.skills).toEqual(['deception', 'stealth'])
    expect(bg!.grant.items).toEqual([
      { text: 'Crowbar', weight: 5 },
      { text: 'Dark cloak' },
    ])
    expect(bg!.grant.currency).toEqual({ gp: 12 })
    expect(bg!.feature).toEqual({
      name: 'Safe Harbour',
      text: 'You know a quiet dock.',
    })
  })

  it('drops zero currency rather than writing it', () => {
    const bg = parseBackground({
      name: 'Broke',
      grant: { currency: { gp: 0, sp: 5 } },
    })
    expect(bg!.grant.currency).toEqual({ sp: 5 })
  })
})

describe('parseKit', () => {
  it('drops a nameless kit', () => {
    expect(parseKit({ saves: ['str'] })).toBeNull()
  })

  it('always yields all six abilities in the priority, exactly once', () => {
    // The auto-assign button needs a complete order; a partial hand-edit tops
    // up rather than disabling the feature.
    const kit = parseKit({ name: 'Warden', abilityPriority: ['wis', 'con'] })
    expect([...kit!.abilityPriority].sort()).toEqual(
      ['cha', 'con', 'dex', 'int', 'str', 'wis'].sort(),
    )
    expect(kit!.abilityPriority.slice(0, 2)).toEqual(['wis', 'con'])
  })

  it('gives a fallback skill choice when none is defined', () => {
    const kit = parseKit({ name: 'Warden' })
    expect(kit!.skillChoices.kind).toBe('skill')
    expect(kit!.skillChoices.count).toBeGreaterThan(0)
  })

  it('drops an equipment group with fewer than two options', () => {
    // One option isn't a choice; it would render a pointless single card.
    const kit = parseKit({
      name: 'Warden',
      equipment: [
        { label: 'Weapon', options: [{ label: 'A club' }] },
        {
          label: 'Armor',
          options: [{ label: 'Leather' }, { label: 'Hide' }],
        },
      ],
    })
    expect(kit!.equipment).toHaveLength(1)
    expect(kit!.equipment[0].label).toBe('Armor')
  })

  it('reads spellcasting only with a real ability', () => {
    const caster = parseKit({
      name: 'Warden',
      spellcasting: {
        ability: 'wis',
        slotsAtLevel1: 2,
        cantripsKnown: 2,
        prepares: true,
      },
    })
    expect(caster!.spellcasting?.ability).toBe('wis')
    expect(caster!.spellcasting?.prepares).toBe(true)
    const nonCaster = parseKit({
      name: 'Bruiser',
      spellcasting: { ability: 'vibes', slotsAtLevel1: 2 },
    })
    expect(nonCaster!.spellcasting).toBeUndefined()
  })

  it('reads unarmored defense only for the two legal values', () => {
    expect(
      parseKit({ name: 'A', unarmoredDefense: 'con' })!.unarmoredDefense,
    ).toBe('con')
    expect(
      parseKit({ name: 'B', unarmoredDefense: 'str' })!.unarmoredDefense,
    ).toBeUndefined()
  })
})

describe('round trip', () => {
  const homebrew = parseHomebrew({
    races: [
      {
        name: 'Thri-kreen',
        summary: 'Insectile wanderers.',
        asi: { dex: 2, wis: 1 },
        speed: 35,
        grant: {
          languages: ['Thri-kreen'],
          traits: [{ name: 'Chameleon Carapace', text: 'Change colour.' }],
          picks: [
            { kind: 'tool', label: 'A tool', options: ['Hammer', 'Saw'] },
          ],
        },
        subraces: [
          { name: 'Tokchar', asi: { str: 1 }, speed: 30, hpPerLevel: 1 },
        ],
      },
    ],
    backgrounds: [
      {
        name: 'Smuggler',
        feature: { name: 'Safe Harbour', text: 'A quiet dock.' },
        grant: { skills: ['deception', 'stealth'], currency: { gp: 12 } },
      },
    ],
    kits: [
      {
        name: 'Warden',
        saves: ['str', 'con'],
        skillChoices: {
          kind: 'skill',
          label: 'Choose two',
          count: 2,
          options: ['athletics', 'survival', 'nature'],
        },
        equipment: [
          {
            label: 'Weapon',
            options: [{ label: 'A spear' }, { label: 'An axe' }],
          },
        ],
        features: [{ name: 'Warden’s Mark', text: 'Mark a foe.' }],
        abilityPriority: ['str', 'con', 'wis', 'dex', 'cha', 'int'],
      },
    ],
    classes: [
      { name: 'Blood Hunter', hitDie: 10, subclasses: ['Ghostslayer'] },
    ],
  })

  it('survives serialize then parse unchanged', () => {
    // The house pattern: one assertion guarding every field mapping at once.
    expect(parseHomebrew(serializeHomebrew(homebrew))).toEqual(homebrew)
  })

  it('does not write derived ids to disk', () => {
    // Writing the id would create a second source of truth that a hand edit
    // could contradict.
    const raw = serializeHomebrew(homebrew) as Record<string, unknown>
    const json = JSON.stringify(raw)
    expect(json).not.toContain('"id"')
    expect((raw.races as Array<{ name: string }>)[0].name).toBe('Thri-kreen')
  })

  it('carries the explanatory comment', () => {
    const raw = serializeHomebrew(homebrew) as Record<string, unknown>
    expect(typeof raw._comment).toBe('string')
  })

  it('an emptied list stays empty through a round trip', () => {
    const emptied = { ...homebrew, races: [] }
    expect(parseHomebrew(serializeHomebrew(emptied)).races).toEqual([])
  })
})
