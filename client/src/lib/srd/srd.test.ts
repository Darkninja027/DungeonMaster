import { describe, expect, it } from 'vitest'
import { ABILITIES, CONDITIONS, DAMAGE_TYPES, SKILLS } from '../character'
import type { Ability } from '../character'
import { PHB_CLASSES, findClass } from '../classes'
// Reaches *out* of srd/ on purpose. The published feats are not SRD content —
// that is why they live in lib/feats/ — but their picks share one global id
// keyspace with every race, background and kit pick here, so they have to be
// checked by the same walkers. Duplicating them into a second test file would
// let a collision between the two tiers slip through, which is the exact class
// of silent bug this file exists to catch.
import { PUBLISHED_FEATS } from '../feats'
// Same reasoning for the published races: not SRD content, which is why they
// live in lib/races/, but subject to every integrity rule below.
import { PUBLISHED_RACES } from '../races'
import { SRD_BACKGROUNDS } from './backgrounds'
import { SRD_CLASS_KITS } from './classKits'
import { ARMOR_AC, WEAPON_STATS } from './equipment'
import { SRD_RACES } from './races'
import { spellcastingFor, subclassLevelOf } from '../tables'
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

/**
 * Both built-in race tiers. The published races are checked by exactly the same
 * walkers as the SRD nine — see the import note above.
 */
const ALL_RACES = [...SRD_RACES, ...PUBLISHED_RACES]

