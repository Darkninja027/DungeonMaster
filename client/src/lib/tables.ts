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
import type { Homebrew } from './homebrew'
import { EMPTY_HOMEBREW } from './homebrew'
import { SRD_BACKGROUNDS, SRD_CLASS_KITS, SRD_RACES } from './srd'
import type { BackgroundInfo, ClassKit, RaceInfo, SubraceInfo } from './srd'

export interface Tables {
  races: Array<RaceInfo>
  backgrounds: Array<BackgroundInfo>
  /**
   * The class list. A `ClassKit` is the whole definition of a class — hit die
   * and subclasses for the sheet, starting gear and features for the wizard —
   * so there is no separate class table any more.
   */
  kits: Array<ClassKit>
}

/** What a world contributes on top of the global store. */
export interface WorldTables {
  races?: Array<RaceInfo>
  backgrounds?: Array<BackgroundInfo>
  kits?: Array<ClassKit>
  /**
   * Legacy per-world class list, from files written before kits absorbed it.
   * Upgraded in place rather than migrated on disk: a world folder is the
   * user's, and rewriting one just because it was opened is not this app's
   * habit. `worldSettings.ts` keeps reading and writing the key, so an old
   * build opening the same folder still finds what it expects.
   */
  classes?: Array<ClassInfo>
}

/** The built-ins alone — the fallback while homebrew is still loading. */
export const SRD_TABLES: Tables = {
  races: SRD_RACES,
  backgrounds: SRD_BACKGROUNDS,
  kits: SRD_CLASS_KITS,
}

/**
 * A legacy `ClassInfo` as a kit: the three fields it has, and empty everything
 * else. A class defined this way still sets its hit die and offers its
 * subclasses on the sheet; it simply has no starting kit, which is exactly what
 * it meant before.
 */
export function kitFromClassInfo(cl: ClassInfo): ClassKit {
  return {
    id: cl.id,
    name: cl.name,
    hitDie: cl.hitDie,
    subclassLabel: cl.subclassLabel,
    subclasses: cl.subclasses,
    saves: [],
    skillChoices: {
      id: `legacy-${cl.id}-skills`,
      kind: 'skill',
      label: 'Choose two skills',
      count: 2,
      options: [],
      open: true,
    },
    grant: {},
    equipment: [],
    features: [],
    abilityPriority: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
  }
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
    kits: layerClasses(global, world),
  }
}

/**
 * The class list, with legacy `classes` entries folded in.
 *
 * The subtlety that matters: **a legacy entry only carries three fields**
 * (name, hit die, subclasses) because that is all `ClassInfo` ever had. Every
 * world is auto-seeded with the twelve PHB classes in that shape, so treating
 * a legacy entry as a full replacement silently stripped the features, saves
 * and equipment off every SRD class in every world — the level-up wizard then
 * had nothing to grant.
 *
 * So a legacy entry *overlays* its three fields onto whatever richer kit is
 * already there, and only becomes a kit in its own right when nothing else
 * defines that name. Precedence is otherwise unchanged: world beats global
 * beats SRD.
 */
function layerClasses(global: Homebrew, world: WorldTables): Array<ClassKit> {
  const kits = layer(SRD_CLASS_KITS, global.kits, world.kits ?? [])
  const byName = new Map(kits.map((kit) => [nameKey(kit.name), kit]))
  const order = kits.map((kit) => nameKey(kit.name))

  for (const legacy of [...(global.classes ?? []), ...(world.classes ?? [])]) {
    const key = nameKey(legacy.name)
    if (key === '') continue
    const existing = byName.get(key)
    if (existing) {
      // Overlay, don't replace: keep the features and equipment the richer
      // definition brought, and take the three fields the legacy list owns.
      byName.set(key, {
        ...existing,
        hitDie: legacy.hitDie,
        subclassLabel: legacy.subclassLabel,
        subclasses: legacy.subclasses,
      })
    } else {
      byName.set(key, kitFromClassInfo(legacy))
      order.push(key)
    }
  }

  return order.flatMap((key) => {
    const kit = byName.get(key)
    return kit ? [kit] : []
  })
}

/**
 * The class list in the shape the character sheet wants. The sheet only needs
 * a hit die and subclass suggestions, and predates kits entirely — this keeps
 * `findClass` and the sheet's two datalists working unchanged.
 */
export function classesFrom(tables: Tables): Array<ClassInfo> {
  return tables.kits.map((kit) => ({
    id: kit.id,
    name: kit.name,
    hitDie: kit.hitDie,
    subclassLabel: kit.subclassLabel,
    subclasses: kit.subclasses,
  }))
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
