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

/**
 * The skill id for something a player typed or a table authored, matched on id
 * first and then on display name, both trimmed and case-insensitively.
 * `undefined` for anything that is not one of the eighteen skills.
 *
 * Two jobs. It lets an open skill pick accept "Animal Handling" — what a person
 * types — and still store `animal-handling`, which is the only spelling the
 * sheet keeps; anything else is dropped by the filter in `buildCharacter` and
 * again on parse, so without this a typed skill name is silently lost. And it
 * is what makes a `skillOrTool` pick decidable: skills are a closed list and
 * tools are free text, so "not a skill" is a complete answer.
 *
 * Deliberately exact rather than fuzzy — a near miss should become a tool, not
 * quietly become the wrong skill.
 */
export function skillIdFor(value: string): string | undefined {
  const key = value.trim().toLowerCase()
  if (key === '') return undefined
  return SKILLS.find((s) => s.id === key || s.name.toLowerCase() === key)?.id
}

/**
 * Armor and weapon proficiency is a closed set in 5e, so these drive quick
 * checkboxes in the editor. They are *not* a filter: classes and races also
 * grant individual weapons ("longsword"), and homebrew grants anything at all.
 * Dropping an unknown value would delete something hand-written in Obsidian.
 */
export const ARMOR_PROFICIENCIES: Array<{ id: string; name: string }> = [
  { id: 'light', name: 'Light armor' },
  { id: 'medium', name: 'Medium armor' },
  { id: 'heavy', name: 'Heavy armor' },
  { id: 'shields', name: 'Shields' },
]

export const WEAPON_CATEGORIES: Array<{ id: string; name: string }> = [
  { id: 'simple', name: 'Simple weapons' },
  { id: 'martial', name: 'Martial weapons' },
]

/** The 13 damage types, alphabetical as the rules list them. */
export const DAMAGE_TYPES: Array<{ id: string; name: string }> = [
  { id: 'acid', name: 'Acid' },
  { id: 'bludgeoning', name: 'Bludgeoning' },
  { id: 'cold', name: 'Cold' },
  { id: 'fire', name: 'Fire' },
  { id: 'force', name: 'Force' },
  { id: 'lightning', name: 'Lightning' },
  { id: 'necrotic', name: 'Necrotic' },
  { id: 'piercing', name: 'Piercing' },
  { id: 'poison', name: 'Poison' },
  { id: 'psychic', name: 'Psychic' },
  { id: 'radiant', name: 'Radiant' },
  { id: 'slashing', name: 'Slashing' },
  { id: 'thunder', name: 'Thunder' },
]

/** The 15 conditions a creature can be immune to. */
export const CONDITIONS: Array<{ id: string; name: string }> = [
  { id: 'blinded', name: 'Blinded' },
  { id: 'charmed', name: 'Charmed' },
  { id: 'deafened', name: 'Deafened' },
  { id: 'exhaustion', name: 'Exhaustion' },
  { id: 'frightened', name: 'Frightened' },
  { id: 'grappled', name: 'Grappled' },
  { id: 'incapacitated', name: 'Incapacitated' },
  { id: 'invisible', name: 'Invisible' },
  { id: 'paralyzed', name: 'Paralyzed' },
  { id: 'petrified', name: 'Petrified' },
  { id: 'poisoned', name: 'Poisoned' },
  { id: 'prone', name: 'Prone' },
  { id: 'restrained', name: 'Restrained' },
  { id: 'stunned', name: 'Stunned' },
  { id: 'unconscious', name: 'Unconscious' },
]

/**
 * Display label for a stored token: "light" -> "Light armor". Anything not in a
 * known set is free text the user typed, so it passes through untouched.
 */
export function proficiencyLabel(value: string): string {
  const id = value.trim().toLowerCase()
  const known = [
    ...ARMOR_PROFICIENCIES,
    ...WEAPON_CATEGORIES,
    ...DAMAGE_TYPES,
    ...CONDITIONS,
  ].find((p) => p.id === id)
  return known ? known.name : value
}

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
  /**
   * Whether this spell is currently prepared, counting against the limit.
   * Meaningless for cantrips, which are always available.
   */
  prepared?: boolean
  /**
   * Prepared for free and exempt from the limit — a cleric's domain spells, a
   * paladin's oath spells, a Warlock or Land druid's circle spells. Wins over
   * `prepared` when both are set, so the two can never disagree.
   */
  alwaysPrepared?: boolean
}

export interface CharacterNote {
  at: string // ISO date
  text: string
  /**
   * Optional headline, so a long note collapses to one readable row instead of
   * a date and a wall of prose. Absent on notes written before titles existed
   * and on anything jotted down in Obsidian as a bare `text:`.
   */
  title?: string
  /**
   * Freeform labels — "session", "lore", "npc". Lowercased and de-duplicated on
   * the way in so `#Session` and `session` can't split one bucket into two.
   */
  tags?: Array<string>
}

/**
 * The tag that marks a note as a session recap. Only notes carrying it print in
 * the character sheet's Session Notes box — lore, loot and untagged scratch
 * notes stay in the Notes tab where everything is listed.
 */
export const SESSION_TAG = 'session'

/** The tags offered as one-click suggestions when a note has none of its own. */
export const SUGGESTED_NOTE_TAGS = [
  SESSION_TAG,
  'lore',
  'npc',
  'quest',
  'loot',
  'downtime',
] as const

/**
 * Normalize one tag for storage: lowercase, no leading '#', inner whitespace
 * collapsed to single dashes so "Sea of Swords" and "sea-of-swords" are one tag
 * rather than two. Returns '' for anything that reduces to nothing.
 */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Normalize a list of tags, dropping blanks and duplicates but keeping order. */
