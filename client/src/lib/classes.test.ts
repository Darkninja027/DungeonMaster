import { describe, expect, it } from 'vitest'
import { CLASSES, findClass, subclassLabelFor, subclassesFor } from './classes'

describe('class table', () => {
  it('covers the 12 PHB classes with unique ids and names', () => {
    expect(CLASSES).toHaveLength(12)
    expect(new Set(CLASSES.map((c) => c.id)).size).toBe(12)
    expect(new Set(CLASSES.map((c) => c.name)).size).toBe(12)
  })

  it('gives every class a real hit die and a non-empty subclass list', () => {
    for (const cl of CLASSES) {
      expect([6, 8, 10, 12]).toContain(cl.hitDie)
      expect(cl.subclassLabel).not.toBe('')
      expect(cl.subclasses.length).toBeGreaterThan(0)
      expect(cl.subclasses).not.toContain('')
    }
  })

  it('uses ids that match the display names', () => {
    for (const cl of CLASSES) {
      expect(cl.id).toBe(cl.name.toLowerCase())
    }
  })

  it('knows the martial/caster hit dice', () => {
    expect(findClass('barbarian')?.hitDie).toBe(12)
    expect(findClass('fighter')?.hitDie).toBe(10)
    expect(findClass('rogue')?.hitDie).toBe(8)
    expect(findClass('wizard')?.hitDie).toBe(6)
  })
})

describe('findClass', () => {
  it('matches on name or id, ignoring case and surrounding space', () => {
    expect(findClass('Fighter')?.id).toBe('fighter')
    expect(findClass('fighter')?.id).toBe('fighter')
    expect(findClass('  FIGHTER  ')?.id).toBe('fighter')
  })

  it('returns undefined for homebrew and blank input', () => {
    expect(findClass('Blood Hunter')).toBeUndefined()
    expect(findClass('')).toBeUndefined()
    expect(findClass('   ')).toBeUndefined()
  })
})

describe('subclass lookups', () => {
  it('suggests the PHB subclasses for a known class', () => {
    expect(subclassesFor('Fighter')).toContain('Eldritch Knight')
    expect(subclassesFor('cleric')).toHaveLength(7)
    expect(subclassesFor('Wizard')).toHaveLength(8)
  })

  it('suggests nothing for homebrew rather than throwing', () => {
    expect(subclassesFor('Blood Hunter')).toEqual([])
    expect(subclassesFor('')).toEqual([])
  })

  it("uses the class's own word for its subclass", () => {
    expect(subclassLabelFor('Paladin')).toBe('Sacred Oath')
    expect(subclassLabelFor('Warlock')).toBe('Otherworldly Patron')
    expect(subclassLabelFor('Blood Hunter')).toBe('Subclass')
    expect(subclassLabelFor('')).toBe('Subclass')
  })
})
