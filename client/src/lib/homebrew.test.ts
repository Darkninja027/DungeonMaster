import { describe, expect, it } from 'vitest'
import {
  EMPTY_HOMEBREW,
  HOMEBREW_VERSION,
  homebrewId,
  isBareSubclass,
  isEmptyGrant,
  parseBackground,
  parseFeat,
  parseHomebrew,
  parseKit,
  parseRace,
  serializeHomebrew,
} from './homebrew'
import type { RaceInfo } from './srd'
import { upsert } from '#/components/character/create/HomebrewDialog'

describe('homebrewId', () => {
  it('slugifies the way the SRD tables are keyed', () => {
    expect(homebrewId('Hill Dwarf')).toBe('hill-dwarf')
    expect(homebrewId('  Thri-kreen  ')).toBe('thri-kreen')
    expect(homebrewId('Dark Elf (Drow)')).toBe('dark-elf-drow')
    expect(homebrewId('Sha’ir')).toBe('shair')
  })
})

describe('upsert', () => {
  const race = (name: string, speed: number): RaceInfo => ({
    id: homebrewId(name),
    name,
    summary: '',
    asi: {},
    speed,
    grant: {},
  })

  it('appends a genuinely new name', () => {
    const next = upsert([race('Thri-kreen', 35)], race('Warforged', 30))
    expect(next.map((r) => r.name)).toEqual(['Thri-kreen', 'Warforged'])
  })

  it('replaces a same-named entry rather than appending', () => {
    const next = upsert([race('Thri-kreen', 35)], race('Thri-kreen', 20))
    expect(next).toHaveLength(1)
    expect(next[0].speed).toBe(20)
  })

  it('matches case-insensitively and keeps the original position', () => {
    const next = upsert(
      [race('Thri-kreen', 35), race('Warforged', 30)],
      race('thri-kreen', 20),
    )
    expect(next.map((r) => r.name)).toEqual(['thri-kreen', 'Warforged'])
    expect(next[0].speed).toBe(20)
  })

  /**
   * The regression this exists for. Appending a same-named entry used to look
   * like it worked — the wizard even selected it — and then the parser dropped
   * it on the next load, keeping the *old* one. Assert against the parser, not
   * just the array, because that is where the data was actually lost.
   */
  it('survives a round-trip through the parser, new values winning', () => {
    const appended = [race('Thri-kreen', 35), race('Thri-kreen', 20)]
    const lost = parseHomebrew({ races: appended })
    expect(lost.races).toHaveLength(1)
    expect(lost.races[0].speed).toBe(35) // the edit vanished

    const upserted = upsert([race('Thri-kreen', 35)], race('Thri-kreen', 20))
    const kept = parseHomebrew({ races: upserted })
    expect(kept.races).toHaveLength(1)
    expect(kept.races[0].speed).toBe(20) // the edit stuck
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

  it('reads the legacy flexible-increase shape, and the feat flag', () => {
    // `{ count, amount }` is what every file written before modes existed
    // carries, and a world file is never rewritten just because it was opened —
    // so this input has to keep parsing forever. Two +1s is exactly what it
    // always meant.
    const race = parseRace({
      name: 'Adaptable',
      flexibleAsi: { count: 2, amount: 1 },
      grantsFeat: true,
    })
    expect(race!.flexibleAsi).toEqual([{ increases: [1, 1] }])
    expect(race!.grantsFeat).toBe(true)
  })

  it('reads modes, so a race can offer a choice of shapes', () => {
    const race = parseRace({
      name: 'Boulderkin',
      flexibleAsi: [
        { label: '+2 and +1', increases: [2, 1] },
        { increases: [1, 1, 1] },
      ],
    })
    expect(race!.flexibleAsi).toEqual([
      { label: '+2 and +1', increases: [2, 1] },
      { increases: [1, 1, 1] },
    ])
  })

  it('drops flexible increases it cannot make sense of', () => {
    const of = (flexibleAsi: unknown) =>
      parseRace({ name: 'X', flexibleAsi })!.flexibleAsi
    expect(of([])).toBeUndefined()
    expect(of([{ increases: [] }])).toBeUndefined()
    expect(of([{ increases: ['two'] }])).toBeUndefined()
    expect(of('yes')).toBeUndefined()
    // Clamped like every other number here: 1-10 per slot, and no more slots
    // than there are abilities to put them in.
    expect(of([{ increases: [99] }])).toEqual([{ increases: [10] }])
    expect(of([{ increases: [1, 1, 1, 1, 1, 1, 1, 1] }])).toEqual([
      { increases: [1, 1, 1, 1, 1, 1] },
    ])
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

describe('parseFeat', () => {
  it('drops a nameless feat', () => {
    expect(parseFeat({ summary: 'x' })).toBeNull()
    expect(parseFeat({ name: '   ' })).toBeNull()
  })

  it('keeps a positive speed bonus and drops a useless one', () => {
    expect(
      parseFeat({ name: 'Fleet', grant: { speedBonus: 10 } })?.grant.speedBonus,
    ).toBe(10)
    // Additive only — a grant that took speed away would be the one thing here
    // that subtracts, and zero is just noise.
    expect(
      parseFeat({ name: 'Fleet', grant: { speedBonus: -10 } })?.grant
        .speedBonus,
    ).toBeUndefined()
    expect(
      parseFeat({ name: 'Fleet', grant: { speedBonus: 0 } })?.grant.speedBonus,
    ).toBeUndefined()
    expect(
      parseFeat({ name: 'Fleet', grant: {} })?.grant.speedBonus,
    ).toBeUndefined()
  })

  it('keeps an initiative bonus either side of zero', () => {
    expect(
      parseFeat({ name: 'Alert', grant: { initiativeBonus: 5 } })?.grant
        .initiativeBonus,
    ).toBe(5)
    // Unlike speed, a penalty here is legitimate and must survive the parse.
    expect(
      parseFeat({ name: 'Sluggish', grant: { initiativeBonus: -3 } })?.grant
        .initiativeBonus,
    ).toBe(-3)
    // Zero is still just noise.
    expect(
      parseFeat({ name: 'Alert', grant: { initiativeBonus: 0 } })?.grant
        .initiativeBonus,
    ).toBeUndefined()
    expect(
      parseFeat({ name: 'Alert', grant: {} })?.grant.initiativeBonus,
    ).toBeUndefined()
  })

  it('keeps the skillOrTool and expertise pick kinds', () => {
    // An unknown kind degrades to 'other', which routes nowhere — so a kind
    // missing from PICK_KINDS is a silent grant of nothing.
    const feat = parseFeat({
      name: 'Handy',
      grant: {
        picks: [
          {
            id: 'handy-any',
            kind: 'skillOrTool',
            label: 'Any three',
            count: 3,
            open: true,
          },
          {
            id: 'handy-exp',
            kind: 'expertise',
            label: 'Expertise',
            count: 1,
            options: ['stealth'],
          },
        ],
      },
    })
    expect(feat?.grant.picks?.[0].kind).toBe('skillOrTool')
    expect(feat?.grant.picks?.[1].kind).toBe('expertise')
  })

  it('parses granted spells, defaulting a bare string to 1st level', () => {
    // The shorthand exists because most homebrew means "a 1st-level spell", and
    // writing `{ name, level }` for every one is a wall.
    const feat = parseFeat({
      name: 'Hexer',
      grant: {
        spells: ['Bane', { name: 'Misty Step', level: 2 }, { name: 'Light' }],
      },
    })
    expect(feat?.grant.spells).toEqual([
      { name: 'Bane', level: 1 },
      { name: 'Misty Step', level: 2 },
      { name: 'Light', level: 1 },
    ])
  })

  it('drops a blank granted spell but keeps a name at two levels', () => {
    // Same name at two levels is legitimate — Magic Initiate's cantrip and
    // spell can share one — so dedup is on name *and* level.
    const feat = parseFeat({
      name: 'Hexer',
      grant: {
        spells: [
          '  ',
          { name: 'Guidance', level: 0 },
          { name: 'Guidance', level: 1 },
          { name: 'Guidance', level: 1 },
        ],
      },
    })
    expect(feat?.grant.spells).toEqual([
      { name: 'Guidance', level: 0 },
      { name: 'Guidance', level: 1 },
    ])
  })

  it('derives the id from the name', () => {
    expect(parseFeat({ name: 'Great Weapon Master' })!.id).toBe(
      'great-weapon-master',
    )
  })

  it('reads the grant through the shared parser, normalising tokens', () => {
    const feat = parseFeat({
      name: 'Resilient',
      summary: 'Tougher than you look.',
      grant: {
        saves: ['con'],
        // Capitalised on purpose: tokenId should normalise it to the id.
        resistances: ['Cold'],
        skills: ['athletics'],
      },
    })
    expect(feat!.grant.saves).toEqual(['con'])
    expect(feat!.grant.resistances).toEqual(['cold'])
    expect(feat!.grant.skills).toEqual(['athletics'])
  })

  it('keeps a half-feat ability bump and omits an empty one', () => {
    expect(parseFeat({ name: 'Resilient', asi: { con: 1 } })!.asi).toEqual({
      con: 1,
    })
    // A full feat has no `asi` key at all rather than an empty object.
    expect(parseFeat({ name: 'Alert' })).not.toHaveProperty('asi')
    expect(parseFeat({ name: 'Alert', asi: { con: 0 } })).not.toHaveProperty(
      'asi',
    )
  })

  it('keeps a prerequisite as free text, and omits a blank one', () => {
    expect(
      parseFeat({ name: 'Grappler', prerequisite: 'Strength 13 or higher' })!
        .prerequisite,
    ).toBe('Strength 13 or higher')
    expect(parseFeat({ name: 'Alert', prerequisite: '  ' })).not.toHaveProperty(
      'prerequisite',
    )
  })

  it('round-trips through serialize without the id', () => {
    const feat = parseFeat({
      name: 'Resilient',
      summary: 'Tougher.',
      prerequisite: 'None',
      asi: { con: 1 },
      grant: { saves: ['con'] },
    })!
    const written = serializeHomebrew({ ...EMPTY_HOMEBREW, feats: [feat] }) as {
      feats: Array<Record<string, unknown>>
    }
    expect(written.feats[0]).not.toHaveProperty('id')
    expect(written.feats[0].name).toBe('Resilient')

    const back = parseHomebrew(written)
    expect(back.feats).toHaveLength(1)
    expect(back.feats[0]).toEqual(feat)
  })

  it('treats a file with no feats key as having none', () => {
    expect(parseHomebrew({ races: [] }).feats).toEqual([])
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

  it('writes a uniform single mode in the shape an older build can read', () => {
    // A build predating modes reads an array as its defaults — two +1s — and is
    // quietly wrong rather than broken. So anything the old shape can still say
    // is written that way, exactly as `serializeSubclass` does.
    const simple = parseHomebrew({
      races: [{ name: 'Adaptable', flexibleAsi: [{ increases: [1, 1] }] }],
    })
    const raw = serializeHomebrew(simple) as {
      races: Array<{ flexibleAsi: unknown }>
    }
    expect(raw.races[0].flexibleAsi).toEqual({ count: 2, amount: 1 })
    expect(parseHomebrew(raw).races[0].flexibleAsi).toEqual([
      { increases: [1, 1] },
    ])
  })

  it('writes modes as modes once the old shape cannot say them', () => {
    const modal = parseHomebrew({
      races: [
        {
          name: 'Boulderkin',
          flexibleAsi: [{ increases: [2, 1] }, { increases: [1, 1, 1] }],
        },
      ],
    })
    const raw = serializeHomebrew(modal) as {
      races: Array<{ flexibleAsi: unknown }>
    }
    expect(raw.races[0].flexibleAsi).toEqual([
      { increases: [2, 1] },
      { increases: [1, 1, 1] },
    ])
    expect(parseHomebrew(raw)).toEqual(modal)
  })
})

describe('subclasses', () => {
  it('reads the legacy bare-string shape', () => {
    // What every file on disk holds today, and will keep holding until
    // somebody authors a feature.
    const kit = parseKit({
      name: 'Warden',
      subclasses: ['Oak', 'Ash'],
    })
    expect(kit?.subclasses.map((sub) => sub.name)).toEqual(['Oak', 'Ash'])
    expect(kit?.subclasses[0].features).toEqual([])
  })

  it('reads both shapes in one list', () => {
    const kit = parseKit({
      name: 'Warden',
      subclasses: [
        'Oak',
        { name: 'Ash', features: [{ level: 3, name: 'Bark Skin' }] },
      ],
    })
    expect(kit?.subclasses.map((sub) => sub.name)).toEqual(['Oak', 'Ash'])
    expect(kit?.subclasses[1].features).toEqual([
      { level: 3, name: 'Bark Skin' },
    ])
  })

  it('a bad row costs that row and nothing more', () => {
    const kit = parseKit({
      name: 'Warden',
      subclasses: [
        'Oak',
        {
          name: 'Ash',
          features: [
            { level: 3, name: 'Bark Skin' },
            { level: 7 },
            null,
            'nope',
          ],
        },
        { features: [{ level: 1, name: 'orphan' }] },
        { name: '   ' },
        42,
      ],
    })
    expect(kit?.subclasses.map((sub) => sub.name)).toEqual(['Oak', 'Ash'])
    expect(kit?.subclasses[1].features).toEqual([
      { level: 3, name: 'Bark Skin' },
    ])
  })

  it('a feature with no level starts at 1, like a class feature', () => {
    const kit = parseKit({
      name: 'Warden',
      subclasses: [{ name: 'Oak', features: [{ name: 'Sapling' }] }],
    })
    expect(kit?.subclasses[0].features).toEqual([{ level: 1, name: 'Sapling' }])
  })

  it('features of the wrong type yield none rather than throwing', () => {
    const kit = parseKit({
      name: 'Warden',
      subclasses: [{ name: 'Oak', features: 'Bark Skin' }],
    })
    expect(kit?.subclasses[0].features).toEqual([])
  })

  it('drops duplicate names, first wins', () => {
    const kit = parseKit({
      name: 'Warden',
      subclasses: ['Oak', { name: 'oak', features: [{ level: 3, name: 'x' }] }],
    })
    expect(kit?.subclasses).toHaveLength(1)
    expect(kit?.subclasses[0].features).toEqual([])
  })

  it('clamps bonus spell levels to 1-9, not 1-20', () => {
    // Spell levels, not character levels — an easy copy-paste error.
    const kit = parseKit({
      name: 'Warden',
      subclasses: [
        {
          name: 'Oak',
          spells: [{ grantedAt: 3, level: 14, names: ['Entangle'] }],
        },
      ],
    })
    expect(kit?.subclasses[0].spells?.[0].level).toBe(9)
  })

  it('drops a spell row that has no spells left', () => {
    const kit = parseKit({
      name: 'Warden',
      subclasses: [
        {
          name: 'Oak',
          spells: [{ grantedAt: 3, level: 1, names: ['  ', ''] }],
        },
      ],
    })
    expect(kit?.subclasses[0].spells).toBeUndefined()
  })

  it('writes a name-only subclass back as a bare string', () => {
    // The forward-compatibility guarantee, as an executable assertion: an
    // older build reads subclasses with `strList`, which drops anything that
    // isn't a string. Writing objects here would empty its dropdown silently.
    const parsed = parseHomebrew({
      version: 1,
      kits: [{ name: 'Warden', subclasses: ['Oak'] }],
    })
    const out = serializeHomebrew(parsed) as {
      kits: Array<{ subclasses: Array<unknown> }>
    }
    expect(out.kits[0].subclasses).toEqual(['Oak'])
  })

  it('writes an object only when there is more to say', () => {
    const parsed = parseHomebrew({
      version: 1,
      kits: [
        {
          name: 'Warden',
          subclasses: [
            'Oak',
            { name: 'Ash', features: [{ level: 3, name: 'Bark Skin' }] },
          ],
        },
      ],
    })
    const out = serializeHomebrew(parsed) as {
      kits: Array<{ subclasses: Array<unknown> }>
    }
    expect(out.kits[0].subclasses[0]).toBe('Oak')
    expect(out.kits[0].subclasses[1]).toMatchObject({ name: 'Ash' })
  })

  it('round-trips a mixed list unchanged', () => {
    const raw = {
      version: 1,
      kits: [
        {
          name: 'Warden',
          subclasses: [
            'Oak',
            { name: 'Ash', features: [{ level: 3, name: 'Bark Skin' }] },
          ],
        },
      ],
    }
    const once = serializeHomebrew(parseHomebrew(raw))
    expect(serializeHomebrew(parseHomebrew(once))).toEqual(once)
  })
})

describe('grant tokens are normalised to ids', () => {
  it('a typed "Cold" resistance becomes the id the sheet matches', () => {
    // The bug: the editor is a free-text token field, but `damageStance` does
    // an exact `includes` against DAMAGE_TYPES ids. "Cold" saved fine and then
    // silently never showed up under Defences.
    const race = parseRace({
      name: 'Goliath',
      grant: { resistances: ['Cold'] },
    })
    expect(race?.grant.resistances).toEqual(['cold'])
  })

  it('accepts any casing', () => {
    const race = parseRace({
      name: 'Goliath',
      grant: { resistances: ['COLD', 'fire', 'Poison'] },
    })
    expect(race?.grant.resistances).toEqual(['cold', 'fire', 'poison'])
  })

  it('leaves a homebrew damage type exactly as typed', () => {
    const race = parseRace({
      name: 'Voidkin',
      grant: { resistances: ['Void'] },
    })
    expect(race?.grant.resistances).toEqual(['Void'])
  })

  it('normalises condition immunities, armor and weapon categories too', () => {
    const race = parseRace({
      name: 'Construct',
      grant: {
        conditionImmunities: ['Charmed'],
        armor: ['Light armor'],
        weapons: ['Simple weapons'],
      },
    })
    expect(race?.grant.conditionImmunities).toEqual(['charmed'])
    expect(race?.grant.armor).toEqual(['light'])
    expect(race?.grant.weapons).toEqual(['simple'])
  })
})

describe('an authored subclass survives a round trip', () => {
  /**
   * The editor can now author a subclass's summary and features, so what was
   * previously only *readable* is now something a user can create. This is the
   * path their work takes to disk and back.
   */
  const authored = {
    kits: [
      {
        name: 'Blood Hunter',
        hitDie: 10,
        subclassLabel: 'Order',
        subclasses: [
          {
            name: 'Order of the Lycan',
            summary: 'A curse, harnessed.',
            features: [
              { level: 3, name: 'Hybrid Transformation', text: 'Shift.' },
            ],
          },
        ],
      },
    ],
  }

  it('keeps the name, summary and features', () => {
    const round = parseHomebrew(serializeHomebrew(parseHomebrew(authored)))
    const sub = round.kits[0].subclasses[0]
    expect(sub.name).toBe('Order of the Lycan')
    expect(sub.summary).toBe('A curse, harnessed.')
    expect(sub.features).toEqual([
      { level: 3, name: 'Hybrid Transformation', text: 'Shift.' },
    ])
  })

  it('writes a subclass that carries nothing back as a bare string', () => {
    // `serializeSubclass`'s rule: a file only gains objects for entries that
    // genuinely hold something, so an untouched list stays as it was on disk.
    const bare = parseHomebrew({
      kits: [{ name: 'Warden', subclasses: ['Oak'] }],
    })
    const raw = serializeHomebrew(bare) as {
      kits: Array<{ subclasses: Array<unknown> }>
    }
    expect(raw.kits[0].subclasses).toEqual(['Oak'])
  })
})

describe('a third caster subclass survives a round trip', () => {
  /**
   * `serializeSubclass` has always written this block — it spreads the whole
   * object — but `parseSubclasses` walked straight past it, so the progression
   * survived a save and vanished on the next load. Worse, `isBareSubclass` did
   * not count it, so a subclass whose *only* content was a spellcasting block
   * was written back as a plain string and lost outright.
   */
  const trickster = {
    kits: [
      {
        name: 'Warden',
        subclasses: [
          {
            name: 'Oak',
            features: [{ level: 3, name: 'Bark Skin' }],
            spellcasting: {
              ability: 'int',
              slotsAtLevel1: 0,
              cantripsKnown: 2,
              spellsKnown: 3,
              prepares: false,
              listLabel: 'Wizard spells',
              slotsByLevel: { 3: [2], 7: [4, 2] },
              cantripsByLevel: { 3: 2, 10: 3 },
              spellsKnownByLevel: { 3: 3, 4: 4 },
            },
          },
        ],
      },
    ],
  }

  it('reads the block back', () => {
    const sub = parseHomebrew(trickster).kits[0].subclasses[0]
    expect(sub.spellcasting?.ability).toBe('int')
    expect(sub.spellcasting?.listLabel).toBe('Wizard spells')
    expect(sub.spellcasting?.slotsByLevel).toEqual({ 3: [2], 7: [4, 2] })
  })

  it('keeps it through serialize and back', () => {
    const round = parseHomebrew(serializeHomebrew(parseHomebrew(trickster)))
    expect(round.kits[0].subclasses[0].spellcasting?.slotsByLevel).toEqual({
      3: [2],
      7: [4, 2],
    })
  })

  it('is not bare when spellcasting is all it has', () => {
    const only = parseHomebrew({
      kits: [
        {
          name: 'Warden',
          subclasses: [
            {
              name: 'Oak',
              spellcasting: {
                ability: 'int',
                listLabel: 'Wizard spells',
                slotsByLevel: { 3: [2] },
              },
            },
          ],
        },
      ],
    })
    const sub = only.kits[0].subclasses[0]
    expect(isBareSubclass(sub)).toBe(false)
    // And so it serializes as an object rather than collapsing to a name.
    const raw = serializeHomebrew(only) as {
      kits: Array<{ subclasses: Array<unknown> }>
    }
    expect(typeof raw.kits[0].subclasses[0]).toBe('object')
  })

  it('reads spellsKnownByLevel and spellbook, which were dropped', () => {
    // Declared on `SpellcastingInfo` and never parsed, so a homebrew "known"
    // caster round-tripped without the table the level-up wizard reads.
    const hb = parseHomebrew({
      kits: [
        {
          name: 'Warden',
          spellcasting: {
            ability: 'wis',
            listLabel: 'Warden spells',
            spellsKnownByLevel: { 1: 2, 5: 6 },
            spellbook: { perLevel: 2 },
          },
        },
      ],
    })
    expect(hb.kits[0].spellcasting?.spellsKnownByLevel).toEqual({ 1: 2, 5: 6 })
    expect(hb.kits[0].spellcasting?.spellbook).toEqual({ perLevel: 2 })
  })
})

describe('isEmptyGrant', () => {
  /**
   * The editor always has an object to bind to, so an untouched grant is `{}`.
   * Storing that would make `isBareSubclass` judge the subclass non-bare on the
   * strength of nothing, and it would serialize as `{ name, grant: {} }`
   * instead of a plain string — noise in a file people hand-edit.
   */
  it('is true for nothing, and for fields present but empty', () => {
    expect(isEmptyGrant({})).toBe(true)
    expect(isEmptyGrant({ skills: [], languages: [] })).toBe(true)
    expect(isEmptyGrant({ currency: {} })).toBe(true)
  })

  it('is false as soon as anything is actually granted', () => {
    expect(isEmptyGrant({ skills: ['stealth'] })).toBe(false)
    expect(isEmptyGrant({ armor: ['medium'] })).toBe(false)
    expect(isEmptyGrant({ currency: { gp: 10 } })).toBe(false)
  })
})

describe('standalone subclasses on disk', () => {
  const swords = {
    className: 'Bard',
    name: 'College of Swords',
    summary: 'A blade as an instrument.',
    features: [{ level: 3, name: 'Blade Flourish', text: 'Flourish.' }],
  }

  it('round-trips with its class attached', () => {
    const round = parseHomebrew(
      serializeHomebrew(parseHomebrew({ subclasses: [swords] })),
    )
    expect(round.subclasses).toHaveLength(1)
    expect(round.subclasses[0].className).toBe('Bard')
    expect(round.subclasses[0].name).toBe('College of Swords')
    expect(round.subclasses[0].features).toEqual([
      { level: 3, name: 'Blade Flourish', text: 'Flourish.' },
    ])
  })

  it('drops an entry with no class to attach to', () => {
    // It would have nowhere to go and would silently never appear.
    expect(
      parseHomebrew({ subclasses: [{ name: 'Orphan' }] }).subclasses,
    ).toEqual([])
    expect(
      parseHomebrew({ subclasses: [{ ...swords, className: '  ' }] })
        .subclasses,
    ).toEqual([])
  })

  it('drops a nameless entry', () => {
    expect(
      parseHomebrew({ subclasses: [{ className: 'Bard' }] }).subclasses,
    ).toEqual([])
  })

  it('de-dupes on class and name together, not name alone', () => {
    // Two classes may each offer a "Hunter"; the shared id-based de-dupe would
    // have thrown one away.
    const both = parseHomebrew({
      subclasses: [
        { className: 'Ranger', name: 'Hunter', features: [] },
        { className: 'Bard', name: 'Hunter', features: [] },
        { className: 'ranger', name: 'hunter', features: [] },
      ],
    })
    expect(both.subclasses.map((s) => s.className)).toEqual(['Ranger', 'Bard'])
  })

  it('keeps a class the tables do not know', () => {
    // It may be defined in a world this global file cannot see.
    const hb = parseHomebrew({
      subclasses: [{ ...swords, className: 'Blood Hunter' }],
    })
    expect(hb.subclasses[0].className).toBe('Blood Hunter')
  })

  it('reads everything a subclass can carry', () => {
    const full = parseHomebrew({
      subclasses: [
        {
          ...swords,
          spells: [{ grantedAt: 3, level: 1, names: ['Bless'] }],
          grant: { armor: ['medium'] },
          spellcasting: {
            ability: 'cha',
            listLabel: 'Bard spells',
            slotsByLevel: { 3: [2] },
          },
        },
      ],
    })
    const sub = full.subclasses[0]
    expect(sub.spells).toEqual([{ grantedAt: 3, level: 1, names: ['Bless'] }])
    expect(sub.grant?.armor).toEqual(['medium'])
    expect(sub.spellcasting?.ability).toBe('cha')
  })

  it('treats a missing key as none', () => {
    expect(parseHomebrew({}).subclasses).toEqual([])
    expect(parseHomebrew({ subclasses: 'nope' }).subclasses).toEqual([])
  })
})

/**
 * A per-level choice on a feature — the College of Swords offering two Fighting
 * Styles at 3rd level.
 *
 * `parseFeatures` used to return `{ level, name, text }` and nothing else, so
 * `picks` and `resource` were destroyed on load. That made this unauthorable by
 * *any* route: hand-writing it into homebrew.json parsed to nothing, and the
 * next save wrote the loss back out. The data model always supported it — the
 * Champion's second Fighting Style at 10th ships in `classKits.ts`.
 */
describe('a choice on a feature', () => {
  const swordsWithPick = {
    className: 'Bard',
    name: 'College of Swords',
    features: [
      {
        level: 3,
        name: 'Fighting Style',
        text: 'You adopt a style.',
        picks: [
          {
            kind: 'feature',
            label: 'Choose a Fighting Style',
            count: 1,
            options: ['Dueling', 'Two-Weapon Fighting'],
            featureLabel: 'Fighting Style',
            featureText: { Dueling: '+2 damage with one one-handed weapon.' },
            featureGrant: { Dueling: { skills: ['athletics'] } },
          },
        ],
        resource: { name: 'Bardic Inspiration', total: 3, resets: 'long' },
      },
    ],
  }

  it('survives the parse it used to be destroyed by', () => {
    const feature = parseHomebrew({ subclasses: [swordsWithPick] })
      .subclasses[0].features[0]
    expect(feature.picks).toHaveLength(1)
    expect(feature.resource).toEqual({
      name: 'Bardic Inspiration',
      total: 3,
      resets: 'long',
    })
  })

  it('keeps the feature kind rather than coercing it to other', () => {
    // `PICK_KINDS` omitted 'feature', so it parsed as 'other' — which
    // `applyPicks` records and then discards.
    const pick = parseHomebrew({ subclasses: [swordsWithPick] }).subclasses[0]
      .features[0].picks![0]
    expect(pick.kind).toBe('feature')
    expect(pick.featureLabel).toBe('Fighting Style')
    expect(pick.featureText).toEqual({
      Dueling: '+2 damage with one one-handed weapon.',
    })
    expect(pick.featureGrant).toEqual({ Dueling: { skills: ['athletics'] } })
  })

  it('namespaces the pick id through the subclass, not the class', () => {
    // Ids share one keyspace across every table; two archetypes of one class
    // can each pose a choice.
    const pick = parseHomebrew({ subclasses: [swordsWithPick] }).subclasses[0]
      .features[0].picks![0]
    expect(pick.id).toContain('college-of-swords')
    expect(pick.id).toContain('fighting-style')
  })

  it('round-trips without leaking the derived id to disk', () => {
    const parsed = parseHomebrew({ subclasses: [swordsWithPick] })
    const written = serializeHomebrew(parsed) as {
      subclasses: Array<{ features: Array<{ picks: Array<{ id?: string }> }> }>
    }
    const pick = written.subclasses[0].features[0].picks[0]
    expect(pick.id).toBeUndefined()
    expect(pick).toMatchObject({ kind: 'feature', featureLabel: 'Fighting Style' })
  })

  it('is stable across a second parse', () => {
    // A file that changes shape every time it is opened would churn on disk.
    const once = parseHomebrew({ subclasses: [swordsWithPick] })
    const twice = parseHomebrew(serializeHomebrew(once))
    expect(twice.subclasses[0].features[0]).toEqual(
      once.subclasses[0].features[0],
    )
  })

  it('carries picks on a class kit’s features too', () => {
    const kit = parseHomebrew({
      kits: [{ name: 'Warden', features: swordsWithPick.features }],
    }).kits[0]
    expect(kit.features[0].picks).toHaveLength(1)
  })

  it('keeps halfProficiency, the third field with no editor', () => {
    const feature = parseHomebrew({
      kits: [
        {
          name: 'Warden',
          features: [{ level: 2, name: 'Jack of All Trades', halfProficiency: 'all' }],
        },
      ],
    }).kits[0].features[0]
    expect(feature.halfProficiency).toBe('all')
  })

  it('drops a closed choice with no options, which can never be answered', () => {
    const feature = parseHomebrew({
      kits: [
        {
          name: 'Warden',
          features: [
            { level: 1, name: 'Nothing', picks: [{ kind: 'feature', label: 'X', count: 1, options: [] }] },
          ],
        },
      ],
    }).kits[0].features[0]
    expect(feature.picks).toBeUndefined()
  })
})
