/**
 * The tables a character is built against: SRD, plus global homebrew, plus
 * whatever this world adds of its own.
 *
 * One place answers "what races exist right now", because the alternative is
 * every call site merging for itself and disagreeing about precedence.
 *
 * **Precedence is world > global > published > SRD**, matched case-insensitively
 * on name. "Published" is the built-in tier that is not SRD 5.1 — see
 * `lib/feats/` and `lib/races/`.
 * A world can deliberately shadow a global entry, and a global entry can shadow
 * an SRD one — that is the point, it is how you fix a built-in you disagree
 * with. Nothing is ever dropped from a character sheet by shadowing: the sheet
 * stores names as free text, so an entry that disappears entirely just stops
 * contributing traits.
 */

import type { ClassInfo } from './classes'
import { PUBLISHED_FEATS } from './feats'
import { PUBLISHED_RACES } from './races'
import { publishedSubclassesFor } from './subclasses'
import type { Homebrew, HomebrewSubclass } from './homebrew'
import { EMPTY_HOMEBREW, isBareSubclass } from './homebrew'
import { SRD_BACKGROUNDS, SRD_CLASS_KITS, SRD_FEATS, SRD_RACES } from './srd'
import type {
  BackgroundInfo,
  ClassKit,
  FeatInfo,
  RaceInfo,
  SpellcastingInfo,
  SubclassInfo,
  SubraceInfo,
} from './srd'

export interface Tables {
  /**
   * The race list. Two tiers of built-in: the SRD nine, plus `lib/races/`,
   * which sits outside `lib/srd/` for races that are not SRD 5.1 content and
   * is currently empty. On top of those sit the user's and the world's own.
   */
  races: Array<RaceInfo>
  backgrounds: Array<BackgroundInfo>
  /**
   * The class list. A `ClassKit` is the whole definition of a class — hit die
   * and subclasses for the sheet, starting gear and features for the wizard —
   * so there is no separate class table any more.
   */
  kits: Array<ClassKit>
  /**
   * Feats. The table whose *SRD* layer is empty by design — SRD 5.1 has no feat
   * list — so the built-ins come from `lib/feats/` instead, which sits outside
   * `lib/srd/` precisely because they are not SRD content. On top of those sit
   * whatever the user and the world have authored.
   */
  feats: Array<FeatInfo>
}

/** What a world contributes on top of the global store. */
export interface WorldTables {
  races?: Array<RaceInfo>
  backgrounds?: Array<BackgroundInfo>
  kits?: Array<ClassKit>
  feats?: Array<FeatInfo>
  /** Subclasses attached to a class by name — see `Homebrew.subclasses`. */
  subclasses?: Array<HomebrewSubclass>
  /**
   * Legacy per-world class list, from files written before kits absorbed it.
   * Upgraded in place rather than migrated on disk: a world folder is the
   * user's, and rewriting one just because it was opened is not this app's
   * habit. `worldSettings.ts` keeps reading and writing the key, so an old
   * build opening the same folder still finds what it expects.
   */
  classes?: Array<ClassInfo>
}

/**
 * The built-ins alone — the fallback while homebrew is still loading, and the
 * list every "is this a built-in?" check in the settings UI reads.
 *
 * The name is now slightly narrower than the contents: feats come from
 * `lib/feats/` and some races from `lib/races/`, both deliberately *not* SRD
 * 5.1. It stays `SRD_TABLES` because "the built-in tier" is what every call
 * site means by it, and renaming would churn six components to no benefit.
 *
 * The published tiers have to be here as well as in `mergeTables`: this is the
 * list every "is this a built-in?" check in the settings UI reads, so updating
 * only the merge leaves the Homebrew tab offering to create something the app
 * already ships.
 */
export const SRD_TABLES: Tables = {
  races: [...SRD_RACES, ...PUBLISHED_RACES],
  backgrounds: SRD_BACKGROUNDS,
  kits: withPublishedSubclasses(SRD_CLASS_KITS),
  feats: [...SRD_FEATS, ...PUBLISHED_FEATS],
}

/**
 * The built-in kits with the published tier's subclasses folded in.
 *
 * A subclass is not a top-level list, so it cannot be `layer`ed like races and
 * feats — it lives inside the kit that offers it, and the published tier is
 * keyed by class name for that reason.
 *
 * What this mostly does is *fill in a stub*. `classKits.ts` seeds every class
 * with the archetype names 5e offers, but SRD 5.1 only licenses one subclass
 * per class, so the rest ship as bare names. This is where a name gains the
 * features that were never ours to put in `lib/srd/`.
 *
 * `layerSubclasses` does the overlay and keeps its own rule: a bare entry never
 * displaces a rich one. Here the published entry is the rich side, so it wins
 * over the stub and appends when the name is new.
 */
function withPublishedSubclasses(kits: Array<ClassKit>): Array<ClassKit> {
  return kits.map((kit) => {
    const published = publishedSubclassesFor(kit.name)
    if (published.length === 0) return kit
    return { ...kit, subclasses: layerSubclasses(kit.subclasses, published) }
  })
}

