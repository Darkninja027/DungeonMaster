import { describe, expect, it } from 'vitest'
import { PHB_CLASSES } from './classes'
import {
  DEFAULT_SETTINGS,
  SETTINGS_COMMENT,
  classId,
  parseWorldSettings,
  serializeWorldSettings,
} from './worldSettings'

describe('parseWorldSettings — missing vs deliberately empty', () => {
  // The load-bearing distinction: no file means "give me the defaults", an empty
  // list means "I deleted them all". Conflating these makes the editor's delete
  // impossible.
  it('falls back to the PHB seed when there is no file', () => {
    expect(parseWorldSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseWorldSettings(null).classes).toHaveLength(12)
  })

  it('keeps an intentionally empty list empty', () => {
    const parsed = parseWorldSettings({ version: 1, classes: [] })
    expect(parsed.classes).toEqual([])
  })

  it('falls back when the file has no classes array at all', () => {
    expect(parseWorldSettings({ version: 1 }).classes).toHaveLength(12)
    expect(parseWorldSettings({ classes: 'nope' }).classes).toHaveLength(12)
  })
})

describe('parseWorldSettings — tolerance', () => {
  it('never throws on garbage', () => {
    expect(() => parseWorldSettings('nope')).not.toThrow()
    expect(() => parseWorldSettings(42)).not.toThrow()
    expect(() => parseWorldSettings([])).not.toThrow()
    expect(() =>
      parseWorldSettings({ classes: [null, 5, {}, []] }),
    ).not.toThrow()
  })

  it('drops rows it cannot use and keeps the ones it can', () => {
    const parsed = parseWorldSettings({
      classes: [null, 5, {}, { name: '   ' }, { name: 'Fighter' }],
    })
    expect(parsed.classes.map((c) => c.name)).toEqual(['Fighter'])
  })

  it('defaults a missing version rather than rejecting the file', () => {
    expect(parseWorldSettings({ classes: [{ name: 'Bard' }] }).version).toBe(1)
    expect(
      parseWorldSettings({ version: 7, classes: [{ name: 'Bard' }] }).version,
    ).toBe(7)
  })
})

describe('parseWorldSettings — class fields', () => {
  it('derives a trimmed lowercase id and keeps the authored name', () => {
    const [cl] = parseWorldSettings({
      classes: [{ name: '  Blood Hunter ' }],
    }).classes
    expect(cl.name).toBe('Blood Hunter')
    expect(cl.id).toBe('blood hunter')
    expect(classId('  Blood Hunter ')).toBe('blood hunter')
  })

  it('takes the first of two entries sharing a name', () => {
    const parsed = parseWorldSettings({
      classes: [
        { name: 'Fighter', hitDie: 10 },
        { name: 'fighter', hitDie: 6 },
      ],
    })
    expect(parsed.classes).toHaveLength(1)
    expect(parsed.classes[0].hitDie).toBe(10)
  })

  it('keeps a homebrew die but replaces nonsense', () => {
    const die = (hitDie: unknown) =>
      parseWorldSettings({ classes: [{ name: 'X', hitDie }] }).classes[0].hitDie
    expect(die(20)).toBe(20)
    // Not snapped to a real die: the user defined this class deliberately.
    expect(die(7)).toBe(7)
    expect(die(10.4)).toBe(10)
    expect(die(undefined)).toBe(8)
    expect(die('ten')).toBe(8)
    expect(die(0)).toBe(8)
    expect(die(-4)).toBe(8)
    expect(die(Number.NaN)).toBe(8)
  })

  it('defaults a blank subclass label to the generic word', () => {
    const label = (subclassLabel: unknown) =>
      parseWorldSettings({ classes: [{ name: 'X', subclassLabel }] }).classes[0]
        .subclassLabel
    expect(label('Sacred Oath')).toBe('Sacred Oath')
    expect(label('  ')).toBe('Subclass')
    expect(label(undefined)).toBe('Subclass')
    expect(label(12)).toBe('Subclass')
  })

  it('cleans the subclass list without reordering it', () => {
    const [cl] = parseWorldSettings({
      classes: [
        {
          name: 'Fighter',
          subclasses: ['  Champion ', '', 'Battle Master', 'champion', 7, null],
        },
      ],
    }).classes
    expect(cl.subclasses).toEqual(['Champion', 'Battle Master'])
  })

  it('tolerates a class with no subclasses', () => {
    const [cl] = parseWorldSettings({ classes: [{ name: 'Fighter' }] }).classes
    expect(cl.subclasses).toEqual([])
  })
})

describe('serializeWorldSettings', () => {
  it('drops the derived id and re-emits the comment', () => {
    const json = serializeWorldSettings(DEFAULT_SETTINGS) as Record<
      string,
      unknown
    >
    expect(json._comment).toBe(SETTINGS_COMMENT)
    expect(json.version).toBe(1)
    expect(JSON.stringify(json)).not.toContain('"id"')
  })

  it('round-trips the PHB seed unchanged', () => {
    const again = parseWorldSettings(
      JSON.parse(JSON.stringify(serializeWorldSettings(DEFAULT_SETTINGS))),
    )
    expect(again.classes).toEqual(PHB_CLASSES)
  })

  it('is stable across a second round trip', () => {
    const raw = {
      version: 1,
      classes: [
        {
          name: 'Blood Hunter',
          hitDie: 10,
          subclasses: ['Order of the Lycan'],
        },
      ],
    }
    const once = parseWorldSettings(raw)
    const twice = parseWorldSettings(
      JSON.parse(JSON.stringify(serializeWorldSettings(once))),
    )
    expect(twice).toEqual(once)
  })

  it('round-trips an emptied list as empty, not as the defaults', () => {
    const emptied = { version: 1, classes: [] }
    const again = parseWorldSettings(
      JSON.parse(JSON.stringify(serializeWorldSettings(emptied))),
    )
    expect(again.classes).toEqual([])
  })
})
