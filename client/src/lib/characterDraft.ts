/**
 * The character-creation wizard's working state.
 *
 * A draft holds **names, not ids** — `raceName: 'Hill Dwarf'`, never
 * `raceId: 'hill-dwarf'`. The SRD tables are consulted by name at commit, so a
 * value the tables don't recognise simply passes through to the sheet. See the
 * header of lib/srd/types.ts.
 *
 * Nothing here touches disk. `buildCharacter` turns a draft into the article
 * content, and the only write is the wizard's Create button.
 */

import type { Ability } from './character'
import { skillIdFor } from './character'
import { emptyAbilityDraft, abilitiesValid } from './abilityMethods'
import type { AbilityDraft } from './abilityMethods'
import type { ClassInfo } from './classes'
import {
  findBackground,
  findKit,
  findFeat,
  findRace,
  findSubrace,
  kitFromClassInfo,
  SRD_TABLES,
} from './tables'
import type { Tables } from './tables'
import type {
  BackgroundInfo,
  ClassKit,
  FeatInfo,
  Grant,
  PickList,
  RaceInfo,
} from './srd'

export interface PersonalityDraft {
  trait: string
  ideal: string
  bond: string
  flaw: string
}

export interface CharacterDraft {
  name: string
  /**
   * The tables this character is being built against — SRD, plus global
   * homebrew, plus this world's own (see lib/tables.ts). Captured when the
   * wizard opened, so a background refetch can't reshuffle the option grids
   * mid-build; creating homebrew inline is the one sanctioned refresh.
   *
   * `kits` is the class list: a kit is the whole definition of a class, hit die
   * included. They are held here rather than looked up globally so every
   * derived helper below stays a pure function of the draft.
   */
  races: Array<RaceInfo>
  backgrounds: Array<BackgroundInfo>
  kits: Array<ClassKit>
  /** Feats offered for the Variant Human pick. Homebrew-only; see lib/srd/feats.ts. */
  feats: Array<FeatInfo>

  raceName: string
  subraceName: string
  className: string
  subclassName: string
  backgroundName: string
  alignment: string

  abilities: AbilityDraft

  /**
   * PickList id -> chosen values. One keyspace shared by every table, which is
   * why srd.test.ts asserts the ids are globally unique.
   */
  picks: Record<string, Array<string>>
  /** EquipmentChoice id -> index into its options. */
  equipment: Record<string, number>
  /** Extra inventory rows typed on the equipment step. */
  extraItems: Array<string>

  /** Chosen cantrip and level 1 spell names, free text or [[wiki links]]. */
  cantrips: Array<string>
  spells: Array<string>

  /** Variant Human and Half-Elf: flexible +1s, keyed by ability. */
  flexibleAsi: Partial<Record<Ability, number>>
  /** Variant Human only. */
  featName: string

  personality: PersonalityDraft
  backstory: string
}

/**
 * A blank draft built against `tables`. Defaults to the SRD tables alone, which
 * is what every call site wants before homebrew has loaded — and what keeps the
 * existing tests honest without threading a fixture through each one.
 */
export function emptyDraft(
  classesOrTables: Array<ClassInfo> | Tables = SRD_TABLES,
): CharacterDraft {
  // Still accepts a bare class list, which is what a legacy world and most of
  // the tests hand over; those classes become kits with no starting gear, which
  // is precisely what they meant.
  const tables: Tables = Array.isArray(classesOrTables)
    ? { ...SRD_TABLES, kits: classesOrTables.map(kitFromClassInfo) }
    : classesOrTables
  return {
    name: '',
    races: tables.races,
    backgrounds: tables.backgrounds,
    kits: tables.kits,
    feats: tables.feats,
    raceName: '',
    subraceName: '',
    className: '',
    subclassName: '',
    backgroundName: '',
    alignment: '',
    abilities: emptyAbilityDraft(),
    picks: {},
    equipment: {},
    extraItems: [],
    cantrips: [],
    spells: [],
    flexibleAsi: {},
    featName: '',
    personality: { trait: '', ideal: '', bond: '', flaw: '' },
    backstory: '',
  }
}

// --- Derived views over a draft ---------------------------------------------

/** The race entry backing this draft, if its tables know the name. */
export function draftRace(draft: CharacterDraft) {
  return findRace(draft.races, draft.raceName)
}

/**
 * The feat entry backing the Variant Human pick, if the tables know the name.
 *
 * Undefined for a feat nobody has authored, which is a supported case: the name
 * still reaches the sheet, it simply grants nothing.
 */
export function draftFeat(draft: CharacterDraft) {
  if (!draftRace(draft)?.grantsFeat) return undefined
  return findFeat(draft.feats, draft.featName)
}

/** The subrace entry, if any. */
export function draftSubrace(draft: CharacterDraft) {
  return draft.subraceName
    ? findSubrace(draft.races, draft.subraceName)?.subrace
    : undefined
}

