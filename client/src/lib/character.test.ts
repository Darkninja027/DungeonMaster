import { describe, expect, it } from 'vitest'
import type { EquipSlot, InventoryItem, Spell } from './character'
import {
  abilityMod,
  addFeatureEntry,
  allNoteTags,
  alwaysPreparedCount,
  attunedCount,
  attunementLimit,
  canAttune,
  canPrepare,
  carriedWeight,
  cyclePreparation,
  carryCapacity,
  clampHitDie,
  coinWeight,
  cycleDamage,
  d20,
  damageStance,
  effectiveSpeed,
  emptyCharacter,
  encumbranceTier,
  equipItem,
  equippedIn,
  featureBadge,
  featureEntries,
  filterFeatures,
  filterNotes,
  fitsSlot,
  guessSlot,
  hasDefenses,
  hasOtherProficiencies,
  hitDiceArePinned,
  initiativeBonus,
  inventoryItemName,
  isCharacterContent,
  isUnearned,
  normalizeTag,
  normalizeTags,
  notePreview,
  parseCharacter,
  passivePerception,
  preparationState,
  preparedCount,
  preparedSpellLimit,
  proficiencyBonus,
  proficiencyLabel,
  removeFeatureEntry,
  resolveSpellDamage,
  scaleSpellDamage,
  spellInfoFromContent,
  spellLevelFromContent,
  saveBonus,
  serializeCharacter,
  setLevel,
  skillBonus,
  slotFor,
  sortedFeatures,
  sortedNotes,
  sortedSpells,
  spellSaveDc,
  tracksPreparation,
  updateFeatureEntry,
  wikiLinkTitle,
  withQty,
} from './character'

function sample() {
  const c = emptyCharacter()
  c.class = 'Ranger'
  c.subclass = 'Hunter'
  c.level = 5
  // Unpinned: a level 5 ranger has five d10s, so `total` is omitted on write
  // and the round-trip covers the auto-tracking path.
  c.hitDice = { size: 10, total: 5, used: 2 }
  c.abilities = { str: 10, dex: 18, con: 14, int: 12, wis: 16, cha: 8 }
  c.saves = ['dex', 'wis']
  c.skills = ['perception']
  c.expertise = ['stealth']
  // A known token plus free text in one list, so the round-trip covers both.
  c.armor = ['light', 'medium', 'shields']
  c.weapons = ['simple', 'martial', 'Longsword']
  c.tools = ["Smith's tools"]
  c.languages = ['Common', 'Elvish']
  c.resistances = ['cold', 'nonmagical bludgeoning']
  c.immunities = ['poison']
  c.vulnerabilities = ['fire']
  c.conditionImmunities = ['charmed', 'frightened']
  c.spellAbility = 'wis'
  c.spellSlots = { 1: { total: 4, used: 1 }, 2: { total: 2, used: 0 } }
  c.attacks = [{ name: 'Longbow', bonus: 9, damage: '1d8+4' }]
  c.traits = [
    { name: 'Darkvision', text: 'See in dim light within 60 feet.' },
    { name: 'Fey Ancestry' },
  ]
  c.feats = [
    { name: 'Sharpshooter', text: 'Ignore long range and half cover.' },
    { name: 'Alert' },
  ]
  // One feature with rules text and one without, so the round-trip covers
  // both the text and the omitted-text branches.
  c.features = [
    { level: 1, name: 'Favored Enemy', text: 'Advantage on [[Survival]].' },
    { level: 2, name: 'Fighting Style' },
    { level: 3, name: 'Primeval Awareness' },
  ]
  // One prepared, one always-prepared and one cantrip, so the round-trip covers
  // every preparation branch including the omitted-flag one.
  c.spells = [
    {
      name: "[[Hunter's Mark]]",
      level: 1,
      damage: '1d6',
      damagePerLevel: '1d6',
      prepared: true,
    },
    { name: 'Cure Wounds', level: 1, alwaysPrepared: true },
    { name: 'Druidcraft', level: 0 },
  ]
  c.preparedLimit = 4
  // Covers all three row shapes so the round-trip test does real work.
  c.inventory = [
    { text: 'Longbow', qty: 1, weight: 2, slot: 'mainHand' },
    // The legacy "(attuned)" text parses to attuned: true, so the fixture
    // has to carry it for the round-trip comparison to hold.
    {
      text: '[[Flametongue]] (attuned)',
      qty: 1,
      weight: 0,
      slot: null,
      attuned: true,
    },
    { text: 'Rations x5', qty: 5, weight: 2, slot: null },
  ]
  c.encumbrance = { enabled: true, countCoins: true }
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
    // Still takes a raw string, so it works on an item's text as-is.
    expect(inventoryItemName(sample().inventory[1].text)).toBe('Flametongue')
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

describe('racial traits', () => {
  it('reads name and optional text, keeping the authored order', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nrace: Halfling\ntraits:\n' +
        "  - { name: Lucky, text: 'Reroll a 1 on an attack, check or save.' }\n" +
        '  - { name: Brave }\n' +
        '---\n',
    )
    expect(character.traits).toEqual([
      { name: 'Lucky', text: 'Reroll a 1 on an attack, check or save.' },
      { name: 'Brave' },
    ])
  })

  it('keeps hand-written bare strings and drops blanks', () => {
    const { character } = parseCharacter(
      '---\ntype: character\ntraits:\n  - Darkvision\n  - "  "\n  - { name: "  " }\n---\n',
    )
    expect(character.traits).toEqual([{ name: 'Darkvision' }])
  })

  it('omits empty text rather than writing an empty string', () => {
    const { character } = parseCharacter(
      '---\ntype: character\ntraits:\n  - { name: Bare, text: "   " }\n---\n',
    )
    expect(character.traits[0].text).toBeUndefined()
  })

  it('defaults to no traits when the field is missing or junk', () => {
    expect(
      parseCharacter('---\ntype: character\n---\n').character.traits,
    ).toEqual([])
    expect(
      parseCharacter('---\ntype: character\ntraits: nope\n---\n').character
        .traits,
    ).toEqual([])
  })
})

describe('feats', () => {
  it('reads name and optional text, keeping the authored order', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nfeats:\n' +
        "  - { name: Sharpshooter, text: 'Ignore long range and half cover.' }\n" +
        '  - { name: Alert }\n' +
        '---\n',
    )
    expect(character.feats).toEqual([
      { name: 'Sharpshooter', text: 'Ignore long range and half cover.' },
      { name: 'Alert' },
    ])
  })

  it('keeps hand-written bare strings and drops blanks', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nfeats:\n  - Lucky\n  - "  "\n  - { name: "  " }\n---\n',
    )
    expect(character.feats).toEqual([{ name: 'Lucky' }])
  })

  it('defaults to no feats when the field is missing or junk', () => {
    expect(
      parseCharacter('---\ntype: character\n---\n').character.feats,
    ).toEqual([])
    expect(
      parseCharacter('---\ntype: character\nfeats: nope\n---\n').character
        .feats,
    ).toEqual([])
  })

  it('keeps feats and traits independent', () => {
    const { character } = parseCharacter(
      '---\ntype: character\ntraits:\n  - Darkvision\nfeats:\n  - Alert\n---\n',
    )
    expect(character.traits).toEqual([{ name: 'Darkvision' }])
    expect(character.feats).toEqual([{ name: 'Alert' }])
  })
})

