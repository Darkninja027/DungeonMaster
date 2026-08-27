/**
 * Levelling an existing character up.
 *
 * **The invariant that makes this safe: `applyLevelUp` only ever appends to
 * arrays and raises numbers.** It never rewrites `hp.current`, never edits or
 * removes an existing feature, never lowers a spell slot total, never touches
 * inventory, notes, abilities the player set, or anything else already on the
 * sheet. A character is somebody's work; a level-up adds to it.
 *
 * That is not a style preference — it is what lets the wizard run against a
 * sheet that has been hand-edited in Obsidian, planned ahead of time, or
 * house-ruled, without the app quietly disagreeing with its owner. The
 * property test in levelUp.test.ts asserts it over an arbitrary character, and
 * it should stay the hardest test in the file.
 *
 * Pure throughout. The wizard's commit is one `update(applyLevelUp(c, draft))`
 * call; autosave takes it from there.
 */

import {
  ABILITIES,
  MAX_RESOURCES,
  abilityMod,
  proficiencyBonus,
  setLevel,
} from './character'
import type {
  Ability,
  Character,
  CharacterResource,
  ClassFeature,
  HalfProficiency,
} from './character'
import { applyFeaturePick, applyPick } from './buildCharacter'
import {
  abilityForChoice,
  asiChoicePick,
  asiChoicePickId,
} from './characterDraft'
import type {
  ClassFeatureInfo,
  ClassKit,
  FeatInfo,
  Grant,
  PickList,
} from './srd'
import {
  DEFAULT_SUBCLASS_LEVEL,
  findFeat,
  findSubclass,
  spellcastingFor,
  subclassLevelOf,
} from './tables'

/** How the player wants to gain hit points for the levels being taken. */
export type HpMethod = 'roll' | 'average' | 'manual'

export interface LevelUpDraft {
  from: number
  to: number
  /**
   * The character as it was when the wizard opened.
   *
   * Snapshotted, not read live, and this is load-bearing: the sheet's own
   * `character` keeps changing underneath an open dialog — a keystroke in
   * another field, or the level itself once Apply lands — and every derived
   * question here ("what features does 1 → 2 grant?") is only answerable
   * against the character that *started* the level-up. Reading the live one
   * made the features step vanish the moment the level moved.
   */
  base: Character
  /**
   * The class kit, captured when the wizard opened — same reasoning as the
   * creation wizard's tables, so a background refetch can't change the answer
   * halfway through. `undefined` for a class the tables don't know, which is a
   * supported case, not an error.
   */
  kit: ClassKit | undefined
  /**
   * Feats offered by the datalist, captured with the kit and for the same
   * reason. Empty is a normal state — feats are homebrew-only, so a user who
   * has authored none simply types a name free-hand, exactly as before.
   */
  feats: Array<FeatInfo>
  hp: {
    method: HpMethod
    /** Rolled totals, one per level gained. Null entries are unrolled. */
    rolls: Array<number | null>
    /** Flat total for `manual`, before the CON modifier. */
    manual: number
  }
  /** Feature names the player is taking. Everything is opt-in. */
  takeFeatures: Array<string>
  /**
   * ASI choices, keyed by the level they're taken at.
   *
   * Sparse: `emptyLevelUpDraft` seeds every crossed level, but a draft
   * assembled by hand — or one whose level range moved — may not have an entry
   * for each, so every read has to cope with a miss.
   */
  asi: Record<number, AsiChoice | undefined>
  /** Set only when this level-up crosses the class's subclass level. */
  subclassName: string
  /**
   * Answers to the choices this level-up poses, keyed by `PickList.id` — the
   * same keyspace and the same shape as `CharacterDraft.picks`.
   *
   * Level-up used to have nowhere to put these, so `applyFeatGrants` dropped
   * `grant.picks` on the floor and a feat taken at 4th level granted strictly
   * less than the same feat taken at 1st. Fourteen published feats were affected
   * — Skilled handed out three proficiencies to a Variant Human and none to
   * anybody else.
   */
  picks: Record<string, Array<string> | undefined>
  /**
   * Cantrip and spell names chosen at this level-up, free text exactly as at
   * creation — a spell on the sheet is just a name, which may be a wiki link,
   * homebrew, or something invented at the table.
   *
   * Separate from `picks` because these are not a `PickList`: how many you may
   * take comes from the class's own progression table rather than from an
   * authored list of options, and the answers are unconstrained.
   */
  cantrips: Array<string>
  spells: Array<string>
  /**
   * Resource rows offered by features gained here, keyed by resource name, and
   * only the ones the player has kept. Pre-filled from the feature's own
   * suggestion; editable and removable before commit.
   */
  resources: Record<
    string,
    // Sparse, and the `undefined` is load-bearing: a row the player dropped is
    // deleted from this record, so "absent" is the answer "no thanks" and
    // every read has to cope with it.
    { total: number; resets?: 'short' | 'long' } | undefined
  >
}

export interface AsiChoice {
  /**
   * `abilities` and `feat` are the two RAW options. `both` is the common house
   * rule — one ability point *and* a feat — offered because plenty of tables
   * play it that way and the alternative is doing it by hand on the sheet
   * afterwards.
   */
  kind: 'abilities' | 'feat' | 'both'
  /** Ability -> points added. */
  abilities: Partial<Record<Ability, number>>
  featName: string
}

/** Points a by-the-book Ability Score Improvement grants. */
export const ASI_POINTS = 2

/** Points the house-rule "+1 and a feat" grants alongside the feat. */
export const ASI_HYBRID_POINTS = 1

/** How many ability points a given choice expects to place. */
export function asiPointsFor(kind: AsiChoice['kind']): number {
  if (kind === 'feat') return 0
  return kind === 'both' ? ASI_HYBRID_POINTS : ASI_POINTS
}

/** The average roll a hit die is taken as, when not rolling: half, round up. */
export function averageHitDie(size: number): number {
  return Math.floor(size / 2) + 1
}

export function emptyAsiChoice(): AsiChoice {
  return { kind: 'abilities', abilities: {}, featName: '' }
}

export function emptyLevelUpDraft(
  c: Character,
  to: number,
  kit: ClassKit | undefined,
  /** Defaulted: a caller with no feat table just gets the free-text behaviour. */
  feats: Array<FeatInfo> = [],
  /**
   * The subclass to seed against, when it is already known — a rebuild of a
   * draft whose archetype the player has chosen. Defaults to the character's
   * own, which is right for a fresh draft.
   */
  subclassName: string = c.subclass,
): LevelUpDraft {
  const from = c.level
  const gained = Math.max(0, to - from)
  return {
    from,
    to,
    base: c,
    kit,
    feats,
    hp: {
      method: 'average',
      rolls: Array<number | null>(gained).fill(null),
      manual: 0,
    },
    // Everything the kit offers is pre-selected: the common case is taking
    // what your class gives you, and unticking is easier than hunting.
    takeFeatures: featuresGained(c, from, to, kit, subclassName).map(
      (f) => f.name,
    ),
    asi: Object.fromEntries(
      asiLevelsCrossed(from, to, kit).map((level) => [level, emptyAsiChoice()]),
    ),
    subclassName,
    picks: {},
    resources: {},
    cantrips: [],
    spells: [],
  }
}

/**
 * Choose a subclass, re-offering the features that choice reveals.
 *
 * `emptyLevelUpDraft` pre-selects everything on offer, because taking what your
 * class gives you is the common case and unticking is easier than hunting. An
 * archetype picked *after* that seeding would otherwise arrive with all its
 * features unticked — the one case where the wizard silently defaults to "no".
 *
 * Only adds. A feature the player has deliberately unticked stays unticked, and
 * switching archetype leaves the previous one's names in the list, where they
 * are harmless: `levelUpPlan` intersects `takeFeatures` with what is actually
 * on offer, so a name with no matching feature grants nothing.
 */
/**
 * Feature names to pre-select for a draft, given the subclass in play.
 *
 * `emptyLevelUpDraft` seeds `takeFeatures` from the character's *existing*
 * subclass, because that is all it knows. An archetype chosen later reveals
 * features that seeding never saw, and they would arrive unticked — the one
 * place the wizard silently defaults to "no". Both `chooseSubclass` and the
 * dialog's rebuild-on-tables-arriving path go through here so neither can
 * forget.
 */
