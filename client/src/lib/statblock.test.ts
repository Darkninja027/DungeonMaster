import { describe, expect, it } from 'vitest'
import { parseStatBlock, xpForCr } from './statblock'

// The exact block the Monster/Creature template produces.
const TEMPLATE = `# Creature Name

*Size type, alignment*

| Stat | Value |
| ---- | ----- |
| Armor Class | 12 |
| Hit Points | 22 (4d8 + 4) |
| Speed | 30 ft. |
| Challenge | 1 (200 XP) |

| STR | DEX | CON | INT | WIS | CHA |
| --- | --- | --- | --- | --- | --- |
| 10 (+0) | 14 (+2) | 12 (+1) | 10 (+0) | 11 (+0) | 8 (-1) |

**Senses** darkvision 60 ft.
`

describe('parseStatBlock', () => {
  it('reads AC, HP, CR, XP, and DEX modifier from the template block', () => {
    const sb = parseStatBlock(TEMPLATE)
    expect(sb.ac).toBe(12)
    expect(sb.hp).toBe(22)
    expect(sb.cr).toBe('1')
    expect(sb.xp).toBe(200)
    expect(sb.dexMod).toBe(2)
  })

  it('derives the DEX modifier from the score when no (+N) is written', () => {
    const content = `# Beast

| STR | DEX | CON | INT | WIS | CHA |
| --- | --- | --- | --- | --- | --- |
| 12 | 16 | 10 | 3 | 12 | 6 |
`
    expect(parseStatBlock(content).dexMod).toBe(3) // mod(16) = +3
  })

  it('falls back to the CR→XP table when XP is not written out', () => {
    const content = `# Ogre

| Stat | Value |
| ---- | ----- |
| Armor Class | 11 |
| Hit Points | 59 |
| Challenge | 2 |
`
    const sb = parseStatBlock(content)
    expect(sb.cr).toBe('2')
    expect(sb.xp).toBe(450)
  })

  it('handles fractional CR', () => {
    const content = `| Challenge | 1/4 (50 XP) |`
    const sb = parseStatBlock(content)
    expect(sb.cr).toBe('1/4')
    expect(sb.xp).toBe(50)
  })

  it('parses XP with a thousands comma', () => {
    const content = `| Challenge | 4 (1,100 XP) |`
    expect(parseStatBlock(content).xp).toBe(1100)
  })

  it('lets frontmatter override the prose block', () => {
    const content = `---
type: monster
ac: 18
hp: 100
cr: 5
dex: 20
---

| Armor Class | 12 |
| Hit Points | 22 (4d8 + 4) |
| Challenge | 1 (200 XP) |

| STR | DEX | CON | INT | WIS | CHA |
| --- | --- | --- | --- | --- | --- |
| 10 (+0) | 14 (+2) | 12 (+1) | 10 (+0) | 11 (+0) | 8 (-1) |
`
    const sb = parseStatBlock(content)
    expect(sb.ac).toBe(18)
    expect(sb.hp).toBe(100)
    expect(sb.cr).toBe('5')
    expect(sb.xp).toBe(1800) // from CR table since no XP in frontmatter
    expect(sb.dexMod).toBe(5) // mod(20)
  })

  it('returns nulls for a non-statblock article rather than guessing', () => {
    const sb = parseStatBlock('# Just a town\n\nNothing combat-y here.')
    expect(sb).toEqual({ ac: null, hp: null, cr: null, xp: null, dexMod: null })
  })

  it('tolerates British spelling "Armour Class"', () => {
    expect(parseStatBlock('| Armour Class | 15 |').ac).toBe(15)
  })
})

describe('xpForCr', () => {
  it('maps known ratings', () => {
    expect(xpForCr('1/2')).toBe(100)
    expect(xpForCr('10')).toBe(5900)
  })
  it('returns null for an unknown rating', () => {
    expect(xpForCr('99')).toBeNull()
  })
})
