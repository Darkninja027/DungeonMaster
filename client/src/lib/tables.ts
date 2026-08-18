/**
 * The tables a character is built against: SRD, plus global homebrew, plus
 * whatever this world adds of its own.
 *
 * One place answers "what races exist right now", because the alternative is
 * every call site merging for itself and disagreeing about precedence.
 *
 * **Precedence is world > global > SRD**, matched case-insensitively on name.
 * A world can deliberately shadow a global entry, and a global entry can shadow
 * an SRD one — that is the point, it is how you fix a built-in you disagree
 * with. Nothing is ever dropped from a character sheet by shadowing: the sheet
 * stores names as free text, so an entry that disappears entirely just stops
 * contributing traits.
 */

import type { ClassInfo } from './classes'
import { PHB_CLASSES } from './classes'
import type { Homebrew } from './homebrew'
import { EMPTY_HOMEBREW } from './homebrew'
import { SRD_BACKGROUNDS, SRD_CLASS_KITS, SRD_RACES } from './srd'
import type { BackgroundInfo, ClassKit, RaceInfo, SubraceInfo } from './srd'

export interface Tables {
  races: Array<RaceInfo>
  backgrounds: Array<BackgroundInfo>
  kits: Array<ClassKit>
  classes: Array<ClassInfo>
}

/** What a world contributes on top of the global store. */
export interface WorldTables {
  classes?: Array<ClassInfo>
  races?: Array<RaceInfo>
  backgrounds?: Array<BackgroundInfo>
  kits?: Array<ClassKit>
}

/** The built-ins alone — the fallback while homebrew is still loading. */
export const SRD_TABLES: Tables = {
  races: SRD_RACES,
  backgrounds: SRD_BACKGROUNDS,
  kits: SRD_CLASS_KITS,
  classes: PHB_CLASSES,
}

function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Later layers replace earlier ones by name, keeping the *earlier* position so
 * the list doesn't reshuffle when someone overrides a built-in — a Dwarf that
 * jumps to the end of the grid the moment you tweak it is disorienting.
 * Genuinely new entries append in the order they were authored.
 */
function layer<T extends { name: string }>(
  ...levels: Array<Array<T>>
): Array<T> {
  const order: Array<string> = []
  const byName = new Map<string, T>()
  for (const level of levels) {
    for (const entry of level) {
      const key = nameKey(entry.name)
      if (key === '') continue
      if (!byName.has(key)) order.push(key)
      byName.set(key, entry)
    }
  }
  return order.flatMap((key) => {
    const entry = byName.get(key)
    return entry ? [entry] : []
  })
}

export function mergeTables(
  global: Homebrew = EMPTY_HOMEBREW,
  world: WorldTables = {},
): Tables {
  return {
    races: layer(SRD_RACES, global.races, world.races ?? []),
    backgrounds: layer(
      SRD_BACKGROUNDS,
      global.backgrounds,
      world.backgrounds ?? [],
    ),
    kits: layer(SRD_CLASS_KITS, global.kits, world.kits ?? []),
    // Classes are the one layer that already existed per-world, so a world with
    // its own list keeps behaving exactly as it did before homebrew arrived.
    classes: layer(PHB_CLASSES, global.classes, world.classes ?? []),
  }
}

// --- lookups ---------------------------------------------------------------
//
// All take the list first, matching `findClass` in classes.ts: it keeps them
// pure and testable without a world, and stops a caller from quietly reading
// the built-ins instead of the merged list.

export function findRace(
  races: Array<RaceInfo>,
  name: string,
): RaceInfo | undefined {
  const key = nameKey(name)
  if (key === '') return undefined
  return races.find((r) => nameKey(r.name) === key)
}

export function findBackground(
  backgrounds: Array<BackgroundInfo>,
  name: string,
): BackgroundInfo | undefined {
  const key = nameKey(name)
  if (key === '') return undefined
  return backgrounds.find((b) => nameKey(b.name) === key)
}

export function findKit(
  kits: Array<ClassKit>,
  name: string,
): ClassKit | undefined {
  const key = nameKey(name)
  if (key === '') return undefined
  return kits.find((k) => nameKey(k.name) === key)
}

/**
 * Subrace lookup, and the one genuinely dangerous case in this file.
 *
 * `Character.race` stores only the full subrace name ("Hill Dwarf"), so the
 * parent race has to be recovered by searching every race's subraces. With
 * homebrew merged in, two different parents can now offer a subrace of the same
 * name — and picking the wrong parent silently yields the wrong speed and the
 * wrong HP rather than any kind of error.
 *
 * So the index is built in one pass over the already-merged race list, and
 * **the last parent wins**, which is the same world > global > SRD precedence
 * the races themselves follow. Build it once per merge and share it, rather
 * than scanning per lookup and hoping array order holds.
 */
export function subraceIndex(
  races: Array<RaceInfo>,
): Map<string, { race: RaceInfo; subrace: SubraceInfo }> {
  const index = new Map<string, { race: RaceInfo; subrace: SubraceInfo }>()
  for (const race of races) {
    for (const subrace of race.subraces ?? []) {
      const key = nameKey(subrace.name)
      if (key === '') continue
      index.set(key, { race, subrace })
    }
  }
  return index
}

export function findSubrace(
  races: Array<RaceInfo>,
  name: string,
): { race: RaceInfo; subrace: SubraceInfo } | undefined {
  const key = nameKey(name)
  if (key === '') return undefined
  return subraceIndex(races).get(key)
}

/** Subraces offered by a race name, empty when it has none or isn't known. */
export function subracesFor(
  races: Array<RaceInfo>,
  raceName: string,
): Array<SubraceInfo> {
  return findRace(races, raceName)?.subraces ?? []
}
