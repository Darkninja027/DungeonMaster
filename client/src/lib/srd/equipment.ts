/**
 * Equipment tables — SRD 5.1 (CC BY 4.0). See ./index.ts for attribution.
 *
 * Scope is deliberately narrow: these cover what a level 1 starting kit can
 * actually hand out, not the whole equipment chapter. `ARMOR_AC` exists so the
 * wizard can show a correct starting AC, and `WEAPON_STATS` so it can write a
 * couple of attack rows. Anything unmatched falls through to "no guess", which
 * is always better than a wrong one — the player fills it in on the sheet.
 *
 * Keys are lowercase because lookups lowercase the inventory row first.
 */

import type { GrantItem } from './types'

/**
 * Armor by name: base AC and how much DEX it lets you add. `dexCap: null` means
 * uncapped (light armor), `0` means none at all (heavy).
 */
export const ARMOR_AC: Record<string, { base: number; dexCap: number | null }> =
  {
    // Light
    'padded armor': { base: 11, dexCap: null },
    'leather armor': { base: 11, dexCap: null },
    'studded leather armor': { base: 12, dexCap: null },
    // Medium
    'hide armor': { base: 12, dexCap: 2 },
    'chain shirt': { base: 13, dexCap: 2 },
    'scale mail': { base: 14, dexCap: 2 },
    breastplate: { base: 14, dexCap: 2 },
    'half plate armor': { base: 15, dexCap: 2 },
    // Heavy
    'ring mail': { base: 14, dexCap: 0 },
    'chain mail': { base: 16, dexCap: 0 },
    splint: { base: 17, dexCap: 0 },
    'plate armor': { base: 18, dexCap: 0 },
  }

/** A shield is a flat +2 on top of whatever armor is worn. */
export const SHIELD_AC_BONUS = 2

/**
 * Weapons a starting kit can grant. `finesse` and `ranged` decide whether the
 * attack uses DEX instead of STR; everything else about the weapon lives on the
 * sheet as free text.
 */
export const WEAPON_STATS: Record<
  string,
  { damage: string; finesse?: boolean; ranged?: boolean }
> = {
  // Simple melee
  club: { damage: '1d4' },
  dagger: { damage: '1d4', finesse: true },
  greatclub: { damage: '1d8' },
  handaxe: { damage: '1d6' },
  javelin: { damage: '1d6' },
  'light hammer': { damage: '1d4' },
  mace: { damage: '1d6' },
  quarterstaff: { damage: '1d6' },
  sickle: { damage: '1d4' },
  spear: { damage: '1d6' },
  // Simple ranged
  'light crossbow': { damage: '1d8', ranged: true },
  dart: { damage: '1d4', finesse: true, ranged: true },
  shortbow: { damage: '1d6', ranged: true },
  sling: { damage: '1d4', ranged: true },
  // Martial melee
  battleaxe: { damage: '1d8' },
  flail: { damage: '1d8' },
  glaive: { damage: '1d10' },
  greataxe: { damage: '1d12' },
  greatsword: { damage: '2d6' },
  halberd: { damage: '1d10' },
  lance: { damage: '1d12' },
  longsword: { damage: '1d8' },
  maul: { damage: '2d6' },
  morningstar: { damage: '1d8' },
  pike: { damage: '1d10' },
  rapier: { damage: '1d8', finesse: true },
  scimitar: { damage: '1d6', finesse: true },
  shortsword: { damage: '1d6', finesse: true },
  trident: { damage: '1d6' },
  'war pick': { damage: '1d8' },
  warhammer: { damage: '1d8' },
  whip: { damage: '1d4', finesse: true },
  // Martial ranged
  'hand crossbow': { damage: '1d6', ranged: true },
  'heavy crossbow': { damage: '1d10', ranged: true },
  longbow: { damage: '1d8', ranged: true },
}