describe('other proficiencies', () => {
  it('reads all four lists as free text', () => {
    const { character } = parseCharacter(
      '---\ntype: character\n' +
        'armor: [light, shields]\n' +
        'weapons: [martial, Longsword]\n' +
        'tools: ["Smith\'s tools", Dice set]\n' +
        'languages: [Common, Dwarvish]\n' +
        '---\n',
    )
    expect(character.armor).toEqual(['light', 'shields'])
    expect(character.weapons).toEqual(['martial', 'Longsword'])
    expect(character.tools).toEqual(["Smith's tools", 'Dice set'])
    expect(character.languages).toEqual(['Common', 'Dwarvish'])
  })

  it('keeps unknown values instead of dropping them like skills do', () => {
    // Homebrew and individually granted weapons must survive a hand edit — a
    // closed vocabulary here would silently delete the user's own data.
    const { character } = parseCharacter(
      '---\ntype: character\narmor: [mithral plate]\nweapons: [gythka]\n---\n',
    )
    expect(character.armor).toEqual(['mithral plate'])
    expect(character.weapons).toEqual(['gythka'])
  })

  it('trims and drops blank hand-typed entries', () => {
    const { character } = parseCharacter(
      '---\ntype: character\ntools: ["  Lute  ", "   ", ""]\n---\n',
    )
    expect(character.tools).toEqual(['Lute'])
  })

  it('drops non-string entries', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nlanguages: [Common, 5, null, { name: Elvish }]\n---\n',
    )
    expect(character.languages).toEqual(['Common'])
  })

  it('defaults to empty when the fields are missing or junk', () => {
    const bare = parseCharacter('---\ntype: character\n---\n').character
    expect(bare.armor).toEqual([])
    expect(bare.weapons).toEqual([])
    expect(bare.tools).toEqual([])
    expect(bare.languages).toEqual([])
    const junk = parseCharacter(
      '---\ntype: character\narmor: nope\ntools: 7\nlanguages: {}\n---\n',
    ).character
    expect(junk.armor).toEqual([])
    expect(junk.tools).toEqual([])
    expect(junk.languages).toEqual([])
  })

  it('keeps the four lists independent', () => {
    const { character } = parseCharacter(
      '---\ntype: character\narmor: [heavy]\nlanguages: [Orc]\n---\n',
    )
    expect(character.armor).toEqual(['heavy'])
    expect(character.weapons).toEqual([])
    expect(character.tools).toEqual([])
    expect(character.languages).toEqual(['Orc'])
  })

  it('labels known tokens and passes free text through', () => {
    expect(proficiencyLabel('light')).toBe('Light armor')
    expect(proficiencyLabel('MARTIAL')).toBe('Martial weapons')
    expect(proficiencyLabel('fire')).toBe('Fire')
    expect(proficiencyLabel('frightened')).toBe('Frightened')
    expect(proficiencyLabel('Mithral plate')).toBe('Mithral plate')
  })

  it('reports whether anything is set', () => {
    expect(hasOtherProficiencies(emptyCharacter())).toBe(false)
    expect(hasOtherProficiencies(sample())).toBe(true)
    expect(
      hasOtherProficiencies({ ...emptyCharacter(), languages: ['Common'] }),
    ).toBe(true)
  })

  it('serializes the lists between the skill proficiencies and ac', () => {
    const yaml = serializeCharacter(sample(), '')
    expect(yaml.indexOf('expertise:')).toBeLessThan(yaml.indexOf('armor:'))
    expect(yaml.indexOf('languages:')).toBeLessThan(yaml.indexOf('ac:'))
  })
})

describe('defenses', () => {
  it('reads the three damage lists and condition immunities', () => {
    const { character } = parseCharacter(
      '---\ntype: character\n' +
        'resistances: [cold, nonmagical bludgeoning]\n' +
        'immunities: [poison]\n' +
        'vulnerabilities: [fire]\n' +
        'conditionImmunities: [charmed, frightened]\n' +
        '---\n',
    )
    expect(character.resistances).toEqual(['cold', 'nonmagical bludgeoning'])
    expect(character.immunities).toEqual(['poison'])
    expect(character.vulnerabilities).toEqual(['fire'])
    expect(character.conditionImmunities).toEqual(['charmed', 'frightened'])
  })

  it('defaults to empty when the fields are missing or junk', () => {
    const bare = parseCharacter('---\ntype: character\n---\n').character
    expect(bare.resistances).toEqual([])
    expect(bare.immunities).toEqual([])
    expect(bare.vulnerabilities).toEqual([])
    expect(bare.conditionImmunities).toEqual([])
    expect(
      parseCharacter('---\ntype: character\nresistances: nope\n---\n').character
        .resistances,
    ).toEqual([])
  })

  it('reports where a damage type currently sits', () => {
    const c = sample()
    expect(damageStance(c, 'cold')).toBe('resistant')
    expect(damageStance(c, 'poison')).toBe('immune')
    expect(damageStance(c, 'fire')).toBe('vulnerable')
    expect(damageStance(c, 'acid')).toBe('none')
  })

  it('cycles none -> resistant -> immune -> vulnerable -> none', () => {
    let c = emptyCharacter()
    const step = () => {
      c = { ...c, ...cycleDamage(c, 'fire') }
      return damageStance(c, 'fire')
    }
    expect(step()).toBe('resistant')
    expect(step()).toBe('immune')
    expect(step()).toBe('vulnerable')
    expect(step()).toBe('none')
  })

  it('never leaves a damage type in two lists at once', () => {
    let c = emptyCharacter()
    for (let i = 0; i < 5; i++) {
      c = { ...c, ...cycleDamage(c, 'fire') }
      const listed = [c.resistances, c.immunities, c.vulnerabilities].filter(
        (list) => list.includes('fire'),
      )
      expect(listed.length).toBeLessThanOrEqual(1)
    }
  })

  it('leaves the other damage types alone when cycling one', () => {
    const c = { ...emptyCharacter(), resistances: ['cold'] }
    const next = { ...c, ...cycleDamage(c, 'fire') }
    expect(next.resistances).toEqual(['cold', 'fire'])
    const off = { ...next, ...cycleDamage(next, 'fire') }
    expect(off.resistances).toEqual(['cold'])
    expect(off.immunities).toEqual(['fire'])
  })

  it('reports whether any defense is set', () => {
    expect(hasDefenses(emptyCharacter())).toBe(false)
    expect(hasDefenses(sample())).toBe(true)
    expect(
      hasDefenses({ ...emptyCharacter(), conditionImmunities: ['prone'] }),
    ).toBe(true)
  })
})

