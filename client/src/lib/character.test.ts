import { describe, expect, it } from 'vitest'
import type { EquipSlot, InventoryItem } from './character'
import {
  abilityMod,
  attunedCount,
  attunementLimit,
  canAttune,
  carriedWeight,
  carryCapacity,
  coinWeight,
  d20,
  effectiveSpeed,
  emptyCharacter,
  encumbranceTier,
  equipItem,
  equippedIn,
  fitsSlot,
  guessSlot,
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
  slotFor,
  sortedSpells,
  spellSaveDc,
  wikiLinkTitle,
  withQty,
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
