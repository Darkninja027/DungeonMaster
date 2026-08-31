import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SRD_TABLES, expandedSpellsFor, findKit } from './tables'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (file: string) => readFileSync(join(HERE, file), 'utf8')

/**
 * The contract on `SubclassInfo.expandedSpells`, enforced rather than merely
 * documented.
 *
 * A patron's expanded list is spells you may *learn*, and a warlock's spells
 * known are the scarcest resource in the game — two of them at 1st level. If
 * either applier ever reads this field the way it reads `spells`, a Fiend
 * warlock silently gains free spells and nothing on the sheet can say where
 * they came from, because `Character.spells` is a flat list with no per-source
 * grouping to say it with.
 *
 * Asserted on the **source text**, not on behaviour, and that is the point. A
 * behavioural test ("build a Fiend warlock, expect no alwaysPrepared rows")
 * passes for a wiring that grants the spells as ordinary *prepared* rows, which
 * is just as wrong and considerably harder to notice. The only thing that makes
 * "never applied" true is the appliers not naming the field, so that is what is
 * checked here — and the behavioural companion in `buildCharacter.test.ts`
 * covers the other direction.
 *
 * If you are here because this failed: the field is suggestion-only, and its
 * one legitimate reader is `expandedSpellsFor` in tables.ts. If an applier
 * genuinely needs to know about a subclass's spells, the answer is almost
 * certainly `SubclassInfo.spells` instead — which means the content was
 * mis-modelled, not that this test is in the way.
 */
describe('expandedSpells is never applied', () => {
  for (const file of ['buildCharacter.ts', 'levelUp.ts']) {
    it(`${file} does not mention expandedSpells`, () => {
      // Deliberately blunt: this fails on a comment mentioning the field, not
      // just on a read of it. That is the wanted ergonomics for a footgun this
      // specific — it forces whoever is here to read the contract first.
      expect(read(file)).not.toContain('expandedSpells')
    })
  }

  it('has exactly one reader, in tables.ts', () => {
    // If a second one appears, either it belongs behind `expandedSpellsFor` or
    // the contract has changed — and it should change deliberately, with this
    // test, rather than incidentally.
    expect(read('tables.ts')).toContain('expandedSpellsFor')
  })
})

describe('expandedSpellsFor', () => {
  const warlock = findKit(SRD_TABLES.kits, 'Warlock')

  it('offers a patron its own list, by spell level', () => {
    expect(expandedSpellsFor(warlock, 'The Fiend', 1)).toEqual([
      'Burning Hands',
      'Command',
    ])
    expect(expandedSpellsFor(warlock, 'The Fiend', 5)).toEqual([
      'Flame Strike',
      'Hallow',
    ])
  })

  it('is name in, empty out, like every other lookup here', () => {
    // None of these is an error: most subclasses have no expanded list at all,
    // and a hand-typed archetype has to keep working.
    expect(expandedSpellsFor(undefined, 'The Fiend', 1)).toEqual([])
    expect(expandedSpellsFor(warlock, 'The Unknowable Bargain', 1)).toEqual([])
    expect(expandedSpellsFor(warlock, '', 1)).toEqual([])
    expect(
      expandedSpellsFor(findKit(SRD_TABLES.kits, 'Fighter'), 'Champion', 1),
    ).toEqual([])
  })

  it('has nothing at cantrip level, and does not mind being asked', () => {
    // No published expanded list holds a cantrip, so the key is simply absent
    // rather than guarded against.
    expect(expandedSpellsFor(warlock, 'The Fiend', 0)).toEqual([])
    expect(expandedSpellsFor(warlock, 'The Fiend', 9)).toEqual([])
  })

  it('returns the same empty array every time', () => {
    // Both call sites feed this into a `useMemo` dependency; a fresh `[]` per
    // call would defeat it on every render.
    expect(expandedSpellsFor(warlock, 'The Fiend', 0)).toBe(
      expandedSpellsFor(warlock, 'The Archfey', 0),
    )
  })
})