describe('back-compat with sheets written before these fields existed', () => {
  it('round-trips an old character without losing anything', () => {
    const old = '---\ntype: character\nclass: Bard\nlevel: 2\n---\n\nProse.'
    const { character, body } = parseCharacter(old)
    const again = parseCharacter(serializeCharacter(character, body))
    expect(again.character).toEqual(character)
    expect(again.body).toBe('Prose.')
  })

  it('leaves subclass blank rather than guessing one', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nclass: Bard\nlevel: 2\n---\n',
    )
    expect(character.subclass).toBe('')
  })

  it('reads a pre-existing total of 1 on a levelled sheet as a pin', () => {
    // Sheets written before the total tracked level all carry `total: 1`. On a
    // level 5 character that reads as a deliberate pin, which is the safe way
    // round: the sheet shows what it was saved with, and the editor offers a
    // reset rather than silently rewriting someone's multiclass maths.
    const { character } = parseCharacter(
      '---\ntype: character\nclass: Bard\nlevel: 5\nhitDice: { size: 8, total: 1, used: 0 }\n---\n',
    )
    expect(character.hitDice.total).toBe(1)
    expect(hitDiceArePinned(character)).toBe(true)
    expect(setLevel(character, 6).hitDice.total).toBe(1)
  })
})

describe('hit dice', () => {
  it('defaults the total to the level when hitDice is missing entirely', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nclass: Fighter\nlevel: 7\n---\n',
    )
    expect(character.hitDice.total).toBe(7)
    expect(hitDiceArePinned(character)).toBe(false)
  })

  it('defaults the total to the level when hitDice omits it', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nlevel: 4\nhitDice: { size: 10, used: 1 }\n---\n',
    )
    expect(character.hitDice).toEqual({ size: 10, total: 4, used: 1 })
  })

  it('omits a total that matches the level so it keeps tracking', () => {
    const c = emptyCharacter()
    c.level = 7
    c.hitDice = { size: 10, total: 7, used: 2 }
    const yaml = serializeCharacter(c, '')
    expect(yaml).not.toMatch(/total:/)
    // ...and levelling the *file* up without touching hitDice still tracks.
    const { character } = parseCharacter(yaml.replace('level: 7', 'level: 9'))
    expect(character.hitDice.total).toBe(9)
    expect(character.hitDice.used).toBe(2)
  })

  it('keeps a total that differs from the level', () => {
    const c = emptyCharacter()
    c.level = 7
    c.hitDice = { size: 10, total: 5, used: 0 }
    const yaml = serializeCharacter(c, '')
    expect(yaml).toMatch(/total: 5/)
    expect(parseCharacter(yaml).character.hitDice.total).toBe(5)
  })

  it('clamps used to the pool and snaps a nonsense die size', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nlevel: 3\nhitDice: { size: 7, total: 3, used: 99 }\n---\n',
    )
    expect(character.hitDice.size).toBe(6)
    expect(character.hitDice.used).toBe(3)
  })

  it('snaps every hand-edited die size to a real die', () => {
    expect(clampHitDie(10)).toBe(10)
    expect(clampHitDie(7)).toBe(6)
    expect(clampHitDie(9)).toBe(8)
    expect(clampHitDie(0)).toBe(4)
    expect(clampHitDie(-3)).toBe(4)
    expect(clampHitDie(100)).toBe(20)
    expect(clampHitDie(Number.NaN)).toBe(8)
  })
})

describe('setLevel', () => {
  it('carries an unpinned total up and down with the level', () => {
    const c = emptyCharacter()
    c.level = 3
    c.hitDice = { size: 10, total: 3, used: 1 }
    expect(setLevel(c, 8).hitDice.total).toBe(8)
    expect(setLevel(c, 8).hitDice.used).toBe(1)
  })

  it('clamps spent dice when the level drops below them', () => {
    const c = emptyCharacter()
    c.level = 6
    c.hitDice = { size: 8, total: 6, used: 5 }
    const down = setLevel(c, 2)
    expect(down.hitDice.total).toBe(2)
    expect(down.hitDice.used).toBe(2)
  })

  it('leaves a pinned total alone', () => {
    const c = emptyCharacter()
    c.level = 6
    c.hitDice = { size: 8, total: 4, used: 1 }
    const up = setLevel(c, 9)
    expect(up.level).toBe(9)
    expect(up.hitDice).toEqual({ size: 8, total: 4, used: 1 })
  })

  it('clamps the level to 1-20', () => {
    const c = emptyCharacter()
    expect(setLevel(c, 0).level).toBe(1)
    expect(setLevel(c, 99).level).toBe(20)
    expect(setLevel(c, 99).hitDice.total).toBe(20)
  })
})

describe('class features', () => {
  it('reads level, name and optional text', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nclass: Rogue\nlevel: 3\nfeatures:\n' +
        "  - { level: 2, name: Cunning Action, text: 'Dash, Disengage or Hide as a bonus action.' }\n" +
        '  - { level: 3, name: "Thief: Fast Hands" }\n' +
        '---\n',
    )
    expect(character.features).toEqual([
      {
        level: 2,
        name: 'Cunning Action',
        text: 'Dash, Disengage or Hide as a bonus action.',
      },
      { level: 3, name: 'Thief: Fast Hands' },
    ])
  })

  it('keeps a hand-written bare string as a level 1 feature', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nfeatures:\n  - Sneak Attack\n  - "  "\n---\n',
    )
    expect(character.features).toEqual([{ level: 1, name: 'Sneak Attack' }])
  })

  it('clamps out-of-range levels and drops nameless rows', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nfeatures:\n' +
        '  - { level: 99, name: Too High }\n' +
        '  - { level: 0, name: Too Low }\n' +
        '  - { level: 3 }\n' +
        '  - { level: 4, name: "   " }\n' +
        '---\n',
    )
    expect(character.features).toEqual([
      { level: 20, name: 'Too High' },
      { level: 1, name: 'Too Low' },
    ])
  })

  it('omits empty text rather than writing an empty string', () => {
    const { character } = parseCharacter(
      '---\ntype: character\nfeatures:\n' +
        '  - { level: 1, name: Bare, text: "   " }\n---\n',
    )
    expect(character.features[0].text).toBeUndefined()
  })

  it('sorts by level then name', () => {
    expect(
      sortedFeatures([
        { level: 3, name: 'Steady Aim' },
        { level: 1, name: 'Sneak Attack' },
        { level: 3, name: 'Fast Hands' },
      ]),
    ).toEqual([
      { level: 1, name: 'Sneak Attack' },
      { level: 3, name: 'Fast Hands' },
      { level: 3, name: 'Steady Aim' },
    ])
  })

  it('leaves the input array untouched when sorting', () => {
    const input = [
      { level: 3, name: 'Later' },
      { level: 1, name: 'Earlier' },
    ]
    sortedFeatures(input)
    expect(input[0].name).toBe('Later')
  })
})

