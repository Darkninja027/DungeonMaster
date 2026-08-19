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

import { ABILITIES, abilityMod, proficiencyBonus, setLevel } from './character'
import type { Ability, Character, ClassFeature } from './character'
import type { ClassKit, FeatInfo, Grant } from './srd'
import { DEFAULT_SUBCLASS_LEVEL, findFeat, subclassLevelOf } from './tables'

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
  /** ASI choices, keyed by the level they're taken at. */
  asi: Record<number, AsiChoice>
  /** Set only when this level-up crosses the class's subclass level. */
  subclassName: string
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
    takeFeatures: featuresGained(c, from, to, kit).map((f) => f.name),
    asi: Object.fromEntries(
      asiLevelsCrossed(from, to, kit).map((level) => [level, emptyAsiChoice()]),
    ),
    subclassName: c.subclass,
  }
}

// --- What this level-up offers ---------------------------------------------

/** Levels being gained, e.g. 4 -> 6 yields [5, 6]. */
export function levelsGained(from: number, to: number): Array<number> {
  const out: Array<number> = []
  for (let level = from + 1; level <= to; level++) out.push(level)
  return out
}

/**
 * Class features gained in this range, minus any the sheet already lists.
 *
 * The de-dupe matters: `ClassFeature`'s own doc says features above the
 * character's level are kept so you can plan a build ahead, so a sheet that
 * already has "Extra Attack (Lv5)" is legal data, not a mistake — granting it
 * again would leave a duplicate row the player then has to clean up.
 */
export function featuresGained(
  c: Character,
  from: number,
  to: number,
  kit: ClassKit | undefined,
): Array<ClassFeature> {
  if (!kit) return []
  const range = new Set(levelsGained(from, to))
  const have = new Set(
    c.features.map((f) => `${f.level}:${f.name.trim().toLowerCase()}`),
  )
  return kit.features
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
  from: number,
  to: number,
  kit: ClassKit | undefined,
): boolean {
  if (!kit || c.subclass.trim() !== '') return false
  const at = subclassLevelOf(kit)
  return at > from && at <= to
}

/**
 * The slot row for a character level: the highest defined level at or below it,
 * so a table only needs rows where the numbers actually change.
 */
