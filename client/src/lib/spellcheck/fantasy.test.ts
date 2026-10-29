/**
 * fantasy.dic — the game's own vocabulary, loaded beside the en-GB dictionary.
 *
 * It exists because the standard en-GB list (SCOWL size 60) is plain English:
 * measured against 190 everyday fantasy words it rejected 41, among them
 * dwarves, elven, undead, wyvern, golem, longsword, chainmail, spellbook — and
 * "pickaxe", which it only knows by the American "pickax". A word missing from
 * the dictionary can't be suggested either, so a typo of one had no fix on
 * offer.
 *
 * It is a real Hunspell .dic, not a word list, so an entry's flags read
 * against en-GB's .aff and `pickaxe/SM` also accepts "pickaxes" and
 * "pickaxe's". S is the plural, M the possessive, D/G/R -ed/-ing/-er; an
 * irregular plural (dwarves, homunculi) is its own line. The first line is the
 * entry count, as Hunspell expects.
 *
 * Generic table vocabulary only. A published setting's proper nouns (Strahd,
 * Barovia) are not this app's to ship — that is what "Add to dictionary" is for.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { aff, createSpell, fantasy } from './dictionary'

let spell: ReturnType<typeof createSpell>

beforeAll(() => {
  // The worker's own construction, so the test can't pass on a different one.
  spell = createSpell()
})

const entries = fantasy.trim().split('\n').slice(1)

describe('fantasy.dic', () => {
  it('declares its own entry count on the first line', () => {
    expect(Number(fantasy.split('\n')[0])).toBe(entries.length)
  })

  it('uses only affix flags en-GB defines', () => {
    const defined = new Set(
      [...aff.matchAll(/^(?:SFX|PFX) (\w) [YN] \d+/gm)].map((m) => m[1]),
    )
    for (const entry of entries) {
      expect(entry, entry).toMatch(/^[^\s/]+(\/[A-Z]+)?$/)
      for (const flag of entry.split('/')[1] ?? '') {
        expect(defined.has(flag), `${entry}: flag ${flag}`).toBe(true)
      }
    }
  })

  it('has no duplicate entries', () => {
    const words = entries.map((e) => e.split('/')[0])
    expect(words.length).toBe(new Set(words).size)
  })

  // Every word en-GB rejected in the original 190-word measurement, plus
  // inflected forms that only the flags make right.
  it.each([
    'Pickaxe',
    'pickaxe',
    'pickaxes',
    "pickaxe's",
    'greataxe',
    'handaxe',
    'longsword',
    'longswords',
    'shortsword',
    'greatsword',
    'shortbow',
    'warhammer',
    'morningstar',
    'glaive',
    'halfplate',
    'chainmail',
    'caltrops',
    'waterskin',
    'tabard',
    'grimoire',
    'electrum',
    'dwarves',
    'dwarven',
    'elven',
    'orcish',
    'wyvern',
    'wyverns',
    'wyrm',
    'gryphon',
    'hippogriff',
    'manticore',
    'kraken',
    'minotaur',
    'revenant',
    'golem',
    'golems',
    'homunculus',
    'homunculi',
    'lycanthrope',
    'undead',
    'cantrip',
    'cantrips',
    'scrying',
    'sigil',
    'shapeshift',
    'shapeshifter',
    'oathbreaker',
    'spellbook',
    'spellbooks',
    'subclasses',
    'NPCs',
    'tieflings',
    'kobolds',
    'homebrewed',
    'multiclassing',
    'Feywild',
  ])('accepts %s', (word) => {
    expect(spell.correct(word)).toBe(true)
  })

  it('suggests the fantasy word for a typo of it', () => {
    expect(spell.suggest('pickaxxe')).toContain('pickaxe')
    expect(spell.suggest('wyverm')).toContain('wyvern')
  })

  // The supplement must add words, not switch checking off.
  it.each(['wizzard', 'pickaxxe', 'Apothicary', 'Remidies'])(
    'still rejects %s',
    (word) => {
      expect(spell.correct(word)).toBe(false)
    },
  )
})