/**
 * Which category each weapon belongs to.
 *
 * The groupings were only comments in `WEAPON_STATS` above, which meant nothing
 * could ask "is a battleaxe covered by martial?" — so a paladin who picked one
 * from their starting gear got "Battleaxe" listed as a proficiency next to the
 * "martial" they already had. Keys match `WEAPON_STATS` exactly; a weapon
 * absent from both is homebrew and is named individually.
 */
export const WEAPON_CATEGORY_OF: Record<string, 'simple' | 'martial'> = {
  // Simple melee
  club: 'simple',
  dagger: 'simple',
  greatclub: 'simple',
  handaxe: 'simple',
  javelin: 'simple',
  'light hammer': 'simple',
  mace: 'simple',
  quarterstaff: 'simple',
  sickle: 'simple',
  spear: 'simple',
  // Simple ranged
  'light crossbow': 'simple',
  dart: 'simple',
  shortbow: 'simple',
  sling: 'simple',
  // Martial melee
  battleaxe: 'martial',
  flail: 'martial',
  glaive: 'martial',
  greataxe: 'martial',
  greatsword: 'martial',
  halberd: 'martial',
  lance: 'martial',
  longsword: 'martial',
  maul: 'martial',
  morningstar: 'martial',
  pike: 'martial',
  rapier: 'martial',
  scimitar: 'martial',
  shortsword: 'martial',
  trident: 'martial',
  'war pick': 'martial',
  warhammer: 'martial',
  whip: 'martial',
  // Martial ranged
  'hand crossbow': 'martial',
  'heavy crossbow': 'martial',
  longbow: 'martial',
}

/** Item weights in pounds, for the rows the kits grant. */
export const ITEM_WEIGHTS: Record<string, number> = {
  'chain mail': 55,
  'scale mail': 45,
  'leather armor': 10,
  'studded leather armor': 13,
  'hide armor': 12,
  'chain shirt': 20,
  breastplate: 20,
  'half plate armor': 40,
  'ring mail': 40,
  'plate armor': 65,
  splint: 60,
  shield: 6,
  longsword: 3,
  shortsword: 2,
  greatsword: 6,
  greataxe: 7,
  battleaxe: 4,
  handaxe: 2,
  warhammer: 2,
  mace: 4,
  quarterstaff: 4,
  dagger: 1,
  rapier: 2,
  scimitar: 3,
  spear: 3,
  javelin: 2,
  club: 2,
  sickle: 2,
  longbow: 2,
  shortbow: 2,
  'light crossbow': 5,
  'heavy crossbow': 18,
  'hand crossbow': 3,
  sling: 0,
  dart: 0.25,
  'holy symbol': 1,
  'component pouch': 2,
  spellbook: 3,
  'explorer’s pack': 59,
  'dungeoneer’s pack': 61,
  'burglar’s pack': 44.5,
  'priest’s pack': 24,
  'scholar’s pack': 10,
  'entertainer’s pack': 38,
  'diplomat’s pack': 39,
}

/**
 * The equipment packs, as single inventory rows. 5e packs are a bundle of a
 * dozen small items; expanding them would bury the real gear in torches and
 * pitons, so they stay one row with the total weight. A player who wants the
 * contents listed can expand it on the sheet.
 */
export const PACKS: Record<string, GrantItem> = {
  explorer: { text: 'Explorer’s pack', weight: 59 },
  dungeoneer: { text: 'Dungeoneer’s pack', weight: 61 },
  burglar: { text: 'Burglar’s pack', weight: 44.5 },
  priest: { text: 'Priest’s pack', weight: 24 },
  scholar: { text: 'Scholar’s pack', weight: 10 },
  entertainer: { text: 'Entertainer’s pack', weight: 38 },
  diplomat: { text: 'Diplomat’s pack', weight: 39 },
}

/** The standard languages, offered as suggestions for "a language of your choice". */
export const STANDARD_LANGUAGES = [
  'Common',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc',
] as const