export function slotsAtLevel(
  kit: ClassKit | undefined,
  level: number,
): Array<number> | undefined {
  const table = kit?.spellcasting?.slotsByLevel
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

/** Cantrips known at a character level, same lookup rule as the slot table. */
export function cantripsAtLevel(
  kit: ClassKit | undefined,
  level: number,
): number | undefined {
  const table = kit?.spellcasting?.cantripsByLevel
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
  subclassName: string | null
  preparedLimitFrom: number | undefined
  preparedLimitTo: number | undefined
}

/**
 * Hit points gained. Each level adds a die (rolled, averaged, or typed) plus
 * the CON modifier, and 5e floors that at 1 — a character with a punishing CON
 * still gains a hit point per level rather than losing ground.
 */
export function hpGained(c: Character, draft: LevelUpDraft): number {
  const levels = Math.max(0, draft.to - draft.from)
  if (levels === 0) return 0
  const con = abilityMod(c.abilities.con)
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
    // A half-feat's own +1 counts however the ASI was spent — including for a
    // pure `feat` choice, where the points come from the feat rather than the
    // improvement. Resolved against the draft's captured feats, so an unknown
    // name contributes nothing, exactly as it does everywhere else.
    const feat = already.has(choice.featName.trim().toLowerCase())
      ? undefined
      : findFeat(draft.feats, choice.featName)
    if (choice.kind !== 'abilities' && feat?.asi) {
      for (const ability of ABILITIES) {
        const points = feat.asi[ability]
        if (!points) continue
        out[ability] = (out[ability] ?? 0) + points
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

/** Feat names taken via ASI in this level-up, blanks dropped. */
export function featsTaken(draft: LevelUpDraft): Array<string> {
  return Object.values(draft.asi)
    .filter((choice) => choice.kind !== 'abilities')
    .map((choice) => choice.featName.trim())
    .filter(Boolean)
}

export function levelUpPlan(c: Character, draft: LevelUpDraft): LevelUpPlan {
  const gained = hpGained(c, draft)
  const taking = new Set(draft.takeFeatures.map((n) => n.trim().toLowerCase()))
  const features = featuresGained(c, draft.from, draft.to, draft.kit).filter(
    (f) => taking.has(f.name.trim().toLowerCase()),
  )

  const before = slotsAtLevel(draft.kit, draft.from) ?? []
  const after = slotsAtLevel(draft.kit, draft.to) ?? []
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
  const sc = draft.kit?.spellcasting
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
    hpFrom: c.hp.max,
    hpTo: c.hp.max + gained,
    hitDiceFrom: c.hitDice.total,
    hitDiceTo: setLevel(c, draft.to).hitDice.total,
    proficiencyFrom: proficiencyBonus(c.level),
    proficiencyTo: proficiencyBonus(draft.to),
    features,
    abilityIncreases,
    featsTaken: featsTaken(draft),
    slots,
    cantripsFrom: cantripsAtLevel(draft.kit, draft.from),
    cantripsTo: cantripsAtLevel(draft.kit, draft.to),
    subclassName:
      needsSubclass(c, draft.from, draft.to, draft.kit) &&
      draft.subclassName.trim() !== ''
        ? draft.subclassName.trim()
        : null,
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
 * - `picks` — an unresolved choice needs a UI to resolve it, and the level-up
 *   ASI step has no pick control. A feat whose grant is entirely a pick still
 *   lands on the sheet by name for the player to fill in by hand.
 * - `traits` — those go to `Character.traits`, which the sheet labels "Racial".
 *   A feat's rules text belongs with the feat, and the feat is already there.
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
    }
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
      max: next.hp.max + plan.hpGained,
      // `current` is deliberately untouched: how hurt you are is a fact about
      // the fiction, not something a level-up gets to decide. Healing to full
      // is the player's call.
      current: next.hp.current,
    },
  }

  if (plan.features.length > 0) {
    next = { ...next, features: [...next.features, ...plan.features] }
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
    const have = new Set(next.feats.map((f) => f.name.trim().toLowerCase()))
    // Carry the feat's one-line summary onto the sheet alongside its name, the
    // same as the creation wizard does — without it the Features tab lists the
    // feat with "No description yet." A feat the tables don't know contributes
    // its name and nothing else.
    const added = plan.featsTaken
      .filter((name) => !have.has(name.toLowerCase()))
      .map((name) => {
        const summary = findFeat(draft.feats, name)?.summary.trim()
        return summary ? { name, text: summary } : { name }
      })
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
  }

  if (plan.slots.length > 0) {
    const spellSlots = { ...next.spellSlots }
    for (const change of plan.slots) {
      const current = spellSlots[change.level] ?? { total: 0, used: 0 }
      spellSlots[change.level] = { ...current, total: change.to }
    }
    next = { ...next, spellSlots }
  }

  if (plan.subclassName) {
    next = { ...next, subclass: plan.subclassName }
  }

  if (plan.preparedLimitTo !== undefined) {
    next = { ...next, preparedLimit: plan.preparedLimitTo }
  }

  return next
}

// --- Step machinery ---------------------------------------------------------

export type LevelUpStepId =
  'hp' | 'features' | 'subclass' | 'asi' | 'spells' | 'review'

/**
 * Steps this level-up actually needs, in order.
 *
 * Reads `draft.base`, never a live character: the step list must not change
 * shape while the dialog is open.
 */
export function levelUpSteps(draft: LevelUpDraft): Array<LevelUpStepId> {
  const c = draft.base
  const steps: Array<LevelUpStepId> = ['hp']
  if (featuresGained(c, draft.from, draft.to, draft.kit).length > 0) {
    steps.push('features')
  }
  if (needsSubclass(c, draft.from, draft.to, draft.kit)) steps.push('subclass')
  if (asiLevelsCrossed(draft.from, draft.to, draft.kit).length > 0) {
    steps.push('asi')
  }
  const before = slotsAtLevel(draft.kit, draft.from)
  const after = slotsAtLevel(draft.kit, draft.to)
  if (after && JSON.stringify(before) !== JSON.stringify(after)) {
    steps.push('spells')
  }
  steps.push('review')
  return steps
}

/** Whether an ASI choice is complete: two points placed, or a feat named. */
export function asiComplete(choice: AsiChoice): boolean {
  const needsFeat = choice.kind !== 'abilities'
  if (needsFeat && choice.featName.trim() === '') return false
  const placed = Object.values(choice.abilities).reduce<number>(
    (sum, n) => sum + n,
    0,
  )
  return placed === asiPointsFor(choice.kind)
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
        asiComplete(draft.asi[level] ?? emptyAsiChoice()),
      )
    case 'spells':
      return true
    case 'review':
      return true
  }
}