export function normalizeTags(raw: Array<string>): Array<string> {
  const out: Array<string> = []
  for (const tag of raw) {
    const t = normalizeTag(tag)
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** Every tag in use on this character, alphabetical, each listed once. */
export function allNoteTags(notes: Array<CharacterNote>): Array<string> {
  const seen = new Set<string>()
  for (const note of notes) for (const tag of note.tags ?? []) seen.add(tag)
  return [...seen].sort()
}

/**
 * Notes newest-first. Undated notes sort last rather than first: an empty `at`
 * is a hand-written note missing its date, not one from the year zero.
 */
export function sortedNotes(notes: Array<CharacterNote>): Array<CharacterNote> {
  return [...notes].sort((a, b) => {
    if (!a.at && !b.at) return 0
    if (!a.at) return 1
    if (!b.at) return -1
    return b.at.localeCompare(a.at)
  })
}

/**
 * Session recaps only, newest first. A note earns its place on the printed
 * sheet by being tagged #session; everything else a player jots down belongs in
 * the Notes tab, not under a caption promising sessions. Tags are normalized to
 * lowercase on the way in, so a plain `includes` is enough.
 */
export function sessionNotes(
  notes: Array<CharacterNote>,
): Array<CharacterNote> {
  return sortedNotes(notes.filter((n) => n.tags?.includes(SESSION_TAG)))
}

/**
 * Filter notes by a free-text query and a set of required tags. The query
 * matches title, body or tag, so typing "strahd" finds the note whether the
 * name is in the headline or buried in the recap. Tags are AND-ed — picking
 * two chips narrows rather than widens.
 */
export function filterNotes(
  notes: Array<CharacterNote>,
  query: string,
  tags: Array<string>,
): Array<CharacterNote> {
  const q = query.trim().toLowerCase()
  return notes.filter((note) => {
    if (!tags.every((t) => note.tags?.includes(t))) return false
    if (!q) return true
    return (
      note.title?.toLowerCase().includes(q) ||
      note.text.toLowerCase().includes(q) ||
      note.at.toLowerCase().includes(q) ||
      (note.tags ?? []).some((t) => t.includes(q))
    )
  })
}

/**
 * Markdown treats a single newline as a space, so a hand-typed list like
 *
 *   3rd Level: Bane, Hunter's Mark
 *   5th Level: Hold Person, Misty Step
 *
 * would run together into one paragraph. Append markdown's own hard-break
 * marker (two trailing spaces) to each line so the layout survives, without
 * touching blank lines (paragraph breaks) or lines that already end in one.
 *
 * Every view that renders authored note or feature text needs this — the sheet
 * and the Notes tab both — or the same note reads differently in each.
 */
export function preserveLineBreaks(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? line : line.replace(/ *$/, '  ')))
    .join('\n')
}

/**
 * A one-line preview of a note's body for its collapsed row — the first
 * non-empty line, stripped of the markdown that would otherwise read as
 * punctuation noise ("## Recap" -> "Recap", "- **Bought** rope" -> "Bought rope").
 */
export function notePreview(text: string): string {
  const line = text.split('\n').find((l) => l.trim()) ?? ''
  return line
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*>\s*/, '')
    .replace(/\[\[([^\][\n|]+)(?:\|([^\][\n]+))?\]\]/g, (_, t, a) => a ?? t)
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .trim()
}

/**
 * A class feature gained at a given level — "Cunning Action" at rogue 2, a
 * subclass feature at 3. Features above the character's current level are kept
 * (so you can plan a build ahead of time) and shown greyed out.
 */
export interface ClassFeature {
  /** Character level this is gained at, 1-20. */
  level: number
  name: string
  /** Optional rules text; [[wiki links]] and dice notation stay live. */
  text?: string
}

/**
 * A named entry with optional rules text, used for anything that isn't gained
 * at a specific class level: racial traits (Darkvision, Lucky) and feats
 * (Alert, Lucky, Sharpshooter). Both render as flat lists.
 */
export interface NamedEntry {
  name: string
  /** Optional rules text; [[wiki links]] and dice notation stay live. */
  text?: string
}

/** A racial trait — Darkvision, Fey Ancestry, Halfling Nimbleness. */
export type RacialTrait = NamedEntry

/** A feat — Alert, Sharpshooter, War Caster. */
export type Feat = NamedEntry

/** The paper-doll slots, in the order the silhouette lays them out. */
export const EQUIP_SLOTS = [
  'head',
  'necklace',
  'cloak',
  'armor',
  'gloves',
  'belt',
  'boots',
  'ring1',
  'ring2',
  'mainHand',
  'offHand',
] as const
export type EquipSlot = (typeof EQUIP_SLOTS)[number]

export const EQUIP_SLOT_NAMES: Record<EquipSlot, string> = {
  head: 'Head',
  necklace: 'Necklace',
  cloak: 'Cloak',
  armor: 'Armor',
  gloves: 'Gloves',
  belt: 'Belt',
  boots: 'Boots',
  ring1: 'Ring (left)',
  ring2: 'Ring (right)',
  mainHand: 'Main hand',
  offHand: 'Off hand',
}

/**
 * Slot names for the "fits" picker, where the left/right distinction is
 * meaningless — an item that fits one ring finger fits the other.
 */
export const SLOT_FIT_NAMES: Record<EquipSlot, string> = {
  ...EQUIP_SLOT_NAMES,
  ring1: 'Ring',
  ring2: 'Ring',
  mainHand: 'Weapon',
  offHand: 'Shield',
}

export interface InventoryItem {
  /**
   * The row exactly as the user typed it — [[wiki links]], "(attuned)" and any
   * legacy " x5" suffix included. Never reconstructed from the other fields,
   * which is what lets an unweighed row round-trip back to a bare YAML string.
   */
  text: string
  /** How many. 1 unless set, or read from a legacy " xN" suffix. */
  qty: number
  /** Pounds *per unit*, as 5e sources list it; contributes qty * weight. */
  weight: number
  /** Which paper-doll slot this occupies, or null if merely carried. */
  slot: EquipSlot | null
  /**
   * Which slot this item *can* go in, so the paper doll doesn't offer to put
   * rations on your head. `undefined` means never set — the UI falls back to
   * `guessSlot` on the name. `null` means "deliberately nothing", which is how
   * you tell the app an item is not wearable and silence the guess.
   */
  fits?: EquipSlot | null
  /** Whether this item is currently attuned, counting against the limit. */
  attuned?: boolean
}

/** 5e gives you three attunement slots; a character may be set otherwise. */
export const DEFAULT_ATTUNEMENT_SLOTS = 3

/**
 * The long-standing convention for marking attunement in a free-text row,
 * e.g. "[[Flametongue]] (attuned)". Read on parse so existing sheets carry
 * over, but never written — the `attuned` field is the source of truth and
 * the row's text is left exactly as the user typed it.
 */
const ATTUNED_TEXT = /\(\s*attun(?:ed|ement)\s*\)/i

/**
 * Keyword guesses for which slot an item belongs in. Only a trailing `\b` is
 * used, not a leading one: 5e names compound constantly ("Longsword",
 * "Greataxe", "Warhammer", "Shortbow"), so requiring a word boundary before
 * the noun would miss most real weapons. Order matters — the first match
 * wins, so "Ring Mail" is armor before it is a ring.
 *
 * Only ever a default: `fits` overrides it, and anything unmatched simply
 * isn't offered a slot.
 */
