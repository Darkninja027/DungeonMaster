import { describe, expect, it } from 'vitest'

import { SRD_CLASS_KITS } from '../srd'
import { SRD_TABLES, findKit, isBareSubclass, subclassLevelOf } from '../tables'
import {
  PUBLISHED_SUBCLASSES,
  publishedSubclassesFor,
} from './publishedSubclasses'

/**
 * The published tier's own invariants. `srd.test.ts` walks the *merged*
 * `SRD_TABLES`, so the shape checks — pick ids, skill ids, feature levels —
 * already cover these entries. What it cannot see is the thing this file
 * exists for: the boundary between what is SRD 5.1 and what is not.
 */
const published = Object.entries(PUBLISHED_SUBCLASSES).flatMap(
  ([className, subs]) => subs.map((sub) => ({ className, sub })),
)

describe('published subclasses', () => {
  it('name a class the tables actually ship', () => {
    // A typo'd class name is silent: `withPublishedSubclasses` finds no kit and
    // the whole entry vanishes rather than erroring.
    for (const className of Object.keys(PUBLISHED_SUBCLASSES)) {
      expect(
        findKit(SRD_CLASS_KITS, className),
        `no class named "${className}"`,
      ).toBeDefined()
    }
  })

  it('are slugified and uniquely identified', () => {
    const seen = new Set<string>()
    for (const { className, sub } of published) {
      const slug = sub.name
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      expect(sub.id, `${className}/${sub.name}`).toBe(slug)
      expect(seen.has(sub.id), `duplicate id "${sub.id}"`).toBe(false)
      seen.add(sub.id)
    }
  })

  it('carry something worth having', () => {
    // A bare entry here would be indistinguishable from the stub it overlays,
    // and `layerSubclasses` would skip it — a silent no-op.
    for (const { className, sub } of published) {
      expect(isBareSubclass(sub), `${className}/${sub.name} is bare`).toBe(
        false,
      )
      expect(sub.summary, `${className}/${sub.name}`).toBeTruthy()
    }
  })

  it('never shadow an SRD subclass that already has content', () => {
    // Overlaying a *stub* is the entire point. Overlaying a subclass that
    // `lib/srd/` authored would silently replace licensed content with ours.
    for (const { className, sub } of published) {
      const kit = findKit(SRD_CLASS_KITS, className)!
      const clash = kit.subclasses.find(
        (s) => s.name.toLowerCase() === sub.name.toLowerCase(),
      )
      if (!clash) continue
      expect(
        isBareSubclass(clash),
        `${className}/${sub.name} shadows an authored SRD subclass`,
      ).toBe(true)
    }
  })

  it('sit at or above the level their class picks a subclass', () => {
    for (const { className, sub } of published) {
      const at = subclassLevelOf(findKit(SRD_CLASS_KITS, className))
      for (const feature of sub.features) {
        expect(
          feature.level,
          `${className}/${sub.name}/${feature.name}`,
        ).toBeGreaterThanOrEqual(at)
        expect(feature.level).toBeLessThanOrEqual(20)
      }
    }
  })

  it('do not repeat a feature name at the same level', () => {
    for (const { className, sub } of published) {
      const seen = new Set<string>()
      for (const f of sub.features) {
        const key = `${f.level}:${f.name.toLowerCase()}`
        expect(seen.has(key), `${className}/${sub.name}: ${key}`).toBe(false)
        seen.add(key)
      }
    }
  })

  it('reach the merged tables the app actually reads', () => {
    // The tier has to be folded into `SRD_TABLES` as well as `mergeTables` —
    // wiring only one leaves half the app disagreeing with the other half.
    for (const { className, sub } of published) {
      const merged = findKit(SRD_TABLES.kits, className)
      const found = merged?.subclasses.find((s) => s.name === sub.name)
      expect(
        found,
        `${className}/${sub.name} missing from SRD_TABLES`,
      ).toBeDefined()
      expect(found?.features.length).toBe(sub.features.length)
    }
  })

  it('leave a class with no published subclasses alone', () => {
    expect(publishedSubclassesFor('Wizard')).toEqual([])
    expect(publishedSubclassesFor('Not A Class')).toEqual([])
  })

  it('match their class name case-insensitively', () => {
    expect(publishedSubclassesFor('barbarian').length).toBeGreaterThan(0)
    expect(publishedSubclassesFor('  Bard  ').length).toBeGreaterThan(0)
  })
})

