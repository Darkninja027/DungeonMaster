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

export interface Spell {
  /** Plain text or a [[wiki link]] to the spell's article. */
  name: string
  /** 0 = cantrip (at will), 1-9 cast by expending a slot of that level. */
  level: number
  /** Damage notation, e.g. "3d4+3"; "mod" resolves to the spell modifier ("2d8+mod"). */
  damage?: string
  /** Upcast increment added once per slot level above `level`, e.g. Magic Missile's "1d4+1". */
  damagePerLevel?: string
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
  spells: Array<Spell>
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
    spells: [],
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

/**
 * Display name for an inventory row when promoting it to an attack:
 * "[[Flametongue]] (attuned)" -> "Flametongue", "Daggers x3" -> "Daggers".
 */
export function inventoryItemName(row: string): string {
  const unlinked = row.replace(
    /\[\[([^\][\n|]+)(?:\|([^\][\n]+))?\]\]/g,
    (_, title: string, alias?: string) => alias ?? title,
  )
  return (
    unlinked
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+x\d+\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim() || row.trim()
  )
}

/** "[[Fireball]]" / "[[Fireball|Boom]]" / "Fireball" -> "Fireball" (article title). */
export function wikiLinkTitle(text: string): string {
  const m = text.match(/\[\[([^\][\n|]+)/)
  return (m ? m[1] : text).trim()
}

export interface SpellInfo {
  level: number | null
  damage: string | null
  /** Added once per slot level above the base, e.g. Magic Missile's "1d4+1". */
  damagePerLevel: string | null
}

/**
 * Read a spell's sheet-relevant data from its article. Frontmatter is the
 * source of truth (`level: 3`, `damage: 8d6`); articles without it fall back
 * to the subtitle convention for the level. Damage is never guessed from
 * prose — a wrong guess is worse than an empty field.
 */
export function spellInfoFromContent(content: string): SpellInfo {
  let level: number | null = null
  let damage: string | null = null
  let damagePerLevel: string | null = null
  const { frontmatter } = splitFrontmatter(content)
  if (frontmatter != null) {
    try {
      const raw = parseYaml(frontmatter) as unknown
      if (typeof raw === 'object' && raw !== null) {
        const r = raw as Record<string, unknown>
        if (typeof r.level === 'number' && r.level >= 0 && r.level <= 9) {
          level = Math.floor(r.level)
        }
        if (typeof r.damage === 'string' && r.damage.trim()) {
          damage = r.damage.trim()
        }
        if (typeof r.damagePerLevel === 'string' && r.damagePerLevel.trim()) {
          damagePerLevel = r.damagePerLevel.trim()
        }
      }
    } catch {
      // malformed frontmatter: fall through to prose detection
    }
  }
  if (level === null) level = spellLevelFromContent(content)
  return { level, damage, damagePerLevel }
}

const NOTATION = /^(\d*)d(\d+)([+-]\d+)?$/i
const MOD_TAIL = /\s*\+\s*mod$/i

/**
 * Upcast damage: base plus damagePerLevel once per slot level above the base
 * ("3d4+3" + 2 × "1d4+1" -> "5d4+5"). A base ending in "+mod" scales too as
 * long as neither roll carries a numeric modifier ("3d8+mod" + "1d8" ->
 * "4d8+mod") — rollDice only accepts a single NdM±k term, so anything that
 * would need two modifiers falls back to the base notation, as do rolls with
 * different dice.
 */
export function scaleSpellDamage(
  base: string,
  perLevel: string | null | undefined,
  levelsAbove: number,
): string {
  if (!perLevel || levelsAbove <= 0) return base
  const hasMod = MOD_TAIL.test(base.trimEnd())
  const b = base
    .trimEnd()
    .replace(MOD_TAIL, '')
    .replace(/\s+/g, '')
    .match(NOTATION)
  const p = perLevel.replace(/\s+/g, '').match(NOTATION)
  if (!b || !p || b[2] !== p[2]) return base
  if (hasMod && (b[3] || p[3] || MOD_TAIL.test(perLevel.trimEnd()))) return base
  const count = Number(b[1] || 1) + levelsAbove * Number(p[1] || 1)
  const mod =
    (b[3] ? Number(b[3]) : 0) + levelsAbove * (p[3] ? Number(p[3]) : 0)
  return `${count}d${b[2]}${mod !== 0 ? signed(mod) : ''}${hasMod ? '+mod' : ''}`
}

/**
 * Detect a spell's level from its article: the subtitle convention is
 * "*1st-level evocation*", "*Level 3 abjuration*", or "*Evocation cantrip*".
 * Only the head of the article is searched so "At Higher Levels… 2nd level
 * or higher" in the body can't lie about the base level. Null if unknown.
 */
export function spellLevelFromContent(content: string): number | null {
  const head = splitFrontmatter(content).body.slice(0, 300)
  const ordinal = head.match(/\b([1-9])(?:st|nd|rd|th)[-\s]level\b/i)
  if (ordinal) return Number(ordinal[1])
  const plain = head.match(/\blevel\s*([1-9])\b/i)
  if (plain) return Number(plain[1])
  if (/\bcantrip\b/i.test(head)) return 0
  return null
}

/**
 * Resolve a spell damage string to rollable notation: "mod" becomes the
 * caster's spellcasting ability modifier ("2d8+mod" -> "2d8+3"). Returns the
 * string unchanged when there is no token.
 */
export function resolveSpellDamage(damage: string, c: Character): string {
  const mod = c.spellAbility ? abilityMod(c.abilities[c.spellAbility]) : 0
  return damage
    .replace(/\s*\+\s*mod\b/i, signed(mod))
    .replace(/\bmod\b/i, `${mod}`)
}

/** Spells sorted for display: cantrips first, then by level, then name. */
export function sortedSpells(spells: Array<Spell>): Array<Spell> {
  return [...spells].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  )
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

  if (Array.isArray(r.spells)) {
    c.spells = r.spells.flatMap((entry): Array<Spell> => {
      if (typeof entry !== 'object' || entry === null) return []
      const s = entry as Record<string, unknown>
      if (typeof s.name !== 'string') return []
      const spell: Spell = {
        name: s.name,
        level: Math.max(0, Math.min(9, num(s.level, 0))),
      }
      if (typeof s.damage === 'string' && s.damage.trim()) {
        spell.damage = s.damage.trim()
      }
      if (typeof s.damagePerLevel === 'string' && s.damagePerLevel.trim()) {
        spell.damagePerLevel = s.damagePerLevel.trim()
      }
      return [spell]
    })
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
    spells: character.spells,
    currency: character.currency,
    inventory: character.inventory,
    notes: character.notes,
  }
  const yaml = stringifyYaml(data).trimEnd()
  return joinFrontmatter(yaml, body)
}