/** Every grant in the tables, labelled with where it came from for failures. */
function allGrants(): Array<{ where: string; grant: Grant }> {
  const out: Array<{ where: string; grant: Grant }> = []
  for (const race of ALL_RACES) {
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
  for (const feat of PUBLISHED_FEATS) {
    out.push({ where: `feat ${feat.name}`, grant: feat.grant })
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
    // Feature picks, class and subclass. These were missed for as long as they
    // have existed: a Fighting Style and a Battle Master's manoeuvres live on
    // `features[].picks`, not on any `grant`, so every check below — global id
    // uniqueness, featureText completeness, unique options, the banned
    // featureGrant fields — walked straight past them.
    for (const feature of kit.features) {
      for (const pick of feature.picks ?? []) {
        out.push({ where: `kit ${kit.name} ${feature.name}`, pick })
      }
    }
    for (const sub of kit.subclasses) {
      for (const feature of sub.features) {
        for (const pick of feature.picks ?? []) {
          out.push({
            where: `kit ${kit.name}/${sub.name} ${feature.name}`,
            pick,
          })
        }
      }
    }
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

  it('every granted spell has a name and a legal level', () => {
    // A blank name renders as an empty spell row, and a level outside 0-9 is
    // either a typo or a slot that doesn't exist — both silent on the sheet.
    for (const { where, grant } of allGrants()) {
      for (const spell of grant.spells ?? []) {
        expect(spell.name.trim(), `${where}: blank granted spell`).not.toBe('')
        expect(
          spell.level,
          `${where}: spell "${spell.name}" level ${spell.level}`,
        ).toBeGreaterThanOrEqual(0)
        expect(
          spell.level,
          `${where}: spell "${spell.name}" level ${spell.level}`,
        ).toBeLessThanOrEqual(9)
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
      // `expertise` picks are skill ids too; `skillOrTool` is checked below,
      // where the options are deliberately mixed.
      if (pick.kind !== 'skill' && pick.kind !== 'expertise') continue
      for (const id of pick.options) {
        expect(
          SKILL_IDS.has(id),
          `${where} pick ${pick.id}: bad skill "${id}"`,
        ).toBe(true)
      }
    }
  })

  it('a skillOrTool pick offers skill ids as its chips', () => {
    // The tools ride the combobox as suggestions, so everything authored in
    // `options` is still a skill and still has to be a real id — switching
    // Skilled to the new kind would otherwise silently drop it out of the
    // check above.
    for (const { where, pick } of allPickLists()) {
      if (pick.kind !== 'skillOrTool') continue
      for (const id of pick.options) {
        expect(
          SKILL_IDS.has(id),
          `${where} pick ${pick.id}: bad skill "${id}"`,
        ).toBe(true)
      }
    }
  })

  it('a skillOrTool pick is always open', () => {
    // Half its answers are free-text tools, so a closed one cannot be answered.
    for (const { where, pick } of allPickLists()) {
      if (pick.kind !== 'skillOrTool') continue
      expect(pick.open, `${where} pick ${pick.id}`).toBe(true)
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

  it('a class kit expertise pick draws from that kit’s own skill list', () => {
    // A class doubles a proficiency it could actually have, so its authored
    // options are the *ceiling* the wizard narrows from — the same eleven the
    // kit offers as skills. A general feat is different: Skill Expert applies to
    // any character, so all eighteen is right there. Duplicating the eleven is
    // what makes this check worth having; it catches the two lists drifting.
    for (const kit of SRD_CLASS_KITS) {
      for (const pick of kit.grant.picks ?? []) {
        if (pick.kind !== 'expertise') continue
        for (const id of pick.options) {
          expect(
            kit.skillChoices.options.includes(id),
            `kit ${kit.name} pick ${pick.id}: "${id}" is not one of its skills`,
          ).toBe(true)
        }
      }
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
  /**
   * The walk-back lookup every progression table uses: the highest row at or
   * below a level. Mirrors `slotsAtLevel` in lib/levelUp.ts, so these tests
   * read the tables exactly the way the app does.
   */
  const atLevel = <T>(table: Record<number, T>, n: number): T | undefined => {
    let best: T | undefined
    let bestLevel = 0
    for (const key of Object.keys(table)) {
      const lvl = Number(key)
      if (lvl <= n && lvl > bestLevel) {
        bestLevel = lvl
        best = table[lvl]
      }
    }
    return best
  }

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

  it('a subclass table is sane at the level its archetype begins', () => {
    // The class-level checks above all read `kit.spellcasting` and walk past a
    // subclass's own table entirely, so an Arcane Trickster's progression was
    // unvalidated by construction rather than by intent. Its numbers are keyed
    // by character level like every other table here, so the level to check
    // against is `subclassLevelOf`, not 1 — which is also why `slotsAtLevel1`
    // is 0 on a third caster and cannot be compared with the first row.
    for (const kit of SRD_CLASS_KITS) {
      for (const sub of kit.subclasses) {
        const sc = sub.spellcasting
        if (!sc) continue
        const at = subclassLevelOf(kit)
        const where = `${kit.name}/${sub.name}`
        expect(ABILITY_IDS.has(sc.ability), where).toBe(true)
        expect(sc.cantripsKnown, where).toBeGreaterThanOrEqual(0)
        expect(sc.spellsKnown, where).toBeGreaterThanOrEqual(0)

        const slots = sc.slotsByLevel
        expect(slots, `${where} has no slot table`).toBeDefined()
        // Nothing before the archetype exists, and a real row the level it does.
        for (const key of Object.keys(slots!)) {
          expect(
            Number(key),
            `${where} grants slots at ${key}`,
          ).toBeGreaterThanOrEqual(at)
        }
        const first = slots![at]
        expect(first, `${where} has no row at level ${at}`).toBeDefined()
        expect(first[0], `${where} level ${at} slots`).toBeGreaterThan(0)

        // Monotonic, exactly as the class-level tables must be.
        let prior = 0
        for (const key of Object.keys(slots!)
          .map(Number)
          .sort((a, b) => a - b)) {
          const total = slots![key].reduce((sum, n) => sum + n, 0)
          expect(
            total,
            `${where} loses slots at ${key}`,
          ).toBeGreaterThanOrEqual(prior)
          prior = total
        }
      }
    }
  })

  it('an Arcane Trickster matches the printed progression at every level', () => {
    // Transcribed once and got Spells Known wrong from 10th up — off by one,
    // then by two, in a sparse table where the error is invisible unless every
    // level is expanded. Spot checks would not have caught it, so this walks
    // all eighteen.
    const sub = SRD_CLASS_KITS.find((k) => k.name === 'Rogue')!.subclasses.find(
      (s) => s.name === 'Arcane Trickster',
    )!
    const sc = sub.spellcasting!
    // [cantrips beyond Mage Hand, spells known, slots by spell level]
    const printed: Record<number, [number, number, Array<number>]> = {
      3: [2, 3, [2]],
      4: [2, 4, [3]],
      5: [2, 4, [3]],
      6: [2, 4, [3]],
      7: [2, 5, [4, 2]],
      8: [2, 6, [4, 2]],
      9: [2, 6, [4, 2]],
      10: [3, 7, [4, 3]],
      11: [3, 8, [4, 3]],
      12: [3, 8, [4, 3]],
      13: [3, 9, [4, 3, 2]],
      14: [3, 10, [4, 3, 2]],
      15: [3, 10, [4, 3, 2]],
      16: [3, 11, [4, 3, 3]],
      17: [3, 11, [4, 3, 3]],
      18: [3, 11, [4, 3, 3]],
      19: [3, 12, [4, 3, 3, 1]],
      20: [3, 13, [4, 3, 3, 1]],
    }
    for (let level = 3; level <= 20; level++) {
      const [cantrips, known, slots] = printed[level]
      expect(atLevel(sc.cantripsByLevel!, level), `cantrips at ${level}`).toBe(
        cantrips,
      )
      expect(
        atLevel(sc.spellsKnownByLevel!, level),
        `spells known at ${level}`,
      ).toBe(known)
      expect(atLevel(sc.slotsByLevel!, level), `slots at ${level}`).toEqual(
        slots,
      )
    }
    // Mage Hand is the fixed cantrip the count above deliberately excludes.
    expect(sub.grant?.spells?.map((sp) => sp.name)).toEqual(['Mage Hand'])
  })

  it('a spells-known table starts where the caster does and only grows', () => {
    // Every "known" caster's column, at every level it covers. A sparse table
    // hides an off-by-one completely — the Arcane Trickster's was wrong from
    // 10th up on the first pass and read as perfectly plausible.
    const known: Record<string, Record<number, number>> = {
      Bard: {
        1: 4,
        2: 5,
        3: 6,
        4: 7,
        5: 8,
        6: 9,
        7: 10,
        8: 11,
        9: 12,
        10: 14,
        11: 15,
        12: 15,
        13: 16,
        14: 18,
        15: 19,
        16: 19,
        17: 20,
        18: 22,
        19: 22,
        20: 22,
      },
      Sorcerer: {
        1: 2,
        2: 3,
        3: 4,
        4: 5,
        5: 6,
        6: 7,
        7: 8,
        8: 9,
        9: 10,
        10: 11,
        11: 12,
        12: 12,
        13: 13,
        14: 13,
        15: 14,
        16: 14,
        17: 15,
        18: 15,
        19: 15,
        20: 15,
      },
      Warlock: {
        1: 2,
        2: 3,
        3: 4,
        4: 5,
        5: 6,
        6: 7,
        7: 8,
        8: 9,
        9: 10,
        10: 10,
        11: 11,
        12: 11,
        13: 12,
        14: 12,
        15: 13,
        16: 13,
        17: 14,
        18: 14,
        19: 15,
        20: 15,
      },
    }
    for (const [name, table] of Object.entries(known)) {
      const sc = SRD_CLASS_KITS.find((k) => k.name === name)!.spellcasting!
      expect(
        sc.spellsKnownByLevel,
        `${name} has no spells-known table`,
      ).toBeDefined()
      // Level 1 must agree with the flat `spellsKnown` the creation wizard
      // reads, or a fresh character and a levelled one disagree at level 1.
      expect(sc.spellsKnownByLevel![1], `${name} level 1`).toBe(sc.spellsKnown)
      for (let level = 1; level <= 20; level++) {
        expect(
          atLevel(sc.spellsKnownByLevel!, level),
          `${name} at ${level}`,
        ).toBe(table[level])
      }
    }
  })

  it('an Eldritch Knight matches the printed progression at every level', () => {
    // The Fighter's third caster, on the same table shape as the Arcane
    // Trickster: two cantrips, not the three the old prose claimed.
    const sub = SRD_CLASS_KITS.find(
      (k) => k.name === 'Fighter',
    )!.subclasses.find((s) => s.name === 'Eldritch Knight')!
    const sc = sub.spellcasting!
    const printed: Record<number, [number, number, Array<number>]> = {
      3: [2, 3, [2]],
      4: [2, 4, [3]],
      5: [2, 4, [3]],
      6: [2, 4, [3]],
      7: [2, 5, [4, 2]],
      8: [2, 6, [4, 2]],
      9: [2, 6, [4, 2]],
      10: [3, 7, [4, 3]],
      11: [3, 8, [4, 3]],
      12: [3, 8, [4, 3]],
      13: [3, 9, [4, 3, 2]],
      14: [3, 10, [4, 3, 2]],
      15: [3, 10, [4, 3, 2]],
      16: [3, 11, [4, 3, 3]],
      17: [3, 11, [4, 3, 3]],
      18: [3, 11, [4, 3, 3]],
      19: [3, 12, [4, 3, 3, 1]],
      20: [3, 13, [4, 3, 3, 1]],
    }
    for (let level = 3; level <= 20; level++) {
      const [cantrips, spells, slots] = printed[level]
      expect(atLevel(sc.cantripsByLevel!, level), `cantrips at ${level}`).toBe(
        cantrips,
      )
      expect(atLevel(sc.spellsKnownByLevel!, level), `spells at ${level}`).toBe(
        spells,
      )
      expect(atLevel(sc.slotsByLevel!, level), `slots at ${level}`).toEqual(
        slots,
      )
    }
    // No fixed cantrip, unlike the Trickster's Mage Hand.
    expect(sub.grant?.spells).toBeUndefined()
  })

  it('only a class that does not cast leaves its casting to an archetype', () => {
    // A third caster on top of a full caster would be two tables claiming the
    // same character, and `spellcastingFor` silently prefers the subclass.
    for (const kit of SRD_CLASS_KITS) {
      const casters = kit.subclasses.filter((sub) => sub.spellcasting)
      if (casters.length === 0) continue
      expect(
        kit.spellcasting,
        `${kit.name} casts and so does its archetype`,
      ).toBeUndefined()
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

describe('published feats', () => {
  it('every id is unique and matches the slugified name', () => {
    const seen = new Set<string>()
    for (const feat of PUBLISHED_FEATS) {
      expect(feat.id, `feat ${feat.name}`).toBe(slug(feat.name))
      expect(seen.has(feat.id), `duplicate feat id "${feat.id}"`).toBe(false)
      seen.add(feat.id)
    }
  })

  it('every name is unique, case-insensitively', () => {
    // `layer()` keys on the lowercased name, so two feats differing only in
    // case would silently collapse into one at merge time.
    const seen = new Set<string>()
    for (const feat of PUBLISHED_FEATS) {
      const key = feat.name.trim().toLowerCase()
      expect(seen.has(key), `duplicate feat name "${feat.name}"`).toBe(false)
      seen.add(key)
    }
  })

  it('every feat has a summary — it is the only thing the list shows', () => {
    for (const feat of PUBLISHED_FEATS) {
      expect(feat.summary.trim(), `feat ${feat.name}`).not.toBe('')
    }
  })

  it('a stated prerequisite is never blank', () => {
    for (const feat of PUBLISHED_FEATS) {
      if (feat.prerequisite === undefined) continue
      expect(feat.prerequisite.trim(), `feat ${feat.name}`).not.toBe('')
    }
  })

  it('half-feat increases are positive and target real abilities', () => {
    for (const feat of PUBLISHED_FEATS) {
      for (const [ability, amount] of Object.entries(feat.asi ?? {})) {
        expect(ABILITY_IDS.has(ability), `feat ${feat.name}: ${ability}`).toBe(
          true,
        )
        expect(amount, `feat ${feat.name}: ${ability}`).toBeGreaterThan(0)
      }
    }
  })

  it('a chooseable increase offers real abilities, and never with a fixed one', () => {
    for (const feat of PUBLISHED_FEATS) {
      const choice = feat.asiChoice
      if (choice === undefined) continue
      // One or the other. Both would apply twice — a silent +2 from a half-feat.
      expect(
        feat.asi,
        `feat ${feat.name} has both asi and asiChoice`,
      ).toBeUndefined()
      expect(choice.length, `feat ${feat.name}`).toBeGreaterThan(1)
      expect(new Set(choice).size, `feat ${feat.name} repeats an ability`).toBe(
        choice.length,
      )
      for (const ability of choice) {
        expect(ABILITY_IDS.has(ability), `feat ${feat.name}: ${ability}`).toBe(
          true,
        )
      }
    }
  })

  it('says "of your choice" exactly when the increase is chooseable', () => {
    // The summary is the only thing the player reads before taking the feat, so
    // it promising a choice the data cannot offer is the bug this pins — six
    // feats said "of your choice" and then quietly picked for you.
    for (const feat of PUBLISHED_FEATS) {
      if (feat.asi === undefined && feat.asiChoice === undefined) continue
      const promises =
        /\+1 [^.]*of your choice|one ability of your choice/i.test(feat.summary)
      expect(
        feat.asiChoice !== undefined,
        `feat ${feat.name}: summary and data disagree about a chooseable +1`,
      ).toBe(promises)
    }
  })

  it('only Resilient ties its saving throw to the chosen ability', () => {
    for (const feat of PUBLISHED_FEATS) {
      if (!feat.grantsSaveForAsiChoice) continue
      // The flag is meaningless without something to follow.
      expect(feat.asiChoice, `feat ${feat.name}`).toBeDefined()
      // And it must not also hand over a fixed save, or the character gets two.
      expect(feat.grant.saves, `feat ${feat.name}`).toBeUndefined()
    }
  })

  it('a repeatable feature pick offers enough for every level that grants it', () => {
    // A Battle Master takes 3 manoeuvres at 3rd and 2 more at 7, 10 and 15 —
    // nine in total, all distinct, all drawn from one list. If the list were
    // ever shorter than that sum the last pick would be unanswerable, and the
    // level-up step gates on every pick being satisfied, so the player would be
    // stuck with no way forward.
    for (const kit of SRD_CLASS_KITS) {
      for (const sub of kit.subclasses) {
        const byOptions = new Map<string, number>()
        for (const feature of sub.features) {
          for (const pick of feature.picks ?? []) {
            if (pick.kind !== 'feature' || pick.open) continue
            const key = pick.options.join('|')
            byOptions.set(key, (byOptions.get(key) ?? 0) + pick.count)
          }
        }
        for (const [key, needed] of byOptions) {
          expect(
            key.split('|').length,
            `${kit.name} / ${sub.name} asks for ${needed} from a shorter list`,
          ).toBeGreaterThanOrEqual(needed)
        }
      }
    }
  })

  it('every feature pick option carries the text its row will show', () => {
    // A `feature` pick writes its answer onto the sheet as a named row, and the
    // rules text rides on the pick. An option with no entry lands as a bare
    // name — fine for homebrew, wrong for an authored table, where it means a
    // typo in one of the two lists that have to agree.
    for (const { where, pick } of allPickLists()) {
      if (pick.kind !== 'feature' || pick.open) continue
      for (const option of pick.options) {
        const text = pick.featureText?.[option]
        expect(text, `${where}: option "${option}" has no text`).toBeTruthy()
      }
    }
  })

  it('a feature option grants only what both apply paths honour', () => {
    // `applyFeaturePick` routes through `applyGrant` at creation and through
    // the level-up applier afterwards, and neither carries items or currency —
    // they would appear at level 1 and vanish at every level-up. Same rule the
    // feat catalogue follows, asserted here because a fighting style is the
    // other thing built on a bare `Grant`.
    for (const { where, pick } of allPickLists()) {
      if (pick.kind !== 'feature') continue
      for (const [option, grant] of Object.entries(pick.featureGrant ?? {})) {
        const at = `${where}: option "${option}"`
        expect(grant.items, at).toBeUndefined()
        expect(grant.currency, at).toBeUndefined()
        expect(grant.traits, at).toBeUndefined()
        // A grant nested inside a grant has no UI to resolve it.
        expect(grant.picks, at).toBeUndefined()
        // Every option a grant names must be one the pick actually offers.
        expect(pick.options, at).toContain(option)
      }
    }
  })

  it('grants no traits, items or currency — level-up drops all three', () => {
    // `applyFeatGrants` in lib/levelUp.ts deliberately ignores these, so a feat
    // carrying them would apply at level 1 and vanish at every level-up. Better
    // never to author them than to ship that inconsistency.
    for (const feat of PUBLISHED_FEATS) {
      expect(feat.grant.traits, `feat ${feat.name}`).toBeUndefined()
      expect(feat.grant.items, `feat ${feat.name}`).toBeUndefined()
      expect(feat.grant.currency, `feat ${feat.name}`).toBeUndefined()
    }
  })

  it('a speed bonus is a positive whole number of feet', () => {
    for (const feat of PUBLISHED_FEATS) {
      const bonus = feat.grant.speedBonus
      if (bonus === undefined) continue
      expect(Number.isInteger(bonus), `feat ${feat.name}`).toBe(true)
      expect(bonus, `feat ${feat.name}`).toBeGreaterThan(0)
    }
  })

  it('every feat claiming speed in its summary actually grants it', () => {
    // The bug this pins: Mobile shipped with `grant: {}` and its "+10 feet"
    // living only in prose, so the feat visibly did nothing.
    for (const feat of PUBLISHED_FEATS) {
      if (!/\+\d+ feet of speed/.test(feat.summary)) continue
      expect(feat.grant.speedBonus, `feat ${feat.name}`).toBeDefined()
    }
  })

  it('an initiative bonus is a whole number', () => {
    for (const feat of PUBLISHED_FEATS) {
      const bonus = feat.grant.initiativeBonus
      if (bonus === undefined) continue
      expect(Number.isInteger(bonus), `feat ${feat.name}`).toBe(true)
      // Deliberately no positivity check, unlike speed: a penalty to initiative
      // is a legitimate thing for a grant to carry.
      expect(bonus, `feat ${feat.name}`).not.toBe(0)
    }
  })

  it('every feat claiming initiative in its summary actually grants it', () => {
    // The Mobile bug again, one field over: Alert shipped with `grant: {}` and
    // its "+5 to initiative" living only in prose, so the feat did nothing.
    for (const feat of PUBLISHED_FEATS) {
      if (!/\+\d+ to initiative/.test(feat.summary)) continue
      expect(feat.grant.initiativeBonus, `feat ${feat.name}`).toBeDefined()
    }
  })

  it('pick ids are prefixed with the feat id that owns them', () => {
    for (const feat of PUBLISHED_FEATS) {
      for (const pick of feat.grant.picks ?? []) {
        expect(pick.id.startsWith(`${feat.id}-`), `feat ${feat.name}`).toBe(
          true,
        )
      }
    }
  })
})

describe('per-level progression', () => {
  it('every feature is gained at a level between 1 and 20', () => {
    for (const kit of SRD_CLASS_KITS) {
      for (const feature of kit.features) {
        expect(
          Number.isInteger(feature.level),
          `${kit.name}: ${feature.name} level ${feature.level}`,
        ).toBe(true)
        expect(
          feature.level,
          `${kit.name}: ${feature.name}`,
        ).toBeGreaterThanOrEqual(1)
        expect(
          feature.level,
          `${kit.name}: ${feature.name}`,
        ).toBeLessThanOrEqual(20)
      }
    }
  })

  it('every class gains something at level 1', () => {
    // A class that grants nothing at first level is almost certainly a
    // transcription slip rather than a design choice.
    for (const kit of SRD_CLASS_KITS) {
      expect(
        kit.features.some((f) => f.level === 1),
        kit.name,
      ).toBe(true)
    }
  })

  it('no class lists the same feature twice at the same level', () => {
    for (const kit of SRD_CLASS_KITS) {
      const seen = new Set<string>()
      for (const f of kit.features) {
        const key = `${f.level}:${f.name.toLowerCase()}`
        expect(
          seen.has(key),
          `${kit.name}: duplicate ${f.name} at ${f.level}`,
        ).toBe(false)
        seen.add(key)
      }
    }
  })

  it('ASI levels are in range, sorted and unique', () => {
    for (const kit of SRD_CLASS_KITS) {
      const levels = kit.asiLevels
      if (!levels) continue
      expect(new Set(levels).size, kit.name).toBe(levels.length)
      expect(
        [...levels].sort((a, b) => a - b),
        kit.name,
      ).toEqual(levels)
      for (const level of levels) {
        expect(level, kit.name).toBeGreaterThanOrEqual(1)
        expect(level, kit.name).toBeLessThanOrEqual(20)
      }
    }
  })

  it('every class takes an ASI at 4, 8, 12, 16 and 19', () => {
    // Universal in 5e. Fighter and Rogue get extras on top, which the previous
    // test allows for — this one just pins the floor.
    for (const kit of SRD_CLASS_KITS) {
      for (const level of [4, 8, 12, 16, 19]) {
        expect(kit.asiLevels, `${kit.name} missing ASI at ${level}`).toContain(
          level,
        )
      }
    }
  })

  it('spell slot tables are well formed', () => {
    for (const kit of SRD_CLASS_KITS) {
      const slots = kit.spellcasting?.slotsByLevel
      if (!slots) continue
      for (const [key, row] of Object.entries(slots)) {
        const level = Number(key)
        expect(Number.isInteger(level), `${kit.name}: key "${key}"`).toBe(true)
        expect(level, kit.name).toBeGreaterThanOrEqual(1)
        expect(level, kit.name).toBeLessThanOrEqual(20)
        // A row is slots per spell level, so at most 9 entries and never more
        // slots than 5e ever grants at one level.
        expect(row.length, `${kit.name} level ${level}`).toBeLessThanOrEqual(9)
        for (const n of row) {
          expect(n, `${kit.name} level ${level}`).toBeGreaterThanOrEqual(0)
          expect(n, `${kit.name} level ${level}`).toBeLessThanOrEqual(9)
        }
        // A trailing zero means the row claims a spell level it can't cast.
        expect(row.at(-1), `${kit.name} level ${level} ends in 0`).not.toBe(0)
      }
    }
  })

  it('a caster with a slot table defines level 1 and agrees with slotsAtLevel1', () => {
    for (const kit of SRD_CLASS_KITS) {
      const sc = kit.spellcasting
      if (!sc?.slotsByLevel) continue
      const first = sc.slotsByLevel[1]
      expect(first, `${kit.name} has no level 1 row`).toBeDefined()
      // Two sources for the same number would drift; this is the guard.
      expect(first[0], `${kit.name} level 1 slots`).toBe(sc.slotsAtLevel1)
    }
  })

  it('slot progression never goes backwards', () => {
    // Total slots are monotonic in 5e for every full and half caster. A row
    // that drops is a typo, and one that silently reduces a character's slots
    // would be worse than useless.
    for (const kit of SRD_CLASS_KITS) {
      const slots = kit.spellcasting?.slotsByLevel
      if (!slots) continue
      const levels = Object.keys(slots)
        .map(Number)
        .sort((a, b) => a - b)
      let previous = 0
      for (const level of levels) {
        const total = slots[level].reduce((sum, n) => sum + n, 0)
        expect(
          total,
          `${kit.name}: level ${level} has fewer slots than the level before`,
        ).toBeGreaterThanOrEqual(previous)
        previous = total
      }
    }
  })

  it('every caster has a progression table', () => {
    // Without one the level-up wizard leaves slots alone, which is correct
    // behaviour but wrong for a class we ship.
    for (const kit of SRD_CLASS_KITS) {
      if (!kit.spellcasting) continue
      expect(kit.spellcasting.slotsByLevel, `${kit.name}`).toBeDefined()
    }
  })

  it('cantrip tables only ever increase', () => {
    for (const kit of SRD_CLASS_KITS) {
      const table = kit.spellcasting?.cantripsByLevel
      if (!table) continue
      const levels = Object.keys(table)
        .map(Number)
        .sort((a, b) => a - b)
      let previous = -1
      for (const level of levels) {
        expect(table[level], `${kit.name} level ${level}`).toBeGreaterThan(
          previous,
        )
        previous = table[level]
      }
    }
  })
})

describe('progression spot checks', () => {
  const kit = (name: string) => SRD_CLASS_KITS.find((k) => k.name === name)!

  it('a Fighter gets Action Surge at 2 and Extra Attack at 5', () => {
    const fighter = kit('Fighter')
    const at = (n: number) =>
      fighter.features.filter((f) => f.level === n).map((f) => f.name)
    expect(at(2)).toContain('Action Surge')
    expect(at(3)).toContain('Martial Archetype')
    expect(at(5)).toContain('Extra Attack')
    // Fighter is one of the two classes with extra ASIs.
    expect(fighter.asiLevels).toContain(6)
    expect(fighter.asiLevels).toContain(14)
  })

  it('a Rogue gets Cunning Action at 2 and an extra ASI at 10', () => {
    const rogue = kit('Rogue')
    expect(rogue.features.find((f) => f.name === 'Cunning Action')?.level).toBe(
      2,
    )
    expect(rogue.features.find((f) => f.name === 'Evasion')?.level).toBe(7)
    expect(rogue.asiLevels).toContain(10)
    expect(rogue.asiLevels).not.toContain(6)
  })

  it('a full caster follows the SRD slot table', () => {
    const wizard = kit('Wizard')
    const slots = wizard.spellcasting!.slotsByLevel!
    expect(slots[1]).toEqual([2])
    expect(slots[3]).toEqual([4, 2])
    expect(slots[5]).toEqual([4, 3, 2])
    // 9th-level slots arrive at character level 17.
    expect(slots[17]).toEqual([4, 3, 3, 3, 2, 1, 1, 1, 1])
    expect(slots[20]).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1])
  })

  it('every full caster shares one table', () => {
    // They genuinely do in 5e; a divergence here would be a typo.
    const tables = ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard'].map(
      (n) => kit(n).spellcasting!.slotsByLevel!,
    )
    for (const table of tables.slice(1)) {
      expect(table).toEqual(tables[0])
    }
  })

  it('a Warlock has Pact Magic, not the full caster table', () => {
    // Few slots, always at the highest level available — a different shape
    // from every other caster, which is why it has its own table.
    const pact = kit('Warlock').spellcasting!.slotsByLevel!
    expect(pact[1]).toEqual([1])
    expect(pact[2]).toEqual([2])
    // At level 5 both slots are 3rd level, and there are no lower ones.
    expect(pact[5]).toEqual([0, 0, 2])
    expect(pact[17]).toEqual([0, 0, 0, 0, 4])
    expect(pact).not.toEqual(kit('Wizard').spellcasting!.slotsByLevel)
  })

  it('cantrips grow at 4 and 10', () => {
    expect(kit('Wizard').spellcasting!.cantripsByLevel).toEqual({
      1: 3,
      4: 4,
      10: 5,
    })
    expect(kit('Bard').spellcasting!.cantripsByLevel).toEqual({
      1: 2,
      4: 3,
      10: 4,
    })
  })

  it('the half casters gain spellcasting at level 2, not 1', () => {
    // Paladin and Ranger correctly have no level-1 spellcasting block, so the
    // creation wizard skips their spells step — the feature lands at 2.
    for (const name of ['Paladin', 'Ranger']) {
      expect(kit(name).spellcasting, name).toBeUndefined()
      expect(
        kit(name).features.find((f) => f.name === 'Spellcasting')?.level,
        name,
      ).toBe(2)
    }
  })

  it('every class has features beyond level 1', () => {
    for (const k of SRD_CLASS_KITS) {
      expect(
        k.features.some((f) => f.level > 1),
        k.name,
      ).toBe(true)
    }
  })
})

describe('subclasses', () => {
  // Written before the content, per this folder's standing rule: a
  // transcription error here is silent — a feature at the wrong level just
  // arrives at the wrong level, and nothing complains.
  const all = SRD_CLASS_KITS.flatMap((kit) =>
    kit.subclasses.map((sub) => ({ kit, sub })),
  )

  it('every subclass has an id and a name', () => {
    for (const { kit, sub } of all) {
      expect(sub.id, kit.name).not.toBe('')
      expect(sub.name.trim(), kit.name).not.toBe('')
    }
  })

  it('subclass ids are unique within their class', () => {
    for (const kit of SRD_CLASS_KITS) {
      const ids = kit.subclasses.map((sub) => sub.id)
      expect(new Set(ids).size, kit.name).toBe(ids.length)
    }
  })

  it('subclass names are unique within their class', () => {
    for (const kit of SRD_CLASS_KITS) {
      const names = kit.subclasses.map((sub) => sub.name.toLowerCase())
      expect(new Set(names).size, kit.name).toBe(names.length)
    }
  })

  it('every subclass feature sits at a real character level', () => {
    for (const { kit, sub } of all) {
      for (const feature of sub.features) {
        expect(Number.isInteger(feature.level), `${kit.name}/${sub.name}`).toBe(
          true,
        )
        expect(
          feature.level,
          `${kit.name}/${sub.name}/${feature.name}`,
        ).toBeGreaterThanOrEqual(1)
        expect(
          feature.level,
          `${kit.name}/${sub.name}/${feature.name}`,
        ).toBeLessThanOrEqual(20)
        expect(feature.name.trim(), `${kit.name}/${sub.name}`).not.toBe('')
      }
    }
  })

  it('no subclass grants a feature before its class picks one', () => {
    // A feature earlier than the choice itself can never be granted, so it
    // would silently never appear.
    for (const kit of SRD_CLASS_KITS) {
      const at = subclassLevelOf(kit)
      for (const sub of kit.subclasses) {
        for (const feature of sub.features) {
          expect(
            feature.level,
            `${kit.name}/${sub.name}/${feature.name}`,
          ).toBeGreaterThanOrEqual(at)
        }
      }
    }
  })

  it('every bonus spell row is a real spell level', () => {
    for (const { kit, sub } of all) {
      for (const row of sub.spells ?? []) {
        expect(row.level, `${kit.name}/${sub.name}`).toBeGreaterThanOrEqual(1)
        expect(row.level, `${kit.name}/${sub.name}`).toBeLessThanOrEqual(9)
        expect(row.grantedAt, `${kit.name}/${sub.name}`).toBeGreaterThanOrEqual(
          1,
        )
        expect(row.grantedAt, `${kit.name}/${sub.name}`).toBeLessThanOrEqual(20)
        expect(row.names.length, `${kit.name}/${sub.name}`).toBeGreaterThan(0)
      }
    }
  })

  it('only spellcasting classes grant bonus spells', () => {
    // A subclass's own table satisfies this too: what the rule is really after
    // is that an always-prepared spell has somewhere to be cast from, and a
    // third caster supplies that itself. `spellcastingFor` is the same resolver
    // the app reads, so the test agrees with the code rather than the shape.
    for (const kit of SRD_CLASS_KITS) {
      for (const sub of kit.subclasses) {
        if ((sub.spells ?? []).length === 0) continue
        expect(
          spellcastingFor(kit, sub.name),
          `${kit.name}/${sub.name} grants spells but nothing casts them`,
        ).toBeDefined()
      }
    }
  })

  it('every class picks its subclass at a sane level', () => {
    for (const kit of SRD_CLASS_KITS) {
      const at = subclassLevelOf(kit)
      expect(at, kit.name).toBeGreaterThanOrEqual(1)
      expect(at, kit.name).toBeLessThanOrEqual(20)
    }
  })

  it('a wizard picks their school at 2', () => {
    // The off-by-one the boolean could not express.
    const wizard = SRD_CLASS_KITS.find((kit) => kit.name === 'Wizard')
    expect(subclassLevelOf(wizard)).toBe(2)
  })
})

describe('published races', () => {
  it('are slugified, uniquely identified and sanely statted', () => {
    const ids = new Set<string>()
    for (const race of PUBLISHED_RACES) {
      expect(race.id, race.name).toBe(
        race.name
          .trim()
          .toLowerCase()
          .replace(/['’]/g, '')
          .replace(/[^a-z0-9]+/g, '-'),
      )
      expect(ids.has(race.id), `duplicate id ${race.id}`).toBe(false)
      ids.add(race.id)
      expect(race.summary.length, race.name).toBeGreaterThan(0)
      expect(race.speed, race.name).toBeGreaterThanOrEqual(20)
      expect(race.speed, race.name).toBeLessThanOrEqual(40)
      for (const [ability, amount] of Object.entries(race.asi)) {
        expect(ABILITY_IDS.has(ability), `${race.name} ${ability}`).toBe(true)
        expect(amount, `${race.name} ${ability}`).toBeGreaterThan(0)
      }
    }
  })

  it('do not shadow an SRD race', () => {
    // `layer` matches on name, so a collision would silently hide one of the
    // nine rather than adding anything.
    const srd = new Set(SRD_RACES.map((r) => r.name.toLowerCase()))
    for (const race of PUBLISHED_RACES) {
      expect(srd.has(race.name.toLowerCase()), race.name).toBe(false)
    }
  })
})

describe('flexible ability increases', () => {
  it('offer slots a player can actually fill', () => {
    for (const race of ALL_RACES) {
      if (!race.flexibleAsi) continue
      expect(race.flexibleAsi.length, race.name).toBeGreaterThan(0)
      for (const mode of race.flexibleAsi) {
        expect(mode.increases.length, race.name).toBeGreaterThan(0)
        // Six abilities is the most there are to raise.
        expect(mode.increases.length, race.name).toBeLessThanOrEqual(6)
        for (const amount of mode.increases) {
          expect(amount, race.name).toBeGreaterThan(0)
          expect(amount, race.name).toBeLessThanOrEqual(10)
        }
      }
    }
  })

  it('never offer the same shape twice in one race', () => {
    // Two modes that mean the same thing render as duplicate cards, which reads
    // as a bug to the player.
    for (const race of ALL_RACES) {
      const shapes = (race.flexibleAsi ?? []).map((m) =>
        [...m.increases].sort((a, b) => a - b).join('/'),
      )
      expect(new Set(shapes).size, race.name).toBe(shapes.length)
    }
  })
})
