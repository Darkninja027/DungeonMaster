import { describe, expect, it } from 'vitest'
import {
  extractStatBlockFence,
  parseStatBlock,
  parseStatBlockCard,
  xpForCr,
} from './statblock'

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

const FENCE = `name: Goblin
size: Small humanoid, neutral evil
ac: 15 (leather armor, shield)
hp: 7 (2d6)
speed: 30 ft.
str: 8
dex: 14
con: 10
int: 10
wis: 8
cha: 8
cr: 1/4 (50 XP)
Senses: darkvision 60 ft., passive Perception 9
Languages: Common, Goblin
---
**Nimble Escape.** The goblin can Disengage or Hide as a bonus action.

## Actions

**Scimitar.** *Melee Weapon Attack:* +4 to hit. *Hit:* 5 (1d6+2) slashing.`

describe('parseStatBlockCard', () => {
  it('parses fields, abilities, extras, and prose', () => {
    const c = parseStatBlockCard(FENCE)
    expect(c.name).toBe('Goblin')
    expect(c.subtitle).toBe('Small humanoid, neutral evil')
    expect(c.ac).toBe('15 (leather armor, shield)')
    expect(c.hp).toBe('7 (2d6)')
    expect(c.speed).toBe('30 ft.')
    expect(c.cr).toBe('1/4')
    expect(c.xp).toBe(50)
    expect(c.abilities.dex).toBe(14)
    expect(c.abilities.cha).toBe(8)
    expect(c.extras).toEqual([
      { label: 'Senses', value: 'darkvision 60 ft., passive Perception 9' },
      { label: 'Languages', value: 'Common, Goblin' },
    ])
    expect(c.prose).toContain('**Nimble Escape.**')
    expect(c.prose).toContain('## Actions')
  })

  it('derives XP from the CR table when not written', () => {
    expect(parseStatBlockCard('cr: 5').xp).toBe(1800)
  })

  it('treats a body with no fields as pure prose', () => {
    const c = parseStatBlockCard('Just some flavor text about a beast.')
    expect(c.name).toBeNull()
    expect(c.prose).toBe('Just some flavor text about a beast.')
  })

  it('starts prose at the first non-field line without needing ---', () => {
    const c = parseStatBlockCard('name: Rat\nac: 10\n\n**Keen Smell.** Advantage.')
    expect(c.name).toBe('Rat')
    expect(c.ac).toBe('10')
    expect(c.prose).toContain('**Keen Smell.**')
  })
})

describe('extractStatBlockFence + parseStatBlock on a fence', () => {
  it('extracts the fence contents', () => {
    const article = 'Intro.\n\n```statblock\nname: Goblin\nac: 15\n```\n\nOutro.'
    expect(extractStatBlockFence(article)).toContain('name: Goblin')
  })

  it('parseStatBlock reads combat numbers from the fence', () => {
    const article = '# Goblin\n\n```statblock\n' + FENCE + '\n```\n'
    const sb = parseStatBlock(article)
    expect(sb.ac).toBe(15)
    expect(sb.hp).toBe(7)
    expect(sb.cr).toBe('1/4')
    expect(sb.xp).toBe(50)
    expect(sb.dexMod).toBe(2) // mod(14)
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
