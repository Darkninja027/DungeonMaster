import { describe, expect, it } from 'vitest'
import {
  abilityMod,
  d20,
  emptyCharacter,
  initiativeBonus,
  inventoryItemName,
  isCharacterContent,
  parseCharacter,
  passivePerception,
  proficiencyBonus,
  resolveSpellDamage,
  scaleSpellDamage,
  spellInfoFromContent,
  spellLevelFromContent,
  saveBonus,
  serializeCharacter,
  skillBonus,
  sortedSpells,
  spellSaveDc,
  wikiLinkTitle,
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
  c.spells = [
    {
      name: "[[Hunter's Mark]]",
      level: 1,
      damage: '1d6',
      damagePerLevel: '1d6',
    },
    { name: 'Druidcraft', level: 0 },
  ]
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

  it('cleans inventory rows into attack names', () => {
    expect(inventoryItemName('[[Flametongue]] (attuned)')).toBe('Flametongue')
    expect(inventoryItemName('[[Sword of Zariel|Holy Sword]]')).toBe(
      'Holy Sword',
    )
    expect(inventoryItemName('Daggers x3')).toBe('Daggers')
    expect(inventoryItemName('Longbow')).toBe('Longbow')
    expect(inventoryItemName('(weird)')).toBe('(weird)') // never empty
  })

  it('resolves the mod token in spell damage', () => {
    const c = sample() // wis caster, +3 mod
    expect(resolveSpellDamage('2d8+mod', c)).toBe('2d8+3')
    expect(resolveSpellDamage('2d8 + mod', c)).toBe('2d8+3')
    expect(resolveSpellDamage('3d4+3', c)).toBe('3d4+3')
    const noCaster = { ...c, spellAbility: null }
    expect(resolveSpellDamage('2d8+mod', noCaster)).toBe('2d8+0')
    const weak = { ...c, abilities: { ...c.abilities, wis: 8 } }
    expect(resolveSpellDamage('2d8+mod', weak)).toBe('2d8-1')
  })

  it('reads spell info from frontmatter, falling back to the subtitle', () => {
    expect(
      spellInfoFromContent(
        '---\ntype: spell\nlevel: 1\ndamage: 3d4+3\ndamagePerLevel: 1d4+1\n---\n\n# Magic Missile',
      ),
    ).toEqual({ level: 1, damage: '3d4+3', damagePerLevel: '1d4+1' })
    // empty damage in the template means "not set"
    expect(
      spellInfoFromContent('---\ntype: spell\nlevel: 0\ndamage: ""\n---\n\nx'),
    ).toEqual({ level: 0, damage: null, damagePerLevel: null })
    // no frontmatter: subtitle wins for level, damage is never guessed
    expect(
      spellInfoFromContent('# Magic Missile\n\n*1st-level evocation*\n\n3d4+3'),
    ).toEqual({ level: 1, damage: null, damagePerLevel: null })
  })

  it('scales upcast damage by damagePerLevel', () => {
    // Magic Missile at 3rd level: 3d4+3 + 2 × 1d4+1 = 5d4+5
    expect(scaleSpellDamage('3d4+3', '1d4+1', 2)).toBe('5d4+5')
    expect(scaleSpellDamage('8d6', '1d6', 1)).toBe('9d6') // Fireball at 4th
    expect(scaleSpellDamage('3d4+3', '1d4+1', 0)).toBe('3d4+3')
    expect(scaleSpellDamage('3d4+3', null, 5)).toBe('3d4+3')
    // incompatible dice fall back to the base roll
    expect(scaleSpellDamage('2d6', '1d8', 2)).toBe('2d6')
  })

  it('scales a "+mod" base and keeps the token', () => {
    expect(scaleSpellDamage('2d8+mod', '1d8', 2)).toBe('4d8+mod')
    expect(scaleSpellDamage('3d8 + mod', '1d8', 1)).toBe('4d8+mod')
    const c = sample() // wis caster, +3 mod
    expect(resolveSpellDamage(scaleSpellDamage('2d8+mod', '1d8', 1), c)).toBe(
      '3d8+3',
    )
    // a mod token mixed with numeric modifiers would need two modifiers in
    // one roll, which rollDice can't do — fall back to the base
    expect(scaleSpellDamage('3d8+1+mod', '1d8', 1)).toBe('3d8+1+mod')
    expect(scaleSpellDamage('3d8+mod', '1d8+1', 1)).toBe('3d8+mod')
    expect(scaleSpellDamage('3d8+mod', '1d8+mod', 1)).toBe('3d8+mod')
    expect(scaleSpellDamage('3d8', '1d8+mod', 1)).toBe('3d8')
  })

  it('detects spell level from the article subtitle', () => {
    expect(
      spellLevelFromContent('# Magic Missile\n\n*1st-level evocation*\n\n…'),
    ).toBe(1)
    expect(spellLevelFromContent('# Aid\n\n*Level 2 abjuration*')).toBe(2)
    expect(spellLevelFromContent('# Light\n\n*Evocation cantrip*')).toBe(0)
    expect(spellLevelFromContent('# Notes\n\nJust prose.')).toBeNull()
    // "At Higher Levels… 2nd level or higher" deep in the body must not win.
    const magicMissile =
      '# Magic Missile\n\n*1st-level evocation*\n\n' +
      'x'.repeat(300) +
      '\n**At Higher Levels.** using a spell slot of 2nd level or higher…'
    expect(spellLevelFromContent(magicMissile)).toBe(1)
  })

  it('extracts spell article titles and sorts spells', () => {
    expect(wikiLinkTitle('[[Fireball]]')).toBe('Fireball')
    expect(wikiLinkTitle('[[Fireball|Boom]]')).toBe('Fireball')
    expect(wikiLinkTitle('Mage Hand')).toBe('Mage Hand')
    expect(
      sortedSpells([
        { name: 'Fireball', level: 3 },
        { name: 'Light', level: 0 },
        { name: 'Aid', level: 2 },
      ]).map((s) => s.name),
    ).toEqual(['Light', 'Aid', 'Fireball'])
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

  it('tolerates hand-edited spell scaling fields', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nspells:\n' +
        '  - { name: Magic Missile, level: 1, damage: 3d4+3, damagePerLevel: 1d4+1 }\n' +
        '  - { name: Bless, level: 1, damagePerLevel: "" }\n' +
        '  - { name: Aid, level: 2, damagePerLevel: 5 }\n' +
        '---\n',
    )
    expect(character.spells[0].damagePerLevel).toBe('1d4+1')
    expect(character.spells[1].damagePerLevel).toBeUndefined()
    expect(character.spells[2].damagePerLevel).toBeUndefined()
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