/** The exotic languages, which some backgrounds and races can reach. */
export const EXOTIC_LANGUAGES = [
  'Abyssal',
  'Celestial',
  'Draconic',
  'Deep Speech',
  'Infernal',
  'Primordial',
  'Sylvan',
  'Undercommon',
] as const

/** Every language, for the "any language" pick lists. */
export const ALL_LANGUAGES = [
  ...STANDARD_LANGUAGES,
  ...EXOTIC_LANGUAGES,
] as const

/** Artisan's tools, for backgrounds and the dwarf's tool proficiency. */
export const ARTISAN_TOOLS = [
  'Alchemist’s supplies',
  'Brewer’s supplies',
  'Calligrapher’s supplies',
  'Carpenter’s tools',
  'Cartographer’s tools',
  'Cobbler’s tools',
  'Cook’s utensils',
  'Glassblower’s tools',
  'Jeweler’s tools',
  'Leatherworker’s tools',
  'Mason’s tools',
  'Painter’s supplies',
  'Potter’s tools',
  'Smith’s tools',
  'Tinker’s tools',
  'Weaver’s tools',
  'Woodcarver’s tools',
] as const

/** Gaming sets, offered by several backgrounds. */
export const GAMING_SETS = [
  'Dice set',
  'Dragonchess set',
  'Playing card set',
  'Three-Dragon Ante set',
] as const

/** Musical instruments — the bard's and entertainer's choices. */
export const MUSICAL_INSTRUMENTS = [
  'Bagpipes',
  'Drum',
  'Dulcimer',
  'Flute',
  'Lute',
  'Lyre',
  'Horn',
  'Pan flute',
  'Shawm',
  'Viol',
] as const

/**
 * Starting AC from worn armor. Returns null when nothing in the list is a
 * recognised armor, which the caller reads as "unarmored".
 *
 * Matched on a cleaned, lowercased row so "[[Chain Mail]]" still resolves. The
 * longest key wins, so "studded leather armor" beats "leather armor".
 */
export function armorEntry(
  text: string,
): { base: number; dexCap: number | null } | null {
  const clean = text.toLowerCase()
  let best: {
    key: string
    entry: { base: number; dexCap: number | null }
  } | null = null
  for (const [key, entry] of Object.entries(ARMOR_AC)) {
    if (!clean.includes(key)) continue
    if (!best || key.length > best.key.length) best = { key, entry }
  }
  return best?.entry ?? null
}

/** Whether an inventory row is a shield. */
export function isShield(text: string): boolean {
  return /\bshield\b/i.test(text)
}

/**
 * Which category a weapon belongs to, or null when the table doesn't know it.
 *
 * Same matching rules as `weaponEntry` — word boundaries, longest key wins —
 * because it is asked about the same free-text rows.
 */
export function weaponCategory(text: string): 'simple' | 'martial' | null {
  const clean = text.toLowerCase()
  let best: { key: string; category: 'simple' | 'martial' } | null = null
  for (const [key, category] of Object.entries(WEAPON_CATEGORY_OF)) {
    if (!new RegExp(`\\b${key}\\b`).test(clean)) continue
    if (!best || key.length > best.key.length) best = { key, category }
  }
  return best ? best.category : null
}

/**
 * Weapon stats for an inventory row, or null. Longest key wins so "hand
 * crossbow" beats a hypothetical "crossbow", and "war pick" isn't shadowed.
 */
export function weaponEntry(text: string): {
  name: string
  damage: string
  finesse?: boolean
  ranged?: boolean
} | null {
  const clean = text.toLowerCase()
  let best: { key: string; stats: (typeof WEAPON_STATS)[string] } | null = null
  for (const [key, stats] of Object.entries(WEAPON_STATS)) {
    if (!new RegExp(`\\b${key}\\b`).test(clean)) continue
    if (!best || key.length > best.key.length) best = { key, stats }
  }
  return best ? { name: best.key, ...best.stats } : null
}
