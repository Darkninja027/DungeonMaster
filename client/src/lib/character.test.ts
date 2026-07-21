import { describe, expect, it } from 'vitest'
import {
  abilityMod,
  d20,
  emptyCharacter,
  initiativeBonus,
  isCharacterContent,
  parseCharacter,
  passivePerception,
  proficiencyBonus,
  saveBonus,
  serializeCharacter,
  skillBonus,
  spellSaveDc,
} from './character'

function sample() {
  const c = emptyCharacter()
  c.class = 'Ranger'
  c.level = 5
  c.abilities = { str: 10, dex: 18, con: 14, int: 12, wis: 16, cha: 8 }
  c.saves = ['dex', 'wis']
  c.skills = ['perception']
  c.expertise = ['stealth']
  c.spellAbility = 'wis'
  c.spellSlots = { 1: { total: 4, used: 1 }, 2: { total: 2, used: 0 } }
  c.attacks = [{ name: 'Longbow', bonus: 9, damage: '1d8+4' }]
  c.inventory = ['Longbow', '[[Flametongue]] (attuned)']
  c.notes = [{ at: '2026-07-21', text: 'Met [[Strahd]].' }]
  return c
}

describe('derived 5e math', () => {
  it('computes ability modifiers', () => {
    expect(abilityMod(10)).toBe(0)
    expect(abilityMod(18)).toBe(4)
    expect(abilityMod(8)).toBe(-1)
    expect(abilityMod(9)).toBe(-1)
  })

  it('computes proficiency by level', () => {
    expect(proficiencyBonus(1)).toBe(2)
    expect(proficiencyBonus(4)).toBe(2)
    expect(proficiencyBonus(5)).toBe(3)
    expect(proficiencyBonus(20)).toBe(6)
  })

  it('computes saves, skills, expertise, and passives', () => {
    const c = sample() // prof +3
    expect(saveBonus(c, 'dex')).toBe(7) // 4 + 3
    expect(saveBonus(c, 'str')).toBe(0) // not proficient
    expect(skillBonus(c, 'perception')).toBe(6) // wis 3 + prof 3
    expect(skillBonus(c, 'stealth')).toBe(10) // dex 4 + expertise 6
    expect(skillBonus(c, 'arcana')).toBe(1) // int mod only
    expect(passivePerception(c)).toBe(16)
    expect(initiativeBonus(c)).toBe(4)
    expect(spellSaveDc(c)).toBe(14) // 8 + 3 + 3
  })

  it('formats d20 notation', () => {
    expect(d20(5)).toBe('d20+5')
    expect(d20(-1)).toBe('d20-1')
    expect(d20(0)).toBe('d20')
  })
})

describe('character frontmatter round-trip', () => {
  it('serializes and parses back losslessly', () => {
    const c = sample()
    const content = serializeCharacter(c, '# Kaelen\n\nBackstory here.')
    expect(isCharacterContent(content)).toBe(true)
    const parsed = parseCharacter(content)
    expect(parsed.character).toEqual(c)
    expect(parsed.body).toBe('# Kaelen\n\nBackstory here.')
  })

  it('fills defaults for missing fields', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nlevel: 3\n---\n\nBody',
    )
    expect(character.level).toBe(3)
    expect(character.abilities.str).toBe(10)
    expect(character.hp.max).toBe(10)
  })

  it('never throws on malformed frontmatter or plain articles', () => {
    expect(parseCharacter('---\n{{{{not yaml\n---\nBody').character).toEqual(
      emptyCharacter(),
    )
    expect(parseCharacter('Just prose.').body).toBe('Just prose.')
    expect(isCharacterContent('# Not a character')).toBe(false)
    expect(isCharacterContent('---\ntype: location\n---\nx')).toBe(false)
  })

  it('clamps out-of-range hand edits', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nlevel: 99\nabilities: { str: -5 }\ndeathSaves: { fail: 7 }\n---\n',
    )
    expect(character.level).toBe(20)
    expect(character.abilities.str).toBe(1)
    expect(character.deathSaves.fail).toBe(3)
  })
})
