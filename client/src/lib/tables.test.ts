import { describe, expect, it } from 'vitest'
import { PHB_CLASSES } from './classes'
import { EMPTY_HOMEBREW, parseHomebrew } from './homebrew'
import {
  SRD_TABLES,
  findBackground,
  findKit,
  findRace,
  findSubrace,
  mergeTables,
  subraceIndex,
  subracesFor,
} from './tables'
import { SRD_BACKGROUNDS, SRD_CLASS_KITS, SRD_RACES } from './srd'

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
    expect(tables.classes.map((c) => c.name)).toEqual(
      PHB_CLASSES.map((c) => c.name),
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
    expect(tables.classes.at(-1)?.name).toBe('Blood Hunter')
    expect(tables.classes.at(-1)?.hitDie).toBe(10)
  })

  it('a world class list still works exactly as it did before homebrew', () => {
    // Regression guard: worldSettings.classes predates all of this.
    const world = { classes: [{ ...PHB_CLASSES[0], hitDie: 6 }] }
    const tables = mergeTables(EMPTY_HOMEBREW, world)
    expect(tables.classes).toHaveLength(PHB_CLASSES.length)
    expect(tables.classes[0].hitDie).toBe(6)
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