describe('inventory migration', () => {
  it('reads legacy bare strings and writes them back unchanged', () => {
    const src =
      '---\ntype: character\ninventory:\n  - Longsword\n  - Rations x5\n' +
      '  - "[[Flametongue]] (attuned)"\n---\n\nBody'
    const { character, body } = parseCharacter(src)
    expect(character.inventory).toEqual([
      { text: 'Longsword', qty: 1, weight: 0, slot: null },
      { text: 'Rations x5', qty: 5, weight: 0, slot: null },
      // "(attuned)" in the text is read as attunement, but not rewritten.
      {
        text: '[[Flametongue]] (attuned)',
        qty: 1,
        weight: 0,
        slot: null,
        attuned: true,
      },
    ])
    // The property that matters: someone who never opts in sees no diff.
    const out = serializeCharacter(character, body)
    expect(out).toContain('inventory:\n  - Longsword\n  - Rations x5\n')
    expect(parseCharacter(out).character.inventory).toEqual(character.inventory)
  })

  it('accepts object rows and the `name` alias in the same list', () => {
    const { character } = parseCharacter(
      '---\ntype: character\ninventory:\n' +
        '  - Torch\n' +
        '  - { text: Plate Armor, weight: 65, slot: armor }\n' +
        '  - { name: Shield, weight: 6, slot: offHand }\n' +
        '  - { text: Potion of Healing, qty: 3, weight: 0.5 }\n' +
        '---\n',
    )
    expect(character.inventory.map((i) => i.text)).toEqual([
      'Torch',
      'Plate Armor',
      'Shield',
      'Potion of Healing',
    ])
    expect(character.inventory[1].slot).toBe('armor')
    expect(character.inventory[2].weight).toBe(6)
    expect(character.inventory[3].qty).toBe(3)
  })

  // Regression guard for the old strList parser, which dropped every
  // non-string row and let the next autosave delete it from disk.
  it('never drops a row, however malformed', () => {
    const { character } = parseCharacter(
      '---\ntype: character\ninventory:\n' +
        '  - Rope\n  - 42\n  - true\n  - { weight: 5 }\n---\n',
    )
    expect(character.inventory).toHaveLength(4)
    const texts = character.inventory.map((i) => i.text)
    expect(texts[0]).toBe('Rope')
    expect(texts[1]).toBe('42')
    expect(texts[2]).toBe('true')
    expect(texts[3]).toContain('weight')
  })

  it('only serializes keys the user actually set', () => {
    const c = emptyCharacter()
    c.inventory = [
      { text: 'Torch', qty: 1, weight: 0, slot: null },
      { text: 'Rations x5', qty: 5, weight: 0, slot: null },
      { text: 'Plate', qty: 1, weight: 65, slot: 'armor' },
    ]
    const yaml = serializeCharacter(c, '')
    expect(yaml).toContain('  - Torch\n')
    expect(yaml).toContain('  - Rations x5\n') // qty implied by the suffix
    expect(yaml).toContain('  - text: Plate\n    weight: 65\n    slot: armor')
  })

  it('keeps one item per slot when a file is hand-edited', () => {
    const { character } = parseCharacter(
      '---\ntype: character\ninventory:\n' +
        '  - { text: Longsword, slot: mainHand }\n' +
        '  - { text: Rapier, slot: mainHand }\n' +
        '  - { text: Hat, slot: hat }\n---\n',
    )
    expect(character.inventory[0].slot).toBe('mainHand')
    expect(character.inventory[1].slot).toBeNull() // evicted, row survives
    expect(character.inventory[1].text).toBe('Rapier')
    expect(character.inventory[2].slot).toBeNull() // 'hat' is not a slot
  })

  it('defaults the opt-in off and tolerates junk', () => {
    expect(
      parseCharacter('---\ntype: character\n---\n').character.encumbrance,
    ).toEqual({ enabled: false, countCoins: true })
    expect(
      parseCharacter(
        '---\ntype: character\nencumbrance: { enabled: true, countCoins: false }\n---\n',
      ).character.encumbrance,
    ).toEqual({ enabled: true, countCoins: false })
    // YAML 1.2 parses bare `yes` as a string, so strict === true keeps it off.
    expect(
      parseCharacter(
        '---\ntype: character\nencumbrance: { enabled: yes }\n---\n',
      ).character.encumbrance.enabled,
    ).toBe(false)
    expect(
      parseCharacter('---\ntype: character\nencumbrance: "on"\n---\n').character
        .encumbrance.enabled,
    ).toBe(false)
  })

  it('keeps a legacy xN suffix in sync when quantity changes', () => {
    const suffixed: InventoryItem = {
      text: 'Rations x5',
      qty: 5,
      weight: 2,
      slot: null,
    }
    expect(withQty(suffixed, 6).text).toBe('Rations x6')
    expect(withQty(suffixed, 1).text).toBe('Rations')
    const plain: InventoryItem = {
      text: 'Torch',
      qty: 1,
      weight: 1,
      slot: null,
    }
    expect(withQty(plain, 4)).toEqual({ ...plain, qty: 4 })
    expect(withQty(plain, 0).qty).toBe(1) // never below one
  })
})

