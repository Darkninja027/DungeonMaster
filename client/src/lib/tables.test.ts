import { describe, expect, it } from 'vitest'
import { PHB_CLASSES } from './classes'
import { EMPTY_HOMEBREW, parseHomebrew } from './homebrew'
import { parseWorldSettings } from './worldSettings'
import {
  SRD_TABLES,
  classesFrom,
  findBackground,
  findFeat,
  findKit,
  findRace,
  findSubrace,
  mergeTables,
  reconcileSubclasses,
  subclassLevelOf,
  subraceIndex,
  subracesFor,
} from './tables'
import { PUBLISHED_FEATS } from './feats'
import { SRD_BACKGROUNDS, SRD_CLASS_KITS, SRD_FEATS, SRD_RACES } from './srd'

describe('feats', () => {
  it('has no SRD built-ins — SRD 5.1 has no feat list', () => {
    // The reason this tier is empty has not changed; the built-ins now come
    // from lib/feats/, which sits outside srd/ precisely because the published
    // feats are not SRD content.
    expect(SRD_FEATS).toEqual([])
  })

  it('ships the published feats as built-ins', () => {
    const names = mergeTables().feats.map((f) => f.name)
    expect(names).toContain('Alert')
    expect(names).toContain('Great Weapon Master')
    expect(names).toContain('Sharpshooter')
    expect(names).toEqual(PUBLISHED_FEATS.map((f) => f.name))
  })

  it('layers world over global over built-in, matched case-insensitively', () => {
    const global = parseHomebrew({
      feats: [
        { name: 'Alert', summary: 'global' },
        { name: 'Tough', summary: 'global' },
        { name: 'Bespoke', summary: 'global' },
      ],
    })
    // Note the `classes` key: `parseWorldSettings` returns early without one
    // and drops every world-homebrew list, feats included.
    const world = parseWorldSettings({
      classes: [],
      feats: [{ name: 'alert', summary: 'world' }],
    })
    const tables = mergeTables(global, { feats: world.feats })

    // Overridden in place, not appended — same rule as races. Alert and Tough
    // are both built-ins, so neither homebrew entry lengthens the list; only
    // the genuinely new one does, and it lands at the end.
    expect(tables.feats).toHaveLength(PUBLISHED_FEATS.length + 1)
    expect(tables.feats.at(-1)?.name).toBe('Bespoke')

    // The built-in keeps its position; the world's casing is what survives.
    const builtInIndex = PUBLISHED_FEATS.findIndex((f) => f.name === 'Alert')
    expect(tables.feats[builtInIndex]?.name).toBe('alert')
    expect(findFeat(tables.feats, 'Alert')?.summary).toBe('world')
    expect(findFeat(tables.feats, 'Tough')?.summary).toBe('global')
  })

  it('findFeat is name-in, undefined-out', () => {
    const tables = mergeTables()
    expect(findFeat(tables.feats, 'alert')?.name).toBe('Alert')
    expect(findFeat(tables.feats, '  Alert  ')?.name).toBe('Alert')
    // A feat nobody authored: the sheet still keeps the typed name.
    expect(findFeat(tables.feats, 'Ancestral Whatsit')).toBeUndefined()
    expect(findFeat(tables.feats, '')).toBeUndefined()
  })
})

