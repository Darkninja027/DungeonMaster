import { describe, expect, it } from 'vitest'
import { emptyCharacter, parseCharacter, serializeCharacter } from './character'
import type { Character } from './character'

/**
 * What the guest's sheet view is allowed to save, and where.
 *
 * The view itself is React, but the rule it enforces is not: a claimed
 * character may only push HP, because that is the whole of the host's write
 * allowlist (SHEET_PATCH_FIELDS in electron/main/table.ts). These pin the
 * shape that rule depends on, so a change to Character that breaks it fails
 * here rather than silently dropping a player's edit at the wire.
 */

const sheet = [
  '---',
  'type: character',
  'class: Rogue',
  'level: 3',
  'hp:',
  '  current: 24',
  '  max: 27',
  '  temp: 0',
  '---',
  '',
  'Rooftops.',
  '',
].join('\n')

/** The comparison the view makes before deciding to send anything. */
function hpChanged(prev: Character, next: Character): boolean {
  return next.hp.current !== prev.hp.current || next.hp.temp !== prev.hp.temp
}

describe('what a guest may save on a claimed sheet', () => {
  it('detects an HP change', () => {
    const { character } = parseCharacter(sheet)
    const next = { ...character, hp: { ...character.hp, current: 17 } }
    expect(hpChanged(character, next)).toBe(true)
  })

  it('detects a temp HP change', () => {
    const { character } = parseCharacter(sheet)
    const next = { ...character, hp: { ...character.hp, temp: 5 } }
    expect(hpChanged(character, next)).toBe(true)
  })

  it('does not fire for an edit the host would refuse anyway', () => {
    // Renaming a feat is a real edit to the draft, but the host's allowlist
    // has no field for it — sending would be a no-op dressed as a save.
    const { character } = parseCharacter(sheet)
    const next: Character = { ...character, level: 4, xp: 900 }
    expect(hpChanged(character, next)).toBe(false)
  })

  it('does not fire when nothing moved', () => {
    const { character } = parseCharacter(sheet)
    expect(hpChanged(character, { ...character })).toBe(false)
  })

  it('an own character round-trips through the local save path', () => {
    // The vault path serializes the whole sheet rather than patching, so the
    // full edit has to survive a round trip.
    const { character, body } = parseCharacter(sheet)
    const next: Character = {
      ...character,
      level: 4,
      hp: { ...character.hp, current: 12 },
    }
    const written = serializeCharacter(next, body)
    const back = parseCharacter(written)
    expect(back.character.level).toBe(4)
    expect(back.character.hp.current).toBe(12)
    expect(back.body).toContain('Rooftops.')
  })

  it('hp is a nested object, so a shallow copy would alias it', () => {
    // The view spreads `{ ...character, hp: { ...character.hp } }` for exactly
    // this reason; a shallow copy alone shares the hp object and the before /
    // after comparison always reports "unchanged".
    const a = emptyCharacter()
    const shallow = { ...a }
    shallow.hp.current = 3
    expect(a.hp.current).toBe(3)
  })
})