/**
 * Fold user-authored standalone subclasses into the kits they name.
 *
 * The same overlay `withPublishedSubclasses` does, one tier up, and it exists
 * for a sharper reason. A `ClassKit` in the homebrew `kits` list *replaces* the
 * built-in of the same name, so adding one College to the Bard used to mean
 * duplicating the whole Bard — inheriting a frozen copy of its features,
 * equipment and spell tables that would never see another fix. Attaching by
 * name instead means the class keeps coming from wherever it came from, and
 * only the archetype is yours.
 *
 * Order is the caller's: later entries win, so world beats global. A subclass
 * naming a class nothing defines is dropped *here* rather than at parse — the
 * file keeps it, because the class may be defined in a world this merge was
 * not given, and losing somebody's work to a merge is worse than it not
 * appearing in one list.
 */
function attachSubclasses(
  kits: Array<ClassKit>,
  subclasses: Array<HomebrewSubclass>,
): Array<ClassKit> {
  if (subclasses.length === 0) return kits
  const byClass = new Map<string, Array<SubclassInfo>>()
  for (const { className, ...sub } of subclasses) {
    const key = nameKey(className)
    if (key === '') continue
    byClass.set(key, [...(byClass.get(key) ?? []), sub])
  }
  return kits.map((kit) => {
    const mine = byClass.get(nameKey(kit.name))
    if (!mine) return kit
    return { ...kit, subclasses: layerSubclasses(kit.subclasses, mine) }
  })
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
    subclasses: cl.subclasses.map(subclassFromName),
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

/** A bare name as a subclass with nothing else — the legacy shape, in full. */
export function subclassFromName(name: string): SubclassInfo {
  return { id: subclassId(name), name, features: [] }
}

function subclassId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'subclass'
  )
}

/**
 * Rebuild a subclass list from an edited list of names, keeping what survived.
 *
 * The editor binds a plain token field to the names, so without this every
 * retype would replace the entries wholesale and silently discard the features
 * the user just authored — the same class of bug as `layerSubclasses`, this
 * time in the UI. A name that is still present keeps its definition; only a
 * genuinely new name becomes a fresh empty entry.
 */
export function reconcileSubclasses(
  existing: Array<SubclassInfo>,
  names: Array<string>,
): Array<SubclassInfo> {
  const byName = new Map(existing.map((sub) => [nameKey(sub.name), sub]))
  return names.flatMap((name) => {
    const trimmed = name.trim()
    if (trimmed === '') return []
    return [byName.get(nameKey(trimmed)) ?? subclassFromName(trimmed)]
  })
}

/**
 * Whether a subclass carries anything beyond its name.
 *
 * Re-exported from `homebrew.ts`, which owns it because `serializeSubclass`
 * needs the same answer and that module sits below this one. It was a second
 * copy here, and the two drifted the moment `spellcasting` was added: one half
 * counted it and the other wrote such a subclass back as a bare string.
 */
export { isBareSubclass } from './homebrew'

/**
 * Overlay a legacy subclass list onto a richer one, by name.
 *
 * **This is the same bug as `layerClasses`, one level down.** A legacy entry is
 * a bare name — all `ClassInfo` ever carried — and every world is seeded with
 * twelve classes in that shape. Taking the legacy list as a replacement would
 * strip the features and bonus spells off every SRD subclass in every world.
 *
 * So a name that already exists keeps its rich definition, and only genuinely
 * new names append. A legacy entry that *does* carry content wins, because a
 * user who hand-wrote it means it.
 *
 * Note the deliberate asymmetry with `hitDie` and `subclassLabel` in
 * `layerClasses`: there, "the legacy file said d6" is real information. Here,
 * "the legacy file said the name" is not. Don't unify them.
 */
function layerSubclasses(
  existing: Array<SubclassInfo>,
  legacy: Array<SubclassInfo>,
): Array<SubclassInfo> {
  const order: Array<string> = existing.map((sub) => nameKey(sub.name))
  const byName = new Map(existing.map((sub) => [nameKey(sub.name), sub]))
  for (const sub of legacy) {
    const key = nameKey(sub.name)
    if (key === '') continue
    const have = byName.get(key)
    // A name-only legacy entry tells us nothing the richer one doesn't.
    if (have && isBareSubclass(sub)) continue
    if (!have) order.push(key)
    byName.set(key, sub)
  }
  return order.flatMap((key) => {
    const sub = byName.get(key)
    return sub ? [sub] : []
  })
}

/**
 * The key every layer here matches on: trimmed, lowercased name.
 *
 * Exported because the settings UI has to ask the same question this file does —
 * "is this built-in shadowed by something the user wrote?" — and answering it
 * with `homebrewId` instead would be subtly wrong: the slug strips apostrophes,
 * so a homebrew "Sha'ir" would not appear to shadow the built-in of that name.
 */
