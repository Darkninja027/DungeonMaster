/**
 * SRD 5.1 reference tables for the character creation wizard.
 *
 * ---------------------------------------------------------------------------
 * ATTRIBUTION
 *
 * This folder contains material from the System Reference Document 5.1 ("SRD
 * 5.1") by Wizards of the Coast LLC, available at
 * https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
 * licensed under the Creative Commons Attribution 4.0 International License,
 * available at https://creativecommons.org/licenses/by/4.0/legalcode.
 *
 * Only SRD 5.1 content appears here. Player's Handbook races, subraces,
 * backgrounds and subclasses that the SRD does not include are deliberately
 * absent — they are not ours to ship. A player who wants one types the name and
 * the sheet keeps it, which is the whole point of the free-text rule below.
 * ---------------------------------------------------------------------------
 *
 * These tables are an editor affordance, never a schema. Every lookup is
 * `name in, undefined out`, mirroring `findClass` in lib/classes.ts: an
 * unrecognised race, background or class contributes its name and nothing else,
 * and the resulting character is still perfectly valid. See ./types.ts.
 */

import { SRD_BACKGROUNDS } from './backgrounds'
import { SRD_CLASS_KITS } from './classKits'
import { SRD_RACES } from './races'
import type { BackgroundInfo, ClassKit, RaceInfo, SubraceInfo } from './types'

export * from './types'
export { SRD_RACES } from './races'
export { SRD_BACKGROUNDS } from './backgrounds'
export { SRD_CLASS_KITS } from './classKits'
export { SRD_FEATS } from './feats'
export { describeFlexibleAsi, describeMode } from './flexibleAsi'
export {
  ALL_LANGUAGES,
  ARMOR_AC,
  ARTISAN_TOOLS,
  EXOTIC_LANGUAGES,
  GAMING_SETS,
  ITEM_WEIGHTS,
  MUSICAL_INSTRUMENTS,
  PACKS,
  SHIELD_AC_BONUS,
  STANDARD_LANGUAGES,
  TOOL_SUGGESTIONS,
  WEAPON_STATS,
  armorEntry,
  isShield,
  weaponCategory,
  weaponEntry,
} from './equipment'

/**
 * The features a class has at a given level — everything granted at or below
 * it, in level order.
 *
 * `ClassKit.features` holds the whole 1-20 progression, so anything showing
 * "what you have now" has to filter. Forgetting to filter is what shipped a
 * level 1 paladin with Extra Attack and Aura of Protection on their sheet —
 * which is why both the wizard and commit go through this one helper rather
 * than each filtering for themselves.
 */
export function featuresUpToLevel<T extends { level: number; name: string }>(
  features: Array<T>,
  level: number,
): Array<T> {
  return features
    .filter((f) => f.level <= level)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
}

/** Case- and whitespace-insensitive name match, as `findClass` does it. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** The SRD race with this name, or undefined for homebrew. */
export function findRace(name: string): RaceInfo | undefined {
  if (!name.trim()) return undefined
  return SRD_RACES.find((r) => sameName(r.name, name))
}

/**
 * The subrace with this name, searched across every race, plus its parent.
 * Searched globally because `Character.race` stores only the full subrace name
 * ("Hill Dwarf") — the parent is recovered from here, not from the sheet.
 */
export function findSubrace(
  name: string,
): { race: RaceInfo; subrace: SubraceInfo } | undefined {
  if (!name.trim()) return undefined
  for (const race of SRD_RACES) {
    const subrace = race.subraces?.find((s) => sameName(s.name, name))
    if (subrace) return { race, subrace }
  }
  return undefined
}

/** The SRD background with this name, or undefined. */
export function findBackground(name: string): BackgroundInfo | undefined {
  if (!name.trim()) return undefined
  return SRD_BACKGROUNDS.find((b) => sameName(b.name, name))
}

/**
 * The starting kit for a class name, or undefined for homebrew. The world's
 * class list — not this — decides which classes exist; see ./classKits.ts.
 */
export function findClassKit(name: string): ClassKit | undefined {
  if (!name.trim()) return undefined
  return SRD_CLASS_KITS.find((k) => sameName(k.name, name))
}

/** Subraces for a race name, empty when it has none or isn't known. */
export function subracesFor(raceName: string): Array<SubraceInfo> {
  return findRace(raceName)?.subraces ?? []
}