describe('mergeTables', () => {
  it('with no homebrew returns exactly the SRD tables', () => {
    const tables = mergeTables()
    expect(tables.races.map((r) => r.name)).toEqual(
      SRD_RACES.map((r) => r.name),
    )
    expect(tables.backgrounds.map((b) => b.name)).toEqual(
      SRD_BACKGROUNDS.map((b) => b.name),
    )
    expect(tables.kits.map((k) => k.name)).toEqual(
      SRD_CLASS_KITS.map((k) => k.name),
    )
    // Kits are the class list now, so every PHB class must be present as one.
    expect(classesFrom(tables).map((c) => c.name)).toEqual(
      SRD_CLASS_KITS.map((k) => k.name),
    )
  })

  it('appends global homebrew after the built-ins', () => {
    const parsed = parseHomebrew({
      races: [{ name: 'Thri-kreen', asi: { dex: 2 } }],
    })
    const tables = mergeTables(parsed)
    expect(tables.races).toHaveLength(SRD_RACES.length + 1)
    expect(tables.races.at(-1)?.name).toBe('Thri-kreen')
  })

  it('global homebrew shadows an SRD entry of the same name', () => {
    const parsed = parseHomebrew({
      races: [{ name: 'Dwarf', speed: 40, asi: { con: 3 } }],
    })
    const tables = mergeTables(parsed)
    const dwarf = findRace(tables.races, 'Dwarf')
    expect(dwarf?.speed).toBe(40)
    expect(dwarf?.asi).toEqual({ con: 3 })
    // Shadowing replaces, never duplicates.
    expect(tables.races.filter((r) => r.name === 'Dwarf')).toHaveLength(1)
    expect(tables.races).toHaveLength(SRD_RACES.length)
  })

  it('a world entry beats a global one', () => {
    const global = parseHomebrew({ races: [{ name: 'Dwarf', speed: 40 }] })
    const world = parseHomebrew({ races: [{ name: 'Dwarf', speed: 15 }] })
    const tables = mergeTables(global, { races: world.races })
    expect(findRace(tables.races, 'Dwarf')?.speed).toBe(15)
  })

  it('matches names case-insensitively when shadowing', () => {
    const parsed = parseHomebrew({ races: [{ name: 'dWaRf', speed: 40 }] })
    const tables = mergeTables(parsed)
    expect(tables.races).toHaveLength(SRD_RACES.length)
    expect(findRace(tables.races, 'Dwarf')?.speed).toBe(40)
  })

  it('keeps an overridden entry in its original position', () => {
    // A Dwarf that jumps to the end of the grid the moment you tweak it is
    // disorienting; overriding should feel like editing, not re-adding.
    const before = SRD_RACES.findIndex((r) => r.name === 'Dwarf')
    const parsed = parseHomebrew({ races: [{ name: 'Dwarf', speed: 40 }] })
    const tables = mergeTables(parsed)
    expect(tables.races.findIndex((r) => r.name === 'Dwarf')).toBe(before)
  })

  it('merges backgrounds, kits and classes the same way', () => {
    const global = parseHomebrew({
      backgrounds: [{ name: 'Smuggler' }, { name: 'Acolyte', summary: 'Mine' }],
      kits: [{ name: 'Warden' }],
      classes: [{ name: 'Blood Hunter', hitDie: 10 }],
    })
    const tables = mergeTables(global)
    expect(findBackground(tables.backgrounds, 'Smuggler')).toBeDefined()
    expect(findBackground(tables.backgrounds, 'Acolyte')?.summary).toBe('Mine')
    expect(tables.backgrounds).toHaveLength(SRD_BACKGROUNDS.length + 1)
    expect(findKit(tables.kits, 'Warden')).toBeDefined()
    expect(tables.kits.at(-1)?.name).toBe('Blood Hunter')
    expect(tables.kits.at(-1)?.hitDie).toBe(10)
  })

  it('a legacy world class list still overrides, exactly as it did before', () => {
    // Regression guard: worldSettings.classes predates kits, and a world file
    // written by an older build must keep working without being rewritten.
    const world = { classes: [{ ...PHB_CLASSES[0], hitDie: 6 }] }
    const tables = mergeTables(EMPTY_HOMEBREW, world)
    expect(tables.kits).toHaveLength(SRD_CLASS_KITS.length)
    expect(findKit(tables.kits, PHB_CLASSES[0].name)?.hitDie).toBe(6)
  })

  it('a legacy class becomes a kit with no starting gear', () => {
    // Which is exactly what it meant: it never carried any.
    const world = {
      classes: [
        {
          id: 'blood-hunter',
          name: 'Blood Hunter',
          hitDie: 10,
          subclassLabel: 'Order',
          subclasses: ['Order of the Ghostslayer'],
        },
      ],
    }
    const kit = findKit(mergeTables(EMPTY_HOMEBREW, world).kits, 'Blood Hunter')
    expect(kit?.hitDie).toBe(10)
    expect(kit?.subclasses.map((sub) => sub.name)).toEqual([
      'Order of the Ghostslayer',
    ])
    expect(kit?.saves).toEqual([])
    expect(kit?.equipment).toEqual([])
    expect(kit?.features).toEqual([])
  })

  it('a legacy class overlays its three fields onto a richer kit', () => {
    // The bug this pins: every world is auto-seeded with the twelve PHB
    // classes as a legacy `classes` list. Treating those as full replacements
    // stripped the features, saves and equipment off every SRD class in every
    // world, leaving the level-up wizard with nothing to grant.
    const world = { classes: [{ ...PHB_CLASSES[0], hitDie: 6 }] }
    const kit = findKit(
      mergeTables(EMPTY_HOMEBREW, world).kits,
      PHB_CLASSES[0].name,
    )
    // The legacy list owns the hit die...
    expect(kit?.hitDie).toBe(6)
    // ...but everything it never carried survives.
    expect(kit?.features.length).toBeGreaterThan(0)
    expect(kit?.saves.length).toBe(2)
    expect(kit?.equipment.length).toBeGreaterThan(0)
  })

  it('a seeded legacy list leaves every SRD class intact', () => {
    // The exact shape a real world file has after the app scaffolds it.
    const world = { classes: PHB_CLASSES }
    const tables = mergeTables(EMPTY_HOMEBREW, world)
    for (const srd of SRD_CLASS_KITS) {
      const kit = findKit(tables.kits, srd.name)
      expect(kit?.features.length, srd.name).toBe(srd.features.length)
      expect(kit?.asiLevels, srd.name).toEqual(srd.asiLevels)
    }
  })

  it('a seeded legacy list leaves every SRD subclass intact', () => {
    // The same bug one level down, and the reason the test above wasn't
    // enough: it asserts on the kit, so it stayed green while the overlay
    // replaced every rich subclass with a name-only one.
    const world = { classes: PHB_CLASSES }
    const tables = mergeTables(EMPTY_HOMEBREW, world)
    for (const srd of SRD_CLASS_KITS) {
      const kit = findKit(tables.kits, srd.name)
      expect(
        kit?.subclasses.map((sub) => sub.name),
        srd.name,
      ).toEqual(srd.subclasses.map((sub) => sub.name))
      for (const expected of srd.subclasses) {
        const sub = kit?.subclasses.find((s) => s.name === expected.name)
        expect(sub?.features.length, `${srd.name}/${expected.name}`).toBe(
          expected.features.length,
        )
      }
    }
  })

  it('a bare-string legacy list keeps the subclass features it never had', () => {
    // Starts from the shape that is actually on disk — strings — rather than
    // from PHB_CLASSES, which is a constant and could pass for the wrong
    // reason. This is the test that would have caught the original bug.
    const world = parseWorldSettings({
      version: 4,
      classes: [
        {
          name: 'Fighter',
          hitDie: 10,
          subclassLabel: 'Martial Archetype',
          subclasses: ['Champion', 'Battle Master', 'Eldritch Knight'],
        },
      ],
    })
    const kit = findKit(mergeTables(EMPTY_HOMEBREW, world).kits, 'Fighter')
    const champion = kit?.subclasses.find((sub) => sub.name === 'Champion')
    expect(champion?.features.length).toBe(
      SRD_CLASS_KITS.find((k) => k.name === 'Fighter')?.subclasses.find(
        (sub) => sub.name === 'Champion',
      )?.features.length,
    )
  })

  it('a legacy subclass list neither reorders nor truncates the rich one', () => {
    const world = {
      classes: [
        {
          id: 'fighter',
          name: 'Fighter',
          hitDie: 10,
          subclassLabel: 'Martial Archetype',
          // Mentions one, omits two, adds one of its own.
          subclasses: ['Eldritch Knight', 'Homebrew Knight'],
        },
      ],
    }
    const kit = findKit(mergeTables(EMPTY_HOMEBREW, world).kits, 'Fighter')
    expect(kit?.subclasses.map((sub) => sub.name)).toEqual([
      'Champion',
      'Battle Master',
      'Eldritch Knight',
      'Homebrew Knight',
    ])
    // The mentioned one keeps whatever the SRD kit gave it rather than being
    // flattened to a bare name by the legacy overlay.
    const srdEk = SRD_CLASS_KITS.find(
      (k) => k.name === 'Fighter',
    )?.subclasses.find((sub) => sub.name === 'Eldritch Knight')
    const ek = kit?.subclasses.find((sub) => sub.name === 'Eldritch Knight')
    expect(ek?.features.length).toBe(srdEk?.features.length)
  })

  it('classesFrom hands the sheet plain names, never entries', () => {
    // ClassInfo is the sheet-facing shape; an object here renders as
    // "[object Object]" in the subclass datalist.
    for (const info of classesFrom(SRD_TABLES)) {
      for (const name of info.subclasses) {
        expect(typeof name, info.name).toBe('string')
      }
    }
  })

  it('a homebrew subclass appends without displacing the built-ins', () => {
    const wizard = SRD_CLASS_KITS.find((k) => k.name === 'Wizard')!
    const global = {
      ...EMPTY_HOMEBREW,
      kits: [
        {
          ...wizard,
          subclasses: [
            { id: 'school-of-tea', name: 'School of Tea', features: [] },
          ],
        },
      ],
    }
    const kit = findKit(mergeTables(global).kits, 'Wizard')
    // A kit-tier override replaces the list outright — that is what editing a
    // kit means, unlike the legacy overlay above.
    expect(kit?.subclasses.map((sub) => sub.name)).toEqual(['School of Tea'])
  })

  it('resolves the subclass level from either field', () => {
    const wizard = SRD_CLASS_KITS.find((k) => k.name === 'Wizard')
    const cleric = SRD_CLASS_KITS.find((k) => k.name === 'Cleric')
    const fighter = SRD_CLASS_KITS.find((k) => k.name === 'Fighter')
    // The whole reason the number exists: the boolean couldn't say "2".
    expect(subclassLevelOf(wizard)).toBe(2)
    expect(subclassLevelOf(cleric)).toBe(1)
    expect(subclassLevelOf(fighter)).toBe(3)
    // A file written by an older build has only the boolean.
    expect(
      subclassLevelOf({
        ...fighter!,
        subclassLevel: undefined,
        subclassAtLevel1: true,
      }),
    ).toBe(1)
    expect(subclassLevelOf(undefined)).toBe(3)
  })

  it('reconciling an edited name list keeps authored features', () => {
    // The editor binds a token field to the names; without reconciliation a
    // retype would silently discard whatever the user just wrote.
    const existing = [
      {
        id: 'oak',
        name: 'Oak',
        features: [{ level: 3, name: 'Bark Skin' }],
      },
      { id: 'ash', name: 'Ash', features: [] },
    ]
    const next = reconcileSubclasses(existing, ['Oak', 'Elm'])
    expect(next.map((sub) => sub.name)).toEqual(['Oak', 'Elm'])
    expect(next[0].features).toEqual([{ level: 3, name: 'Bark Skin' }])
    expect(next[1].features).toEqual([])
  })

  it('classesFrom exposes only what the sheet needs', () => {
    const cl = classesFrom(SRD_TABLES).find((c) => c.name === 'Fighter')
    expect(cl).toEqual({
      id: 'fighter',
      name: 'Fighter',
      hitDie: 10,
      subclassLabel: 'Martial Archetype',
      subclasses: ['Champion', 'Battle Master', 'Eldritch Knight'],
    })
  })

  it('ignores entries with a blank name', () => {
    const tables = mergeTables({
      ...EMPTY_HOMEBREW,
      races: [
        { id: '', name: '  ', summary: '', asi: {}, speed: 30, grant: {} },
      ],
    })
    expect(tables.races).toHaveLength(SRD_RACES.length)
  })
})

