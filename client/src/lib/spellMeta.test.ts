import { describe, expect, it } from 'vitest'
import { spellMetaLabel } from './useGlobalLibrary'

/**
 * The suggestion rows' right-hand note. Pure, so it is tested without the three
 * queries `useSpellMeta` needs to collect the entries it labels.
 */
describe('spellMetaLabel', () => {
  it('names a cantrip as one rather than "0th"', () => {
    expect(spellMetaLabel({ level: 0, school: 'Evocation' })).toBe(
      'Cantrip · Evocation',
    )
  })

  it('ordinalises the levels that need it', () => {
    expect(spellMetaLabel({ level: 1, school: 'Abjuration' })).toBe(
      '1st · Abjuration',
    )
    expect(spellMetaLabel({ level: 2, school: 'Evocation' })).toBe(
      '2nd · Evocation',
    )
    expect(spellMetaLabel({ level: 3, school: 'Necromancy' })).toBe(
      '3rd · Necromancy',
    )
    expect(spellMetaLabel({ level: 4, school: 'Illusion' })).toBe(
      '4th · Illusion',
    )
    expect(spellMetaLabel({ level: 9, school: 'Conjuration' })).toBe(
      '9th · Conjuration',
    )
  })

  it('title-cases a hand-written school', () => {
    // The frontmatter is hand-editable and says "evocation" as often as
    // "Evocation"; the row should not shout the difference.
    expect(spellMetaLabel({ level: 2, school: 'evocation' })).toBe(
      '2nd · Evocation',
    )
    expect(spellMetaLabel({ level: 2, school: 'EVOCATION' })).toBe(
      '2nd · Evocation',
    )
  })

  it('shows whichever half the article declares', () => {
    // "Unknown means show it" — the same bargain filterSpells strikes. A
    // half-labelled row is more useful than an unlabelled one.
    expect(spellMetaLabel({ level: 3 })).toBe('3rd')
    expect(spellMetaLabel({ school: 'Divination' })).toBe('Divination')
  })

  it('is empty when the article declares neither', () => {
    // The caller drops empty labels, so a folder-only entry renders its bare
    // name exactly as it always did.
    expect(spellMetaLabel({})).toBe('')
    expect(spellMetaLabel({ level: null, school: null })).toBe('')
    expect(spellMetaLabel({ school: '   ' })).toBe('')
  })
})