function offeredFeatureNames(
  draft: LevelUpDraft,
  subclassName: string,
): Array<string> {
  return featuresGained(
    draft.base,
    draft.from,
    draft.to,
    draft.kit,
    subclassName,
  ).map((f) => f.name)
}

export function chooseSubclass(
  draft: LevelUpDraft,
  subclassName: string,
): LevelUpDraft {
  const next = { ...draft, subclassName }
  const revealed = offeredFeatureNames(draft, subclassName)
  const have = new Set(draft.takeFeatures.map((n) => n.trim().toLowerCase()))
  const added = revealed.filter((n) => !have.has(n.trim().toLowerCase()))
  if (added.length === 0) return next
  return { ...next, takeFeatures: [...draft.takeFeatures, ...added] }
}

// --- What this level-up offers ---------------------------------------------

/** Levels being gained, e.g. 4 -> 6 yields [5, 6]. */
export function levelsGained(from: number, to: number): Array<number> {
  const out: Array<number> = []
  for (let level = from + 1; level <= to; level++) out.push(level)
  return out
}

/**
 * Class *and subclass* features gained in this range, minus any the sheet
 * already lists.
 *
 * The de-dupe matters: `ClassFeature`'s own doc says features above the
 * character's level are kept so you can plan a build ahead, so a sheet that
 * already has "Extra Attack (Lv5)" is legal data, not a mistake — granting it
 * again would leave a duplicate row the player then has to clean up.
 *
 * The two sources run through one code path, which is what `SubclassInfo`'s doc
 * has always claimed and what this function did not actually do: it read
 * `kit.features` alone, so a Battle Master gained nothing from being a Battle
 * Master at any level. `subclassName` is taken as an argument rather than read
 * off `c.subclass` because the archetype may be getting chosen *in this very
 * level-up* — a Fighter reaching 3rd level picks Battle Master and gains its
 * 3rd-level features in the same pass, and the character doesn't know its own
 * subclass until the commit lands.
 */
