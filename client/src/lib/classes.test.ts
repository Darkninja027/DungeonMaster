import { describe, expect, it } from 'vitest'
import { SEED_CLASSES } from '../../electron/main/worldSettings'
import { HIT_DIE_SIZES } from './character'
import type { ClassInfo } from './classes'
import {
  PHB_CLASSES,
  findClass,
  subclassLabelFor,
  subclassesFor,
} from './classes'

/**
 * A homebrew list, to prove the lookups work over anything the caller hands them
 * and not just the built-in seed.
 */
const HOMEBREW: Array<ClassInfo> = [
  {
    id: 'blood hunter',
    name: 'Blood Hunter',
    hitDie: 10,
    subclassLabel: 'Blood Hunter Order',
    subclasses: ['Order of the Lycan'],
  },
]

describe('PHB seed', () => {
  // These assert the shape of the *built-in seed*, not of a user's list — a
  // world's worldSettings.json may hold any number of classes with any die.
  it('covers the 12 PHB classes with unique ids and names', () => {
    expect(PHB_CLASSES).toHaveLength(12)
    expect(new Set(PHB_CLASSES.map((c) => c.id)).size).toBe(12)
    expect(new Set(PHB_CLASSES.map((c) => c.name)).size).toBe(12)
  })

  it('gives every class a real hit die and a non-empty subclass list', () => {
    for (const cl of PHB_CLASSES) {
      expect(HIT_DIE_SIZES).toContain(cl.hitDie)
      expect(cl.subclassLabel).not.toBe('')
      expect(cl.subclasses.length).toBeGreaterThan(0)
      expect(cl.subclasses).not.toContain('')
    }
  })

  it('uses ids that match the display names', () => {
    for (const cl of PHB_CLASSES) {
      expect(cl.id).toBe(cl.name.toLowerCase())
    }
  })

  it('knows the martial/caster hit dice', () => {
    expect(findClass(PHB_CLASSES, 'barbarian')?.hitDie).toBe(12)
    expect(findClass(PHB_CLASSES, 'fighter')?.hitDie).toBe(10)
    expect(findClass(PHB_CLASSES, 'rogue')?.hitDie).toBe(8)
    expect(findClass(PHB_CLASSES, 'wizard')?.hitDie).toBe(6)
  })

  /**
   * The main process seeds new worlds from its own copy of this list, because
   * the renderer (Vite/ESM, `#/` alias) and main (esbuild/CJS) don't share a
   * module graph. This is the guard on that duplication — if it fails, someone
   * edited one copy and not the other. `id` is derived at parse time and so is
   * absent from the seed.
   */
  it('keeps the main-process seed identical to PHB_CLASSES', () => {
    expect(SEED_CLASSES).toEqual(
      PHB_CLASSES.map(({ id: _id, ...rest }) => rest),
    )
  })
})

describe('findClass', () => {
  it('matches on name or id, ignoring case and surrounding space', () => {
    expect(findClass(PHB_CLASSES, 'Fighter')?.id).toBe('fighter')
    expect(findClass(PHB_CLASSES, 'fighter')?.id).toBe('fighter')
    expect(findClass(PHB_CLASSES, '  FIGHTER  ')?.id).toBe('fighter')
  })

  it('returns undefined for anything outside the list, and for blanks', () => {
    expect(findClass(PHB_CLASSES, 'Blood Hunter')).toBeUndefined()
    expect(findClass(PHB_CLASSES, '')).toBeUndefined()
    expect(findClass(PHB_CLASSES, '   ')).toBeUndefined()
  })

  // The whole point of the list being an argument: a world that replaced the
  // built-ins gets its own classes, and only its own.
  it('searches the list it was given, not the built-ins', () => {
    expect(findClass(HOMEBREW, 'Blood Hunter')?.hitDie).toBe(10)
    expect(findClass(HOMEBREW, 'Fighter')).toBeUndefined()
    expect(findClass([], 'Fighter')).toBeUndefined()
  })

  it('takes the first of two entries sharing a name', () => {
    const dupes: Array<ClassInfo> = [
      { ...HOMEBREW[0], hitDie: 10 },
      { ...HOMEBREW[0], hitDie: 6 },
    ]
    expect(findClass(dupes, 'Blood Hunter')?.hitDie).toBe(10)
  })
})

describe('subclass lookups', () => {
  it('suggests the PHB subclasses for a known class', () => {
    expect(subclassesFor(PHB_CLASSES, 'Fighter')).toContain('Eldritch Knight')
    expect(subclassesFor(PHB_CLASSES, 'cleric')).toHaveLength(7)
    expect(subclassesFor(PHB_CLASSES, 'Wizard')).toHaveLength(8)
  })

  it('suggests nothing for an unknown class rather than throwing', () => {
    expect(subclassesFor(PHB_CLASSES, 'Blood Hunter')).toEqual([])
    expect(subclassesFor(PHB_CLASSES, '')).toEqual([])
    expect(subclassesFor([], 'Fighter')).toEqual([])
  })

  it("uses the class's own word for its subclass", () => {
    expect(subclassLabelFor(PHB_CLASSES, 'Paladin')).toBe('Sacred Oath')
    expect(subclassLabelFor(PHB_CLASSES, 'Warlock')).toBe('Otherworldly Patron')
    expect(subclassLabelFor(HOMEBREW, 'Blood Hunter')).toBe(
      'Blood Hunter Order',
    )
    expect(subclassLabelFor(PHB_CLASSES, 'Blood Hunter')).toBe('Subclass')
    expect(subclassLabelFor(PHB_CLASSES, '')).toBe('Subclass')
  })
})
