/**
 * Shapes for the SRD 5.1 reference tables in this folder.
 *
 * These tables are an **editor affordance, not a schema**. Everything they feed
 * ends up on the sheet as plain strings, exactly as if a user had typed it: the
 * wizard writes `race: Hill Dwarf`, never `race: hill-dwarf`. An id here is for
 * React keys and lookups only and must never reach disk — see the note on
 * ARMOR_PROFICIENCIES in lib/character.ts and the header of lib/classes.ts.
 *
 * The corollary is that every lookup is `name in, undefined out`, mirroring
 * `findClass`: a race, background or class the tables don't know contributes its
 * name and nothing else, and the character is still perfectly valid. Homebrew
 * must survive a round trip untouched.
 *
 * Deliberately not a rules engine. There are no per-level tables here: the
 * wizard builds a level 1 character and the sheet takes it from there. The one
 * derived-number exception is `SubraceInfo.hpPerLevel`, which exists for exactly
 * one subrace — see its doc comment before adding a second.
 */

import type { Ability, EquipSlot } from '../character'

/**
 * A bundle of things granted by a race, background, class kit or equipment
 * choice. Every field is optional and every list is merged into the character
 * additively, then de-duplicated case-insensitively — a race and a background
 * both granting Common yields one Common.
 *
 * Ability scores are deliberately absent: racial increases live on
 * `RaceInfo.asi` because they are applied at commit on top of the rolled base,
 * not merged like a list.
 */
export interface Grant {
  /** Skill ids from `SKILLS`. Validated by srd.test.ts. */
  skills?: Array<string>
  /** Saving throws by `Ability`. In practice only class kits grant these. */
  saves?: Array<Ability>
  /** Armor proficiency ids from `ARMOR_PROFICIENCIES`, or free text. */
  armor?: Array<string>
  /** Weapon category ids from `WEAPON_CATEGORIES`, or individual weapon names. */
  weapons?: Array<string>
  /** Tool names, free text — 5e has no closed tool list worth encoding. */
  tools?: Array<string>
  /** Language names, free text. */
  languages?: Array<string>
  /** Damage type ids from `DAMAGE_TYPES`. */
  resistances?: Array<string>
  /** Condition ids from `CONDITIONS`. */
  conditionImmunities?: Array<string>
  /** Named entries that land in `Character.traits`. */
  traits?: Array<GrantTrait>
  /** Inventory rows. */
  items?: Array<GrantItem>
  /** Starting coin, added to `Character.currency`. */
  currency?: Partial<Record<'cp' | 'sp' | 'ep' | 'gp' | 'pp', number>>
  /**
   * Choices the player must resolve before this grant is complete. Ids share
   * one keyspace across every table, so they are prefixed by owner and asserted
   * globally unique in srd.test.ts — a collision would silently cross-wire two
   * unrelated choices.
   */
  picks?: Array<PickList>
}

export interface GrantTrait {
  name: string
  /** Rules text. `[[wiki links]]` and dice notation stay live on the sheet. */
  text?: string
}

/**
 * One inventory row. `weight` is per unit, matching `InventoryItem.weight`.
 * `fits` is passed through only when set, so an unset value falls back to
 * `guessSlot` on the name rather than pinning the row to nothing.
 */
export interface GrantItem {
  /** The row text as it should appear on the sheet. */
  text: string
  qty?: number
  /** Pounds per unit. Omitted means unweighed, which serializes as a bare row. */
  weight?: number
  fits?: EquipSlot | null
}

/**
 * What kind of thing a `PickList` is choosing, so the UI can render the right
 * control and `buildCharacter` knows which character list to merge it into.
 */
export type PickKind =
  | 'skill'
  | 'tool'
  | 'language'
  | 'weapon'
  | 'armor'
  | 'spell'
  | 'cantrip'
  /** Anything else — rendered as free text with the options as suggestions. */
  | 'other'

/**
 * "Choose two skills from this list", "choose one artisan's tool", "choose any
 * one language". `open` means the options are suggestions rather than a closed
 * set, which is what keeps a homebrew or DM-invented answer typeable.
 */
export interface PickList {
  /** Globally unique across every SRD table. Prefix with the owner's id. */
  id: string
  kind: PickKind
  /** Shown as the group heading, e.g. "Choose two skills". */
  label: string
  /** How many must be chosen. */
  count: number
  /**
   * The offered values. For `kind: 'skill'` these are `SKILLS` ids; otherwise
   * free-text names shown as chips. Empty with `open: true` means "type
   * anything", which is how "any one language of your choice" is modelled.
   */
  options: Array<string>
  /**
   * Whether a value outside `options` is allowed. When false the UI offers only
   * the listed chips; when true it also offers a free-text input with the
   * options as a datalist.
   */
  open?: boolean
}

/** Racial ability score increases, e.g. `{ con: 2 }` for a Dwarf. */
export type AbilityScoreIncrease = Partial<Record<Ability, number>>