describe('encumbrance', () => {
  const item = (text: string, qty: number, weight: number): InventoryItem => ({
    text,
    qty,
    weight,
    slot: null,
  })
  const carrier = (str: number, items: Array<InventoryItem>, gp = 0) => {
    const c = emptyCharacter()
    c.abilities.str = str
    c.speed = 30
    c.inventory = items
    c.currency.gp = gp
    c.encumbrance = { enabled: true, countCoins: true }
    return c
  }

  it('sums qty x per-unit weight', () => {
    expect(carriedWeight(carrier(10, [item('Rations', 5, 2)]))).toBe(10)
    expect(carriedWeight(carrier(10, [item('Feather', 100, 0)]))).toBe(0)
    expect(carryCapacity(carrier(14, []))).toBe(210)
  })

  it('counts coins at 50 to the pound, or not at all when toggled off', () => {
    const c = carrier(10, [], 250)
    expect(coinWeight(c)).toBe(5)
    expect(carriedWeight(c)).toBe(5)
    c.currency = { cp: 30, sp: 20, ep: 0, gp: 0, pp: 0 } // 50 coins = 1 lb
    expect(carriedWeight(c)).toBe(1)
    expect(
      carriedWeight({
        ...c,
        encumbrance: { enabled: true, countCoins: false },
      }),
    ).toBe(0)
  })

  it('applies the variant tiers at STR x5 / x10 / x15', () => {
    const at = (w: number) => encumbranceTier(carrier(10, [item('Load', 1, w)]))
    expect(at(50)).toBe('none') // exactly STR x5 is still fine
    expect(at(51)).toBe('encumbered')
    expect(at(100)).toBe('encumbered') // exactly STR x10
    expect(at(101)).toBe('heavily-encumbered')
    expect(at(150)).toBe('heavily-encumbered') // exactly capacity
    expect(at(151)).toBe('over')
  })

  it('reduces speed by 10 / 20 / to zero', () => {
    const sp = (w: number) => effectiveSpeed(carrier(10, [item('Load', 1, w)]))
    expect(sp(0)).toBe(30)
    expect(sp(60)).toBe(20)
    expect(sp(120)).toBe(10)
    expect(sp(200)).toBe(0)
    const slow = carrier(10, [item('Load', 1, 60)])
    expect(effectiveSpeed({ ...slow, speed: 5 })).toBe(0) // never negative
  })

  it('is inert until the character opts in', () => {
    const c = carrier(10, [item('Anvil', 1, 500)], 10000)
    const off = { ...c, encumbrance: { enabled: false, countCoins: true } }
    expect(encumbranceTier(off)).toBe('none')
    expect(effectiveSpeed(off)).toBe(30)
    // carriedWeight still reports honestly; the UI decides whether to show it.
    expect(carriedWeight(off)).toBe(700)
  })

  it('does not flip tiers on float noise at the boundary', () => {
    // STR 1 -> encumbered above 5 lb. 250 coins is exactly 5 lb.
    const c = carrier(1, [], 250)
    expect(carriedWeight(c)).toBe(5)
    expect(encumbranceTier(c)).toBe('none')
  })
})

describe('slot fitting', () => {
  const it_ = (text: string, fits?: EquipSlot | null): InventoryItem => {
    const base: InventoryItem = { text, qty: 1, weight: 0, slot: null }
    return fits === undefined ? base : { ...base, fits }
  }

  it('guesses a slot from the item name', () => {
    expect(guessSlot('Longsword')).toBe('mainHand')
    expect(guessSlot('Chain Mail')).toBe('armor')
    expect(guessSlot('Studded Leather Armor')).toBe('armor')
    expect(guessSlot('Boots of Elvenkind')).toBe('boots')
    expect(guessSlot('[[Ring of Protection]]')).toBe('ring1')
    expect(guessSlot('Cloak of Displacement')).toBe('cloak')
    expect(guessSlot('+1 Shield')).toBe('offHand')
    expect(guessSlot('Helm of Brilliance')).toBe('head')
  })

  it('reads a type hint out of a parenthetical', () => {
    // inventoryItemName strips "(...)", so the raw row is checked too.
    expect(guessSlot('[[Flametongue]] (longsword)')).toBe('mainHand')
    expect(guessSlot('Mithral (breastplate)')).toBe('armor')
    // "(attuned)" is not a type hint and must not confuse the match.
    expect(guessSlot('[[Flametongue]] (attuned)')).toBeNull()
    expect(guessSlot('[[Ring of Three Wishes]] (attuned)')).toBe('ring1')
  })

  it('guesses nothing for ordinary gear', () => {
    expect(guessSlot('Rations x5')).toBeNull()
    expect(guessSlot('Rope')).toBeNull()
    expect(guessSlot('Torch')).toBeNull()
    expect(guessSlot('Thieves' + "' Tools")).toBeNull()
  })

  it('lets an explicit fits override or silence the guess', () => {
    expect(slotFor(it_('Longsword'))).toBe('mainHand') // guessed
    expect(slotFor(it_('Longsword', null))).toBeNull() // deliberately not worn
    expect(slotFor(it_('Rations x5', 'belt'))).toBe('belt') // deliberate override
    expect(slotFor(it_('Rope'))).toBeNull()
  })

  it('keeps rations off the paper doll', () => {
    expect(fitsSlot(it_('Rations x5'), 'mainHand')).toBe(false)
    expect(fitsSlot(it_('Rations x5'), 'head')).toBe(false)
    expect(fitsSlot(it_('Longsword'), 'mainHand')).toBe(true)
    expect(fitsSlot(it_('Longsword'), 'head')).toBe(false)
  })

  it('treats the two rings and the two hands as interchangeable', () => {
    expect(fitsSlot(it_('Ring of Protection'), 'ring1')).toBe(true)
    expect(fitsSlot(it_('Ring of Protection'), 'ring2')).toBe(true)
    expect(fitsSlot(it_('Longsword'), 'offHand')).toBe(true)
    expect(fitsSlot(it_('Shield'), 'mainHand')).toBe(true)
    expect(fitsSlot(it_('Ring of Protection'), 'necklace')).toBe(false)
  })

  it('round-trips fits, writing it only when it differs from the guess', () => {
    const c = emptyCharacter()
    c.inventory = [
      it_('Longsword'), // guess matches -> bare string
      it_('Rations x5', 'belt'), // override -> written
      it_('Shield', null), // deliberately not wearable -> written
    ]
    const yaml = serializeCharacter(c, '')
    expect(yaml).toContain('  - Longsword\n')
    expect(yaml).toContain('fits: belt')
    expect(yaml).toContain('fits: null')
    expect(parseCharacter(yaml).character.inventory).toEqual(c.inventory)
  })

  it('reads a hand-written fits, treating junk as not wearable', () => {
    const { character } = parseCharacter(
      '---\ntype: character\ninventory:\n' +
        '  - { text: Lucky Stone, fits: necklace }\n' +
        '  - { text: Weird Thing, fits: elbow }\n' +
        '  - Longsword\n---\n',
    )
    expect(character.inventory[0].fits).toBe('necklace')
    expect(character.inventory[1].fits).toBeNull() // unknown slot -> not wearable
    expect(character.inventory[2].fits).toBeUndefined() // absent -> guess applies
    expect(slotFor(character.inventory[2])).toBe('mainHand')
  })
})

