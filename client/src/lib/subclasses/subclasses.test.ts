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