describe('lookups', () => {
  const tables = SRD_TABLES

  it('find by name, case- and whitespace-insensitively', () => {
    expect(findRace(tables.races, '  hill dwarf  ')).toBeUndefined()
    expect(findRace(tables.races, ' DWARF ')?.name).toBe('Dwarf')
    expect(findBackground(tables.backgrounds, 'acolyte')?.name).toBe('Acolyte')
    expect(findKit(tables.kits, 'CLERIC')?.name).toBe('Cleric')
  })

  it('return undefined for an unknown name, not a throw', () => {
    // The free-text contract: homebrew the tables don't know just passes through.
    expect(findRace(tables.races, 'Thri-kreen')).toBeUndefined()
    expect(findBackground(tables.backgrounds, 'Smuggler')).toBeUndefined()
    expect(findKit(tables.kits, 'Blood Hunter')).toBeUndefined()
  })

  it('return undefined for an empty name', () => {
    expect(findRace(tables.races, '')).toBeUndefined()
    expect(findRace(tables.races, '   ')).toBeUndefined()
    expect(findSubrace(tables.races, '')).toBeUndefined()
  })

  it('subracesFor reads off the race, empty for one without any', () => {
    expect(subracesFor(tables.races, 'Dwarf').map((s) => s.name)).toEqual([
      'Hill Dwarf',
      'Mountain Dwarf',
    ])
    expect(subracesFor(tables.races, 'Half-Orc')).toEqual([])
    expect(subracesFor(tables.races, 'Thri-kreen')).toEqual([])
  })
})

