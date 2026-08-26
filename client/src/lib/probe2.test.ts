import { describe, expect, it } from 'vitest'
import { parseHomebrew, serializeHomebrew } from './homebrew'
import { isBareSubclass } from './tables'

describe('probe: subclass spellcasting round trip', () => {
  it('survives parse', () => {
    const hb = parseHomebrew({
      kits: [{
        name: 'Warden',
        subclasses: [{
          name: 'Oak',
          features: [{ level: 3, name: 'X' }],
          spellcasting: {
            ability: 'int', slotsAtLevel1: 0, cantripsKnown: 2,
            spellsKnown: 3, prepares: false, listLabel: 'Wizard spells',
            slotsByLevel: { 3: [2] },
          },
        }],
      }],
    })
    expect(hb.kits[0].subclasses[0].spellcasting).toBeDefined()
  })

  it('a subclass carrying only spellcasting is not bare', () => {
    expect(isBareSubclass({
      id: 'x', name: 'X', features: [],
      spellcasting: {
        ability: 'int', slotsAtLevel1: 0, cantripsKnown: 2,
        spellsKnown: 3, prepares: false, listLabel: 'Wizard spells',
      },
    })).toBe(false)
  })
})