export function featuresGained(
  c: Character,
  from: number,
  to: number,
  kit: ClassKit | undefined,
  /** Defaulted so callers with no subclass in hand keep the old behaviour. */
  subclassName: string = c.subclass,
): Array<ClassFeature> {
  if (!kit) return []
  const range = new Set(levelsGained(from, to))
  const have = new Set(
    c.features.map((f) => `${f.level}:${f.name.trim().toLowerCase()}`),
  )
  const subclass = findSubclass(kit, subclassName)
  return [...kit.features, ...(subclass?.features ?? [])]
    .filter((f) => range.has(f.level))
    .filter((f) => !have.has(`${f.level}:${f.name.trim().toLowerCase()}`))
    .map((f): ClassFeature =>
      f.text
        ? { level: f.level, name: f.name, text: f.text }
        : { level: f.level, name: f.name },
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
}

/** ASI levels crossed by this level-up. */
export function asiLevelsCrossed(
  from: number,
  to: number,
  kit: ClassKit | undefined,
): Array<number> {
  if (!kit?.asiLevels) return []
  return kit.asiLevels.filter((level) => level > from && level <= to)
}

/**
 * Whether this level-up crosses the level at which the class picks a subclass,
 * and the character hasn't already got one.
 *
 * The level itself comes from `subclassLevelOf`, which resolves the kit's
 * `subclassLevel`, then the older `subclassAtLevel1` boolean, then the 5e
 * default of 3. A homebrew class that disagrees can still type a subclass on
 * the sheet at any time.
 */
export const SUBCLASS_LEVEL = DEFAULT_SUBCLASS_LEVEL

export function needsSubclass(
  c: Character,
  // Unused since the gate stopped keying on the crossing level-up — see below.
  // Kept because every caller passes a range and dropping it would churn them
  // all to say less.
  _from: number,
  to: number,
  kit: ClassKit | undefined,
): boolean {
  if (!kit || c.subclass.trim() !== '') return false
  const at = subclassLevelOf(kit)
  // `at > from` alone asks only on the level-up that crosses the threshold,
  // which silently excluded every class that picks at level 1: a Cleric's `at`
  // is 1 and every level-up starts at 1 or above, so the step could never
  // appear and a domainless cleric was stuck that way forever. A subclass owed
  // at or below the level being reached is still owed, however late it is
  // noticed. The guard above is what stops it re-asking once one is set.
  return at <= to
}

/**
 * The slot row for a character level: the highest defined level at or below it,
 * so a table only needs rows where the numbers actually change.
 */
export function slotsAtLevel(
  kit: ClassKit | undefined,
  level: number,
  /**
   * The archetype in force, when one is. Trailing and optional so the many
   * callers with no subclass in hand keep reading the class's own table; an
   * Arcane Trickster's slots live on the subclass and are invisible without it.
   */
  subclassName = '',
): Array<number> | undefined {
  const table = spellcastingFor(kit, subclassName)?.slotsByLevel
  if (!table) return undefined
  let best: Array<number> | undefined
  let bestLevel = 0
  for (const [key, row] of Object.entries(table)) {
    const at = Number(key)
    if (at <= level && at > bestLevel) {
      bestLevel = at
      best = row
    }
  }
  return best
}

/**
 * Spells known at a character level, same lookup rule again.
 *
 * Only the "known" casters have a table — a preparer has no cap to track, and
 * `undefined` here means "this class does not count spells known", which is a
 * different answer from 0 and is why the level-up step asks for nothing rather
 * than asking for none.
 */
export function spellsKnownAtLevel(
  kit: ClassKit | undefined,
  level: number,
  /** The archetype in force; see `slotsAtLevel`. */
  subclassName = '',
): number | undefined {
  const table = spellcastingFor(kit, subclassName)?.spellsKnownByLevel
  if (!table) return undefined
  let best: number | undefined
  let bestLevel = 0
  for (const [key, value] of Object.entries(table)) {
    const at = Number(key)
    if (at <= level && at > bestLevel) {
      bestLevel = at
      best = value
    }
  }
  return best
}

/**
 * How many more of something a level-up grants: the table at the new level
 * minus the table at the old one.
 *
 * Floored at 0 so a table that goes backwards — a homebrew typo — asks for
 * nothing rather than a negative number, and `undefined` in means 0 out: a
 * class with no table for this is not owed any.
 */
function gainedBetween(
  lookup: (
    kit: ClassKit | undefined,
    level: number,
    subclassName?: string,
  ) => number | undefined,
  draft: LevelUpDraft,
  subclassName: string,
): number {
  const before = lookup(draft.kit, draft.from, subclassName)
  const after = lookup(draft.kit, draft.to, subclassName)
  if (after === undefined) return 0
  return Math.max(0, after - (before ?? 0))
}

/**
 * The spells and cantrips the player typed, as sheet rows.
 *
 * Trimmed and de-duplicated here rather than at the UI so the plan is the one
 * answer both the summary panel and the commit read — the property that keeps
 * "what it says it will do" and "what it does" from drifting apart.
 */
function chosenSpells(
  draft: LevelUpDraft,
): Array<{ name: string; level: number }> {
  const out: Array<{ name: string; level: number }> = []
  const seen = new Set<string>()
  const take = (names: Array<string>, level: number) => {
    for (const raw of names) {
      const name = raw.trim()
      if (!name) continue
      const key = `${level}:${name.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ name, level })
    }
  }
  take(draft.cantrips, 0)
  take(draft.spells, 1)
  return out
}

/** Cantrips known at a character level, same lookup rule as the slot table. */
export function cantripsAtLevel(
  kit: ClassKit | undefined,
  level: number,
  /** The archetype in force; see `slotsAtLevel`. */
  subclassName = '',
): number | undefined {
  const table = spellcastingFor(kit, subclassName)?.cantripsByLevel
  if (!table) return undefined
  let best: number | undefined
  let bestLevel = 0
  for (const [key, value] of Object.entries(table)) {
    const at = Number(key)
    if (at <= level && at > bestLevel) {
      bestLevel = at
      best = value
    }
  }
  return best
}

/**
 * Where a level-up pick came from, so the step can say "From the Skilled feat"
 * rather than showing three unattributed skill slots.
 *
 * The level-up counterpart of `OwnedPickList` in characterDraft.ts, and
 * deliberately the same shape: one step renders both, and a second shape would
 * mean a second renderer.
 */
export interface LevelUpPick {
  pick: PickList
  owner: string
  ownerKind: 'feat' | 'class' | 'subclass'
}

/**
 * Every choice this level-up poses, in the order they should be answered.
 *
 * Two sources: feats taken at any ASI level crossed here, and features gained
 * from the class or the chosen subclass. Both were previously silent — a feat's
 * picks were dropped at commit, and a feature had no way to carry one at all.
 *
 * `expertise` picks sort last, the same rule `draftOwnedPickLists` follows: what
 * you may double depends on what you are proficient in, so a Skill Expert's two
 * halves have to be answered in that order or the second offers nothing.
 */
export function levelUpPicks(draft: LevelUpDraft): Array<LevelUpPick> {
  const out: Array<LevelUpPick> = []

  // Feats first: an ASI is chosen before the features step in every layout, and
  // a feat's picks are the ones a player is most likely to be waiting on.
  const already = new Set(
    draft.base.feats.map((f) => f.name.trim().toLowerCase()),
  )
  for (const name of featsTaken(draft)) {
    // A feat the character already had grants nothing on a re-take, so it must
    // not ask anything either — `applyLevelUp` refuses to add it twice.
    if (already.has(name.trim().toLowerCase())) continue
    already.add(name.trim().toLowerCase())
    const feat = findFeat(draft.feats, name)
    if (feat) {
      const choice = asiChoicePick(feat)
      if (choice)
        out.push({ pick: choice, owner: feat.name, ownerKind: 'feat' })
    }
    for (const pick of feat?.grant.picks ?? []) {
      out.push({ pick, owner: feat?.name ?? name, ownerKind: 'feat' })
    }
  }

  // Then the features actually being taken. Intersected with `takeFeatures`
  // because features are opt-in: a player who unticked Combat Superiority is
  // not asked to choose manoeuvres for it.
  const taking = new Set(draft.takeFeatures.map((n) => n.trim().toLowerCase()))
  const kit = draft.kit
  if (kit) {
    const subclass = findSubclass(
      kit,
      draft.subclassName || draft.base.subclass,
    )
    const range = new Set(levelsGained(draft.from, draft.to))
    const sources: Array<[Array<ClassFeatureInfo>, LevelUpPick['ownerKind']]> =
      [
        [kit.features, 'class'],
        [subclass?.features ?? [], 'subclass'],
      ]
    for (const [features, ownerKind] of sources) {
      for (const feature of features) {
        if (!range.has(feature.level)) continue
        if (!taking.has(feature.name.trim().toLowerCase())) continue
        for (const pick of feature.picks ?? []) {
          out.push({ pick, owner: feature.name, ownerKind })
        }
      }
    }
  }

  return [
    ...out.filter((o) => o.pick.kind !== 'expertise'),
    ...out.filter((o) => o.pick.kind === 'expertise'),
  ]
}

/**
 * Values a pick should grey out: ones the character already has, and ones
 * already spent on another pick crossed in the same level-up.
 *
 * The level-up counterpart of the creation wizard's `grantedFor`. "Your sheet"
 * is the only source it can name for what the character owns — unlike a draft,
 * a finished character has forgotten which race or background handed each value
 * over — but a value spent on another pick here is named by that pick's owner.
 *
 * Greyed rather than hidden, as everywhere else: a silently missing option
 * reads as the app having lost the choice.
 */
export function grantedAlreadyAt(
  c: Character,
  draft: LevelUpDraft,
  pick: PickList,
  /** All picks this level-up poses; defaulted so callers need not thread it. */
  picks: Array<LevelUpPick> = levelUpPicks(draft),
): Map<string, string> {
  const out = new Map<string, string>()

  // Spent on a sibling pick of the same kind. A Battle Master going 6 -> 10
  // crosses two manoeuvre picks at once, and each has to see the other's
  // answers or the same manoeuvre can be taken twice.
  for (const { pick: other, owner } of picks) {
    if (other.id === pick.id || other.kind !== pick.kind) continue
    for (const value of pickedAt(draft, other.id)) {
      if (!out.has(value)) out.set(value, owner)
    }
  }

  // A `feature` pick's answers live in `Character.features` under the row name
  // the pick writes — "Manoeuvre: Riposte", not "Riposte" — so they are matched
  // by that same construction rather than by the raw option. Without this a
  // 7th-level Battle Master was offered the three manoeuvres they took at 3rd,
  // and `applyFeaturePick` silently swallowed the duplicate.
  if (pick.kind === 'feature') {
    for (const option of pick.options) {
      if (out.has(option)) continue
      const name = pick.featureLabel
        ? `${pick.featureLabel}: ${option}`
        : option
      if (c.features.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
        out.set(option, 'your sheet')
      }
    }
    return out
  }

  const owned =
    pick.kind === 'skill' || pick.kind === 'skillOrTool'
      ? c.skills
      : pick.kind === 'expertise'
        ? c.expertise
        : pick.kind === 'language'
          ? c.languages
          : pick.kind === 'tool'
            ? c.tools
            : []
  for (const value of owned) {
    if (!out.has(value)) out.set(value, 'your sheet')
  }
  return out
}

/**
 * Skills this character may take expertise in — the ones they are already
 * proficient with, plus any being granted by this same level-up.
 *
 * The level-up twin of `eligibleExpertise`, which takes a draft and so could
 * never be reached from here. Without it Skill Expert's second pick offered the
 * class's authored ceiling rather than the character's own skills, which is the
 * thing that makes "two of *your* proficiencies" true.
 */
export function eligibleExpertiseAt(
  c: Character,
  draft: LevelUpDraft,
  pick: PickList,
): Array<string> {
  const owned = new Set(c.skills)
  // Skills granted by another pick in this same level-up count: Skill Expert
  // grants a proficiency and an expertise together, and the whole point is that
  // the second may double the first.
  for (const { pick: other } of levelUpPicks(draft)) {
    if (other.id === pick.id) continue
    if (other.kind !== 'skill' && other.kind !== 'skillOrTool') continue
    for (const value of draft.picks[other.id] ?? []) owned.add(value)
  }
  return pick.options.filter((id) => owned.has(id))
}

/** The values chosen for one level-up pick. */
export function pickedAt(draft: LevelUpDraft, id: string): Array<string> {
  return draft.picks[id] ?? []
}

/** Whether a level-up pick has exactly as many answers as it asked for. */
export function pickSatisfiedAt(draft: LevelUpDraft, pick: PickList): boolean {
  return pickedAt(draft, pick.id).length === pick.count
}

/**
 * Resource rows this level-up offers, from the features being taken.
 *
 * Suggestions, not grants. The wizard pre-fills them and the player accepts,
 * edits or drops each one — see `Character.resources`. A later feature naming
 * the same resource supersedes an earlier one in the same level-up (a Battle
 * Master going 3 -> 10 in one go should be offered five dice, not four).
 */
export function resourcesOffered(draft: LevelUpDraft): Array<{
  name: string
  total: number
  resets?: 'short' | 'long'
  /**
   * What the sheet says today, when this counter is already tracked. Lets the
   * step show "4 -> 5" rather than presenting a raise as a brand-new row.
   */
  from?: number
}> {
  const kit = draft.kit
  if (!kit) return []
  const taking = new Set(draft.takeFeatures.map((n) => n.trim().toLowerCase()))
  const subclass = findSubclass(kit, draft.subclassName || draft.base.subclass)
  const range = new Set(levelsGained(draft.from, draft.to))
  const byName = new Map<
    string,
    { name: string; total: number; resets?: 'short' | 'long'; at: number }
  >()
  for (const feature of [...kit.features, ...(subclass?.features ?? [])]) {
    if (!range.has(feature.level)) continue
    if (!taking.has(feature.name.trim().toLowerCase())) continue
    const offer = feature.resource
    if (!offer) continue
    const prior = byName.get(offer.name.toLowerCase())
    if (prior && prior.at >= feature.level) continue
    byName.set(offer.name.toLowerCase(), { ...offer, at: feature.level })
  }
  return [...byName.values()]
    .sort((a, b) => a.at - b.at || a.name.localeCompare(b.name))
    .flatMap(({ name, total, resets }) => {
      const existing = draft.base.resources.find(
        (r) => r.name.trim().toLowerCase() === name.trim().toLowerCase(),
      )
      // Nothing to offer when the sheet already meets or beats the table: a
      // player who tuned their dice higher is not shown a downgrade, and an
      // unchanged number is not worth a row in the step.
      if (existing && existing.total >= total) return []
      const offer: {
        name: string
        total: number
        resets?: 'short' | 'long'
        from?: number
      } = { name, total }
      if (resets) offer.resets = resets
      if (existing) offer.from = existing.total
      return [offer]
    })
}

/**
 * The half proficiency a feature taken in this level-up confers, or undefined.
 *
 * Mirrors `resourcesOffered` in how it looks: the plan's features are
 * `ClassFeature` rows carrying only level/name/text, so the flag has to be read
 * off the kit and subclass tables the wizard is working from.
 *
 * Gated on the feature actually being *taken*. Everything in this wizard is
 * opt-in, and a player who unticked Jack of All Trades has said they do not
 * want it — quietly setting the field anyway would be the app overruling them.
 *
 * `all` wins over `physical` when a level-up somehow grants both, because it is
 * strictly broader and the alternative is deciding by array order.
 */
export function halfProficiencyGained(
  draft: LevelUpDraft,
  plan: Pick<LevelUpPlan, 'features'>,
): HalfProficiency | undefined {
  const kit = draft.kit
  if (!kit) return undefined
  const taking = new Set(plan.features.map((f) => f.name.trim().toLowerCase()))
  const subclass = findSubclass(kit, draft.subclassName || draft.base.subclass)
  const range = new Set(levelsGained(draft.from, draft.to))
  let found: HalfProficiency | undefined
  for (const feature of [...kit.features, ...(subclass?.features ?? [])]) {
    if (!feature.halfProficiency) continue
    if (!range.has(feature.level)) continue
    if (!taking.has(feature.name.trim().toLowerCase())) continue
    if (feature.halfProficiency === 'all') return 'all'
    found = feature.halfProficiency
  }
  return found
}

/**
 * The subclass's always-prepared rows falling inside this level-up.
 *
 * A domain table unfolds across a career — a Life Domain cleric gains two
 * spells at each of 1, 3, 5, 7 and 9 — so this is keyed on the levels being
 * *gained*, not on whether the archetype was chosen just now. `levelsGained`
 * is exclusive of `from`, so levelling 3 to 5 collects the 5th-level row and
 * not the 3rd the character already has.
 *
 * Rows the sheet already carries are dropped here rather than at apply, so the
 * step shows what is genuinely new: a player who typed Bless in by hand should
 * not be told their domain is handing it over. Matched on name and level, the
 * same key `applySubclassSpells` dedupes on.
 */
export function alwaysPreparedGained(
  draft: LevelUpDraft,
  subclassName: string,
): Array<{ name: string; level: number }> {
  const subclass = findSubclass(draft.kit, subclassName)
  if (!subclass?.spells) return []
  const range = new Set(levelsGained(draft.from, draft.to))
  const have = new Set(
    draft.base.spells.map(
      (sp) => `${sp.level}:${sp.name.trim().toLowerCase()}`,
    ),
  )
  const out: Array<{ name: string; level: number }> = []
  for (const row of subclass.spells) {
    if (!range.has(row.grantedAt)) continue
    for (const name of row.names) {
      const key = `${row.level}:${name.trim().toLowerCase()}`
      if (have.has(key)) continue
      have.add(key)
      out.push({ name, level: row.level })
    }
  }
  return out
}

// --- The plan ---------------------------------------------------------------

export interface SlotChange {
  /** Spell level, 1-9. */
  level: number
  from: number
  to: number
}

/**
 * Everything this level-up will do, computed before anything is written. The
 * wizard's right-hand panel renders exactly this, which is what makes
 * "additive and previewed" visible rather than promised.
 */
export interface LevelUpPlan {
  from: number
  to: number
  hpGained: number
  /**
   * Hit points owed for levels already held because this level-up raised the
   * CON modifier, and hit points from a newly-taken Tough. Broken out from
   * `hpGained` rather than folded into it so the summary panel can say *why*
   * the maximum jumped by more than the dice explain.
   */
  hpRetroactive: number
  hpFromFeats: number
  hpFrom: number
  hpTo: number
  hitDiceFrom: number
  hitDiceTo: number
  proficiencyFrom: number
  proficiencyTo: number
  features: Array<ClassFeature>
  /** Ability -> points, merged across every ASI taken. */
  abilityIncreases: Partial<Record<Ability, number>>
  featsTaken: Array<string>
  slots: Array<SlotChange>
  cantripsFrom: number | undefined
  cantripsTo: number | undefined
  /**
   * How many new cantrips and spells this level-up entitles the player to.
   *
   * A count, not a gate: the step shows it as a tally and never blocks Next,
   * the same bargain every table in this app strikes. 0 for a preparer, whose
   * spells are chosen fresh each day rather than learned.
   */
  cantripsToPick: number
  spellsToPick: number
  /** The spells and cantrips actually chosen, as rows ready for the sheet. */
  spellsAdded: Array<{ name: string; level: number }>
  /**
   * Spells the archetype hands over outright — the Arcane Trickster's Mage
   * Hand. Not a choice, so it is not part of `cantripsToPick`, but the step has
   * to *show* it: a picker reading "0 / 2" beside a sheet that does not list
   * Mage Hand yet reads as though it were still owed, and the grant does not
   * land until Apply.
   */
  spellsGranted: Array<{ name: string; level: number }>
  /**
   * Domain, oath and circle spells reaching the sheet on this level-up —
   * always prepared and outside the prepared limit.
   *
   * Separate from `spellsGranted` because the two fields they come from mean
   * different things. `grant.spells` is a fixed spell handed over once, on the
   * level-up that chooses the archetype. This is a *table* that unfolds as the
   * character grows: a Life Domain cleric's rows arrive at 1, 3, 5, 7 and 9,
   * long after the domain was chosen and every one of those level-ups has a
   * null `subclassName`. Keying this off the chosen-archetype branch would
   * deliver the first row and silently drop the other four.
   */
  alwaysPreparedGained: Array<{ name: string; level: number }>
  subclassName: string | null
  /**
   * Counters to add, already filtered to the ones the player kept. Named rows
   * rather than a count, so the summary can list them.
   */
  resources: Array<CharacterResource>
  preparedLimitFrom: number | undefined
  preparedLimitTo: number | undefined
  /**
   * The ability this character casts with, when a level-up is what makes them a
   * caster at all.
   *
   * Only creation ever set `Character.spellAbility`, which was fine while every
   * caster cast from level 1. An Arcane Trickster becomes one at 3rd, and was
   * left with `null` — so `spellSaveDc` and `spellAttackBonus` both returned
   * null and the sheet could not compute either.
   *
   * `undefined` when there is nothing to say: not a caster, or already set.
   * Never overwrites an ability the sheet already names, in keeping with this
   * file only ever adding.
   */
  spellAbilityTo: Ability | undefined
}

/**
 * Hit points gained. Each level adds a die (rolled, averaged, or typed) plus
 * the CON modifier, and 5e floors that at 1 — a character with a punishing CON
 * still gains a hit point per level rather than losing ground.
 */
export function hpGained(c: Character, draft: LevelUpDraft): number {
  const levels = Math.max(0, draft.to - draft.from)
  if (levels === 0) return 0
  // The CON the character will *have*, not the one they arrived with. An ASI
  // taken in this same level-up raises the modifier before the new hit dice are
  // rolled, so reading the pre-ASI score shorted every level bought alongside a
  // +2 CON. `retroactiveHp` below covers the levels already held.
  const con = abilityMod(c.abilities.con + (mergedAsi(draft).con ?? 0))
  const die = c.hitDice.size

  if (draft.hp.method === 'manual') {
    // A typed total is taken as the whole gain, floored at one per level.
    return Math.max(levels, Math.round(draft.hp.manual))
  }

  let total = 0
  for (let i = 0; i < levels; i++) {
    const rolled =
      draft.hp.method === 'roll' ? (draft.hp.rolls[i] ?? null) : null
    const base = rolled ?? averageHitDie(die)
    total += Math.max(1, base + con)
  }
  return total
}

/**
 * Hit points owed for levels the character *already had*, when this level-up
 * raises the Constitution modifier.
 *
 * 5e is explicit that raising CON raises your maximum for every level, not just
 * the ones bought afterwards. Without this a Fighter who took +2 CON at 4th
 * level was three hit points short for the rest of their career, and the sheet
 * disagreed with every other sheet at the table.
 *
 * Only ever positive: it reads the *modifier* gain, so two points that don't
 * cross a modifier boundary correctly owe nothing, and a hand-lowered score
 * yields zero rather than a negative — `applyLevelUp` never takes HP away.
 */
export function retroactiveHp(c: Character, draft: LevelUpDraft): number {
  const points = mergedAsi(draft).con ?? 0
  if (points <= 0) return 0
  const before = abilityMod(c.abilities.con)
  // The same 20 cap `applyLevelUp` applies, so the preview can't promise hit
  // points the commit then declines to grant.
  const after = abilityMod(Math.min(20, c.abilities.con + points))
  return Math.max(0, after - before) * draft.from
}

/**
 * Hit points from a feat taken in this level-up that raises the maximum per
 * level — Tough, and any homebrew feat authored with `hpPerLevel`.
 *
 * Counted over the *whole* character, `draft.to` levels, because that is what
 * Tough says: your maximum increases by 2 per character level, including the
 * ones behind you. Only feats genuinely being added count, so re-taking a feat
 * the sheet already lists grants nothing — the same rule `mergedAsi` uses for a
 * half-feat's +1, and for the same reason.
 */
export function featHp(c: Character, draft: LevelUpDraft): number {
  const already = new Set(c.feats.map((f) => f.name.trim().toLowerCase()))
  let perLevel = 0
  for (const name of featsTaken(draft)) {
    if (already.has(name.trim().toLowerCase())) continue
    already.add(name.trim().toLowerCase())
    perLevel += findFeat(draft.feats, name)?.grant.hpPerLevel ?? 0
  }
  return perLevel * draft.to
}

/** Ability increases merged across every ASI taken in this level-up. */
export function mergedAsi(
  draft: LevelUpDraft,
): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {}
  // Feats the character already had when the wizard opened. Re-taking one is a
  // no-op, so its half-feat bump must not apply either — otherwise the ability
  // would rise while the grant (correctly) did nothing, and the two halves of
  // one feat would disagree.
  const already = new Set(
    draft.base.feats.map((f) => f.name.trim().toLowerCase()),
  )
  for (const choice of Object.values(draft.asi)) {
    if (!choice) continue
    // A half-feat's own +1 counts however the ASI was spent — including for a
    // pure `feat` choice, where the points come from the feat rather than the
    // improvement. Resolved against the draft's captured feats, so an unknown
    // name contributes nothing, exactly as it does everywhere else.
    const key = choice.featName.trim().toLowerCase()
    const feat = already.has(key) ? undefined : findFeat(draft.feats, key)
    // Grown as it goes, mirroring `applyLevelUp`'s own feat loop: a 4 -> 8
    // level-up crosses three ASI levels chosen independently, and naming the
    // same feat at two of them added its bump twice while `applyLevelUp`
    // (correctly) added the feat once. The two halves have to agree.
    if (feat) already.add(key)
    if (choice.kind !== 'abilities' && feat?.asi) {
      for (const ability of ABILITIES) {
        const points = feat.asi[ability]
        if (!points) continue
        out[ability] = (out[ability] ?? 0) + points
      }
    }
    // A half-feat whose +1 is the player's to place. Worth nothing until they
    // place it — unanswered, the point simply is not granted, which is right:
    // the alternative is guessing an ability on their behalf, and guessing is
    // the bug this replaced.
    if (choice.kind !== 'abilities' && feat?.asiChoice) {
      const answer = draft.picks[asiChoicePickId(feat.id)]?.[0]
      const ability = answer ? abilityForChoice(answer) : undefined
      // Only an ability the feat actually offered; a typed answer outside the
      // list is ignored rather than quietly widening the feat.
      if (ability && feat.asiChoice.includes(ability)) {
        out[ability] = (out[ability] ?? 0) + 1
      }
    }
    // `both` raises an ability as well as granting a feat.
    if (choice.kind === 'feat') continue
    for (const ability of ABILITIES) {
      const points = choice.abilities[ability]
      if (!points) continue
      out[ability] = (out[ability] ?? 0) + points
    }
  }
  return out
}

/**
 * Ability scores as they stand when one ASI level is being chosen — the
 * character's own, plus everything spent at *earlier* ASI levels in this same
 * level-up.
 *
 * Every ASI level used to read `draft.base` directly, so all five a Fighter
 * crosses on the way to 20 showed the same starting score. A player who took
 * Strength 16 -> 18 at the first was still shown 16 at the next four, could
 * "raise to 18" at each, and watched the summary total 20 while every stepper
 * claimed 18. The steppers were each right about a different question and none
 * of them was the one being asked.
 *
 * Excludes the level being chosen, so the stepper still shows what you are
 * raising *from*. Half-feat bumps count too — they are spent points like any
 * other.
 */
export function abilitiesBefore(
  draft: LevelUpDraft,
  atLevel: number,
): Record<Ability, number> {
  const out = { ...draft.base.abilities }
  const already = new Set(
    draft.base.feats.map((f) => f.name.trim().toLowerCase()),
  )
  for (const level of asiLevelsCrossed(draft.from, draft.to, draft.kit)) {
    if (level >= atLevel) continue
    const choice = draft.asi[level]
    if (!choice) continue

    const key = choice.featName.trim().toLowerCase()
    const feat = already.has(key) ? undefined : findFeat(draft.feats, key)
    if (feat) already.add(key)

    if (choice.kind !== 'abilities' && feat?.asi) {
      for (const ability of ABILITIES) {
        out[ability] += feat.asi[ability] ?? 0
      }
    }
    if (choice.kind !== 'abilities' && feat?.asiChoice) {
      const answer = draft.picks[asiChoicePickId(feat.id)]?.[0]
      const ability = answer ? abilityForChoice(answer) : undefined
      if (ability && feat.asiChoice.includes(ability)) out[ability] += 1
    }
    if (choice.kind === 'feat') continue
    for (const ability of ABILITIES) {
      out[ability] += choice.abilities[ability] ?? 0
    }
  }
  // The same cap `applyLevelUp` applies, so a stepper can never offer a point
  // the commit would then decline to grant.
  for (const ability of ABILITIES) out[ability] = Math.min(20, out[ability])
  return out
}

/** Feat names taken via ASI in this level-up, blanks dropped. */
export function featsTaken(draft: LevelUpDraft): Array<string> {
  return Object.values(draft.asi)
    .filter(
      (choice): choice is AsiChoice =>
        choice !== undefined && choice.kind !== 'abilities',
    )
    .map((choice) => choice.featName.trim())
    .filter(Boolean)
}

export function levelUpPlan(c: Character, draft: LevelUpDraft): LevelUpPlan {
  const gained = hpGained(c, draft)
  const retroactive = retroactiveHp(c, draft)
  const fromFeats = featHp(c, draft)
  const taking = new Set(draft.takeFeatures.map((n) => n.trim().toLowerCase()))
  const features = featuresGained(
    c,
    draft.from,
    draft.to,
    draft.kit,
    draft.subclassName || c.subclass,
  ).filter((f) => taking.has(f.name.trim().toLowerCase()))

  // The archetype in force: the one being chosen this level-up if there is one,
  // else what the sheet already says. Same resolution `resourcesOffered` and
  // `levelUpPicks` use, so a third-caster's slots arrive on the very level-up
  // that makes them a caster.
  const castingAs = draft.subclassName || draft.base.subclass
  // The archetype being chosen *by this level-up*, as opposed to one the sheet
  // already names. Null on every later level-up, which is what stops a subclass
  // grant applying twice.
  const subclassChosen =
    needsSubclass(c, draft.from, draft.to, draft.kit) &&
    draft.subclassName.trim() !== ''
      ? draft.subclassName.trim()
      : null
  const before = slotsAtLevel(draft.kit, draft.from, castingAs) ?? []
  const after = slotsAtLevel(draft.kit, draft.to, castingAs) ?? []
  const slots: Array<SlotChange> = []
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    const level = i + 1
    const current =
      (c.spellSlots[level] as { total: number } | undefined)?.total ?? 0
    const next = after[i] ?? 0
    // Only ever an increase: a sheet with more slots than the table (a
    // house rule, a magic item) keeps them.
    if (next > current) slots.push({ level, from: current, to: next })
  }

  const abilityIncreases = mergedAsi(draft)
  const sc = spellcastingFor(draft.kit, castingAs)
  // `mod + level`, the same formula buildCharacter uses at creation — the two
  // must agree or a levelled character drifts from a freshly built one. Never
  // lowered: a sheet with a higher limit has been deliberately house-ruled.
  const preparedLimitTo =
    sc?.prepares && c.preparedLimit > 0
      ? Math.max(
          c.preparedLimit,
          abilityMod(
            c.abilities[sc.ability] + (abilityIncreases[sc.ability] ?? 0),
          ) + draft.to,
        )
      : undefined

  return {
    from: draft.from,
    to: draft.to,
    hpGained: gained,
    hpRetroactive: retroactive,
    hpFromFeats: fromFeats,
    hpFrom: c.hp.max,
    hpTo: c.hp.max + gained + retroactive + fromFeats,
    hitDiceFrom: c.hitDice.total,
    hitDiceTo: setLevel(c, draft.to).hitDice.total,
    proficiencyFrom: proficiencyBonus(c.level),
    proficiencyTo: proficiencyBonus(draft.to),
    features,
    abilityIncreases,
    featsTaken: featsTaken(draft),
    slots,
    cantripsFrom: cantripsAtLevel(draft.kit, draft.from, castingAs),
    cantripsTo: cantripsAtLevel(draft.kit, draft.to, castingAs),
    cantripsToPick: gainedBetween(cantripsAtLevel, draft, castingAs),
    spellsToPick: gainedBetween(spellsKnownAtLevel, draft, castingAs),
    spellsAdded: chosenSpells(draft),
    spellsGranted:
      subclassChosen === null
        ? []
        : (findSubclass(draft.kit, subclassChosen)?.grant?.spells ?? []).map(
            (sp) => ({ name: sp.name, level: sp.level }),
          ),
    alwaysPreparedGained: alwaysPreparedGained(draft, castingAs),
    subclassName: subclassChosen,
    // Only the offers the player kept — `draft.resources` is keyed by name and
    // a dropped row is deleted from it, so an offer with no entry is one they
    // said no to. Fresh counters start unspent.
    resources: resourcesOffered(draft).flatMap(
      (offer): Array<CharacterResource> => {
        const kept = draft.resources[offer.name]
        if (!kept) return []
        const row: CharacterResource = {
          name: offer.name,
          used: 0,
          total: kept.total,
        }
        if (kept.resets) row.resets = kept.resets
        return [row]
      },
    ),
    // Only when the sheet has none: a player who has set their own — a
    // homebrew archetype, a DM ruling — keeps it.
    spellAbilityTo: c.spellAbility === null ? sc?.ability : undefined,
    preparedLimitFrom: c.preparedLimit || undefined,
    preparedLimitTo:
      preparedLimitTo === c.preparedLimit ? undefined : preparedLimitTo,
  }
}

// --- Applying it ------------------------------------------------------------

/**
 * Apply a level-up. Additive only — see the file header.
 *
 * Everything here either appends to an array or raises a number. If you are
 * adding a branch and find yourself replacing a value the player could have
 * set, that is the invariant telling you to make it a separate, explicit
 * action instead.
 */
/** Append strings, skipping blanks and case-insensitive duplicates. */
function addTo(into: Array<string>, from: Array<string> | undefined) {
  const out = [...into]
  for (const value of from ?? []) {
    const trimmed = value.trim()
    if (!trimmed) continue
    if (out.some((v) => v.trim().toLowerCase() === trimmed.toLowerCase())) {
      continue
    }
    out.push(trimmed)
  }
  return out
}

/**
 * What a feat taken at level-up grants.
 *
 * Every field here **adds**; nothing is removed, replaced or lowered, which is
 * `applyLevelUp`'s whole contract. Two things are deliberately left out:
 *
 * - `traits` — those go to `Character.traits`, which the sheet labels "Racial".
 *   A feat's rules text belongs with the feat, and the feat is already there.
 *
 * `picks` used to be listed here too, dropped because "an unresolved choice
 * needs a UI to resolve it". It has one now — the picks step — so the answers
 * are applied by `applyLevelUpPicks` below, through the very same `applyPick`
 * the creation wizard uses. That was the whole bug: Skilled granted three
 * proficiencies at level 1 and nothing at level 4.
 *
 * `spells` *is* applied, unlike those two: a fixed spell needs no UI to resolve
 * — Fey Touched's misty step is known from the feat alone — and appending a
 * spell row is exactly the kind of additive change this function exists for.
 */
function applyFeatGrants(c: Character, grants: Array<Grant>): Character {
  let next = c
  for (const grant of grants) {
    next = {
      ...next,
      skills: addTo(next.skills, grant.skills),
      armor: addTo(next.armor, grant.armor),
      weapons: addTo(next.weapons, grant.weapons),
      tools: addTo(next.tools, grant.tools),
      languages: addTo(next.languages, grant.languages),
      resistances: addTo(next.resistances, grant.resistances),
      conditionImmunities: addTo(
        next.conditionImmunities,
        grant.conditionImmunities,
      ),
      saves: [
        ...next.saves,
        ...(grant.saves ?? []).filter((s) => !next.saves.includes(s)),
      ],
      // Additive, like every other field here — `applyLevelUp` only ever raises
      // numbers, so a feat can add feet but nothing can take them away.
      speed: next.speed + (grant.speedBonus ?? 0),
      // Only feats not already on the sheet reach this, which is what stops a
      // re-take stacking the bonus.
      initiativeBonus: next.initiativeBonus + (grant.initiativeBonus ?? 0),
      // Raised, never lowered, like every other number here. Unlike creation
      // this does not re-check for armour: `computeAc` is not re-run at
      // level-up at all, so AC is whatever the player has on their sheet and
      // this adds to it rather than deriving it afresh.
      ac: next.ac + (grant.acBonus ?? 0),
      // Appended, never replacing a row the player already has: matched on name
      // *and* level so a caster who knows Misty Step keeps their own copy — and
      // whatever they'd set on it — rather than getting a second, blanker one.
      spells: [
        ...next.spells,
        ...(grant.spells ?? [])
          .filter(
            (g) =>
              !next.spells.some(
                (s) => s.name === g.name && s.level === g.level,
              ),
          )
          .map((g) => ({ name: g.name, level: g.level })),
      ],
    }
  }
  return next
}

/**
 * Merge every resolved pick into the character.
 *
 * Runs through `applyPick` / `applyFeaturePick` — the creation wizard's own
 * routing — so a feat grants exactly the same thing whether it was taken at
 * level 1 or at level 12. Two copies of that switch would have drifted the
 * first time a kind was added, which is why it moved to buildCharacter.ts and
 * is imported rather than reimplemented.
 *
 * `applyPick` mutates, and everything above here is copy-on-write, so the
 * character is cloned once before it is handed over. The mutation is confined
 * to that clone; the caller's input is untouched, as `applyLevelUp` promises.
 */
export function applyLevelUpPicks(
  c: Character,
  draft: LevelUpDraft,
): Character {
  const picks = levelUpPicks(draft)
  if (picks.length === 0) return c
  const next: Character = {
    ...c,
    skills: [...c.skills],
    saves: [...c.saves],
    expertise: [...c.expertise],
    tools: [...c.tools],
    languages: [...c.languages],
    weapons: [...c.weapons],
    armor: [...c.armor],
    spells: [...c.spells],
    features: [...c.features],
    inventory: [...c.inventory],
  }
  for (const { pick } of picks) {
    const values = pickedAt(draft, pick.id).filter(Boolean)
    if (values.length === 0) continue
    if (pick.kind === 'feature') applyFeaturePick(next, pick, values)
    else applyPick(next, pick.kind, values)
  }
  return next
}

export function applyLevelUp(c: Character, draft: LevelUpDraft): Character {
  if (draft.to <= draft.from) return c
  const plan = levelUpPlan(c, draft)

  // setLevel owns the level and the hit-dice pinning rule; don't reimplement it.
  let next = setLevel(c, draft.to)

  next = {
    ...next,
    hp: {
      ...next.hp,
      max: next.hp.max + plan.hpGained + plan.hpRetroactive + plan.hpFromFeats,
      // `current` is deliberately untouched: how hurt you are is a fact about
      // the fiction, not something a level-up gets to decide. Healing to full
      // is the player's call.
      current: next.hp.current,
    },
  }

  if (plan.features.length > 0) {
    next = { ...next, features: [...next.features, ...plan.features] }
  }

  // Half proficiency, if a feature taken here confers it — Jack of All Trades,
  // Remarkable Athlete. Applied rather than offered: it is a rule about how
  // `skillBonus` computes, not a number the player tunes, and the sheet still
  // lets them change it afterwards.
  //
  // Read off the *table* features rather than `plan.features`, which are
  // `ClassFeature` rows and carry only level/name/text. Same reason
  // `resourcesOffered` reaches back to the kit.
  const conferred = halfProficiencyGained(draft, plan)
  // Never cleared here, only set: `applyLevelUp` does not take things away, and
  // a character who already has the broader `all` is not narrowed to `physical`
  // by multiclass-ish homebrew that grants both.
  if (conferred && next.halfProficiency === null) {
    next = { ...next, halfProficiency: conferred }
  }

  if (Object.keys(plan.abilityIncreases).length > 0) {
    const abilities = { ...next.abilities }
    for (const ability of ABILITIES) {
      const points = plan.abilityIncreases[ability]
      if (!points) continue
      // 20 is the RAW cap for an ASI; 30 is the sheet's own hard limit.
      abilities[ability] = Math.min(20, abilities[ability] + points)
    }
    next = { ...next, abilities }
  }

  if (plan.featsTaken.length > 0) {
    // Grows as it goes, so a feat named at two ASI levels in the same
    // level-up is added once. Feats are not repeatable, and a set built only
    // from the starting sheet let three ASI slots all take Alert — three rows
    // on the sheet and its bonus applied three times.
    const have = new Set(next.feats.map((f) => f.name.trim().toLowerCase()))
    // Carry the feat's one-line summary onto the sheet alongside its name, the
    // same as the creation wizard does — without it the Features tab lists the
    // feat with "No description yet." A feat the tables don't know contributes
    // its name and nothing else.
    const added: Array<{ name: string; text?: string }> = []
    for (const name of plan.featsTaken) {
      const key = name.trim().toLowerCase()
      if (have.has(key)) continue
      have.add(key)
      const summary = findFeat(draft.feats, name)?.summary.trim()
      added.push(summary ? { name, text: summary } : { name })
    }
    if (added.length > 0) next = { ...next, feats: [...next.feats, ...added] }

    // What the newly-taken feats grant. Only the ones actually added, so
    // re-taking a feat the character already has can't apply its grant twice.
    //
    // Append-only by construction: `addTo` and `addNamed` below never remove or
    // overwrite, which is the invariant this whole function is built on. A feat
    // the tables don't know contributes nothing, and that is not an error.
    const grants = added
      .map((f) => findFeat(draft.feats, f.name)?.grant)
      .filter((g): g is NonNullable<typeof g> => g !== undefined)
    if (grants.length > 0) next = applyFeatGrants(next, grants)

    // Resilient's saving throw follows the ability the player chose, so it
    // cannot be a fixed `grant.saves` — one written before anyone has chosen
    // handed a Resilient (Strength) character a Constitution save.
    for (const { name } of added) {
      const feat = findFeat(draft.feats, name)
      if (!feat?.grantsSaveForAsiChoice) continue
      const answer = draft.picks[asiChoicePickId(feat.id)]?.[0]
      const ability = answer ? abilityForChoice(answer) : undefined
      if (!ability || !feat.asiChoice?.includes(ability)) continue
      if (!next.saves.includes(ability)) {
        next = { ...next, saves: [...next.saves, ability] }
      }
    }
  }

  // The answers to everything this level-up asked. Additive like the rest: the
  // shared `applyPick` merges into the character's own lists and never replaces
  // a value already there.
  next = applyLevelUpPicks(next, draft)

  if (plan.resources.length > 0) {
    // A counter already on the sheet is **raised**, not replaced: a Battle
    // Master reaching 10th level has five superiority dice, and a row stuck at
    // four is the sheet disagreeing with the feature directly above it. Raising
    // is what `applyLevelUp` is allowed to do — it is `Math.max`, so a total the
    // player has tuned *higher* than the table (a magic item, a house rule)
    // keeps their number, exactly like a spell slot.
    //
    // `used` rides along untouched, so a Battle Master who has spent two dice
    // still has two spent — gaining a die is not the same as regaining one.
    const offered = new Map(
      plan.resources.map((r) => [r.name.trim().toLowerCase(), r]),
    )
    const resources = next.resources.map((row) => {
      const offer = offered.get(row.name.trim().toLowerCase())
      if (!offer) return row
      offered.delete(row.name.trim().toLowerCase())
      return offer.total > row.total ? { ...row, total: offer.total } : row
    })
    // Whatever was left is genuinely new. Capped, and a row that would push
    // past the cap is dropped rather than displacing one already there.
    const added = [...offered.values()]
    next = {
      ...next,
      resources:
        added.length > 0
          ? [...resources, ...added].slice(0, MAX_RESOURCES)
          : resources,
    }
  }

  if (plan.slots.length > 0) {
    const spellSlots = { ...next.spellSlots }
    for (const change of plan.slots) {
      const current = spellSlots[change.level] ?? { total: 0, used: 0 }
      spellSlots[change.level] = { ...current, total: change.to }
    }
    next = { ...next, spellSlots }
  }

  if (plan.spellsAdded.length > 0) {
    // Appended, never replacing a row the player already has — the same rule
    // `applyFeatGrants` follows, matched on name *and* level so a spell known
    // as both a cantrip and a levelled spell keeps both rows.
    //
    // Compared case-insensitively after trimming, unlike that function's exact
    // match: these names were typed by hand a moment ago, and "fire bolt"
    // against an existing "Fire Bolt" is the same spell by any reading.
    //
    // Never `prepared`, matching `applyPick`'s spell case: what is prepared is
    // a daily decision the sheet owns, not something learning a spell settles.
    const has = new Set(
      next.spells.map((sp) => `${sp.level}:${sp.name.trim().toLowerCase()}`),
    )
    const added = plan.spellsAdded.filter(
      (sp) => !has.has(`${sp.level}:${sp.name.trim().toLowerCase()}`),
    )
    if (added.length > 0) next = { ...next, spells: [...next.spells, ...added] }
  }

  if (plan.subclassName) {
    next = { ...next, subclass: plan.subclassName }
    // What the archetype itself hands over — the Assassin's two tool
    // proficiencies, a Valor Bard's martial weapons.
    //
    // Only on the level-up that *chooses* it, because `plan.subclassName` is
    // null on every later one, so a grant cannot apply twice. Through
    // `applyFeatGrants` because that is the additive applier already trusted
    // here: it merges into the character's own lists and never overwrites, and
    // it drops `traits`, `items` and `currency` exactly as it does for a feat.
    //
    // Creation applies this through `draftGrants` instead, so a class picking
    // its subclass at level 1 gets it there and this branch never sees one.
    const granted = findSubclass(draft.kit, plan.subclassName)?.grant
    if (granted) next = applyFeatGrants(next, [granted])
  }

  // The domain table. Outside the `plan.subclassName` branch above on purpose:
  // these rows keep arriving for the rest of the character's career, long after
  // the archetype was chosen, and `plan.subclassName` is null on every one of
  // those level-ups. Already filtered against the sheet by `alwaysPreparedGained`,
  // so this appends without re-checking.
  if (plan.alwaysPreparedGained.length > 0) {
    next = {
      ...next,
      spells: [
        ...next.spells,
        ...plan.alwaysPreparedGained.map((sp) => ({
          name: sp.name,
          level: sp.level,
          alwaysPrepared: true,
        })),
      ],
    }
  }

  if (plan.spellAbilityTo !== undefined) {
    next = { ...next, spellAbility: plan.spellAbilityTo }
  }

  if (plan.preparedLimitTo !== undefined) {
    next = { ...next, preparedLimit: plan.preparedLimitTo }
  }

  return next
}

// --- Step machinery ---------------------------------------------------------

export type LevelUpStepId =
  'hp' | 'features' | 'subclass' | 'asi' | 'picks' | 'spells' | 'review'

/**
 * Steps this level-up actually needs, in order.
 *
 * Reads `draft.base`, never a live character: the step list must not change
 * shape while the dialog is open.
 */
export function levelUpSteps(draft: LevelUpDraft): Array<LevelUpStepId> {
  const c = draft.base
  const steps: Array<LevelUpStepId> = ['hp']
  // Subclass *before* features, which is the opposite of the order these were
  // added in and now load-bearing: the archetype chosen here decides which
  // features the next step offers, so asking for them the other way round
  // showed a Fighter an empty features step and then asked what they were.
  if (needsSubclass(c, draft.from, draft.to, draft.kit)) steps.push('subclass')
  if (
    featuresGained(
      c,
      draft.from,
      draft.to,
      draft.kit,
      draft.subclassName || c.subclass,
    ).length > 0
  ) {
    steps.push('features')
  }
  if (asiLevelsCrossed(draft.from, draft.to, draft.kit).length > 0) {
    steps.push('asi')
  }
  // After the ASI, because a feat chosen there is one of the two things that
  // can pose a pick, and before spells, because a chosen cantrip lands on the
  // same sheet section the spells step then reports on.
  if (levelUpPicks(draft).length > 0 || resourcesOffered(draft).length > 0) {
    steps.push('picks')
  }
  // Slots are not the only reason to open this step, and gating on them alone
  // was a real hole: an Arcane Trickster learns a spell at 8th, 11th, 14th and
  // 20th with no slot change at all, so four of their ten spell gains never
  // prompted. The cantrip note above it had been invisible the same way.
  const castingAs = draft.subclassName || draft.base.subclass
  const before = slotsAtLevel(draft.kit, draft.from, castingAs)
  const after = slotsAtLevel(draft.kit, draft.to, castingAs)
  const slotsChanged =
    Boolean(after) && JSON.stringify(before) !== JSON.stringify(after)
  if (
    slotsChanged ||
    gainedBetween(cantripsAtLevel, draft, castingAs) > 0 ||
    gainedBetween(spellsKnownAtLevel, draft, castingAs) > 0
  ) {
    steps.push('spells')
  }
  steps.push('review')
  return steps
}

/**
 * Feats still available to take at one ASI level.
 *
 * 5e feats are not repeatable, so a feat already on the sheet — or already
 * named at another ASI level in this same level-up — is not on offer. Both
 * halves matter: `applyLevelUp` refuses to add a feat the character already
 * has, so offering one meant the player could spend an ASI on nothing at all
 * and never be told, and a 4 -> 8 level-up crosses three ASI levels whose
 * choices are made independently.
 *
 * Free text is untouched, as everywhere else here: this narrows what the
 * suggestion list *offers*, and a name typed by hand still reaches the sheet
 * for a table playing it differently.
 */
export function featsAvailable(
  c: Character,
  draft: LevelUpDraft,
  /** The ASI level being chosen for; its own pick stays available. */
  atLevel: number,
): Array<FeatInfo> {
  const taken = new Set(c.feats.map((f) => f.name.trim().toLowerCase()))
  for (const [level, choice] of Object.entries(draft.asi)) {
    if (Number(level) === atLevel || !choice) continue
    const name = choice.featName.trim().toLowerCase()
    if (name !== '') taken.add(name)
  }
  return draft.feats.filter((f) => !taken.has(f.name.trim().toLowerCase()))
}

/** Whether an ASI choice is complete: two points placed, or a feat named. */
export function asiComplete(
  choice: AsiChoice,
  /**
   * How many points there is anywhere left to put, when the caller knows. A
   * character with every score at 20 has nowhere to spend an improvement, and
   * demanding two placed points would leave the wizard's Next button dead with
   * nothing the player could do about it — the one kind of gate that is a trap
   * rather than a prompt. Omitted, the check is the plain "all points placed".
   */
  headroom?: number,
): boolean {
  const needsFeat = choice.kind !== 'abilities'
  if (needsFeat && choice.featName.trim() === '') return false
  const placed = Object.values(choice.abilities).reduce<number>(
    (sum, n) => sum + n,
    0,
  )
  const wanted = asiPointsFor(choice.kind)
  return placed === Math.min(wanted, headroom ?? wanted)
}

/**
 * The first ASI level in this level-up that is not yet finished, or undefined
 * when they all are.
 *
 * The wizard locks every level after this one. Not a validation rule — nothing
 * here rejects a draft — but a display one, and it exists because each ASI's
 * numbers are only meaningful once the ones before it are settled: a later
 * level shows what your scores will be *when you reach it*, and that answer
 * changes under the player's feet while an earlier level is still being edited.
 *
 * Levels are answered in order, which is also the order they happen in.
 */
export function firstIncompleteAsi(draft: LevelUpDraft): number | undefined {
  return asiLevelsCrossed(draft.from, draft.to, draft.kit).find(
    (level) =>
      !asiComplete(
        draft.asi[level] ?? emptyAsiChoice(),
        asiHeadroom(draft, level),
      ),
  )
}

/**
 * Whether one ASI level is open for editing: every earlier one is complete.
 *
 * The first incomplete level is itself open — it is the one being worked on.
 */
export function asiUnlocked(draft: LevelUpDraft, atLevel: number): boolean {
  const blocked = firstIncompleteAsi(draft)
  return blocked === undefined || atLevel <= blocked
}

/** Points that can still be placed given the 20 cap, across all six abilities. */
export function asiHeadroom(draft: LevelUpDraft, atLevel: number): number {
  const before = abilitiesBefore(draft, atLevel)
  return ABILITIES.reduce((sum, a) => sum + Math.max(0, 20 - before[a]), 0)
}

/**
 * Whether a step has everything it needs. Takes only the draft: every gate here
 * is a question about choices the player has made, not about the character.
 */
export function canAdvance(draft: LevelUpDraft, step: LevelUpStepId): boolean {
  switch (step) {
    case 'hp':
      if (draft.hp.method !== 'roll') return true
      // Every level being taken needs its die rolled before the total means
      // anything.
      return draft.hp.rolls
        .slice(0, Math.max(0, draft.to - draft.from))
        .every((roll) => roll !== null)
    case 'features':
      // All opt-in; taking none is a legitimate choice.
      return true
    case 'subclass':
      return draft.subclassName.trim() !== ''
    case 'asi':
      return asiLevelsCrossed(draft.from, draft.to, draft.kit).every((level) =>
        asiComplete(
          draft.asi[level] ?? emptyAsiChoice(),
          asiHeadroom(draft, level),
        ),
      )
    case 'picks':
      // Every choice answered in full. An unanswered pick is the one kind of
      // incomplete state that silently costs the player something: the feat is
      // already on the sheet by the time they notice.
      return levelUpPicks(draft).every(({ pick }) =>
        pickSatisfiedAt(draft, pick),
      )
    case 'spells':
      // Deliberately ungated, unlike every case around it. The counts are what
      // the table says you may take, not a bill to settle: a player who wants
      // to pick their spells later, or on paper, is not stopped here.
      return true
    case 'review':
      return true
  }
}
