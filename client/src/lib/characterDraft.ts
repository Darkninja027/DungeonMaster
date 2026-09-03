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
import type { Ruleset } from './ruleset'
import { ABILITIES, ABILITY_NAMES, skillIdFor } from './character'
import { emptyAbilityDraft, abilitiesValid } from './abilityMethods'
import type { AbilityDraft } from './abilityMethods'
import type { ClassInfo } from './classes'
import {
  castsAtLevel1,
  findBackground,
  findKit,
  findFeat,
  findRace,
  findSubclass,
  findSubrace,
  kitFromClassInfo,
  spellcastingFor,
  SRD_TABLES,
} from './tables'
import type { Tables } from './tables'
import { featuresUpToLevel } from './srd'
import type {
  BackgroundInfo,
  ClassKit,
  FeatInfo,
  FlexibleAsiMode,
  Grant,
  PickKind,
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

  /**
   * The edition this character is built under, written onto the sheet.
   *
   * Null in a campaign world, whose own `ruleset` already answers for every
   * character in it — the wizard inherits it and records nothing, so a sheet
   * there is unchanged. The vault sets it: it has no edition of its own, so
   * the answer has to live on the character.
   */
  ruleset: Ruleset | null

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

  /**
   * Player-chosen racial increases, keyed by ability — Variant Human's and
   * Half-Elf's two +1s, a Goliath's +2 and +1.
   *
   * A per-ability *amount* rather than a set of chosen abilities, which is what
   * lets a mode with mixed sizes work without `racialAsi` changing at all.
   */
  flexibleAsi: Partial<Record<Ability, number>>
  /**
   * Which of the race's `flexibleAsi` modes the player is taking, as an index.
   *
   * Only meaningful for a race offering more than one — a Goliath's "+2 and +1"
   * versus "three +1s". It cannot be inferred from the placements above: an
   * empty draft matches the start of every mode, so the wizard would not know
   * whether to render two slots or three. 0 for a single-mode race, which is
   * also the right default for a race the tables don't know.
   */
  flexibleAsiMode: number
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
    ruleset: null,
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
    flexibleAsiMode: 0,
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
 * The chosen subclass entry, if the class offers one by that name.
 *
 * Only meaningful for a class that picks at level 1 — Cleric, Sorcerer,
 * Warlock — because that is the only case where creation knows the answer. A
 * Fighter's archetype is chosen at 3rd and the level-up wizard resolves it
 * there instead.
 *
 * Undefined for a subclass nobody has authored, which is a supported case and
 * the same bargain `draftFeat` makes: the name still reaches the sheet, it
 * simply grants nothing.
 */
export function draftSubclass(draft: CharacterDraft) {
  return findSubclass(draftKit(draft), draft.subclassName)
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
 * race, subrace, background, class kit, subclass, then each resolved equipment
 * option.
 *
 * Order matters only for de-duplication, which keeps the first spelling it saw.
 *
 * The subclass sits directly after the kit because it is part of the class: a
 * Life Domain cleric's heavy armour is the class's grant plus the domain's, and
 * only a class picking its subclass at level 1 has one to contribute here at
 * all. Routing it through this list rather than special-casing it in
 * `buildCharacter` is what makes a subclass's `acBonus`, `speedBonus`,
 * `initiativeBonus` and `hpPerLevel` work: those are summed over exactly this
 * list, and a grant applied anywhere else is silently missed by all four.
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
    const subclass = draftSubclass(draft)
    if (subclass?.grant) out.push(subclass.grant)
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
  return draftOwnedPickLists(draft).map((o) => o.pick)
}

/**
 * What kind of thing owns a pick, so the UI can say "Skilled feat" rather than
 * a bare "Skilled" that reads like it could be anything.
 *
 * Subrace collapses into `'race'`: "Hill Dwarf race" is what a player would
 * call it, and the distinction buys nothing they'd recognise. `'equipment'` is
 * the odd one — its owner is an option *label* ("a martial weapon and a
 * shield") rather than the name of a thing with a kind, so a caller wanting
 * prose should print that owner bare.
 */
export type PickOwnerKind =
  'race' | 'background' | 'feat' | 'class' | 'equipment'

/** A pick list beside the name of whatever handed it out. */
export interface OwnedPickList {
  pick: PickList
  /**
   * The race, background, feat or class the pick came from — "Skilled",
   * "Soldier", "Fighter".
   *
   * A `PickList` has no room to say who owns it, and its own label is written
   * from the player's side ("Choose two skills", "Skill proficiency"), so it
   * cannot answer "where did this come from". Pairing the two here is what
   * lets the Skills step say *Already granted by Skilled* rather than naming
   * some other pick's generic label back at the player.
   */
  owner: string
  /**
   * Which of the five kinds `owner` is. The name alone can't be classified
   * after the fact — "Skilled" is a feat and "Soldier" is a background, and
   * nothing about either string says so — but every call site below knows,
   * so it is recorded here rather than guessed at later.
   */
  ownerKind: PickOwnerKind
}

/**
 * Every pick list the draft offers, each paired with its owner's name.
 *
 * Mirrors `draftGrants` deliberately: same sources, same order, so the two
 * cannot disagree about what a draft grants. `draftPickLists` is this with the
 * owners dropped, kept because most callers only need the picks.
 *
 * The mirror is a maintenance obligation, not just a description — a source
 * added to one and not the other is a draft that grants something it never
 * asked about, or asks something it never grants. The subclass was added to
 * both together for that reason.
 */
export function draftOwnedPickLists(
  draft: CharacterDraft,
): Array<OwnedPickList> {
  const out: Array<OwnedPickList> = []
  const add = (
    grant: Grant | undefined,
    owner: string,
    ownerKind: PickOwnerKind,
  ) => {
    for (const pick of grant?.picks ?? []) out.push({ pick, owner, ownerKind })
  }
  const race = draftRace(draft)
  if (race) add(race.grant, race.name, 'race')
  const subrace = draftSubrace(draft)
  if (subrace) add(subrace.grant, subrace.name, 'race')
  const background = draftBackground(draft)
  if (background) add(background.grant, background.name, 'background')
  const feat = draftFeat(draft)
  if (feat) {
    // A half-feat whose +1 the player places — offered before its own picks,
    // because "which ability" is the first thing a Skill Expert decides.
    const choice = asiChoicePick(feat)
    if (choice) out.push({ pick: choice, owner: feat.name, ownerKind: 'feat' })
    add(feat.grant, feat.name, 'feat')
  }
  const kit = draftKit(draft)
  if (kit) {
    add(kit.grant, kit.name, 'class')
    // Choices posed by the features a level-1 character actually has — a
    // Fighter's Fighting Style. These live on the feature rather than on
    // `kit.grant` because they arrive *with* it, and a feature gained at 5th
    // level must not be asked about during creation; `featuresUpToLevel` is
    // what draws that line, and it is the same line `buildCharacter` uses when
    // it decides which feature rows to write.
    for (const feature of featuresUpToLevel(kit.features, 1)) {
      for (const pick of feature.picks ?? []) {
        out.push({ pick, owner: feature.name, ownerKind: 'class' })
      }
    }
    // The subclass, mirroring `draftGrants` — its own grant, then the choices
    // posed by whichever of its features a level-1 character has. Only a class
    // picking at level 1 reaches this: `featuresUpToLevel` draws the same line
    // it draws for the kit above, so a domain feature gained at 6th is not
    // asked about during creation.
    //
    // Owner is the subclass's own name rather than the class's — "Knowledge
    // Domain" is what a player would call the thing that handed them their
    // expertise, and `ownerKind` has no subclass member because the distinction
    // buys nothing they'd recognise, exactly as subrace collapses into 'race'.
    const subclass = draftSubclass(draft)
    if (subclass) {
      add(subclass.grant, subclass.name, 'class')
      for (const feature of featuresUpToLevel(subclass.features, 1)) {
        for (const pick of feature.picks ?? []) {
          out.push({ pick, owner: feature.name, ownerKind: 'class' })
        }
      }
    }
    for (const choice of kit.equipment) {
      const index = draft.equipment[choice.id] as number | undefined
      const option = index === undefined ? undefined : choice.options[index]
      if (option) add(option.grant, option.label, 'equipment')
    }
    out.push({ pick: kit.skillChoices, owner: kit.name, ownerKind: 'class' })
  }
  // Expertise picks last, whatever handed them out. An expertise pick's answer
  // is drawn from proficiencies the player may only just have chosen — the
  // rogue's are the four from `skillChoices`, which is pushed above its own
  // `grant.picks` — so leaving it in source order asks which skills to double
  // before asking which skills you have. Ordering is a property of the *kind*,
  // not the owner: Skill Expert's expertise belongs under its own skill pick
  // for exactly the same reason, and currently manages it only by authoring
  // accident.
  //
  // A stable partition, so everything else keeps the fixed race / subrace /
  // background / feat / class order `draftGrants` mirrors. That mirror is about
  // sources and their order, and grants have no expertise dimension, so sorting
  // picks by kind can't put the two out of step about what a draft grants.
  return [
    ...out.filter((o) => o.pick.kind !== 'expertise'),
    ...out.filter((o) => o.pick.kind === 'expertise'),
  ]
}

/**
 * Skill ids chosen in pick lists, as opposed to granted outright.
 *
 * Only the skill-ish kinds: a tool or language sharing a name with a skill is
 * not the same proficiency. Expertise is excluded on purpose — taking expertise
 * in a skill does not spend the proficiency in it, so an expertise pick neither
 * greys a skill out elsewhere nor makes the character proficient.
 */
function pickedSkills(
  draft: CharacterDraft,
  /** A pick to leave out — its own choices are the chips being toggled. */
  exceptPickId: string | undefined,
  each: (skillId: string, owner: string) => void,
): void {
  for (const { pick, owner } of draftOwnedPickLists(draft)) {
    if (pick.id === exceptPickId) continue
    if (pick.kind !== 'skill' && pick.kind !== 'skillOrTool') continue
    for (const value of picked(draft, pick.id)) {
      const id = skillIdFor(value)
      // The owner, not `pick.label` — "Skilled" says where the skill went,
      // where "Skill proficiency" is just another pick's prompt.
      if (id !== undefined) each(id, owner)
    }
  }
}

/**
 * The skills an expertise pick can actually double: every proficiency the
 * character holds, granted outright or chosen in another pick.
 *
 * "Two of *your* skill proficiencies" is a fact about the draft, not about the
 * Rogue, so the narrowing happens here rather than in the table. `pick.options`
 * stays authored data — srd.test.ts validates it, and rewriting it in place
 * would make the table a lie the test still passes on — and this intersects
 * with it rather than replacing it, so a pick meaning to offer a subset still
 * does.
 *
 * Returns fewer than `pick.count` entries when the skills haven't been chosen
 * yet, which is why expertise picks sort last: the Skills step renders the
 * shortfall as a hint rather than an empty box, and filling the skill picks
 * above resolves it.
 */
export function eligibleExpertise(
  draft: CharacterDraft,
  pick: PickList,
): Array<string> {
  const owned = new Set(grantedSkills(draft).keys())
  pickedSkills(draft, undefined, (id) => owned.add(id))
  return pick.options.filter((id) => owned.has(id))
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
  pickedSkills(draft, exceptPickId, (id, owner) => add([id], owner))
  return out
}

/**
 * Values of one kind the character already has, mapped to where each came from.
 *
 * The general form of `grantedSkills`, which answered this for skills alone —
 * so a Half-Elf who already spoke Elvish was still offered Elvish as a
 * selectable chip, spent a pick on it, and had it silently deduplicated away by
 * `mergeList` at commit. The pick was gone and nothing said so.
 *
 * Returns a map rather than a set because the UI names the source: greying a
 * chip is only fair if it also says *why*.
 */
export function grantedFor(
  draft: CharacterDraft,
  kind: PickKind,
  /**
   * When given, also count values chosen in *other* pick lists of this kind,
   * and exempt this one — a pick must never grey out its own answers.
   */
  exceptPickId?: string,
): Map<string, string> {
  // Skills keep their own function: they resolve free text through `skillIdFor`
  // and are the one kind whose values are ids rather than the words on screen.
  if (kind === 'skill' || kind === 'skillOrTool') {
    return grantedSkills(draft, exceptPickId)
  }
  const field = GRANT_FIELD_FOR[kind]
  if (!field) return new Map()

  const out = new Map<string, string>()
  const add = (values: Array<string> | undefined, source: string) => {
    for (const value of values ?? []) {
      const trimmed = value.trim()
      // First writer wins, matching `mergeList` — the source shown is the one
      // that would actually have granted it.
      if (trimmed && !out.has(trimmed)) out.set(trimmed, source)
    }
  }
  const race = draftRace(draft)
  if (race) add(race.grant[field], race.name)
  const subrace = draftSubrace(draft)
  if (subrace) add(subrace.grant[field], subrace.name)
  const background = draftBackground(draft)
  if (background) add(background.grant[field], background.name)
  const kit = draftKit(draft)
  if (kit) add(kit.grant[field], kit.name)
  const feat = draftFeat(draft)
  if (feat) add(feat.grant[field], feat.name)

  if (exceptPickId === undefined) return out
  // Values spent in another pick of the same kind. Two "choose a language"
  // picks must not both offer Dwarvish.
  for (const { pick, owner } of draftOwnedPickLists(draft)) {
    if (pick.id === exceptPickId || pick.kind !== kind) continue
    add(picked(draft, pick.id), owner)
  }
  return out
}

/**
 * Which `Grant` list a pick kind draws from, for the kinds where the two line
 * up one-to-one. Absent for kinds a grant cannot hand over outright (`spell`,
 * `cantrip`, `expertise`, `feature`, `other`), which is why the lookup is
 * partial rather than a `Record`.
 */
const GRANT_FIELD_FOR: Partial<
  Record<PickKind, 'languages' | 'tools' | 'armor' | 'weapons'>
> = {
  language: 'languages',
  tool: 'tools',
  armor: 'armor',
  weapon: 'weapons',
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
  // And the chooseable half of one, once the player has placed it. Unanswered
  // it is worth nothing rather than a guess — see `asiChoicePick`.
  const feat = draftFeat(draft)
  if (feat?.asiChoice) {
    const answer = picked(draft, asiChoicePickId(feat.id))[0]
    const ability = answer ? abilityForChoice(answer) : undefined
    if (ability && feat.asiChoice.includes(ability)) {
      bump({ [ability]: 1 })
    }
  }
  return out
}

/**
 * The synthetic pick id for a feat's chooseable +1.
 *
 * Derived from the feat id rather than authored, because the choice belongs to
 * the *feat* and every authored pick id is already spoken for. Kept in one
 * function so the writer (`levelUpPicks`) and the reader (`mergedAsi`) cannot
 * disagree about the key.
 */
export function asiChoicePickId(featId: string): string {
  return `${featId}-asi-choice`
}

/**
 * A feat's chooseable ability increase, as a `PickList` the ordinary picks step
 * can render.
 *
 * Synthetic rather than authored: expressing it as a pick means no new control,
 * no new step and no new gating — it is one more choice among the feat's own,
 * shown beside them and answered the same way. `kind: 'other'` because the
 * answer does not belong in any character *list*: it raises a score, and
 * `mergedAsi` reads it back directly.
 */
export function asiChoicePick(feat: FeatInfo): PickList | undefined {
  if (!feat.asiChoice || feat.asiChoice.length === 0) return undefined
  return {
    id: asiChoicePickId(feat.id),
    kind: 'other',
    label: feat.grantsSaveForAsiChoice
      ? 'Choose an ability — you gain +1 and its saving throw'
      : 'Choose an ability to increase by 1',
    count: 1,
    // Display names, not ids: this is the one pick whose values are read back
    // as abilities, and `abilityForChoice` resolves either spelling so a
    // hand-typed answer still lands.
    options: feat.asiChoice.map((a) => ABILITY_NAMES[a]),
  }
}

/** The ability a chooseable-ASI answer names, by id or display name. */
export function abilityForChoice(value: string): Ability | undefined {
  const key = value.trim().toLowerCase()
  return ABILITIES.find(
    (a) => a === key || ABILITY_NAMES[a].toLowerCase() === key,
  )
}

/**
 * The shapes of player-chosen increase this race offers, or undefined for a
 * race that fixes its own. Variant Human and Half-Elf offer one; a race in the
 * Goliath mould offers two, and the player picks between them.
 *
 * An empty list reads as "none": a race whose only mode was dropped as garbage
 * must not leave the player gated on a choice with nothing to choose.
 */
export function flexibleAsiSpec(
  draft: CharacterDraft,
): Array<FlexibleAsiMode> | undefined {
  const modes = draftRace(draft)?.flexibleAsi
  return modes && modes.length > 0 ? modes : undefined
}

/**
 * The mode the player is taking.
 *
 * Clamped rather than trusted. The index is just a number on a draft, and a
 * race swapped underneath it — or a homebrew edit that removed a mode — must
 * not leave the wizard reading past the end of the list.
 */
export function chosenFlexibleMode(
  draft: CharacterDraft,
): FlexibleAsiMode | undefined {
  const modes = flexibleAsiSpec(draft)
  if (!modes) return undefined
  return modes[draft.flexibleAsiMode] ?? modes[0]
}

/**
 * Whether the chosen mode's slots are all filled.
 *
 * Compares the multiset of amounts, not their total: "+2 and +1" and "three
 * +1s" both add to 3, so a sum alone would pass a Goliath who put every point
 * in one ability. Sorting both sides is enough — a mode's slots are
 * interchangeable, and which ability sits in which is not a fact worth keeping.
 */
export function flexibleAsiComplete(draft: CharacterDraft): boolean {
  const mode = chosenFlexibleMode(draft)
  if (!mode) return true
  const placed = Object.values(draft.flexibleAsi).sort((a, b) => a - b)
  const wanted = [...mode.increases].sort((a, b) => a - b)
  return (
    placed.length === wanted.length && placed.every((n, i) => n === wanted[i])
  )
}

/**
 * The placed increases, re-shaped to a different mode's slots.
 *
 * Switching from "+2 and +1" to "three +1s" cannot keep the +2, and clearing
 * the lot would throw away the abilities the player actually chose — the
 * amounts were the mode's to dictate, not theirs. So the abilities are kept in
 * the order they were placed and resized to the new slots, and anything past
 * the last slot is dropped.
 *
 * The same trade `setKind` makes in the level-up wizard's AsiStep when the
 * point budget shrinks. Insertion order is load-bearing here — it is what
 * "the order they were placed" means — which is usually a smell and is
 * deliberate in this one spot.
 */
export function refitFlexibleAsi(
  placed: Partial<Record<Ability, number>>,
  mode: FlexibleAsiMode,
): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {}
  const abilities = Object.keys(placed) as Array<Ability>
  // Abilities past the last slot are dropped, which is the whole point: a
  // three-+1s spread refitted to "+2 and +1" has one ability too many.
  for (const [i, amount] of mode.increases.entries()) {
    if (i >= abilities.length) break
    out[abilities[i]] = amount
  }
  return out
}