export interface RaceInfo {
  /** Lookup/React key only. Never written to disk. */
  id: string
  /** What lands in `Character.race` when there is no subrace. */
  name: string
  /** One line shown on the option card. */
  summary: string
  asi: AbilityScoreIncrease
  /** Walking speed in feet. */
  speed: number
  /** Everything else this race hands out. */
  grant: Grant
  /**
   * Subraces, if any. A race with subraces requires one to be chosen — the
   * wizard gates the step on it.
   */
  subraces?: Array<SubraceInfo>
  /**
   * Variant Human only: two +1s to different abilities, plus a feat. Modelled
   * as a flag rather than a general mechanism because it is the sole SRD case.
   */
  flexibleAsi?: { count: number; amount: number }
  /** Variant Human only: the player also takes a feat at level 1. */
  grantsFeat?: boolean
}

export interface SubraceInfo {
  id: string
  /**
   * What lands in `Character.race` — the full "Hill Dwarf", not "Hill". A sheet
   * should read the way a player would say it out loud.
   */
  name: string
  summary: string
  /** Stacks on top of the parent race's `asi`. */
  asi: AbilityScoreIncrease
  /** Overrides the parent's speed when set (Wood Elf's 35). */
  speed?: number
  grant: Grant
  /**
   * Extra max HP per level. Exists for exactly one SRD subrace — the Hill
   * Dwarf's Dwarven Toughness — and is read once in `buildCharacter`.
   *
   * If you are here to add a second one, add the field to that subrace and move
   * on. If you are here to add a fifth, the answer is still not a rules engine:
   * this app is a notebook, and the sheet is hand-editable for a reason.
   */
  hpPerLevel?: number
}

export interface BackgroundInfo {
  id: string
  /** What lands in `Character.background`. */
  name: string
  summary: string
  /** The background's named feature, e.g. Acolyte's "Shelter of the Faithful". */
  feature: GrantTrait
  grant: Grant
  /**
   * A few suggested personality traits/ideals/bonds/flaws to seed the markdown
   * body. Trimmed to a handful rather than the full d8 tables — the wizard only
   * needs enough to prompt, and the player types over it anyway.
   */
  suggestions?: {
    traits?: Array<string>
    ideals?: Array<string>
    bonds?: Array<string>
    flaws?: Array<string>
  }
}

/**
 * One "(a) or (b)" equipment decision. Resolved by index into `options`, so a
 * draft stores a number and the option's grant is applied at commit.
 */
export interface EquipmentChoice {
  /** Globally unique, same keyspace rule as `PickList.id`. */
  id: string
  label: string
  options: Array<EquipmentOption>
}

export interface EquipmentOption {
  /** Shown on the card, e.g. "chain mail" or "a martial weapon and a shield". */
  label: string
  grant: Grant
}

export interface SpellcastingInfo {
  ability: Ability
  /** Level 1 slots. Cantrips are level 0 and cost nothing. */
  slotsAtLevel1: number
  cantripsKnown: number
  /**
   * How many level 1 spells to pick. For preparers (cleric, druid, paladin,
   * wizard) this is the size of the starting pick, not a permanent cap.
   */
  spellsKnown: number
  /**
   * Whether this class prepares from a list each day rather than knowing a
   * fixed set. Drives `Character.preparedLimit`, which is `mod + level` for
   * preparers and 0 for everyone else.
   */
  prepares: boolean
  /** Label for the spell list, e.g. "Cleric spells". Shown on the step. */
  listLabel: string
}

/**
 * A class: what it is, and what it starts with.
 *
 * This is the *whole* definition. It used to be split in two — a per-world
 * `ClassInfo` (name, hit die, subclasses) that the character sheet read, and a
 * global kit that only the creation wizard read — which meant a homebrew class
 * travelled with a world folder while its starting gear did not, and you edited
 * one class in two places. They were always joined by name anyway.
 *
 * `hitDie` / `subclassLabel` / `subclasses` are the three fields the sheet
 * needs; everything else is creation-time. A class the tables don't know still
 * works on a sheet — `Character.class` is free text, and always was.
 */
export interface ClassKit {
  id: string
  name: string
  /** Hit die size, e.g. 10 for a d10. Read by the sheet, not just the wizard. */
  hitDie: number
  /**
   * What this class calls its subclass choice — "Sacred Oath" for a paladin,
   * "Otherworldly Patron" for a warlock. Used as the subclass field's
   * placeholder so the prompt matches the class you picked.
   */
  subclassLabel: string
  /** Subclass names, no rules text. Offered as suggestions, never enforced. */
  subclasses: Array<string>
  saves: Array<Ability>
  /** The class's skill list and how many to choose from it. */
  skillChoices: PickList
  grant: Grant
  equipment: Array<EquipmentChoice>
  /** Features gained at level 1. */
  features: Array<{ name: string; text?: string }>
  spellcasting?: SpellcastingInfo
  /**
   * Barbarian and Monk compute AC from ability scores rather than armor.
   * Without this they show a visibly wrong starting AC.
   */
  unarmoredDefense?: 'con' | 'wis'
  /**
   * Whether the subclass is chosen at level 1 (Cleric, Sorcerer, Warlock) or
   * later. Drives whether the Class step shows a subclass picker or a muted
   * "chosen at level 3" note.
   */
  subclassAtLevel1?: boolean
  /**
   * A sensible ability priority for the one-click auto-assign on the standard
   * array and rolled methods. Highest first.
   */
  abilityPriority: Array<Ability>
}
