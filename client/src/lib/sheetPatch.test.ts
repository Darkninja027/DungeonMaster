import { describe, expect, it } from 'vitest'
import { applySheetPatch } from './sheetPatch'
import { parseCharacter } from './character'

/**
 * A guest's HP edit lands on the DM's disk, so the two failure modes that
 * matter are writing the wrong thing and writing something that is not a sheet
 * at all. Both are covered here against real round-tripped content.
 */

const sheet = `---
type: character
class: Rogue
level: 3
hp:
  current: 24
  max: 27
  temp: 0
---

Thalia keeps to the rooftops.
`

describe('applySheetPatch', () => {
  it('changes current hp and leaves the prose alone', () => {
    const out = applySheetPatch(sheet, { hpCurrent: 17 })!
    expect(out).toBeTruthy()
    const { character, body } = parseCharacter(out)
    expect(character.hp.current).toBe(17)
    expect(character.hp.max).toBe(27)
    expect(body).toContain('Thalia keeps to the rooftops.')
  })

  it('keeps every field it was not asked to change', () => {
    const out = applySheetPatch(sheet, { hpCurrent: 1 })!
    const { character } = parseCharacter(out)
    expect(character.class).toBe('Rogue')
    expect(character.level).toBe(3)
  })

  it('clamps above the sheet maximum', () => {
    const out = applySheetPatch(sheet, { hpCurrent: 999 })!
    expect(parseCharacter(out).character.hp.current).toBe(27)
  })

  it('clamps below zero', () => {
    const out = applySheetPatch(sheet, { hpCurrent: -5 })!
    expect(parseCharacter(out).character.hp.current).toBe(0)
  })

  it('sets temp hp', () => {
    const out = applySheetPatch(sheet, { hpTemp: 6 })!
    expect(parseCharacter(out).character.hp.temp).toBe(6)
  })

  it('returns null when nothing would change, so no write happens', () => {
    expect(applySheetPatch(sheet, { hpCurrent: 24 })).toBeNull()
    expect(applySheetPatch(sheet, {})).toBeNull()
  })

  it('refuses an article that is not a character sheet', () => {
    // parseCharacter is tolerant and would yield an EMPTY sheet here, which
    // serialized back would destroy the article.
    const prose = '# The Tavern\n\nA warm room over the docks.\n'
    expect(applySheetPatch(prose, { hpCurrent: 5 })).toBeNull()
  })

  it('refuses frontmatter that is not type: character', () => {
    const other = '---\ntitle: Notes\n---\n\nSome prose.\n'
    expect(applySheetPatch(other, { hpCurrent: 5 })).toBeNull()
  })

  it('round-trips repeatedly without drifting', () => {
    let content = sheet
    for (const hp of [20, 15, 15, 3, 27]) {
      const next = applySheetPatch(content, { hpCurrent: hp })
      if (next) content = next
    }
    const { character } = parseCharacter(content)
    expect(character.hp.current).toBe(27)
    expect(character.class).toBe('Rogue')
  })
})