/**
 * The race a subrace belongs to — recovered by search, because the sheet stores
 * only the full subrace name. See the warning on findSubrace in tables.ts.
 */
export function draftSubraceParent(draft: CharacterDraft) {
  return draft.subraceName
    ? findSubrace(draft.races, draft.subraceName)?.race
    : undefined
}

export function draftBackground(draft: CharacterDraft) {
  return findBackground(draft.backgrounds, draft.backgroundName)
}

export function draftKit(draft: CharacterDraft) {
  return findKit(draft.kits, draft.className)
}

/**
 * The chosen class in the shape the sheet-facing code wants. Derived from the
 * kit, which *is* the class now — kept as its own helper because callers only
 * want the hit die and the subclass label, and shouldn't have to know a kit
 * carries a whole starting inventory too.
 */
export function draftClassInfo(draft: CharacterDraft): ClassInfo | undefined {
  const kit = draftKit(draft)
  if (!kit) return undefined
  return {
    id: kit.id,
    name: kit.name,
    hitDie: kit.hitDie,
    subclassLabel: kit.subclassLabel,
    // Names only — `ClassInfo` is the sheet-facing shape.
    subclasses: kit.subclasses.map((sub) => sub.name),
  }
}

/**
 * Every grant this draft has accrued, in the fixed order they must be merged:
 * race, subrace, background, class kit, then each resolved equipment option.
 *
 * Order matters only for de-duplication, which keeps the first spelling it saw.
 */
export function draftGrants(draft: CharacterDraft): Array<Grant> {
  const out: Array<Grant> = []
  const race = draftRace(draft)
  if (race) out.push(race.grant)
  const subrace = draftSubrace(draft)
  if (subrace) out.push(subrace.grant)
  const background = draftBackground(draft)
  if (background) out.push(background.grant)
  // A feat grants through the same channel as everything else, so a feat that
  // hands out a skill or a save needs no special case at commit.
  const feat = draftFeat(draft)
  if (feat) out.push(feat.grant)
  const kit = draftKit(draft)
  if (kit) {
    out.push(kit.grant)
    for (const choice of kit.equipment) {
      // `equipment` is a sparse record: an unanswered choice has no key,
      // and an index is only ever written by clicking a rendered option.
      const index = draft.equipment[choice.id] as number | undefined
      const option = index === undefined ? undefined : choice.options[index]
      if (option) out.push(option.grant)
    }
  }
  return out
}

/**
 * Every pick list this draft must satisfy, including those nested inside a
 * chosen equipment option — picking "any martial weapon" adds a pick that
 * picking "a greataxe" does not.
 */
export function draftPickLists(draft: CharacterDraft): Array<PickList> {
  const out: Array<PickList> = []
  for (const grant of draftGrants(draft)) {
    out.push(...(grant.picks ?? []))
  }
  const kit = draftKit(draft)
  if (kit) out.push(kit.skillChoices)
  return out
}

/** The values chosen for one pick list. */
export function picked(draft: CharacterDraft, id: string): Array<string> {
  return draft.picks[id] ?? []
}

/** Whether a pick list has exactly as many choices as it asks for. */
export function pickSatisfied(draft: CharacterDraft, pick: PickList): boolean {
  return picked(draft, pick.id).length === pick.count
}

/**
 * Skill ids the character already has, with where each came from. The Skills
 * step greys these out rather than hiding them: 5e says pick something else,
 * and a silently missing option reads as a lost choice.
 *
 * Counts skills taken in *other pick lists* too, not just ones granted
 * outright. Two lists can offer the same skill — Variant Human's one free
 * skill, a class's two, and Skilled's three all draw from the full eighteen —
 * and choosing it twice used to be allowed right up until `mergeList` deduped
 * the pair at commit, quietly turning two picks into one. Greying it in the
 * second list is the only place that can be said out loud.
 *
 * A pick never greys out its *own* choices: those are the chips the player is
 * toggling, and disabling one would make it unclickable to undo.
 */
export function grantedSkills(
  draft: CharacterDraft,
  /**
   * When given, also count skills chosen in *other* pick lists, and exempt this
   * one. Omit it for the plain "already yours" question — the step's summary
   * line means skills the character was handed, not ones it just picked.
   */
  exceptPickId?: string,
): Map<string, string> {
  const out = new Map<string, string>()
  const add = (skills: Array<string> | undefined, source: string) => {
    for (const id of skills ?? []) if (!out.has(id)) out.set(id, source)
  }
  const race = draftRace(draft)
  if (race) add(race.grant.skills, race.name)
  const subrace = draftSubrace(draft)
  if (subrace) add(subrace.grant.skills, subrace.name)
  const background = draftBackground(draft)
  if (background) add(background.grant.skills, background.name)
  const kit = draftKit(draft)
  if (kit) add(kit.grant.skills, kit.name)
  if (exceptPickId === undefined) return out
  for (const pick of draftPickLists(draft)) {
    if (pick.id === exceptPickId) continue
    // Only the skill-ish kinds: a tool or language sharing a name with a skill
    // is not the same proficiency. Expertise is excluded on purpose — taking
    // expertise in a skill does not spend the proficiency in it.
    if (pick.kind !== 'skill' && pick.kind !== 'skillOrTool') continue
    add(
      picked(draft, pick.id)
        .map((v) => skillIdFor(v))
        .filter((id): id is string => id !== undefined),
      pick.label,
    )
  }
  return out
}