const SLOT_KEYWORDS: Array<[RegExp, EquipSlot]> = [
  [/(helm|helmet|hat|cap|circlet|crown|hood|mask)\b/i, 'head'],
  [/(amulet|necklace|pendant|periapt|talisman|medallion)\b/i, 'necklace'],
  [/(cloak|cape|mantle|robe)s?\b/i, 'cloak'],
  [/(armor|armour|mail|plate|breastplate|cuirass|leather)s?\b/i, 'armor'],
  [/(glove|gauntlet|bracer|mitten)s?\b/i, 'gloves'],
  [/(belt|girdle|sash)\b/i, 'belt'],
  [/(boot|shoe|sandal|greave|slipper)s?\b/i, 'boots'],
  [/\bring\b/i, 'ring1'],
  [/(shield|buckler)\b/i, 'offHand'],
  [
    /(sword|axe|mace|hammer|dagger|spear|staff|wand|bow|flail|glaive|halberd|rapier|scimitar|club|maul|pike|lance|whip|sickle|trident|blade|morningstar|javelin|dart|sling)s?\b/i,
    'mainHand',
  ],
]

/**
 * Best guess at the slot an item goes in, from its name. Returns null when
 * nothing matches — rations, rope and torches get no slot and so are never
 * offered on the paper doll.
 *
 * Matched against the cleaned name first, then the raw row: a parenthetical
 * is often where the type actually lives ("Flametongue (longsword)"), and
 * `inventoryItemName` strips those. The "(attuned)" marker is dropped first
 * so it can't be mistaken for a type hint.
 */
export function guessSlot(text: string): EquipSlot | null {
  const name = inventoryItemName(text)
  const raw = text.replace(ATTUNED_TEXT, ' ')
  for (const [re, slot] of SLOT_KEYWORDS) {
    if (re.test(name) || re.test(raw)) return slot
  }
  return null
}

/**
 * The slot an item may be equipped in: an explicit `fits` if the user set one
 * (including a deliberate null), otherwise the name guess.
 */
export function slotFor(item: InventoryItem): EquipSlot | null {
  return item.fits !== undefined ? item.fits : guessSlot(item.text)
}

/**
 * Whether an item can go in a given slot. Rings are interchangeable, so an
 * item that fits `ring1` fits `ring2` too; likewise a one-handed weapon or
 * shield can go in either hand.
 */
export function fitsSlot(item: InventoryItem, slot: EquipSlot): boolean {
  const fits = slotFor(item)
  if (fits === null) return false
  if (fits === slot) return true
  const rings = fits.startsWith('ring') && slot.startsWith('ring')
  const hands =
    (fits === 'mainHand' || fits === 'offHand') &&
    (slot === 'mainHand' || slot === 'offHand')
  return rings || hands
}

export interface EncumbranceSettings {
  /** Off by default, so existing sheets see no change at all. */
  enabled: boolean
  /** 5e counts coins at 50/lb; sub-toggle for tables that don't bother. */
  countCoins: boolean
}

export interface Character {
  class: string
  /**
   * Free text like `class`. The editor suggests the PHB names for the chosen
   * class (see lib/classes.ts), but homebrew and hand-edited values pass
   * through untouched.
   */
  subclass: string
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
  /**
   * Other proficiencies. Free text so homebrew and individually granted weapons
   * survive; `ARMOR_PROFICIENCIES` / `WEAPON_CATEGORIES` are editor affordances,
   * not filters. Known tokens store lowercase, free text keeps its own casing.
   */
  armor: Array<string>
  weapons: Array<string>
  tools: Array<string>
  languages: Array<string>
  /** Damage types by `DAMAGE_TYPES` id. A type belongs to at most one list. */
  resistances: Array<string>
  immunities: Array<string>
  vulnerabilities: Array<string>
  /** Conditions by `CONDITIONS` id. */
  conditionImmunities: Array<string>
  ac: number
  /** Misc initiative bonus on top of the DEX modifier. */
  initiativeBonus: number
  speed: number
  hp: { current: number; max: number; temp: number }
  /**
   * `total` tracks `level` unless the sheet pins it — a total that differs from
   * the level is a deliberate override (multiclass, homebrew) and survives both
   * serialization and levelling up. See {@link setLevel} and
   * {@link hitDiceArePinned}.
   */
  hitDice: { size: number; total: number; used: number }
  deathSaves: { success: number; fail: number }
  attacks: Array<Attack>
  /** Racial traits, granted at creation and so not levelled. */
  traits: Array<RacialTrait>
  /** Feats taken via ASI or a variant-human start; not tied to a level. */
  feats: Array<Feat>
  /** Class/subclass features, each tagged with the level it's gained at. */
  features: Array<ClassFeature>
  spellAbility: Ability | null
  /** Keyed by spell level 1-9. */
  spellSlots: Record<number, SpellSlots>
  spells: Array<Spell>
  /**
   * How many non-cantrip spells may be prepared at once. 0 means this character
   * doesn't prepare spells at all (sorcerers, warlocks, monsters) and no
   * preparation UI appears — see {@link tracksPreparation}.
   */
  preparedLimit: number
  currency: Record<'cp' | 'sp' | 'ep' | 'gp' | 'pp', number>
  /** Free-text rows with optional weight/qty/slot; [[wiki links]] resolve. */
  inventory: Array<InventoryItem>
  encumbrance: EncumbranceSettings
  /** How many items may be attuned at once. 3 by RAW; homebrew varies. */
  attunementSlots: number
  notes: Array<CharacterNote>
}

