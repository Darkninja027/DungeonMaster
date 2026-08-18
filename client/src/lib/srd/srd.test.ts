import { describe, expect, it } from 'vitest'
import { ABILITIES, CONDITIONS, DAMAGE_TYPES, SKILLS } from '../character'
import type { Ability } from '../character'
import { PHB_CLASSES, findClass } from '../classes'
import { SRD_BACKGROUNDS } from './backgrounds'
import { SRD_CLASS_KITS } from './classKits'
import { ARMOR_AC, WEAPON_STATS } from './equipment'
import { SRD_RACES } from './races'
import type { Grant, PickList } from './types'

/**
 * Integrity assertions over the SRD tables.
 *
 * These exist because every transcription error in this data is *silent*: a
 * mistyped skill id doesn't throw, it just vanishes when the sheet parses the
 * frontmatter back, and nobody notices until a player wonders why their cleric
 * has no Religion. Roughly 2,000 lines of hand-entered rules is the largest
 * source of defects in this feature, and this file is the net under it.
 *
 * Written before the bulk of the data, deliberately.
 */

const SKILL_IDS = new Set(SKILLS.map((s) => s.id))
const DAMAGE_IDS = new Set(DAMAGE_TYPES.map((d) => d.id))
const CONDITION_IDS = new Set(CONDITIONS.map((c) => c.id))
const ABILITY_IDS = new Set<string>(ABILITIES)

/** Every grant in the tables, labelled with where it came from for failures. */
function allGrants(): Array<{ where: string; grant: Grant }> {
  const out: Array<{ where: string; grant: Grant }> = []
  for (const race of SRD_RACES) {
    out.push({ where: `race ${race.name}`, grant: race.grant })
    for (const sub of race.subraces ?? []) {
      out.push({ where: `subrace ${sub.name}`, grant: sub.grant })
    }
  }
  for (const bg of SRD_BACKGROUNDS) {
    out.push({ where: `background ${bg.name}`, grant: bg.grant })
  }
  for (const kit of SRD_CLASS_KITS) {
    out.push({ where: `kit ${kit.name}`, grant: kit.grant })
    for (const choice of kit.equipment) {
      for (const [i, option] of choice.options.entries()) {
        out.push({
          where: `kit ${kit.name} equipment ${choice.id}[${i}]`,
          grant: option.grant,
        })
      }
    }
  }
  return out
}

/** Every PickList in the tables, labelled. */
function allPickLists(): Array<{ where: string; pick: PickList }> {
  const out: Array<{ where: string; pick: PickList }> = []
  for (const { where, grant } of allGrants()) {
    for (const pick of grant.picks ?? []) out.push({ where, pick })
  }
  for (const kit of SRD_CLASS_KITS) {
    out.push({ where: `kit ${kit.name} skillChoices`, pick: kit.skillChoices })
  }
  return out
}

describe('grant contents reference real ids', () => {
  it('every granted skill is a real SKILLS id', () => {
    for (const { where, grant } of allGrants()) {
      for (const id of grant.skills ?? []) {
        expect(SKILL_IDS.has(id), `${where}: unknown skill "${id}"`).toBe(true)
      }
    }
  })

  it('every granted save is a real ability', () => {
    for (const { where, grant } of allGrants()) {
      for (const id of grant.saves ?? []) {
        expect(ABILITY_IDS.has(id), `${where}: unknown save "${id}"`).toBe(true)
      }
    }
  })

  it('every resistance is a real DAMAGE_TYPES id', () => {
    for (const { where, grant } of allGrants()) {
      for (const id of grant.resistances ?? []) {
        expect(
          DAMAGE_IDS.has(id),
          `${where}: unknown damage type "${id}"`,
        ).toBe(true)
      }
    }
  })

  it('every condition immunity is a real CONDITIONS id', () => {
    for (const { where, grant } of allGrants()) {
      for (const id of grant.conditionImmunities ?? []) {
        expect(
          CONDITION_IDS.has(id),
          `${where}: unknown condition "${id}"`,
        ).toBe(true)
      }
    }
  })

  it('class kit saves are real abilities', () => {
    for (const kit of SRD_CLASS_KITS) {
      for (const save of kit.saves) {
        expect(ABILITY_IDS.has(save), `kit ${kit.name}: bad save`).toBe(true)
      }
      // 5e gives every class exactly two saving throw proficiencies.
      expect(kit.saves.length, `kit ${kit.name}`).toBe(2)
    }
  })

  it('ability priorities list all six abilities exactly once', () => {
    for (const kit of SRD_CLASS_KITS) {
      expect([...kit.abilityPriority].sort(), `kit ${kit.name}`).toEqual(
        [...ABILITIES].sort(),
      )
    }
  })
})