/** Racial ability increases, race and subrace merged, plus flexible picks. */
export function racialAsi(
  draft: CharacterDraft,
): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {}
  const bump = (asi: Partial<Record<Ability, number>> | undefined) => {
    for (const [key, value] of Object.entries(asi ?? {})) {
      const ability = key as Ability
      out[ability] = (out[ability] ?? 0) + value
    }
  }
  bump(draftRace(draft)?.asi)
  bump(draftSubrace(draft)?.asi)
  bump(draft.flexibleAsi)
  // A half-feat's +1 lands here rather than in buildCharacter, so it flows
  // through `finalScores` with the racial increases and gets the same 1-30
  // clamp. Only ever set for a race that grants a feat at all.
  bump(draftFeat(draft)?.asi)
  return out
}

/**
 * How many flexible +1s this race offers, and how big each is. Variant Human
 * and Half-Elf both take two +1s; everyone else takes none.
 */
export function flexibleAsiSpec(
  draft: CharacterDraft,
): { count: number; amount: number } | undefined {
  return draftRace(draft)?.flexibleAsi
}

/** Whether the flexible +1s have all been placed. */
export function flexibleAsiComplete(draft: CharacterDraft): boolean {
  const spec = flexibleAsiSpec(draft)
  if (!spec) return true
  const placed = Object.values(draft.flexibleAsi).reduce((sum, v) => sum + v, 0)
  return placed === spec.count * spec.amount
}

// --- Step gating ------------------------------------------------------------

export type StepId =
  | 'name'
  | 'race'
  | 'class'
  | 'abilities'
  | 'background'
  | 'skills'
  | 'spells'
  | 'equipment'
  | 'review'

/** The steps in order, with the spells step conditional on the class. */
export function stepsFor(draft: CharacterDraft): Array<StepId> {
  const steps: Array<StepId> = [
    'name',
    'race',
    'class',
    'abilities',
    'background',
    'skills',
  ]
  if (draftKit(draft)?.spellcasting) steps.push('spells')
  steps.push('equipment', 'review')
  return steps
}

/**
 * Characters live in `Characters/<Title>.md`, so the name has to be a legal
 * filename. Mirrors the main process's `nameError` rather than importing it —
 * electron/main is not reachable from the renderer.
 */
export function nameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Give your character a name.'
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    return 'A name cannot contain \\ / : * ? " < > or |.'
  }
  if (trimmed.startsWith('.')) return 'A name cannot start with a dot.'
  if (trimmed.length > 120) return 'That name is too long.'
  return null
}

/** Whether a step has everything it needs for the wizard to move on. */
export function canAdvance(draft: CharacterDraft, step: StepId): boolean {
  switch (step) {
    case 'name':
      return nameProblem(draft.name) === null
    case 'race': {
      if (!draft.raceName.trim()) return false
      // A race with subraces requires one; a homebrew race has none to require.
      const race = draftRace(draft)
      if (race?.subraces?.length && !draft.subraceName.trim()) return false
      return flexibleAsiComplete(draft)
    }
    case 'class':
      return draft.className.trim().length > 0
    case 'abilities':
      return abilitiesValid(draft.abilities)
    case 'background':
      return draft.backgroundName.trim().length > 0
    case 'skills':
      // Every pick list except those owned by the equipment step, which is
      // gated separately so a missing weapon choice doesn't block here.
      return draftPickLists(draft)
        .filter((p) => p.kind !== 'weapon')
        .every((p) => pickSatisfied(draft, p))
    case 'spells': {
      const sc = draftKit(draft)?.spellcasting
      if (!sc) return true
      return (
        draft.cantrips.filter(Boolean).length === sc.cantripsKnown &&
        draft.spells.filter(Boolean).length === sc.spellsKnown
      )
    }
    case 'equipment': {
      const kit = draftKit(draft)
      if (!kit) return true
      // Sparse record again: a choice the player has not answered is absent.
      const allChosen = kit.equipment.every((choice) =>
        Object.hasOwn(draft.equipment, choice.id),
      )
      const weaponPicks = draftPickLists(draft).filter(
        (p) => p.kind === 'weapon',
      )
      return allChosen && weaponPicks.every((p) => pickSatisfied(draft, p))
    }
    case 'review':
      return true
  }
}

/** Whether every step up to and including `step` is satisfied. */
export function completedThrough(draft: CharacterDraft, step: StepId): boolean {
  const steps = stepsFor(draft)
  const end = steps.indexOf(step)
  if (end < 0) return false
  return steps.slice(0, end + 1).every((s) => canAdvance(draft, s))
}