export function nameKey(name: string): string {
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
    races: layer(SRD_RACES, PUBLISHED_RACES, global.races, world.races ?? []),
    backgrounds: layer(
      SRD_BACKGROUNDS,
      global.backgrounds,
      world.backgrounds ?? [],
    ),
    kits: layerClasses(global, world),
    feats: layer(SRD_FEATS, PUBLISHED_FEATS, global.feats, world.feats ?? []),
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
  // The published tier sits directly on top of SRD and below anything a user
  // wrote, so it is folded in *before* `layer` runs: a homebrew kit that
  // replaces Barbarian outright is still allowed to say there is no Totem
  // Warrior, which is the whole point of world > global > published > SRD.
  const kits = attachSubclasses(
    layer(
      withPublishedSubclasses(SRD_CLASS_KITS),
      global.kits,
      world.kits ?? [],
    ),
    // Global first, world second, so a world's subclass of the same name wins.
    [...global.subclasses, ...(world.subclasses ?? [])],
  )
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
        // Overlaid, not replaced — see `layerSubclasses`. Passing the legacy
        // list straight through here is how every SRD subclass in every world
        // would lose its features.
        subclasses: layerSubclasses(
          existing.subclasses,
          legacy.subclasses.map(subclassFromName),
        ),
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
    // Names only: `ClassInfo` is the sheet-facing shape and has no use for
    // features. Handing over the entries themselves renders "[object Object]"
    // in the sheet's subclass datalist.
    subclasses: kit.subclasses.map((sub) => sub.name),
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
 * Feat lookup. Name in, undefined out — a feat nobody has authored still lands
 * on the sheet as the name the player typed, it simply grants nothing. That is
 * the same contract as every other lookup here, and it is what keeps a feat
 * hand-written in Obsidian working.
 */
export function findFeat(
  feats: Array<FeatInfo>,
  name: string,
): FeatInfo | undefined {
  const key = nameKey(name)
  if (key === '') return undefined
  return feats.find((f) => nameKey(f.name) === key)
}

/**
 * Subclass lookup within a kit. Name in, undefined out, like every other lookup
 * here — a subclass the tables don't know contributes its name and nothing
 * else, which is what keeps a hand-typed archetype working.
 */
export function findSubclass(
  kit: ClassKit | undefined,
  name: string,
): SubclassInfo | undefined {
  const key = nameKey(name)
  if (key === '' || !kit) return undefined
  return kit.subclasses.find((sub) => nameKey(sub.name) === key)
}

/**
 * The spell progression in force for a character: the archetype's own when it
 * has one, else the class's.
 *
 * The precedence rule lives here and nowhere else, because the two tables mean
 * different things and picking the wrong one is silent. A Rogue has no
 * `spellcasting` block at all — the *class* does not cast — so an Arcane
 * Trickster's slots can only come from the subclass. Reading `kit.spellcasting`
 * directly would hand that character nothing; putting a block on the kit to
 * compensate would hand every Thief a spell step at level 1.
 *
 * Name in, undefined out, like every other lookup in this file: an archetype
 * the tables don't know falls through to the class's own table rather than
 * erasing it, so a homebrew subclass on a Wizard still casts as a Wizard.
 */
export function spellcastingFor(
  kit: ClassKit | undefined,
  subclassName: string,
): SpellcastingInfo | undefined {
  return findSubclass(kit, subclassName)?.spellcasting ?? kit?.spellcasting
}

/**
 * The class whose spell list a character casts from — which is not always their
 * own class.
 *
 * An Arcane Trickster is a Rogue who casts wizard spells, and an Eldritch
 * Knight is a Fighter who does. Filtering spell suggestions by the *class* name
 * handed those two an empty list: every wizard spell's `classes` frontmatter
 * says Wizard, and matching it against "Rogue" excludes all of them.
 *
 * Derived from `listLabel`, which already carries the answer ("Wizard spells")
 * and is authored on every caster. Falls back to the class's own name when the
 * label is missing or shaped unexpectedly, and returns undefined for a class
 * that does not cast — `filterSpells` treats undefined as "do not narrow",
 * which is the right answer for homebrew nobody's spells mention.
 */
export function spellListClass(
  kit: ClassKit | undefined,
  subclassName: string,
): string | undefined {
  const sc = spellcastingFor(kit, subclassName)
  if (!sc) return undefined
  const label = sc.listLabel.trim()
  // "Wizard spells" -> "Wizard". Anything else is used as-is rather than
  // mangled, since the field is free text a homebrew kit also writes.
  const match = /^(.*?)\s+spells$/i.exec(label)
  return (match?.[1] ?? label) || kit?.name
}

/**
 * The character level at which a class chooses its subclass.
 *
 * Resolves the two fields that can say it: `subclassLevel` when a file or table
 * has one, else the older `subclassAtLevel1` boolean, else 3. The boolean could
 * not express Wizard's level 2, which is why the number exists.
 */
export function subclassLevelOf(kit: ClassKit | undefined): number {
  if (!kit) return DEFAULT_SUBCLASS_LEVEL
  if (typeof kit.subclassLevel === 'number') return kit.subclassLevel
  return kit.subclassAtLevel1 === true ? 1 : DEFAULT_SUBCLASS_LEVEL
}

/** Where 5e puts the subclass choice when a class doesn't say otherwise. */
export const DEFAULT_SUBCLASS_LEVEL = 3

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