describe('the cleric domains', () => {
  // A cleric picks at level 1, so these are the first subclasses that have to
  // work at *creation* rather than only at level-up. All seven are checked
  // together because they were authored together and the split between the
  // SRD one and the six published ones is invisible from the merged tables.
  const cleric = findKit(SRD_TABLES.kits, 'Cleric')
  const DOMAINS = [
    'Knowledge Domain',
    'Life Domain',
    'Light Domain',
    'Nature Domain',
    'Tempest Domain',
    'Trickery Domain',
    'War Domain',
  ]

  it('all seven carry features and a domain spell table', () => {
    for (const name of DOMAINS) {
      const sub = cleric?.subclasses.find((s) => s.name === name)
      expect(sub, name).toBeDefined()
      expect(sub?.features.length, name).toBeGreaterThan(0)
      expect(sub?.spells?.length, name).toBe(5)
    }
  })

  it('grant their domain spells at 1, 3, 5, 7 and 9', () => {
    // The shape 5e uses for every domain. A row at the wrong character level
    // is silent — it just arrives on the wrong level-up.
    for (const name of DOMAINS) {
      const sub = cleric?.subclasses.find((s) => s.name === name)
      expect(
        sub?.spells?.map((row) => row.grantedAt),
        name,
      ).toEqual([1, 3, 5, 7, 9])
      // Spell level tracks character level: 1st-level spells at 1, 2nd at 3.
      expect(
        sub?.spells?.map((row) => row.level),
        name,
      ).toEqual([1, 2, 3, 4, 5])
      for (const row of sub?.spells ?? []) {
        expect(row.names.length, name + ' at ' + row.grantedAt).toBe(2)
      }
    }
  })

  it('each offer a Channel Divinity option at 2nd', () => {
    // The class grants the counter at 2; the domain is what it is spent on.
    for (const name of DOMAINS) {
      const sub = cleric?.subclasses.find((s) => s.name === name)
      const at2 = sub?.features.filter((f) => f.level === 2) ?? []
      expect(
        at2.some((f) => f.name.startsWith('Channel Divinity')),
        name,
      ).toBe(true)
    }
  })

  it('never author a counter of their own', () => {
    // Channel Divinity is the cleric's counter and only three fit on a sheet.
    // A domain adding a second would crowd it out for that domain alone.
    for (const name of DOMAINS) {
      const sub = cleric?.subclasses.find((s) => s.name === name)
      for (const f of sub?.features ?? []) {
        expect(f.resource, name + '/' + f.name).toBeUndefined()
      }
    }
  })

  it('scale Divine Strike as its own row rather than prose', () => {
    // Every domain that has it upgrades at 14. Folded into the level-8 text it
    // would be prose the level-up wizard cannot grant.
    for (const name of DOMAINS) {
      const sub = cleric?.subclasses.find((s) => s.name === name)
      const has8 = sub?.features.some(
        (f) => f.level === 8 && f.name === 'Divine Strike',
      )
      if (!has8) continue
      expect(
        sub?.features.some(
          (f) => f.level === 14 && f.name.startsWith('Divine Strike'),
        ),
        name,
      ).toBe(true)
    }
  })
})

describe('the SRD boundary', () => {
  it('keeps every published subclass out of lib/srd', () => {
    // The promise in `lib/srd/index.ts` is that only SRD 5.1 content lives
    // there. A published subclass that gained features in `classKits.ts` would
    // break it, and nothing else would notice.
    for (const { className, sub } of published) {
      const kit = findKit(SRD_CLASS_KITS, className)!
      const inSrd = kit.subclasses.find((s) => s.name === sub.name)
      if (!inSrd) continue
      expect(
        inSrd.features.length,
        `${className}/${sub.name} has features in lib/srd/`,
      ).toBe(0)
    }
  })

  it('leaves exactly the SRD subclasses authored in lib/srd', () => {
    // SRD 5.1 licenses one archetype per class. This pins which names carry
    // content in `lib/srd/`, so a future pass cannot quietly author a PHB
    // subclass there — it has to come here instead, or change this list
    // deliberately.
    const authored = SRD_CLASS_KITS.flatMap((kit) =>
      kit.subclasses
        .filter((sub) => !isBareSubclass(sub))
        .map((sub) => `${kit.name}/${sub.name}`),
    ).sort()
    expect(authored).toEqual(
      [
        'Barbarian/Path of the Berserker',
        'Bard/College of Lore',
        'Cleric/Life Domain',
        'Druid/Circle of the Land',
        'Fighter/Champion',
        'Rogue/Thief',
        // Not SRD 5.1, and knowingly here: these four predate the published
        // tier. Battle Master, Eldritch Knight, Assassin and Arcane Trickster
        // are PHB archetypes whose content was authored into `lib/srd/` before
        // the boundary was drawn. Moving them is a follow-up, not a silent
        // change — see NEXT-CLASS-PROMPT.md.
        'Fighter/Battle Master',
        'Fighter/Eldritch Knight',
        'Rogue/Assassin',
        'Rogue/Arcane Trickster',
      ].sort(),
    )
  })
})