describe('pick lists', () => {
  it('ids are globally unique across every table', () => {
    // All picks share one `draft.picks` keyspace. A duplicate id would make two
    // unrelated choices silently the same choice.
    const seen = new Map<string, string>()
    for (const { where, pick } of allPickLists()) {
      const prior = seen.get(pick.id)
      expect(
        prior,
        `pick id "${pick.id}" used by both ${prior} and ${where}`,
      ).toBeUndefined()
      seen.set(pick.id, where)
    }
  })

  it('skill picks offer only real skill ids', () => {
    for (const { where, pick } of allPickLists()) {
      if (pick.kind !== 'skill') continue
      for (const id of pick.options) {
        expect(
          SKILL_IDS.has(id),
          `${where} pick ${pick.id}: bad skill "${id}"`,
        ).toBe(true)
      }
    }
  })

  it('a closed pick offers at least as many options as it requires', () => {
    for (const { where, pick } of allPickLists()) {
      if (pick.open) continue
      expect(
        pick.options.length,
        `${where} pick ${pick.id} wants ${pick.count} of ${pick.options.length}`,
      ).toBeGreaterThanOrEqual(pick.count)
    }
  })

  it('every pick asks for at least one choice', () => {
    for (const { where, pick } of allPickLists()) {
      expect(pick.count, `${where} pick ${pick.id}`).toBeGreaterThan(0)
    }
  })

  it('options within a pick are unique', () => {
    for (const { where, pick } of allPickLists()) {
      expect(new Set(pick.options).size, `${where} pick ${pick.id}`).toBe(
        pick.options.length,
      )
    }
  })
})

describe('equipment choices', () => {
  it('ids are globally unique', () => {
    const seen = new Set<string>()
    for (const kit of SRD_CLASS_KITS) {
      for (const choice of kit.equipment) {
        expect(
          seen.has(choice.id),
          `duplicate equipment id "${choice.id}"`,
        ).toBe(false)
        seen.add(choice.id)
      }
    }
  })

  it('every choice offers at least two options', () => {
    // A one-option "choice" is a grant; model it as one.
    for (const kit of SRD_CLASS_KITS) {
      for (const choice of kit.equipment) {
        expect(
          choice.options.length,
          `${kit.name}/${choice.id}`,
        ).toBeGreaterThan(1)
      }
    }
  })
})

describe('collection ids', () => {
  it('race ids are unique and match their slugified name', () => {
    const seen = new Set<string>()
    for (const race of SRD_RACES) {
      expect(seen.has(race.id), `duplicate race id "${race.id}"`).toBe(false)
      seen.add(race.id)
      expect(race.id).toBe(slug(race.name))
    }
  })

  it('subrace ids are unique across all races', () => {
    const seen = new Set<string>()
    for (const race of SRD_RACES) {
      for (const sub of race.subraces ?? []) {
        expect(seen.has(sub.id), `duplicate subrace id "${sub.id}"`).toBe(false)
        seen.add(sub.id)
        expect(sub.id).toBe(slug(sub.name))
      }
    }
  })

  it('background ids are unique and match their slugified name', () => {
    const seen = new Set<string>()
    for (const bg of SRD_BACKGROUNDS) {
      expect(seen.has(bg.id), `duplicate background id "${bg.id}"`).toBe(false)
      seen.add(bg.id)
      expect(bg.id).toBe(slug(bg.name))
    }
  })

  it('class kit ids are unique and match their slugified name', () => {
    const seen = new Set<string>()
    for (const kit of SRD_CLASS_KITS) {
      expect(seen.has(kit.id), `duplicate kit id "${kit.id}"`).toBe(false)
      seen.add(kit.id)
      expect(kit.id).toBe(slug(kit.name))
    }
  })
})