describe('subrace resolution — the shadowing hazard', () => {
  it('finds an SRD subrace and its correct parent', () => {
    const hit = findSubrace(SRD_TABLES.races, 'Hill Dwarf')
    expect(hit?.race.name).toBe('Dwarf')
    expect(hit?.subrace.hpPerLevel).toBe(1)
  })

  it('a homebrew subrace resolves to its OWN parent, not an SRD race', () => {
    // The dangerous case. `Character.race` stores only "Hill Dwarf", so the
    // parent is recovered by search. If a homebrew race offers a subrace whose
    // name matches an SRD one, picking the wrong parent silently produces the
    // wrong speed and HP rather than any kind of error.
    const global = parseHomebrew({
      races: [
        {
          name: 'Deep Dwarf',
          speed: 20,
          subraces: [{ name: 'Hill Dwarf', asi: { cha: 2 } }],
        },
      ],
    })
    const tables = mergeTables(global)
    const hit = findSubrace(tables.races, 'Hill Dwarf')
    // Global beats SRD, so the homebrew parent wins — deliberately, and the
    // same precedence the races themselves follow.
    expect(hit?.race.name).toBe('Deep Dwarf')
    expect(hit?.race.speed).toBe(20)
    expect(hit?.subrace.asi).toEqual({ cha: 2 })
  })

  it('a world subrace beats a global one of the same name', () => {
    const global = parseHomebrew({
      races: [{ name: 'A', subraces: [{ name: 'Shared', asi: { str: 1 } }] }],
    })
    const world = parseHomebrew({
      races: [{ name: 'B', subraces: [{ name: 'Shared', asi: { dex: 1 } }] }],
    })
    const tables = mergeTables(global, { races: world.races })
    const hit = findSubrace(tables.races, 'Shared')
    expect(hit?.race.name).toBe('B')
    expect(hit?.subrace.asi).toEqual({ dex: 1 })
  })

  it('overriding a race replaces its subraces wholesale', () => {
    // Shadowing is replacement, not a merge of the two subrace lists — a
    // half-merged race would be impossible to reason about.
    const global = parseHomebrew({
      races: [{ name: 'Dwarf', subraces: [{ name: 'Sky Dwarf' }] }],
    })
    const tables = mergeTables(global)
    expect(subracesFor(tables.races, 'Dwarf').map((s) => s.name)).toEqual([
      'Sky Dwarf',
    ])
    expect(findSubrace(tables.races, 'Hill Dwarf')).toBeUndefined()
  })

  it('the index holds every subrace across every race', () => {
    const index = subraceIndex(SRD_TABLES.races)
    const total = SRD_RACES.reduce((n, r) => n + (r.subraces?.length ?? 0), 0)
    expect(index.size).toBe(total)
    expect(index.get('wood elf')?.race.name).toBe('Elf')
  })

  it('is keyed case-insensitively', () => {
    expect(findSubrace(SRD_TABLES.races, 'HILL DWARF')?.race.name).toBe('Dwarf')
  })
})