describe('attunement', () => {
  const withItems = (
    rows: Array<Partial<InventoryItem> & { text: string }>,
    slots?: number,
  ) => {
    const c = emptyCharacter()
    c.inventory = rows.map((r) => ({
      qty: 1,
      weight: 0,
      slot: null,
      ...r,
    }))
    if (slots !== undefined) c.attunementSlots = slots
    return c
  }

  it('defaults to three slots', () => {
    expect(emptyCharacter().attunementSlots).toBe(3)
    expect(
      parseCharacter('---\ntype: character\n---\n').character.attunementSlots,
    ).toBe(3)
  })

  it('counts attuned items and honours a custom limit', () => {
    const c = withItems(
      [
        { text: 'Ring of Protection', attuned: true },
        { text: 'Cloak of Elvenkind', attuned: true },
        { text: 'Rope' },
      ],
      5,
    )
    expect(attunedCount(c)).toBe(2)
    expect(attunementLimit(c)).toBe(5)
  })

  it('blocks a new attunement at the limit but never an existing one', () => {
    const c = withItems(
      [
        { text: 'Ring of Protection', attuned: true },
        { text: 'Cloak of Elvenkind', attuned: true },
        { text: 'Boots of Speed', attuned: true },
        { text: 'Amulet of Health' },
      ],
      3,
    )
    expect(canAttune(c, c.inventory[3])).toBe(false) // would be a 4th
    expect(canAttune(c, c.inventory[0])).toBe(true) // already attuned
    // Raising the limit unblocks it; lowering it never strands you.
    expect(canAttune({ ...c, attunementSlots: 4 }, c.inventory[3])).toBe(true)
    const over = { ...c, attunementSlots: 1 }
    expect(canAttune(over, c.inventory[0])).toBe(true) // can still release
    expect(canAttune(over, c.inventory[3])).toBe(false)
  })

  it('reads the legacy "(attuned)" text so old sheets carry over', () => {
    const { character } = parseCharacter(
      '---\ntype: character\ninventory:\n' +
        '  - "[[Flametongue]] (attuned)"\n' +
        '  - Ioun Stone (Attunement)\n' +
        '  - Longsword\n---\n',
    )
    expect(character.inventory[0].attuned).toBe(true)
    expect(character.inventory[1].attuned).toBe(true) // case/word variant
    expect(character.inventory[2].attuned).toBeUndefined()
    expect(attunedCount(character)).toBe(2)
  })

  it('leaves the row text alone when attuning', () => {
    const c = withItems([{ text: '[[Flametongue]] (attuned)', attuned: true }])
    const yaml = serializeCharacter(c, '')
    // Text says it and the flag agrees, so it stays a bare string.
    expect(yaml).toContain('  - "[[Flametongue]] (attuned)"\n')
    expect(yaml).not.toContain('attuned: true')
  })

  it('writes attuned: false to override legacy text', () => {
    const c = withItems([
      { text: '[[Flametongue]] (attuned)', attuned: false },
      { text: 'Longsword', attuned: true },
    ])
    const yaml = serializeCharacter(c, '')
    expect(yaml).toContain('attuned: false')
    expect(yaml).toContain('attuned: true')
    const back = parseCharacter(yaml).character.inventory
    // The explicit false must beat the "(attuned)" still in the text.
    expect(back[0].attuned).toBeUndefined()
    expect(back[1].attuned).toBe(true)
    expect(attunedCount(parseCharacter(yaml).character)).toBe(1)
  })

  it('round-trips a custom slot count and clamps junk', () => {
    const c = emptyCharacter()
    c.attunementSlots = 5
    expect(
      parseCharacter(serializeCharacter(c, '')).character.attunementSlots,
    ).toBe(5)
    const at = (v: string) =>
      parseCharacter(`---\ntype: character\nattunementSlots: ${v}\n---\n`)
        .character.attunementSlots
    expect(at('0')).toBe(0)
    expect(at('-2')).toBe(0)
    expect(at('2.7')).toBe(2)
    expect(at('"lots"')).toBe(3) // unparseable -> the default
  })
})