describe('kits line up with the shipped class list', () => {
  it('every kit name resolves against PHB_CLASSES', () => {
    // The world's class list is the authority on hit dice; a kit whose name
    // doesn't match one would never be found and would silently do nothing.
    for (const kit of SRD_CLASS_KITS) {
      expect(
        findClass(PHB_CLASSES, kit.name),
        `kit "${kit.name}" matches no PHB class`,
      ).toBeDefined()
    }
  })

  it('covers all 12 PHB classes', () => {
    expect(SRD_CLASS_KITS.length).toBe(PHB_CLASSES.length)
  })
})

describe('races', () => {
  it('ability score increases are positive and target real abilities', () => {
    const check = (asi: Partial<Record<Ability, number>>, where: string) => {
      for (const [key, value] of Object.entries(asi)) {
        expect(ABILITY_IDS.has(key), `${where}: unknown ability "${key}"`).toBe(
          true,
        )
        expect(value, `${where}: ${key}`).toBeGreaterThan(0)
      }
    }
    for (const race of SRD_RACES) {
      check(race.asi, `race ${race.name}`)
      for (const sub of race.subraces ?? []) {
        check(sub.asi, `subrace ${sub.name}`)
      }
    }
  })

  it('every race has a plausible speed', () => {
    for (const race of SRD_RACES) {
      expect(race.speed, race.name).toBeGreaterThanOrEqual(20)
      expect(race.speed, race.name).toBeLessThanOrEqual(40)
    }
  })

  it('only Variant Human takes a feat at level 1', () => {
    const withFeat = SRD_RACES.filter((r) => r.grantsFeat).map((r) => r.name)
    expect(withFeat).toEqual(['Variant Human'])
  })

  it('hpPerLevel is used by exactly one subrace', () => {
    // Guards the "this is a field, not an engine" decision in types.ts.
    const withHp = SRD_RACES.flatMap((r) => r.subraces ?? []).filter(
      (s) => s.hpPerLevel,
    )
    expect(withHp.map((s) => s.name)).toEqual(['Hill Dwarf'])
  })
})

describe('backgrounds', () => {
  it('each grants exactly two skill proficiencies', () => {
    // Universal in 5e, and a good check on transcription.
    for (const bg of SRD_BACKGROUNDS) {
      expect(bg.grant.skills?.length ?? 0, bg.name).toBe(2)
    }
  })

  it('each has a named feature', () => {
    for (const bg of SRD_BACKGROUNDS) {
      expect(bg.feature.name.length, bg.name).toBeGreaterThan(0)
    }
  })
})

describe('spellcasting', () => {
  it('slots and known counts are sane at level 1', () => {
    for (const kit of SRD_CLASS_KITS) {
      const sc = kit.spellcasting
      if (!sc) continue
      expect(ABILITY_IDS.has(sc.ability), kit.name).toBe(true)
      expect(sc.slotsAtLevel1, kit.name).toBeGreaterThan(0)
      expect(sc.cantripsKnown, kit.name).toBeGreaterThanOrEqual(0)
      expect(sc.spellsKnown, kit.name).toBeGreaterThanOrEqual(0)
    }
  })

  it('non-casters have no spellcasting block', () => {
    const casters = SRD_CLASS_KITS.filter((k) => k.spellcasting).map(
      (k) => k.name,
    )
    // Ranger and Paladin gain spells at level 2, so they are correctly absent
    // from a level 1 wizard.
    expect(casters.sort()).toEqual(
      ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'].sort(),
    )
  })
})

describe('equipment tables', () => {
  it('armor AC values are plausible and dex caps well-formed', () => {
    for (const [name, entry] of Object.entries(ARMOR_AC)) {
      expect(entry.base, name).toBeGreaterThanOrEqual(10)
      expect(entry.base, name).toBeLessThanOrEqual(18)
      if (entry.dexCap !== null) {
        expect(entry.dexCap, name).toBeGreaterThanOrEqual(0)
        expect(entry.dexCap, name).toBeLessThanOrEqual(2)
      }
    }
  })

  it('armor and weapon keys are lowercase, since lookups lowercase the row', () => {
    for (const name of Object.keys(ARMOR_AC))
      expect(name).toBe(name.toLowerCase())
    for (const name of Object.keys(WEAPON_STATS)) {
      expect(name).toBe(name.toLowerCase())
    }
  })

  it('weapon damage is dice notation', () => {
    for (const [name, stats] of Object.entries(WEAPON_STATS)) {
      expect(stats.damage, name).toMatch(/^\d+d\d+$/)
    }
  })
})

/** Mirrors the id convention: lowercase, spaces and apostrophes to dashes. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