/**
 * Which ability sits in each of the mode's slots, by slot index.
 *
 * The draft stores placements by ability, which cannot tell two same-sized
 * slots apart — so the slot view is derived: walk the slots in order and hand
 * each the next unclaimed ability holding that amount. That is enough, because
 * same-sized slots are interchangeable by definition; the only thing this has
 * to get right is that one ability never fills two slots.
 */
export function flexibleSlotAbilities(
  placed: Partial<Record<Ability, number>>,
  mode: FlexibleAsiMode,
): Array<Ability | undefined> {
  const taken = new Set<Ability>()
  return mode.increases.map((amount) => {
    const match = (Object.keys(placed) as Array<Ability>).find(
      (ability) => !taken.has(ability) && placed[ability] === amount,
    )
    if (match) taken.add(match)
    return match
  })
}

/**
 * Put `ability` in one slot, taking it out of any other it held.
 *
 * Passing undefined clears the slot. An ability can only be raised once, so
 * assigning one that is already placed elsewhere *moves* it rather than
 * duplicating it — which is what makes the dropdowns behave when you change
 * your mind.
 */
export function assignFlexibleSlot(
  placed: Partial<Record<Ability, number>>,
  mode: FlexibleAsiMode,
  slot: number,
  ability: Ability | undefined,
): Partial<Record<Ability, number>> {
  const current = flexibleSlotAbilities(placed, mode)
  const next: Partial<Record<Ability, number>> = {}
  current.forEach((held, i) => {
    const who = i === slot ? ability : held === ability ? undefined : held
    if (who === undefined) return
    const amount = mode.increases[i]
    next[who] = amount
  })
  return next
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
  // `castsAtLevel1`, not `kit.spellcasting`: a half caster has a block whose
  // table starts at 2, and asking whether the block *exists* would show a
  // level-1 paladin a step offering nothing. Passing the subclass matters for
  // the mirror case — an archetype that casts when its class does not.
  if (castsAtLevel1(draftKit(draft), draft.subclassName)) steps.push('spells')
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
      // Through `spellcastingFor` so the step is gated by the same table that
      // put it on the list; reading the kit's block directly would let a
      // subclass caster's step appear and then pass unanswered.
      const sc = spellcastingFor(draftKit(draft), draft.subclassName)
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
