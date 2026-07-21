import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { joinFrontmatter, splitFrontmatter } from './formatMarkdown'

/**
 * A character is a normal markdown article whose YAML frontmatter carries
 * `type: character` plus the 5e sheet data below. The markdown body stays
 * free-form prose (backstory). Everything here is tolerant of hand edits in
 * Obsidian: missing or malformed fields fall back to defaults field-by-field.
 */

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type Ability = (typeof ABILITIES)[number]

export const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
}

/** The 18 5e skills and the ability each keys off. */
export const SKILLS: Array<{ id: string; name: string; ability: Ability }> = [
  { id: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { id: 'animal-handling', name: 'Animal Handling', ability: 'wis' },
  { id: 'arcana', name: 'Arcana', ability: 'int' },
  { id: 'athletics', name: 'Athletics', ability: 'str' },
  { id: 'deception', name: 'Deception', ability: 'cha' },
  { id: 'history', name: 'History', ability: 'int' },
  { id: 'insight', name: 'Insight', ability: 'wis' },
  { id: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { id: 'investigation', name: 'Investigation', ability: 'int' },
  { id: 'medicine', name: 'Medicine', ability: 'wis' },
  { id: 'nature', name: 'Nature', ability: 'int' },
  { id: 'perception', name: 'Perception', ability: 'wis' },
  { id: 'performance', name: 'Performance', ability: 'cha' },
  { id: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { id: 'religion', name: 'Religion', ability: 'int' },
  { id: 'sleight-of-hand', name: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth', name: 'Stealth', ability: 'dex' },
  { id: 'survival', name: 'Survival', ability: 'wis' },
]

export interface Attack {
  name: string
  /** To-hit bonus, e.g. 9 renders a d20+9 chip. */
  bonus: number
  /** Damage notation, e.g. "1d8+4". */
  damage: string
}

export interface SpellSlots {
  total: number
  used: number
}

export interface CharacterNote {
  at: string // ISO date
  text: string
}

export interface Character {
  class: string
  level: number
  race: string
  background: string
  alignment: string
  xp: number
  abilities: Record<Ability, number>
  /** Proficient saving throws. */
  saves: Array<Ability>
  /** Proficient skill ids; `expertise` doubles proficiency. */
  skills: Array<string>
  expertise: Array<string>
  ac: number
  /** Misc initiative bonus on top of the DEX modifier. */
  initiativeBonus: number
  speed: number
  hp: { current: number; max: number; temp: number }
  hitDice: { size: number; total: number; used: number }
  deathSaves: { success: number; fail: number }
  attacks: Array<Attack>
  spellAbility: Ability | null
  /** Keyed by spell level 1-9. */
  spellSlots: Record<number, SpellSlots>
  currency: Record<'cp' | 'sp' | 'ep' | 'gp' | 'pp', number>
  /** Free-text rows; [[wiki links]] resolve to articles. */
  inventory: Array<string>
  notes: Array<CharacterNote>
}

export function emptyCharacter(): Character {
  return {
    class: '',
    level: 1,
    race: '',
    background: '',
    alignment: '',
    xp: 0,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: [],
    skills: [],
    expertise: [],
    ac: 10,
    initiativeBonus: 0,
    speed: 30,
    hp: { current: 10, max: 10, temp: 0 },
    hitDice: { size: 8, total: 1, used: 0 },
    deathSaves: { success: 0, fail: 0 },
    attacks: [],
    spellAbility: null,
    spellSlots: {},
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    inventory: [],
    notes: [],
  }
}

// --- Derived 5e math --------------------------------------------------------

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function proficiencyBonus(level: number): number {
  return Math.ceil(Math.max(1, level) / 4) + 1
}

export function saveBonus(c: Character, ability: Ability): number {
  return (
    abilityMod(c.abilities[ability]) +
    (c.saves.includes(ability) ? proficiencyBonus(c.level) : 0)
  )
}

export function skillBonus(c: Character, skillId: string): number {
  const skill = SKILLS.find((s) => s.id === skillId)
  if (!skill) return 0
  const prof = c.expertise.includes(skillId)
    ? proficiencyBonus(c.level) * 2
    : c.skills.includes(skillId)
      ? proficiencyBonus(c.level)
      : 0
  return abilityMod(c.abilities[skill.ability]) + prof
}

export function initiativeBonus(c: Character): number {
  return abilityMod(c.abilities.dex) + c.initiativeBonus
}

export function passivePerception(c: Character): number {
  return 10 + skillBonus(c, 'perception')
}

export function spellSaveDc(c: Character): number | null {
  if (!c.spellAbility) return null
  return 8 + proficiencyBonus(c.level) + abilityMod(c.abilities[c.spellAbility])
}

export function spellAttackBonus(c: Character): number | null {
  if (!c.spellAbility) return null
  return proficiencyBonus(c.level) + abilityMod(c.abilities[c.spellAbility])
}

/** "+3" / "-1" — dice notation and display both want the sign. */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/** d20 notation for a bonus: 5 -> "d20+5", -1 -> "d20-1", 0 -> "d20". */
export function d20(bonus: number): string {
  return bonus === 0 ? 'd20' : `d20${signed(bonus)}`
}

// --- Frontmatter parse / serialize ------------------------------------------

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback
const strList = (v: unknown): Array<string> =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

function parseAbility(v: unknown): Ability | null {
  return typeof v === 'string' && (ABILITIES as readonly string[]).includes(v)
    ? (v as Ability)
    : null
}

/** Whether raw article content is a character sheet. */
export function isCharacterContent(content: string): boolean {
  const { frontmatter } = splitFrontmatter(content)
  return frontmatter != null && /^type:\s*character\s*$/m.test(frontmatter)
}

/**
 * Parse article content into sheet data + prose body. Tolerant: a malformed
 * or partial frontmatter yields defaults for the broken fields, never throws.
 */
export function parseCharacter(content: string): {
  character: Character
  body: string
} {
  const { frontmatter, body } = splitFrontmatter(content)
  const c = emptyCharacter()
  if (frontmatter == null) return { character: c, body }

  let raw: unknown
  try {
    raw = parseYaml(frontmatter)
  } catch {
    return { character: c, body }
  }
  if (typeof raw !== 'object' || raw === null) return { character: c, body }
  const r = raw as Record<string, unknown>

  c.class = str(r.class, c.class)
  c.level = Math.max(1, Math.min(20, num(r.level, c.level)))
  c.race = str(r.race, c.race)
  c.background = str(r.background, c.background)
  c.alignment = str(r.alignment, c.alignment)
  c.xp = Math.max(0, num(r.xp, c.xp))

  if (typeof r.abilities === 'object' && r.abilities !== null) {
    const a = r.abilities as Record<string, unknown>
    for (const key of ABILITIES) {
      c.abilities[key] = Math.max(
        1,
        Math.min(30, num(a[key], c.abilities[key])),
      )
    }
  }
  c.saves = strList(r.saves).flatMap((s) => {
    const a = parseAbility(s)
    return a ? [a] : []
  })
  const knownSkill = (id: string) => SKILLS.some((s) => s.id === id)
  c.skills = strList(r.skills).filter(knownSkill)
  c.expertise = strList(r.expertise).filter(knownSkill)

  c.ac = Math.max(0, num(r.ac, c.ac))
  c.initiativeBonus = num(r.initiativeBonus, c.initiativeBonus)
  c.speed = Math.max(0, num(r.speed, c.speed))

  if (typeof r.hp === 'object' && r.hp !== null) {
    const hp = r.hp as Record<string, unknown>
    c.hp.max = Math.max(1, num(hp.max, c.hp.max))
    c.hp.current = Math.max(0, num(hp.current, c.hp.max))
    c.hp.temp = Math.max(0, num(hp.temp, 0))
  }
  if (typeof r.hitDice === 'object' && r.hitDice !== null) {
    const hd = r.hitDice as Record<string, unknown>
    c.hitDice.size = num(hd.size, c.hitDice.size)
    c.hitDice.total = Math.max(0, num(hd.total, c.level))
    c.hitDice.used = Math.max(0, Math.min(c.hitDice.total, num(hd.used, 0)))
  }
  if (typeof r.deathSaves === 'object' && r.deathSaves !== null) {
    const ds = r.deathSaves as Record<string, unknown>
    c.deathSaves.success = Math.max(0, Math.min(3, num(ds.success, 0)))
    c.deathSaves.fail = Math.max(0, Math.min(3, num(ds.fail, 0)))
  }

  if (Array.isArray(r.attacks)) {
    c.attacks = r.attacks.flatMap((entry): Array<Attack> => {
      if (typeof entry !== 'object' || entry === null) return []
      const at = entry as Record<string, unknown>
      if (typeof at.name !== 'string') return []
      return [
        {
          name: at.name,
          bonus: num(at.bonus, 0),
          damage: str(at.damage, ''),
        },
      ]
    })
  }

  c.spellAbility = parseAbility(r.spellAbility)
  if (typeof r.spellSlots === 'object' && r.spellSlots !== null) {
    for (const [key, value] of Object.entries(r.spellSlots)) {
      const lvl = Number(key)
      if (!Number.isInteger(lvl) || lvl < 1 || lvl > 9) continue
      if (typeof value !== 'object' || value === null) continue
      const slot = value as Record<string, unknown>
      const total = Math.max(0, num(slot.total, 0))
      c.spellSlots[lvl] = {
        total,
        used: Math.max(0, Math.min(total, num(slot.used, 0))),
      }
    }
  }

  if (typeof r.currency === 'object' && r.currency !== null) {
    const cur = r.currency as Record<string, unknown>
    for (const coin of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
      c.currency[coin] = Math.max(0, num(cur[coin], 0))
    }
  }

  c.inventory = strList(r.inventory)
  if (Array.isArray(r.notes)) {
    c.notes = r.notes.flatMap((entry): Array<CharacterNote> => {
      if (typeof entry !== 'object' || entry === null) return []
      const n = entry as Record<string, unknown>
      if (typeof n.text !== 'string') return []
      return [{ at: str(n.at, ''), text: n.text }]
    })
  }

  return { character: c, body }
}

/** Serialize sheet data + prose back into article content. */
export function serializeCharacter(character: Character, body: string): string {
  const data: Record<string, unknown> = {
    type: 'character',
    class: character.class,
    level: character.level,
    race: character.race,
    background: character.background,
    alignment: character.alignment,
    xp: character.xp,
    abilities: character.abilities,
    saves: character.saves,
    skills: character.skills,
    expertise: character.expertise,
    ac: character.ac,
    initiativeBonus: character.initiativeBonus,
    speed: character.speed,
    hp: character.hp,
    hitDice: character.hitDice,
    deathSaves: character.deathSaves,
    attacks: character.attacks,
    spellAbility: character.spellAbility,
    spellSlots: character.spellSlots,
    currency: character.currency,
    inventory: character.inventory,
    notes: character.notes,
  }
  const yaml = stringifyYaml(data).trimEnd()
  return joinFrontmatter(yaml, body)
}