describe('kits carry the class fields the sheet needs', () => {
  it('every SRD kit has a hit die and a subclass label', () => {
    for (const kit of SRD_CLASS_KITS) {
      expect(kit.hitDie, kit.name).toBeGreaterThan(0)
      expect(kit.subclassLabel.length, kit.name).toBeGreaterThan(0)
    }
  })

  it('the SRD kits match the PHB class list they absorbed', () => {
    // Guards the one-off merge: the hit die and subclasses moved from
    // PHB_CLASSES into the kits, and a transcription slip would be silent.
    for (const cl of PHB_CLASSES) {
      const kit = findKit(SRD_CLASS_KITS, cl.name)
      expect(kit, cl.name).toBeDefined()
      expect(kit?.hitDie, cl.name).toBe(cl.hitDie)
      expect(kit?.subclassLabel, cl.name).toBe(cl.subclassLabel)
      expect(
        kit?.subclasses.map((sub) => sub.name),
        cl.name,
      ).toEqual(cl.subclasses)
    }
  })

  it('a homebrew class overriding an SRD one replaces its hit die', () => {
    const global = parseHomebrew({
      kits: [{ name: 'Fighter', hitDie: 6, subclasses: ['Duellist'] }],
    })
    const kit = findKit(mergeTables(global).kits, 'Fighter')
    expect(kit?.hitDie).toBe(6)
    expect(kit?.subclasses.map((sub) => sub.name)).toEqual(['Duellist'])
    // Replacement, not a merge — the SRD subclasses are gone.
    expect(kit?.subclasses.map((sub) => sub.name)).not.toContain('Champion')
  })
})