export function emptyCharacter(): Character {
  return {
    class: '',
    subclass: '',
    level: 1,
    race: '',
    background: '',
    alignment: '',
    xp: 0,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: [],
    skills: [],
    expertise: [],
    armor: [],
    weapons: [],
    tools: [],
    languages: [],
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    conditionImmunities: [],
    ac: 10,
    initiativeBonus: 0,
    speed: 30,
    hp: { current: 10, max: 10, temp: 0 },
    hitDice: { size: 8, total: 1, used: 0 },
    deathSaves: { success: 0, fail: 0 },
    attacks: [],
    traits: [],
    feats: [],
    features: [],
    spellAbility: null,
    spellSlots: {},
    spells: [],
    preparedLimit: 0,
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    inventory: [],
    encumbrance: { enabled: false, countCoins: true },
    attunementSlots: DEFAULT_ATTUNEMENT_SLOTS,
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

/** The die sizes a 5e class can have, plus room for homebrew at either end. */
export const HIT_DIE_SIZES = [4, 6, 8, 10, 12, 20] as const

/**
 * Snaps a hand-edited die size to the nearest real die. A `d7` is a typo, not a
 * house rule, but the value is never zeroed — the closest die is always a more
 * useful sheet than a blank one.
 */
export function clampHitDie(size: number): number {
  if (!Number.isFinite(size)) return 8
  return HIT_DIE_SIZES.reduce((best, die) =>
    Math.abs(die - size) < Math.abs(best - size) ? die : best,
  )
}

/**
 * Whether this sheet's hit-dice total has been pinned away from its level.
 * An unpinned total follows the level; a pinned one is left alone.
 */
export function hitDiceArePinned(c: Character): boolean {
  return c.hitDice.total !== c.level
}

/**
 * Applies a level change, carrying an unpinned hit-dice total along with it.
 * `used` is clamped so a long-rest tally can never exceed the pool it's spent
 * against.
 */
export function setLevel(c: Character, level: number): Character {
  const next = Math.max(1, Math.min(20, level))
  if (hitDiceArePinned(c)) return { ...c, level: next }
  return {
    ...c,
    level: next,
    hitDice: {
      ...c.hitDice,
      total: next,
      used: Math.min(c.hitDice.used, next),
    },
  }
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

// --- Other proficiencies and defenses ---------------------------------------

/** Where a damage type currently sits. A type is never in two lists at once. */
export type DamageStance = 'none' | 'resistant' | 'immune' | 'vulnerable'

export function damageStance(c: Character, id: string): DamageStance {
  if (c.resistances.includes(id)) return 'resistant'
  if (c.immunities.includes(id)) return 'immune'
  if (c.vulnerabilities.includes(id)) return 'vulnerable'
  return 'none'
}

/**
 * Cycle a damage type none -> resistant -> immune -> vulnerable -> none. Lives
 * here rather than in the component so the "never in two lists" invariant is
 * unit-testable; returns a patch to spread over the character.
 */
export function cycleDamage(c: Character, id: string): Partial<Character> {
  const next: DamageStance =
    damageStance(c, id) === 'none'
      ? 'resistant'
      : damageStance(c, id) === 'resistant'
        ? 'immune'
        : damageStance(c, id) === 'immune'
          ? 'vulnerable'
          : 'none'
  const without = (list: Array<string>) => list.filter((d) => d !== id)
  return {
    resistances:
      next === 'resistant'
        ? [...without(c.resistances), id]
        : without(c.resistances),
    immunities:
      next === 'immune'
        ? [...without(c.immunities), id]
        : without(c.immunities),
    vulnerabilities:
      next === 'vulnerable'
        ? [...without(c.vulnerabilities), id]
        : without(c.vulnerabilities),
  }
}

/** True when any of the four defensive lists is set. */
export function hasDefenses(c: Character): boolean {
  return (
    c.resistances.length > 0 ||
    c.immunities.length > 0 ||
    c.vulnerabilities.length > 0 ||
    c.conditionImmunities.length > 0
  )
}

/** True when any of the four other-proficiency lists is set. */
export function hasOtherProficiencies(c: Character): boolean {
  return (
    c.armor.length > 0 ||
    c.weapons.length > 0 ||
    c.tools.length > 0 ||
    c.languages.length > 0
  )
}

export function spellSaveDc(c: Character): number | null {
  if (!c.spellAbility) return null
  return 8 + proficiencyBonus(c.level) + abilityMod(c.abilities[c.spellAbility])
}

export function spellAttackBonus(c: Character): number | null {
  if (!c.spellAbility) return null
  return proficiencyBonus(c.level) + abilityMod(c.abilities[c.spellAbility])
}

// --- Encumbrance (5e variant rules, opt-in per character) -------------------

/** 5e: 50 coins weigh a pound, whatever the denomination. */
export const COINS_PER_POUND = 50

export type EncumbranceTier =
  'none' | 'encumbered' | 'heavily-encumbered' | 'over'

export const ENCUMBRANCE_LABELS: Record<EncumbranceTier, string> = {
  none: 'Unencumbered',
  encumbered: 'Encumbered',
  'heavily-encumbered': 'Heavily encumbered',
  over: 'Over capacity',
}

/** Weight of the coin purse in pounds; 0 when the sub-toggle is off. */
export function coinWeight(c: Character): number {
  if (!c.encumbrance.countCoins) return 0
  const coins = Object.values(c.currency).reduce((sum, n) => sum + n, 0)
  return coins / COINS_PER_POUND
}

/**
 * Pounds carried: every row's qty x per-unit weight, plus coins. Rounded to
 * two places so float noise on the coin division can't nudge a character over
 * a threshold that they land on exactly.
 */
export function carriedWeight(c: Character): number {
  const items = c.inventory.reduce(
    (sum, item) => sum + item.qty * item.weight,
    0,
  )
  return Math.round((items + coinWeight(c)) * 100) / 100
}

/** STR x 15 — past this you cannot move at all. */
export function carryCapacity(c: Character): number {
  return c.abilities.str * 15
}

export function encumbranceThresholds(c: Character): {
  encumbered: number
  heavy: number
  max: number
} {
  const str = c.abilities.str
  return { encumbered: str * 5, heavy: str * 10, max: str * 15 }
}

/**
 * Which band the character is in. Returns 'none' whenever the feature is off,
 * so callers never need to guard — the opt-in is enforced here alone.
 * Boundaries are RAW: you are encumbered once weight *exceeds* STR x 5.
 */
export function encumbranceTier(c: Character): EncumbranceTier {
  if (!c.encumbrance.enabled) return 'none'
  const w = carriedWeight(c)
  const { encumbered, heavy, max } = encumbranceThresholds(c)
  if (w > max) return 'over'
  if (w > heavy) return 'heavily-encumbered'
  if (w > encumbered) return 'encumbered'
  return 'none'
}

/** Speed reduction in feet for a tier. */
export function encumbrancePenalty(tier: EncumbranceTier): number {
  return tier === 'encumbered' ? 10 : tier === 'heavily-encumbered' ? 20 : 0
}

/**
 * Walking speed after encumbrance. Over your maximum carrying capacity your
 * speed is 0 (RAW), not speed - 20; never negative either way.
 */
export function effectiveSpeed(c: Character): number {
  const tier = encumbranceTier(c)
  if (tier === 'over') return 0
  return Math.max(0, c.speed - encumbrancePenalty(tier))
}

// --- Attunement -------------------------------------------------------------

/** How many items are currently attuned. */
export function attunedCount(c: Character): number {
  return c.inventory.filter((i) => i.attuned).length
}

/** The character's attunement limit, floored at 0. */
export function attunementLimit(c: Character): number {
  return Math.max(0, Math.floor(c.attunementSlots))
}

/**
 * Whether a *new* attunement would exceed the limit. An already-attuned item
 * is always allowed to stay attuned, so a hand-edited file over the cap can
 * still be unpicked one item at a time rather than being stuck.
 */
export function canAttune(c: Character, item: InventoryItem): boolean {
  return Boolean(item.attuned) || attunedCount(c) < attunementLimit(c)
}

// --- Spell preparation ------------------------------------------------------

/**
 * Where a spell sits: not prepared, prepared against the limit, or always
 * prepared for free (domain/oath/circle spells). Cantrips are 'always' — they
 * need no preparation and can never be switched off.
 */
export type PreparationState = 'none' | 'prepared' | 'always'

/**
 * Read a spell's preparation as one value, so `alwaysPrepared` and `prepared`
 * can never be seen disagreeing: `alwaysPrepared` wins, and a cantrip is always
 * available whatever the flags say.
 */
export function preparationState(spell: Spell): PreparationState {
  if (spell.level === 0 || spell.alwaysPrepared) return 'always'
  return spell.prepared ? 'prepared' : 'none'
}

/**
 * Cycle a spell none -> prepared -> always -> none, mirroring `cycleDamage`.
 * Returns the flags to spread over the spell, so the "never disagreeing"
 * invariant is unit-testable rather than living in the component.
 *
 * Cantrips are left alone: they are always available, so there is nothing to
 * cycle and the UI shows no toggle for them.
 */
export function cyclePreparation(
  spell: Spell,
): Pick<Spell, 'prepared' | 'alwaysPrepared'> {
  if (spell.level === 0) return {}
  switch (preparationState(spell)) {
    case 'none':
      return { prepared: true, alwaysPrepared: undefined }
    case 'prepared':
      return { prepared: undefined, alwaysPrepared: true }
    default:
      return { prepared: undefined, alwaysPrepared: undefined }
  }
}

/**
 * How many spells are prepared *against the limit*. Cantrips and always-
 * prepared spells are free by RAW, so both are excluded here rather than at
 * each call site.
 */
export function preparedCount(c: Character): number {
  return c.spells.filter((s) => preparationState(s) === 'prepared').length
}

/** How many spells are prepared for free, outside the limit. */
export function alwaysPreparedCount(c: Character): number {
  return c.spells.filter((s) => s.level > 0 && s.alwaysPrepared).length
}

/** The prepared-spell limit, floored at 0. */
export function preparedSpellLimit(c: Character): number {
  return Math.max(0, Math.floor(c.preparedLimit))
}

/**
 * Whether this character prepares spells at all. A limit of 0 means no — a
 * sorcerer or warlock casts everything they know, so no preparation UI should
 * appear. This is the single opt-in gate; callers check it instead of the
 * number, the way `encumbranceTier` owns the encumbrance opt-in.
 */
export function tracksPreparation(c: Character): boolean {
  return preparedSpellLimit(c) > 0
}

/**
 * Whether a *new* preparation would exceed the limit. A spell that already
 * counts is always allowed to stay, so a sheet over the cap (hand-edited, or
 * after lowering the limit) can be unpicked one spell at a time rather than
 * being stuck with every toggle disabled.
 *
 * Cantrips and always-prepared spells never consume the limit, so cycling one
 * is always allowed — note this means a *full* character can still promote a
 * prepared spell to always-prepared, which frees a slot rather than using one.
 */
export function canPrepare(c: Character, spell: Spell): boolean {
  if (preparationState(spell) !== 'none') return true
  return preparedCount(c) < preparedSpellLimit(c)
}

// --- Equipment slots --------------------------------------------------------

/** The item occupying a slot, or null. Parse guarantees at most one. */
export function equippedIn(
  items: Array<InventoryItem>,
  slot: EquipSlot,
): InventoryItem | null {
  return items.find((i) => i.slot === slot) ?? null
}

/**
 * Move the item at `index` into `slot` (or unequip it with null), evicting
 * whatever held that slot. Index-addressed to match how InventoryTab already
 * edits rows, and it can't orphan a slot: deleting the row deletes the slot.
 */
export function equipItem(
  items: Array<InventoryItem>,
  index: number,
  slot: EquipSlot | null,
): Array<InventoryItem> {
  return items.map((item, i) =>
    i === index
      ? { ...item, slot }
      : slot !== null && item.slot === slot
        ? { ...item, slot: null }
        : item,
  )
}

/**
 * Set quantity, keeping any legacy " xN" suffix in the text in sync so the
 * two can never disagree on screen.
 */
export function withQty(item: InventoryItem, qty: number): InventoryItem {
  const n = Math.max(1, Math.floor(qty))
  return QTY_SUFFIX.test(item.text)
    ? {
        ...item,
        qty: n,
        text: item.text.replace(QTY_SUFFIX, n > 1 ? ` x${n}` : ''),
      }
    : { ...item, qty: n }
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

/**
 * Inventory sorted A-Z for the printed sheet only — `c.inventory` keeps the
 * player's own order, which is what the Gear tab edits and what round-trips to
 * disk. Sorting on `inventoryItemName` rather than the raw row means
 * "[[Flametongue]]" files under F, not "[", and "Daggers x3" under D; the
 * fallback keeps a row that is *only* a qty suffix from collapsing to "".
 * Case-insensitive via `sensitivity: 'base'`, matching lib/bestiary.ts, so a
 * lowercase "rope" doesn't sort after every capitalised item.
 */
export function sortedInventory(
  items: Array<InventoryItem>,
): Array<InventoryItem> {
  return [...items].sort((a, b) =>
    inventoryItemName(a.text).localeCompare(
      inventoryItemName(b.text),
      undefined,
      { sensitivity: 'base' },
    ),
  )
}

// --- Unified feature view ---------------------------------------------------

/**
 * Where a feature came from. The three live in separate frontmatter arrays
 * (`traits`, `feats`, `features`) because only class features carry a level,
 * but the editor shows them as one list badged by source — three stacked
 * sections made it hard to find anything.
 */
export type FeatureSource = 'trait' | 'feat' | 'class'

export const FEATURE_SOURCE_NAMES: Record<FeatureSource, string> = {
  trait: 'Racial',
  feat: 'Feat',
  class: 'Class',
}

/**
 * One row of the unified list: a named entry plus which array it lives in and,
 * for class features, the level it's gained at. `index` is its position within
 * its own source array, which is how edits are routed back — the merged view is
 * sorted, so a position in it means nothing to the stored data.
 */
export interface FeatureEntry {
  source: FeatureSource
  index: number
  name: string
  text?: string
  /** Only ever set for `class` features. */
  level?: number
}

/**
 * Merge the three arrays into one display list: racial traits, then feats, then
 * class features by level. Within a source the stored order is kept — there's
 * no natural sort for traits or feats, and re-ordering a hand-written list on
 * every render would be surprising.
 */
export function featureEntries(c: Character): Array<FeatureEntry> {
  const flat = (source: 'trait' | 'feat', entries: Array<NamedEntry>) =>
    entries.map((e, index): FeatureEntry => ({
      source,
      index,
      name: e.name,
      text: e.text,
    }))
  // Sorted by level for display, but each row remembers where it actually sits
  // in `c.features` so edits land on the right entry.
  const classFeatures = c.features
    .map((f, index): FeatureEntry => ({
      source: 'class',
      index,
      name: f.name,
      text: f.text,
      level: f.level,
    }))
    .sort((a, b) => a.level! - b.level! || a.name.localeCompare(b.name))
  return [
    ...flat('trait', c.traits),
    ...flat('feat', c.feats),
    ...classFeatures,
  ]
}

/** The badge text for a row: "Racial", "Feat", or "Class · Lv7". */
export function featureBadge(entry: FeatureEntry): string {
  const name = FEATURE_SOURCE_NAMES[entry.source]
  return entry.source === 'class' ? `${name} · Lv${entry.level}` : name
}

/**
 * Whether a row is a class feature the character hasn't reached yet. Those are
 * kept so a build can be planned ahead, and shown muted rather than hidden.
 */
export function isUnearned(entry: FeatureEntry, c: Character): boolean {
  return entry.source === 'class' && (entry.level ?? 1) > c.level
}

/**
 * Free-text search over the merged list: matches name, rules text, and the
 * source label so "racial" or "feat" narrows the list the same way the filter
 * chips do.
 */
export function filterFeatures(
  entries: Array<FeatureEntry>,
  query: string,
): Array<FeatureEntry> {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.text?.toLowerCase().includes(q) ||
      featureBadge(e).toLowerCase().includes(q),
  )
}

/**
 * Apply an edit to whichever array the row came from, returning a patch to
 * spread over the character. Routing lives here rather than in the component so
 * the "index is per-source" invariant is unit-testable.
 */
export function updateFeatureEntry(
  c: Character,
  entry: FeatureEntry,
  patch: { name?: string; text?: string; level?: number },
): Partial<Character> {
  const { name, text, level } = patch
  const applyNamed = (list: Array<NamedEntry>) =>
    list.map((e, i) =>
      i === entry.index
        ? {
            ...e,
            ...(name !== undefined ? { name } : {}),
            ...(text !== undefined ? { text: text || undefined } : {}),
          }
        : e,
    )
  switch (entry.source) {
    case 'trait':
      return { traits: applyNamed(c.traits) }
    case 'feat':
      return { feats: applyNamed(c.feats) }
    default:
      return {
        features: c.features.map((f, i) =>
          i === entry.index
            ? {
                ...f,
                ...(name !== undefined ? { name } : {}),
                ...(text !== undefined ? { text: text || undefined } : {}),
                ...(level !== undefined
                  ? { level: Math.max(1, Math.min(20, level)) }
                  : {}),
              }
            : f,
        ),
      }
  }
}

/** Remove a row from whichever array it came from. */
export function removeFeatureEntry(
  c: Character,
  entry: FeatureEntry,
): Partial<Character> {
  const without = <T>(list: Array<T>) =>
    list.filter((_, i) => i !== entry.index)
  switch (entry.source) {
    case 'trait':
      return { traits: without(c.traits) }
    case 'feat':
      return { feats: without(c.feats) }
    default:
      return { features: without(c.features) }
  }
}

/** Append a new entry to the array for `source`. */
export function addFeatureEntry(
  c: Character,
  source: FeatureSource,
  name: string,
  text: string,
  level: number,
): Partial<Character> {
  const named: NamedEntry = text ? { name, text } : { name }
  switch (source) {
    case 'trait':
      return { traits: [...c.traits, named] }
    case 'feat':
      return { feats: [...c.feats, named] }
    default:
      return {
        features: [
          ...c.features,
          text ? { level, name, text } : { level, name },
        ],
      }
  }
}

/** Features sorted for display: by level, then by name within a level. */
export function sortedFeatures(
  features: Array<ClassFeature>,
): Array<ClassFeature> {
  return [...features].sort(
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
/**
 * Free-text list field: trims and drops blanks. Unlike `skills`, these lists
 * have no known vocabulary to filter against, so a blank hand-typed entry would
 * otherwise reach the UI and the printed sheet as an empty row.
 */
const textList = (v: unknown): Array<string> =>
  strList(v)
    .map((s) => s.trim())
    .filter(Boolean)

function parseAbility(v: unknown): Ability | null {
  return typeof v === 'string' && (ABILITIES as readonly string[]).includes(v)
    ? (v as Ability)
    : null
}

/**
 * Racial traits and feats share a shape: a name plus optional rules text. A
 * bare string is accepted as a name-only entry, which is how people tend to
 * jot them down by hand in Obsidian.
 */
function parseNamedEntries(list: Array<unknown>): Array<NamedEntry> {
  return list.flatMap((raw): Array<NamedEntry> => {
    if (typeof raw === 'string') {
      return raw.trim() ? [{ name: raw.trim() }] : []
    }
    if (typeof raw !== 'object' || raw === null) return []
    const e = raw as Record<string, unknown>
    if (typeof e.name !== 'string' || !e.name.trim()) return []
    const entry: NamedEntry = { name: e.name.trim() }
    if (typeof e.text === 'string' && e.text.trim()) entry.text = e.text.trim()
    return [entry]
  })
}

// --- Inventory rows ---------------------------------------------------------

/** Legacy quantity suffix: "Rations x5", "Torch X10". */
const QTY_SUFFIX = /\s+x(\d+)\s*$/i

function parseEquipSlot(v: unknown): EquipSlot | null {
  return typeof v === 'string' && (EQUIP_SLOTS as readonly string[]).includes(v)
    ? (v as EquipSlot)
    : null
}

/** Best-effort text for a row that is neither a string nor a usable mapping. */
function unknownRowText(entry: unknown): string {
  if (entry === null || entry === undefined) return ''
  if (typeof entry === 'object') {
    try {
      return stringifyYaml(entry)
        .trim()
        .replace(/\s*\n\s*/g, ' ')
    } catch {
      return ''
    }
  }
  return String(entry)
}

/**
 * One inventory row, from either shape:
 *   - Longsword                                   (legacy bare string)
 *   - Rations x5                                  (legacy, quantity in text)
 *   - { text: Plate Armor, weight: 65, slot: armor }
 *   - { name: Shield, weight: 6 }                 (hand-written `name:` alias)
 * Never returns null — an unrecognised value is stringified rather than
 * dropped, because dropping it means the next autosave deletes it from disk.
 */
function parseInventoryItem(entry: unknown): InventoryItem {
  if (typeof entry === 'string') {
    const m = entry.match(QTY_SUFFIX)
    // The suffix is read into qty but left in the text: stripping and
    // re-rendering it would mangle near-misses like "Arrows (silvered) x20".
    const item: InventoryItem = {
      text: entry,
      qty: m ? Math.max(1, Number(m[1])) : 1,
      weight: 0,
      slot: null,
    }
    // Carry over the old "(attuned)" convention; the text keeps saying it.
    if (ATTUNED_TEXT.test(entry)) item.attuned = true
    return item
  }
  if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
    const it = entry as Record<string, unknown>
    const raw = typeof it.text === 'string' ? it.text : it.name
    const text = typeof raw === 'string' ? raw : ''
    if (text.trim()) {
      const suffix = text.match(QTY_SUFFIX)
      const item: InventoryItem = {
        text,
        qty: Math.max(
          1,
          Math.floor(num(it.qty, suffix ? Number(suffix[1]) : 1)),
        ),
        weight: Math.max(0, num(it.weight, 0)),
        slot: parseEquipSlot(it.slot),
      }
      // Present-but-unusable (`fits: none`, `fits: junk`) is a deliberate
      // null — "not wearable". Absent stays undefined so the guess applies.
      if ('fits' in it) item.fits = parseEquipSlot(it.fits)
      // An explicit `attuned: false` beats the legacy text, so un-attuning an
      // item whose name still reads "(attuned)" actually sticks.
      if ('attuned' in it) {
        if (it.attuned === true) item.attuned = true
      } else if (ATTUNED_TEXT.test(text)) {
        item.attuned = true
      }
      return item
    }
  }
  return { text: unknownRowText(entry), qty: 1, weight: 0, slot: null }
}

/**
 * Parse the whole list, enforcing one item per slot: a hand-edited file with
 * two `slot: mainHand` rows keeps the first and un-equips the rest — the row
 * itself always survives, only its slot is cleared.
 */
export function parseInventory(v: unknown): Array<InventoryItem> {
  if (!Array.isArray(v)) return []
  const taken = new Set<EquipSlot>()
  const items: Array<InventoryItem> = []
  for (const entry of v) {
    const item = parseInventoryItem(entry)
    // A row that reduced to nothing at all was an empty YAML entry.
    if (!item.text.trim()) continue
    if (item.slot) {
      if (taken.has(item.slot)) item.slot = null
      else taken.add(item.slot)
    }
    items.push(item)
  }
  return items
}

/**
 * Collapse a row with nothing set back to a bare YAML string, so a character
 * nobody has weighed round-trips byte-identically and the file still reads as
 * a plain list in Obsidian. Only rows carrying real data become mappings, and
 * each omits keys left at their default.
 */
function serializeInventoryItem(
  item: InventoryItem,
): string | Record<string, unknown> {
  const suffixQty = item.text.match(QTY_SUFFIX)
  const qtyIsImplied = suffixQty
    ? Number(suffixQty[1]) === item.qty
    : item.qty === 1
  // `fits` is noise whenever it merely restates what the name already implies.
  const fitsIsImplied =
    item.fits === undefined || item.fits === guessSlot(item.text)
  // Likewise `attuned`, when the row's own "(attuned)" text already says so.
  const textSaysAttuned = ATTUNED_TEXT.test(item.text)
  const attunedIsImplied = Boolean(item.attuned) === textSaysAttuned
  if (
    qtyIsImplied &&
    fitsIsImplied &&
    attunedIsImplied &&
    item.weight === 0 &&
    item.slot === null
  ) {
    return item.text
  }
  const out: Record<string, unknown> = { text: item.text }
  if (!qtyIsImplied) out.qty = item.qty
  if (item.weight !== 0) out.weight = item.weight
  if (item.slot !== null) out.slot = item.slot
  // YAML `null` reads as "explicitly not wearable" on the way back in.
  if (!fitsIsImplied) out.fits = item.fits
  // `false` is meaningful here: it overrides a legacy "(attuned)" in the text.
  if (!attunedIsImplied) out.attuned = Boolean(item.attuned)
  return out
}

export function serializeInventory(
  items: Array<InventoryItem>,
): Array<string | Record<string, unknown>> {
  return items.map(serializeInventoryItem)
}

/**
 * Drop the preparation flags unless actually true, so sheets that don't prepare
 * spells stay byte-identical instead of growing a `prepared: false` on every
 * row. Cantrips never carry either key — preparation is meaningless there — and
 * only one of the two is ever written, matching `preparationState`.
 */
function serializeSpell(spell: Spell): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: spell.name,
    level: spell.level,
  }
  if (spell.damage !== undefined) out.damage = spell.damage
  if (spell.damagePerLevel !== undefined) {
    out.damagePerLevel = spell.damagePerLevel
  }
  if (spell.level > 0) {
    if (spell.alwaysPrepared) out.alwaysPrepared = true
    else if (spell.prepared) out.prepared = true
  }
  return out
}

/**
 * Drop the optional note keys unless set, so notes written before titles and
 * tags existed round-trip byte-identically instead of growing a `title: null`
 * on every entry.
 */
function serializeNote(note: CharacterNote): Record<string, unknown> {
  const out: Record<string, unknown> = { at: note.at }
  if (note.title?.trim()) out.title = note.title.trim()
  if (note.tags && note.tags.length > 0) out.tags = note.tags
  out.text = note.text
  return out
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
  c.subclass = str(r.subclass, c.subclass)
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

  // Deliberately unfiltered, unlike skills above: an unrecognised entry is
  // homebrew or an individually granted weapon, not a mistake to discard.
  c.armor = textList(r.armor)
  c.weapons = textList(r.weapons)
  c.tools = textList(r.tools)
  c.languages = textList(r.languages)
  c.resistances = textList(r.resistances)
  c.immunities = textList(r.immunities)
  c.vulnerabilities = textList(r.vulnerabilities)
  c.conditionImmunities = textList(r.conditionImmunities)

  c.ac = Math.max(0, num(r.ac, c.ac))
  c.initiativeBonus = num(r.initiativeBonus, c.initiativeBonus)
  c.speed = Math.max(0, num(r.speed, c.speed))

  if (typeof r.hp === 'object' && r.hp !== null) {
    const hp = r.hp as Record<string, unknown>
    c.hp.max = Math.max(1, num(hp.max, c.hp.max))
    c.hp.current = Math.max(0, num(hp.current, c.hp.max))
    c.hp.temp = Math.max(0, num(hp.temp, 0))
  }
  // Default the total to the level *outside* the guard below: a sheet with no
  // hitDice key at all still gets one die per level, which the old code missed
  // (it left a level 7 fighter printing "1/1"). serializeCharacter omits `total`
  // whenever it equals the level, so an unpinned sheet keeps following it.
  c.hitDice.total = c.level
  if (typeof r.hitDice === 'object' && r.hitDice !== null) {
    const hd = r.hitDice as Record<string, unknown>
    c.hitDice.size = clampHitDie(num(hd.size, c.hitDice.size))
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

  if (Array.isArray(r.traits)) c.traits = parseNamedEntries(r.traits)
  if (Array.isArray(r.feats)) c.feats = parseNamedEntries(r.feats)

  if (Array.isArray(r.features)) {
    c.features = r.features.flatMap((entry): Array<ClassFeature> => {
      // A bare string is a feature with no level yet — keep it at level 1
      // rather than dropping something the user hand-wrote in Obsidian.
      if (typeof entry === 'string') {
        return entry.trim() ? [{ level: 1, name: entry.trim() }] : []
      }
      if (typeof entry !== 'object' || entry === null) return []
      const f = entry as Record<string, unknown>
      if (typeof f.name !== 'string' || !f.name.trim()) return []
      const feature: ClassFeature = {
        level: Math.max(1, Math.min(20, Math.floor(num(f.level, 1)))),
        name: f.name.trim(),
      }
      if (typeof f.text === 'string' && f.text.trim()) {
        feature.text = f.text.trim()
      }
      return [feature]
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
      // Strict: only a real `true` prepares a spell, so junk reads as not
      // prepared rather than silently arming half the list.
      if (s.alwaysPrepared === true) spell.alwaysPrepared = true
      // `alwaysPrepared` wins, so the two flags can't come back disagreeing
      // even if a hand-edited file sets both.
      else if (s.prepared === true) spell.prepared = true
      return [spell]
    })
  }

  if (typeof r.currency === 'object' && r.currency !== null) {
    const cur = r.currency as Record<string, unknown>
    for (const coin of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
      c.currency[coin] = Math.max(0, num(cur[coin], 0))
    }
  }

  c.inventory = parseInventory(r.inventory)
  if (typeof r.encumbrance === 'object' && r.encumbrance !== null) {
    const e = r.encumbrance as Record<string, unknown>
    // Strict opt-in: junk means off. Coins opt *out*: absent means the 5e default.
    c.encumbrance = {
      enabled: e.enabled === true,
      countCoins: e.countCoins !== false,
    }
  }
  c.attunementSlots = Math.max(
    0,
    Math.floor(num(r.attunementSlots, c.attunementSlots)),
  )
  c.preparedLimit = Math.max(
    0,
    Math.floor(num(r.preparedLimit, c.preparedLimit)),
  )
  if (Array.isArray(r.notes)) {
    c.notes = r.notes.flatMap((entry): Array<CharacterNote> => {
      // A bare string is a note somebody typed straight into the YAML list;
      // keep it as an undated body rather than dropping their writing.
      if (typeof entry === 'string') {
        return entry.trim() ? [{ at: '', text: entry }] : []
      }
      if (typeof entry !== 'object' || entry === null) return []
      const n = entry as Record<string, unknown>
      if (typeof n.text !== 'string') return []
      const note: CharacterNote = { at: str(n.at, ''), text: n.text }
      if (typeof n.title === 'string' && n.title.trim()) {
        note.title = n.title.trim()
      }
      // Accept a hand-written "session, lore" string as well as a YAML list —
      // both are natural to type, and normalizeTags settles the casing.
      const rawTags = Array.isArray(n.tags)
        ? strList(n.tags)
        : typeof n.tags === 'string'
          ? n.tags.split(',')
          : []
      const tags = normalizeTags(rawTags)
      if (tags.length > 0) note.tags = tags
      return [note]
    })
  }

  return { character: c, body }
}

/** Serialize sheet data + prose back into article content. */
export function serializeCharacter(character: Character, body: string): string {
  const data: Record<string, unknown> = {
    type: 'character',
    class: character.class,
    subclass: character.subclass,
    level: character.level,
    race: character.race,
    background: character.background,
    alignment: character.alignment,
    xp: character.xp,
    abilities: character.abilities,
    saves: character.saves,
    skills: character.skills,
    expertise: character.expertise,
    armor: character.armor,
    weapons: character.weapons,
    tools: character.tools,
    languages: character.languages,
    resistances: character.resistances,
    immunities: character.immunities,
    vulnerabilities: character.vulnerabilities,
    conditionImmunities: character.conditionImmunities,
    ac: character.ac,
    initiativeBonus: character.initiativeBonus,
    speed: character.speed,
    hp: character.hp,
    hitDice: {
      size: character.hitDice.size,
      // Omitted while it matches the level, so the sheet keeps auto-tracking as
      // the character grows. A written total is therefore always a pin.
      ...(hitDiceArePinned(character)
        ? { total: character.hitDice.total }
        : {}),
      used: character.hitDice.used,
    },
    deathSaves: character.deathSaves,
    attacks: character.attacks,
    traits: character.traits,
    feats: character.feats,
    features: character.features,
    spellAbility: character.spellAbility,
    spellSlots: character.spellSlots,
    spells: character.spells.map(serializeSpell),
    preparedLimit: character.preparedLimit,
    currency: character.currency,
    inventory: serializeInventory(character.inventory),
    encumbrance: character.encumbrance,
    attunementSlots: character.attunementSlots,
    notes: character.notes.map(serializeNote),
  }
  const yaml = stringifyYaml(data).trimEnd()
  return joinFrontmatter(yaml, body)
}