describe('spell preparation', () => {
  const withSpells = (
    rows: Array<Partial<Spell> & { name: string }>,
    limit?: number,
  ) => {
    const c = emptyCharacter()
    c.spells = rows.map((r) => ({ level: 1, ...r }))
    if (limit !== undefined) c.preparedLimit = limit
    return c
  }

  it('counts prepared spells but never cantrips', () => {
    const c = withSpells(
      [
        { name: 'Bless', prepared: true },
        { name: 'Cure Wounds', prepared: true },
        { name: 'Heroism' },
        // A hand-edited cantrip may carry the flag; it still must not count.
        { name: 'Sacred Flame', level: 0, prepared: true },
      ],
      4,
    )
    expect(preparedCount(c)).toBe(2)
  })

  it('reads a spell state, with alwaysPrepared winning over prepared', () => {
    const st = (s: Partial<Spell>) =>
      preparationState({ name: 'X', level: 1, ...s })
    expect(st({})).toBe('none')
    expect(st({ prepared: true })).toBe('prepared')
    expect(st({ alwaysPrepared: true })).toBe('always')
    // A hand-edited file setting both must not read as two things at once.
    expect(st({ prepared: true, alwaysPrepared: true })).toBe('always')
    // Cantrips are always available whatever the flags say.
    expect(st({ level: 0 })).toBe('always')
    expect(st({ level: 0, prepared: true })).toBe('always')
  })

  it('cycles none -> prepared -> always -> none', () => {
    const spell: Spell = { name: 'Bless', level: 1 }
    const step = (s: Spell): Spell => ({ ...s, ...cyclePreparation(s) })
    const one = step(spell)
    expect(preparationState(one)).toBe('prepared')
    const two = step(one)
    expect(preparationState(two)).toBe('always')
    // The flags never accumulate: promoting drops `prepared` rather than
    // leaving both set.
    expect(two.prepared).toBeUndefined()
    const three = step(two)
    expect(preparationState(three)).toBe('none')
    expect(three.prepared).toBeUndefined()
    expect(three.alwaysPrepared).toBeUndefined()
  })

  it('leaves cantrips alone when cycled', () => {
    const cantrip: Spell = { name: 'Sacred Flame', level: 0 }
    expect(cyclePreparation(cantrip)).toEqual({})
  })

  it('exempts always-prepared spells from the limit', () => {
    const c = withSpells(
      [
        { name: 'Bless', prepared: true },
        { name: 'Cure Wounds', prepared: true },
        // Oath spells: prepared for free, outside the count.
        { name: 'Divine Favor', alwaysPrepared: true },
        { name: 'Searing Smite', alwaysPrepared: true },
        { name: 'Heroism' },
      ],
      2,
    )
    expect(preparedCount(c)).toBe(2) // the two limited ones only
    expect(alwaysPreparedCount(c)).toBe(2)
    // The limit is full, yet an always-prepared spell can still be cycled and
    // a fresh one can still be promoted straight to always.
    expect(canPrepare(c, c.spells[2])).toBe(true)
    expect(canPrepare(c, c.spells[4])).toBe(false) // would be a 3rd limited one
  })

  it('never counts an always-prepared cantrip as a free slot', () => {
    const c = withSpells(
      [{ name: 'Sacred Flame', level: 0, alwaysPrepared: true }],
      4,
    )
    expect(alwaysPreparedCount(c)).toBe(0)
    expect(preparedCount(c)).toBe(0)
  })

  it('is inert until the character sets a limit', () => {
    const off = withSpells([{ name: 'Bless' }])
    expect(tracksPreparation(off)).toBe(false)
    expect(preparedSpellLimit(off)).toBe(0)
    // With no limit there is nowhere to put a preparation, so a new one is
    // refused — but the UI never offers one, because tracksPreparation is the
    // gate. Both are pinned here so the split stays deliberate.
    expect(canPrepare(off, off.spells[0])).toBe(false)
    expect(tracksPreparation(withSpells([{ name: 'Bless' }], 1))).toBe(true)
  })

  it('floors the limit at 0 and truncates fractions', () => {
    const at = (n: number) =>
      preparedSpellLimit(withSpells([{ name: 'Bless' }], n))
    expect(at(4)).toBe(4)
    expect(at(0)).toBe(0)
    expect(at(-3)).toBe(0)
    expect(at(4.7)).toBe(4)
  })

  it('always allows cantrips, whatever the limit', () => {
    const c = withSpells(
      [
        { name: 'Bless', prepared: true },
        { name: 'Sacred Flame', level: 0 },
      ],
      1,
    )
    expect(preparedCount(c)).toBe(1) // the limit is already full
    expect(canPrepare(c, c.spells[1])).toBe(true)
  })

  it('blocks a new preparation at the limit but never an existing one', () => {
    const c = withSpells(
      [
        { name: 'Bless', prepared: true },
        { name: 'Cure Wounds', prepared: true },
        { name: 'Divine Favor', prepared: true },
        { name: 'Shield of Faith', prepared: true },
        { name: 'Heroism' },
      ],
      4,
    )
    expect(canPrepare(c, c.spells[4])).toBe(false) // would be a 5th
    expect(canPrepare(c, c.spells[0])).toBe(true) // already prepared
    // Raising the limit unblocks it; lowering it never strands you.
    expect(canPrepare({ ...c, preparedLimit: 5 }, c.spells[4])).toBe(true)
    const over = { ...c, preparedLimit: 2 }
    expect(canPrepare(over, c.spells[0])).toBe(true) // can still unprepare
    expect(canPrepare(over, c.spells[4])).toBe(false)
  })

  it('omits the flags for unprepared spells and cantrips', () => {
    const c = withSpells(
      [
        { name: 'Bless', prepared: true },
        { name: 'Heroism' },
        { name: 'Sacred Flame', level: 0, prepared: true },
        { name: 'Divine Favor', alwaysPrepared: true },
      ],
      4,
    )
    const yaml = serializeCharacter(c, '')
    expect(yaml).not.toContain('prepared: false')
    // `alwaysPrepared: true` also matches /prepared: true/, so count precisely:
    // one plain prepared row and one always row, and no cantrip flag.
    expect(yaml.match(/^\s+prepared: true$/gm)).toHaveLength(1)
    expect(yaml.match(/^\s+alwaysPrepared: true$/gm)).toHaveLength(1)
  })

  it('writes only one of the two flags when both are set', () => {
    const c = withSpells(
      [{ name: 'Bless', prepared: true, alwaysPrepared: true }],
      4,
    )
    const yaml = serializeCharacter(c, '')
    expect(yaml).toContain('alwaysPrepared: true')
    expect(yaml.match(/^\s+prepared: true$/gm)).toBeNull()
  })

  it('round-trips the flags and treats junk as unprepared', () => {
    const c = withSpells(
      [
        { name: 'Bless', prepared: true },
        { name: 'Divine Favor', alwaysPrepared: true },
      ],
      4,
    )
    const back = parseCharacter(serializeCharacter(c, '')).character
    expect(back.spells[0].prepared).toBe(true)
    expect(back.spells[1].alwaysPrepared).toBe(true)
    expect(back.spells[1].prepared).toBeUndefined()
    expect(back.preparedLimit).toBe(4)
    const spellYaml = (keys: string) =>
      parseCharacter(
        `---\ntype: character\nspells:\n  - name: Bless\n    level: 1\n${keys}---\n`,
      ).character.spells[0]
    expect(spellYaml('    prepared: true\n').prepared).toBe(true)
    expect(spellYaml('    prepared: false\n').prepared).toBeUndefined()
    // only a real boolean prepares
    expect(spellYaml('    prepared: "yes"\n').prepared).toBeUndefined()
    expect(spellYaml('    alwaysPrepared: true\n').alwaysPrepared).toBe(true)
    // Both set on disk: alwaysPrepared wins and `prepared` is dropped.
    const both = spellYaml('    prepared: true\n    alwaysPrepared: true\n')
    expect(both.alwaysPrepared).toBe(true)
    expect(both.prepared).toBeUndefined()
    expect(preparationState(both)).toBe('always')
  })

  it('round-trips a custom limit and clamps junk', () => {
    const at = (v: string) =>
      parseCharacter(`---\ntype: character\npreparedLimit: ${v}\n---\n`)
        .character.preparedLimit
    expect(at('4')).toBe(4)
    expect(at('0')).toBe(0)
    expect(at('-2')).toBe(0)
    expect(at('4.7')).toBe(4)
    expect(at('"four"')).toBe(0) // unparseable -> the default, i.e. not tracked
  })
})

describe('equipment slots', () => {
  const items = (): Array<InventoryItem> => [
    { text: 'Longsword', qty: 1, weight: 3, slot: 'mainHand' },
    { text: 'Rapier', qty: 1, weight: 2, slot: null },
  ]

  it('finds the occupant of a slot', () => {
    expect(equippedIn(items(), 'mainHand')?.text).toBe('Longsword')
    expect(equippedIn(items(), 'boots')).toBeNull()
  })

  it('evicts the incumbent rather than losing it', () => {
    const next = equipItem(items(), 1, 'mainHand')
    expect(next[0].slot).toBeNull()
    expect(next[0].text).toBe('Longsword') // row survives, just unequipped
    expect(next[1].slot).toBe('mainHand')
    expect(equipItem(next, 1, null)[1].slot).toBeNull()
  })
})

describe('session notes', () => {
  const notes = () => [
    {
      at: '2026-08-06',
      title: 'Strahd offer',
      text: 'He offered passage.',
      tags: ['npc', 'lore'],
    },
    {
      at: '2026-08-13',
      title: 'Ambush',
      text: 'Jumped on the road.',
      tags: ['session'],
    },
    { at: '', text: 'Undated jotting.' },
  ]

  it('sorts newest first, undated last', () => {
    // An empty `at` is a note missing its date, not one from the year zero.
    expect(sortedNotes(notes()).map((n) => n.at)).toEqual([
      '2026-08-13',
      '2026-08-06',
      '',
    ])
  })

  it('normalizes tags to one canonical form', () => {
    expect(normalizeTag('#Session')).toBe('session')
    expect(normalizeTag('  Sea of Swords ')).toBe('sea-of-swords')
    expect(normalizeTag('##')).toBe('')
    // Dedupes case variants rather than splitting one bucket into two.
    expect(normalizeTags(['Session', 'session', '#SESSION', ''])).toEqual([
      'session',
    ])
  })

  it('lists every tag in use, once, alphabetically', () => {
    expect(allNoteTags(notes())).toEqual(['lore', 'npc', 'session'])
  })

  it('searches title, body, date and tags', () => {
    const find = (q: string) => filterNotes(notes(), q, []).map((n) => n.at)
    expect(find('strahd')).toEqual(['2026-08-06']) // title
    expect(find('road')).toEqual(['2026-08-13']) // body
    expect(find('npc')).toEqual(['2026-08-06']) // tag
    expect(find('2026-08-13')).toEqual(['2026-08-13']) // date
    expect(find('')).toHaveLength(3)
  })

  it('ANDs tag filters so picking two narrows rather than widens', () => {
    expect(filterNotes(notes(), '', ['npc'])).toHaveLength(1)
    expect(filterNotes(notes(), '', ['npc', 'lore'])).toHaveLength(1)
    expect(filterNotes(notes(), '', ['npc', 'session'])).toHaveLength(0)
  })

  it('previews the first real line without its markdown punctuation', () => {
    expect(notePreview('## Recap\n\nbody')).toBe('Recap')
    expect(notePreview('- **Bought** rope')).toBe('Bought rope')
    expect(notePreview('\n\n> Met [[Strahd|the count]] here')).toBe(
      'Met the count here',
    )
    expect(notePreview('')).toBe('')
  })

  it('round-trips titles and tags through frontmatter', () => {
    const c = emptyCharacter()
    c.notes = [
      { at: '2026-08-13', title: 'Ambush', text: 'Jumped.', tags: ['session'] },
    ]
    const parsed = parseCharacter(serializeCharacter(c, '')).character
    expect(parsed.notes).toEqual(c.notes)
  })

  it('leaves untitled, untagged notes byte-identical on write', () => {
    const c = emptyCharacter()
    c.notes = [{ at: '2026-08-13', text: 'Plain note.' }]
    const yaml = serializeCharacter(c, '')
    // No `title:` / `tags:` keys grow on a note that has neither.
    expect(yaml).not.toMatch(/title:/)
    expect(yaml).not.toMatch(/tags:/)
    expect(parseCharacter(yaml).character.notes).toEqual(c.notes)
  })

  it('accepts hand-written notes: bare strings and comma-separated tags', () => {
    const yaml = [
      '---',
      'type: character',
      'notes:',
      '  - Just a jotted line',
      '  - { text: Tagged one, tags: "Session, NPC" }',
      '---',
      '',
    ].join('\n')
    const parsed = parseCharacter(yaml).character.notes
    expect(parsed[0]).toEqual({ at: '', text: 'Just a jotted line' })
    expect(parsed[1].tags).toEqual(['session', 'npc'])
  })
})

describe('unified feature view', () => {
  const sheet = () => {
    const c = emptyCharacter()
    c.level = 5
    c.traits = [{ name: 'Darkvision', text: 'See 60ft.' }]
    c.feats = [{ name: 'Sharpshooter' }]
    c.features = [
      { level: 14, name: 'Blindsense' },
      { level: 2, name: 'Cunning Action', text: 'Bonus action Dash.' },
    ]
    return c
  }

  it('merges the three arrays: traits, then feats, then class by level', () => {
    expect(featureEntries(sheet()).map((e) => e.name)).toEqual([
      'Darkvision',
      'Sharpshooter',
      'Cunning Action',
      'Blindsense',
    ])
  })

  it('badges each row with where it came from', () => {
    const [trait, feat, cls] = featureEntries(sheet())
    expect(featureBadge(trait)).toBe('Racial')
    expect(featureBadge(feat)).toBe('Feat')
    expect(featureBadge(cls)).toBe('Class · Lv2')
  })

  it('marks class features above the current level as not yet gained', () => {
    const c = sheet()
    const byName = (n: string) => featureEntries(c).find((e) => e.name === n)!
    expect(isUnearned(byName('Blindsense'), c)).toBe(true) // level 14 > 5
    expect(isUnearned(byName('Cunning Action'), c)).toBe(false)
    expect(isUnearned(byName('Darkvision'), c)).toBe(false) // never levelled
  })

  it('searches name, text and source label', () => {
    const all = featureEntries(sheet())
    const find = (q: string) => filterFeatures(all, q).map((e) => e.name)
    expect(find('dark')).toEqual(['Darkvision'])
    expect(find('bonus action')).toEqual(['Cunning Action']) // body text
    expect(find('racial')).toEqual(['Darkvision']) // badge
    expect(find('')).toHaveLength(4)
  })

  it('routes an edit back to the array the row came from', () => {
    const c = sheet()
    // The merged list is sorted, so the display position of "Cunning Action"
    // (index 2) is not its position in c.features (index 1).
    const cunning = featureEntries(c).find((e) => e.name === 'Cunning Action')!
    expect(cunning.index).toBe(1)
    const patched = { ...c, ...updateFeatureEntry(c, cunning, { level: 3 }) }
    expect(patched.features[1]).toEqual({
      level: 3,
      name: 'Cunning Action',
      text: 'Bonus action Dash.',
    })
    expect(patched.features[0].name).toBe('Blindsense') // untouched
    expect(patched.traits).toEqual(c.traits)
  })

  it('clamps a hand-typed level to 1-20', () => {
    const c = sheet()
    const cls = featureEntries(c).find((e) => e.name === 'Blindsense')!
    expect(updateFeatureEntry(c, cls, { level: 99 }).features![0].level).toBe(
      20,
    )
    expect(updateFeatureEntry(c, cls, { level: 0 }).features![0].level).toBe(1)
  })

  it('clears a description emptied to blank rather than storing an empty string', () => {
    const c = sheet()
    const trait = featureEntries(c)[0]
    expect(updateFeatureEntry(c, trait, { text: '' }).traits![0]).toEqual({
      name: 'Darkvision',
    })
  })

  it('removes from the right array only', () => {
    const c = sheet()
    const feat = featureEntries(c).find((e) => e.source === 'feat')!
    const next = { ...c, ...removeFeatureEntry(c, feat) }
    expect(next.feats).toEqual([])
    expect(next.traits).toHaveLength(1)
    expect(next.features).toHaveLength(2)
  })

  it('adds to the array named by source, levelling only class features', () => {
    const c = emptyCharacter()
    expect(addFeatureEntry(c, 'trait', 'Lucky', '', 3).traits).toEqual([
      { name: 'Lucky' },
    ])
    expect(addFeatureEntry(c, 'feat', 'Alert', 'Bonus init.', 3).feats).toEqual(
      [{ name: 'Alert', text: 'Bonus init.' }],
    )
    expect(addFeatureEntry(c, 'class', 'Evasion', '', 7).features).toEqual([
      { level: 7, name: 'Evasion' },
    ])
  })
})
