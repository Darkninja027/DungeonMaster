/**
 * Resolve a wizard draft into the two things a character article needs: the
 * sheet frontmatter and the prose body.
 *
 * **Pure and total.** A half-filled draft yields a half-filled character rather
 * than throwing, which is what lets the live summary panel call this on every
 * keystroke. Every SRD lookup is optional-chained and every list defaulted; if
 * you add a branch here, keep that property or the wizard blanks mid-typing.
 *
 * **Everything written is a plain string.** A race, background or class the SRD
 * tables don't know contributes its name and nothing else, exactly as if it had
 * been typed into the sheet by hand. No id ever reaches disk.
 */

import {
  abilityMod,
  emptyCharacter,
  MAX_RESOURCES,
  proficiencyBonus,
  skillIdFor,
  SKILLS,
} from './character'
import type {
  Ability,
  Character,
  CharacterResource,
  ClassFeature,
  InventoryItem,
  NamedEntry,
} from './character'
import { baseScores } from './abilityMethods'
import {
  abilityForChoice,
  asiChoicePickId,
  draftBackground,
  draftClassInfo,
  draftFeat,
  draftGrants,
  draftKit,
  draftPickLists,
  draftRace,
  draftSubclass,
  draftSubrace,
  picked,
  racialAsi,
} from './characterDraft'
import type { CharacterDraft } from './characterDraft'
import {
  SHIELD_AC_BONUS,
  armorEntry,
  featuresUpToLevel,
  isShield,
  weaponCategory,
  weaponEntry,
} from './srd'
import type {
  Grant,
  GrantItem,
  PickKind,
  PickList,
  SubclassSpells,
} from './srd'
import { castsAtLevel1, spellcastingFor } from './tables'

/** Ability scores after racial increases, clamped to the parser's 1-30 range. */
export function finalScores(draft: CharacterDraft): Record<Ability, number> {
  const base = baseScores(draft.abilities)
  const asi = racialAsi(draft)
  const out = {} as Record<Ability, number>
  for (const [key, value] of Object.entries(base)) {
    const ability = key as Ability
    const raised = value + (asi[ability] ?? 0)
    out[ability] = Math.max(1, Math.min(30, raised))
  }
  return out
}

/** Append, keeping the first spelling of any case-insensitive duplicate. */
function mergeList(into: Array<string>, from: Array<string> | undefined) {
  for (const value of from ?? []) {
    const trimmed = value.trim()
    if (!trimmed) continue
    if (into.some((v) => v.toLowerCase() === trimmed.toLowerCase())) continue
    into.push(trimmed)
  }
}

/** Append named entries, de-duplicated by name. */
function mergeNamed(
  into: Array<NamedEntry>,
  from: Array<NamedEntry> | undefined,
) {
  for (const entry of from ?? []) {
    if (!entry.name.trim()) continue
    if (into.some((e) => e.name.toLowerCase() === entry.name.toLowerCase())) {
      continue
    }
    into.push(
      entry.text
        ? { name: entry.name, text: entry.text }
        : { name: entry.name },
    )
  }
}

/**
 * One grant item as an inventory row. `fits` is spread only when the table set
 * it, so an unset value falls through to `guessSlot` on the sheet rather than
 * being pinned to "nothing".
 */
function toInventoryItem(item: GrantItem): InventoryItem {
  return {
    text: item.text,
    qty: item.qty ?? 1,
    weight: item.weight ?? 0,
    slot: null,
    ...(item.fits !== undefined ? { fits: item.fits } : {}),
  }
}

/** Merge one grant's list fields into a character in place. */
function applyGrant(c: Character, grant: Grant) {
  // Additive, and applied here so the level-up path gets it too: that path
  // reaches `applyGrant` through `applyFeaturePick` and never re-derives AC, so
  // a bonus summed only in `buildCharacter` was silently lost after creation.
  // Creation still sums it separately, because only there can the "while
  // wearing armour" condition be checked against the inventory the kit built —
  // see the `wearingArmor` guard below, which is why this line skips a grant
  // that creation will account for itself.
  c.ac += grant.acBonus ?? 0
  mergeList(c.skills, grant.skills)
  mergeList(c.armor, grant.armor)
  mergeList(c.weapons, grant.weapons)
  mergeList(c.tools, grant.tools)
  mergeList(c.languages, grant.languages)
  mergeList(c.resistances, grant.resistances)
  mergeList(c.conditionImmunities, grant.conditionImmunities)
  mergeNamed(c.traits, grant.traits)
  for (const save of grant.saves ?? []) {
    if (!c.saves.includes(save)) c.saves.push(save)
  }
  for (const item of grant.items ?? []) {
    const row = toInventoryItem(item)
    // Same item from two sources stacks rather than listing twice.
    const existing = c.inventory.find(
      (i) => i.text.toLowerCase() === row.text.toLowerCase(),
    )
    if (existing) existing.qty += row.qty
    else c.inventory.push(row)
  }
  for (const [coin, amount] of Object.entries(grant.currency ?? {})) {
    const key = coin as keyof Character['currency']
    c.currency[key] += amount
  }
  applyGrantSpells(c, grant)
}

/**
 * Spells a grant hands over outright — Fey Touched's misty step and friends.
 *
 * Never `prepared` and never `alwaysPrepared`: these are cast once per long rest
 * without spending a slot, so counting them against `preparedLimit` would charge
 * a caster for something free, and `alwaysPrepared` would imply a domain-spell
 * relationship they don't have. A non-caster who takes the feat gets the spell
 * with no slots at all, which is exactly how the feat works.
 *
 * Shared with the level-up path, which needs the same rule.
 */
export function applyGrantSpells(c: Character, grant: Grant): void {
  for (const spell of grant.spells ?? []) {
    // Name *and* level, so a caster who already knows Misty Step as a 2nd-level
    // spell isn't handed a duplicate row, while a same-named cantrip survives.
    if (
      !c.spells.some((s) => s.name === spell.name && s.level === spell.level)
    ) {
      c.spells.push({ name: spell.name, level: spell.level })
    }
  }
}

/**
 * A subclass's always-prepared table — domain, oath and circle spells.
 *
 * The counterpart to `applyGrantSpells` above and deliberately *not* the same
 * function, because the two fields mean different things. `Grant.spells` is a
 * fixed spell handed over once; `SubclassInfo.spells` is a table that unfolds
 * with the character, and its rows are **always prepared and exempt from the
 * prepared limit** — which is what `alwaysPrepared` models and the entire
 * reason a Life Domain cleric can carry Bless without spending a preparation
 * on it. `preparedCount` counts only `'prepared'`, so setting the flag is what
 * makes the exemption real.
 *
 * `grantedAt` is the **character** level and `level` the **spell** level; they
 * are different numbers and conflating them is the easy mistake here.
 *
 * Idempotent, and it has to be: `Character.spells` is a flat list with no
 * per-source grouping, so a domain spell is indistinguishable from a
 * hand-typed one and re-running this at every level-up must not duplicate a
 * row. Deduped on name and level exactly as `applyGrantSpells` is.
 *
 * Never lowers or unsets anything. A spell the player already had as an
 * ordinary prepared spell keeps whatever they set — this appends what is
 * missing rather than restating the table, because a character is somebody's
 * work.
 */
export function applySubclassSpells(
  c: Character,
  subclass: { spells?: Array<SubclassSpells> } | undefined,
  level: number,
): void {
  for (const row of subclass?.spells ?? []) {
    if (row.grantedAt > level) continue
    for (const name of row.names) {
      if (!c.spells.some((s) => s.name === name && s.level === row.level)) {
        c.spells.push({ name, level: row.level, alwaysPrepared: true })
      }
    }
  }
}

/**
 * Whether a weapon proficiency is already implied by a category the character
 * has. A weapon `WEAPON_CATEGORY_OF` doesn't know is never covered, so homebrew
 * still gets named individually.
 */
function coveredByCategory(c: Character, weapon: string): boolean {
  const category = weaponCategory(weapon)
  if (!category) return false
  return c.weapons.some((w) => w.trim().toLowerCase() === category)
}

/**
 * Route one resolved pick's values into the character fields its kind belongs
 * to. Mutates in place and only ever merges — nothing here removes or replaces.
 *
 * Exported and taking `(character, kind, values)` rather than a draft, because
 * the level-up wizard resolves the same picks against a finished `Character`
 * with no draft in sight. Both callers must stay on this one implementation: a
 * feat's Skilled pick has to land in the same place whether it was taken at
 * level 1 by a Variant Human or at level 4 through an ASI, and two copies of
 * this switch would drift apart the first time a kind was added.
 */
export function applyPick(c: Character, kind: PickKind, values: Array<string>) {
  if (values.length === 0) return
  switch (kind) {
    case 'skill':
      // Through `skillIdFor` so a typed display name — "Animal Handling"
      // rather than `animal-handling` — becomes the id the sheet stores.
      // Without it the filter at the end of `buildCharacter` drops the value
      // and the player silently loses a proficiency they chose. A value that
      // is no skill at all is left as-is for that same filter to reject.
      mergeList(
        c.skills,
        values.map((v) => skillIdFor(v) ?? v),
      )
      break
    case 'skillOrTool':
      // The one kind whose values do not share a destination, so it routes
      // per value rather than per pick: a skill becomes its id, and anything
      // else is a tool, stored verbatim because tools are free text.
      for (const value of values) {
        const id = skillIdFor(value)
        if (id) mergeList(c.skills, [id])
        else mergeList(c.tools, [value])
      }
      break
    case 'expertise':
      // Expertise, not proficiency: `skillBonus` doubles the bonus for these.
      // Filing them in `c.skills` would quietly hand back a plain proficiency
      // the character usually already has.
      mergeList(
        c.expertise,
        values.map((v) => skillIdFor(v) ?? v),
      )
      break
    case 'tool':
      mergeList(c.tools, values)
      break
    case 'language':
      mergeList(c.languages, values)
      break
    case 'weapon':
      // A granted weapon is a thing you carry, and *sometimes* also a
      // proficiency. Listing "Battleaxe" beside the "martial" category a
      // paladin already has is noise, not information — the category
      // already covers it. So only name a weapon individually when no
      // category the character has would include it.
      mergeList(
        c.weapons,
        values.filter((v) => !coveredByCategory(c, v)),
      )
      for (const value of values) {
        const existing = c.inventory.find(
          (i) => i.text.toLowerCase() === value.toLowerCase(),
        )
        if (existing) existing.qty += 1
        else c.inventory.push({ text: value, qty: 1, weight: 0, slot: null })
      }
      break
    case 'armor':
      mergeList(c.armor, values)
      break
    case 'cantrip':
      for (const name of values) {
        if (!c.spells.some((s) => s.name === name)) {
          c.spells.push({ name, level: 0 })
        }
      }
      break
    case 'spell':
      // Level 1, and never `prepared`. Every spell pick in the tables is a
      // 1st-level one (Fey Touched, Shadow Touched, Magic Initiate, Ritual
      // Caster, Artificer Initiate), and all of them are cast without
      // spending a slot — once per long rest, or from a ritual book. Marking
      // them prepared would spend a caster's preparation limit on a spell
      // that never needed it, and a rogue who took Fey Touched has no limit
      // to spend at all.
      //
      // Matched on name *and* level, unlike the cantrip case above: a caster
      // can legitimately know the cantrip and the 1st-level spell of the same
      // name, and Magic Initiate hands out one of each.
      for (const name of values) {
        if (!c.spells.some((s) => s.name === name && s.level === 1)) {
          c.spells.push({ name, level: 1 })
        }
      }
      break
    case 'feature':
      // A choice whose answer *is* a feature: a Fighter's Fighting Style, a
      // Battle Master's manoeuvres. The value carries the chosen name and the
      // pick's `featureText` the rules reminder, so it lands as a real row on
      // the Features tab rather than being recorded and dropped.
      //
      // Level 0 and de-duped by name alone: unlike a class feature, this is not
      // gained *at* a level in any meaningful sense — it is an answer, and the
      // level it was answered at is not a fact worth pinning. `featureRow`
      // below is what actually writes it, because the text lives on the pick.
      break
    default:
      // 'other' carries no single home on the sheet; it surfaces in the body
      // and on the traits the option belongs to.
      break
  }
}

/**
 * Grants carried by the options a player has chosen in `feature` picks.
 *
 * Separate from `draftGrants`, which walks the fixed sources — race, subrace,
 * background, feat, class, equipment. A feature pick's grant belongs to an
 * *answer*, so it cannot be known until the answer is given.
 */
function featurePickGrants(draft: CharacterDraft): Array<Grant> {
  const out: Array<Grant> = []
  // De-duped by the row name the pick writes, matching `applyFeaturePick`: it
  // refuses to add a second "Fighting Style: Defense" row, so the bonus must
  // not be counted a second time either. A draft holding the same answer twice
  // is reachable — a stale value plus a re-pick — and the two halves of one
  // choice have to agree about how many times it happened.
  const seen = new Set<string>()
  for (const pick of draftPickLists(draft)) {
    if (pick.kind !== 'feature') continue
    for (const value of picked(draft, pick.id)) {
      const name = (
        pick.featureLabel ? `${pick.featureLabel}: ${value}` : value
      ).toLowerCase()
      if (seen.has(name)) continue
      seen.add(name)
      const grant = pick.featureGrant?.[value]
      if (grant) out.push(grant)
    }
  }
  return out
}

/** Merge the player's resolved pick lists into the right character fields. */
function applyPicks(c: Character, draft: CharacterDraft) {
  for (const pick of draftPickLists(draft)) {
    const values = picked(draft, pick.id).filter(Boolean)
    if (values.length === 0) continue
    if (pick.kind === 'feature') {
      applyFeaturePick(c, pick, values)
      continue
    }
    applyPick(c, pick.kind, values)
  }
}

/**
 * A `feature` pick's chosen values, as rows on the sheet.
 *
 * Separate from `applyPick` because it needs the whole `PickList` — the rules
 * text for each option lives on the pick as `featureText`, keyed by option, and
 * a bare `(kind, values)` call cannot reach it.
 */
export function applyFeaturePick(
  c: Character,
  pick: PickList,
  values: Array<string>,
) {
  for (const value of values) {
    const name = pick.featureLabel ? `${pick.featureLabel}: ${value}` : value
    if (c.features.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      continue
    }
    const text = pick.featureText?.[value]
    c.features.push(text ? { level: 0, name, text } : { level: 0, name })
    // The row *and* whatever it grants. Inside the de-dupe guard, so choosing a
    // style already on the sheet cannot apply its bonus a second time.
    const grant = pick.featureGrant?.[value]
    if (grant) applyGrant(c, grant)
  }
}

/**
 * Starting AC. Reads the inventory the kit actually produced, so it agrees with
 * what the player sees in their pack. Falls back to 10 + DEX, which is also
 * what an unarmored character gets.
 */
export function computeAc(
  character: Character,
  unarmoredDefense?: 'con' | 'wis',
): number {
  const dex = abilityMod(character.abilities.dex)
  const shield = character.inventory.some((i) => isShield(i.text))
    ? SHIELD_AC_BONUS
    : 0

  let best: { base: number; dexCap: number | null } | null = null
  for (const item of character.inventory) {
    const entry = armorEntry(item.text)
    if (!entry) continue
    if (!best || entry.base > best.base) best = entry
  }

  if (!best) {
    // Barbarian and Monk compute AC from ability scores while unarmored;
    // without this they show a visibly wrong starting number.
    if (unarmoredDefense === 'con') {
      return 10 + dex + abilityMod(character.abilities.con) + shield
    }
    if (unarmoredDefense === 'wis') {
      // The monk's version explicitly does not work with a shield.
      return 10 + dex + abilityMod(character.abilities.wis)
    }
    return 10 + dex + shield
  }

  const dexBonus = best.dexCap === null ? dex : Math.min(dex, best.dexCap)
  return best.base + dexBonus + shield
}

/** Attack rows for the weapons the kit granted. Silent on anything unknown. */
function deriveAttacks(character: Character, level: number) {
  const prof = proficiencyBonus(level)
  const str = abilityMod(character.abilities.str)
  const dex = abilityMod(character.abilities.dex)
  const attacks: Character['attacks'] = []
  for (const item of character.inventory) {
    const weapon = weaponEntry(item.text)
    if (!weapon) continue
    if (attacks.some((a) => a.name.toLowerCase() === item.text.toLowerCase())) {
      continue
    }
    // Finesse takes the better of the two, which is what a player would do.
    const mod = weapon.ranged ? dex : weapon.finesse ? Math.max(str, dex) : str
    const damage =
      mod === 0 ? weapon.damage : `${weapon.damage}${mod > 0 ? '+' : ''}${mod}`
    attacks.push({ name: item.text, bonus: prof + mod, damage })
  }
  return attacks
}

/** The markdown body: identity subtitle, personality, backstory. */
export function buildBody(draft: CharacterDraft): string {
  const name = draft.name.trim() || 'Unnamed character'
  const race = draft.subraceName.trim() || draft.raceName.trim()
  const identity = [race, draft.className.trim(), draft.subclassName.trim()]
    .filter(Boolean)
    .join(' ')
  const subtitle = [
    identity,
    draft.backgroundName.trim(),
    draft.alignment.trim(),
  ]
    .filter(Boolean)
    .join(' · ')

  const lines = [`# ${name}`]
  if (subtitle) lines.push('', `*${subtitle}*`)

  const { trait, ideal, bond, flaw } = draft.personality
  const personality: Array<string> = []
  if (trait.trim()) personality.push(`**Trait.** ${trait.trim()}`)
  if (ideal.trim()) personality.push(`**Ideal.** ${ideal.trim()}`)
  if (bond.trim()) personality.push(`**Bond.** ${bond.trim()}`)
  if (flaw.trim()) personality.push(`**Flaw.** ${flaw.trim()}`)
  if (personality.length > 0) {
    lines.push('', '## Personality', '', ...personality)
  }

  lines.push('', '## Backstory', '')
  lines.push(
    draft.backstory.trim() ||
      'Where they came from, who they left behind, and what they are running toward.',
  )

  return lines.join('\n')
}

export function buildCharacter(draft: CharacterDraft): {
  character: Character
  body: string
} {
  const c = emptyCharacter()
  const race = draftRace(draft)
  const subrace = draftSubrace(draft)
  const background = draftBackground(draft)
  const kit = draftKit(draft)
  const classInfo = draftClassInfo(draft)

  // Identity. The sheet says "Hill Dwarf", not "Dwarf" — a subrace is what a
  // player calls themselves, and findSubrace resolves the full name back.
  // Null unless the wizard was told to pin one (the vault), in which case the
  // sheet states its own edition because its folder cannot.
  c.ruleset = draft.ruleset
  c.race = draft.subraceName.trim() || draft.raceName.trim()
  c.class = draft.className.trim()
  c.subclass = draft.subclassName.trim()
  c.background = draft.backgroundName.trim()
  c.alignment = draft.alignment.trim()
  c.level = 1

  c.abilities = finalScores(draft)

  // The world's class list owns the hit die; a homebrew class keeps its own.
  const hitDie = classInfo?.hitDie ?? 8
  c.hitDice = { size: hitDie, total: 1, used: 0 }

  for (const grant of draftGrants(draft)) applyGrant(c, grant)
  applyPicks(c, draft)

  if (background) mergeNamed(c.traits, [background.feature])

  // Base from the race, then anything additive on top. The base is assigned
  // here rather than inside `applyGrant` because a subrace *replaces* its
  // parent's speed (Wood Elf's 35) while a feat *adds* to whatever you have —
  // summing after the fact keeps those two from clobbering each other.
  c.speed =
    (subrace?.speed ?? race?.speed ?? 30) +
    draftGrants(draft).reduce((sum, grant) => sum + (grant.speedBonus ?? 0), 0)

  // Nothing else writes this at creation, so it is a plain sum rather than the
  // base-plus-bonus dance speed needs above. Assigned, not `+=`: this function
  // is total and the live summary panel re-runs it on every keystroke.
  c.initiativeBonus = draftGrants(draft).reduce(
    (sum, grant) => sum + (grant.initiativeBonus ?? 0),
    0,
  )

  const conMod = abilityMod(c.abilities.con)
  // A grant's `hpPerLevel` alongside the subrace's: at level 1 both are worth
  // exactly one level, so a Variant Human who took Tough starts with its +2 the
  // same way a Hill Dwarf starts with its +1.
  const grantHpPerLevel = draftGrants(draft).reduce(
    (sum, grant) => sum + (grant.hpPerLevel ?? 0),
    0,
  )
  const hpMax = Math.max(
    1,
    hitDie + conMod + (subrace?.hpPerLevel ?? 0) + grantHpPerLevel,
  )
  c.hp = { current: hpMax, max: hpMax, temp: 0 }

  // Grants that raise AC — the Defense fighting style's +1 — on top of what
  // armour and Dexterity derive. Only while actually wearing armour, which is
  // the half of Defense the `acBonus` field itself cannot express: it is
  // checked here, once, because this is the only place that can see both the
  // grant and the inventory the kit produced.
  //
  // This **assigns**, which deliberately discards the increments `applyGrant`
  // made while merging those same grants above. AC is derived at creation and
  // merely adjusted afterwards, so the two paths cannot share one line: keep
  // the assignment last, or a Defense fighter starts with +2.
  const wearingArmor = c.inventory.some(
    (item) => armorEntry(item.text) !== null && !isShield(item.text),
  )
  const acBonus = wearingArmor
    ? draftGrants(draft).reduce((sum, grant) => sum + (grant.acBonus ?? 0), 0) +
      // A `feature` pick's grant is not part of `draftGrants` — it hangs off
      // the chosen option rather than off a race, class or background — so it
      // is summed from the picks the player has answered.
      featurePickGrants(draft).reduce(
        (sum, grant) => sum + (grant.acBonus ?? 0),
        0,
      )
    : 0
  c.ac = computeAc(c, kit?.unarmoredDefense) + acBonus

  // Resilient's saving throw follows the ability the player chose, so it is not
  // a fixed `grant.saves` — one written before anyone has chosen handed a
  // Resilient (Strength) character a Constitution save. Mirrors the same step
  // in `applyLevelUp`, so the feat is worth the same at level 1 and at level 8.
  const feat = draftFeat(draft)
  if (feat?.grantsSaveForAsiChoice) {
    const answer = picked(draft, asiChoicePickId(feat.id))[0]
    const ability = answer ? abilityForChoice(answer) : undefined
    if (ability && feat.asiChoice?.includes(ability)) {
      if (!c.saves.includes(ability)) c.saves.push(ability)
    }
  }

  if (kit) {
    // Saves are a top-level kit field rather than part of its grant, because
    // only a class grants them and the two-save rule is asserted in srd.test.ts.
    for (const save of kit.saves) {
      if (!c.saves.includes(save)) c.saves.push(save)
    }
    // Level 1 only. The kit carries the whole 1-20 progression for the
    // level-up wizard, so an unfiltered copy put Extra Attack and Aura of
    // Protection on a brand-new paladin — and stamped level 1 on them, which
    // then stopped `featuresGained` from ever granting them properly.
    //
    // Prepended, not assigned: `applyPicks` has already run, and a `feature`
    // pick's answer — "Fighting Style: Defense" — is a feature row too.
    // Overwriting the list here silently threw the player's choice away, so the
    // pick was offered, gated on, and then discarded. The class's own features
    // come first because they are what the answers hang off.
    //
    // The subclass's own level-1 features follow the class's, for a class that
    // picks at level 1 — Cleric, Sorcerer, Warlock. Every other class chooses
    // an archetype at 3rd and `findSubclass` finds nothing here, so this is
    // inert for them rather than special-cased. Its *grant* is not applied
    // here: that rides `draftGrants` with everything else, so a subclass's
    // armour, speed and AC land through the same path a race's do.
    const subclass = draftSubclass(draft)
    c.features = [
      ...featuresUpToLevel(kit.features, 1).map((f): ClassFeature => ({
        level: f.level,
        name: f.name,
        ...(f.text ? { text: f.text } : {}),
      })),
      ...featuresUpToLevel(subclass?.features ?? [], 1).map(
        (f): ClassFeature => ({
          level: f.level,
          name: f.name,
          ...(f.text ? { text: f.text } : {}),
        }),
      ),
      ...c.features,
    ]
    // Counters the level-1 features imply — a Bard's Bardic Inspiration, a
    // Paladin's Divine Sense.
    //
    // This had no delivery path at all until it was written: `resourcesOffered`
    // only considers the levels being *gained*, and level 1 is outside every
    // level-up range because you never gain the level you started at. So a
    // level-1 `resource` was authored, correct, and reached no sheet ever — the
    // Bard's had been inert since the day it was written.
    //
    // Applied rather than offered, which is the one place this differs from
    // level-up. There the player ticks a box, because a later feature raising a
    // counter they have already tuned is a change worth consenting to; at
    // creation there is nothing to overwrite and no step to ask in, and a blank
    // sheet missing the counter its own Features tab describes is the worse
    // failure. The row is editable and deletable, so nothing here is final.
    //
    // Same class + subclass pair as the features above, so a level-1 archetype
    // carrying a counter gets it too.
    c.resources = [
      ...featuresUpToLevel(kit.features, 1),
      ...featuresUpToLevel(subclass?.features ?? [], 1),
    ]
      .flatMap((f) => (f.resource ? [f.resource] : []))
      // First writer wins on a duplicate name, matching `resourcesOffered`'s
      // one-row-per-name rule and keeping the class's own ahead of an
      // archetype's.
      .reduce<Array<CharacterResource>>((rows, offer) => {
        const key = offer.name.trim().toLowerCase()
        if (rows.some((r) => r.name.trim().toLowerCase() === key)) return rows
        return [
          ...rows,
          {
            name: offer.name,
            used: 0,
            total: offer.total,
            ...(offer.resets ? { resets: offer.resets } : {}),
          },
        ]
      }, [])
      .slice(0, MAX_RESOURCES)
    // Through `spellcastingFor`, never `kit.spellcasting` directly — a subclass
    // may carry its own block, and reading past it leaves a level-1 archetype
    // caster silently non-casting. No SRD class needs this today; a homebrew
    // one can, and the type's own doc comment requires it.
    const sc = spellcastingFor(kit, draft.subclassName)
    // `castsAtLevel1` rather than `sc` alone: a half caster *has* a block, but
    // its table starts at 2nd level. Gating on the block's existence would give
    // a level-1 paladin a spell ability, an empty level-1 slot row and a
    // prepared limit, all of which are wrong until they actually gain spells.
    if (sc && castsAtLevel1(kit, draft.subclassName)) {
      c.spellAbility = sc.ability
      c.spellSlots = { 1: { total: sc.slotsAtLevel1, used: 0 } }
      for (const name of draft.cantrips.filter(Boolean)) {
        if (!c.spells.some((s) => s.name === name)) {
          c.spells.push({ name, level: 0 })
        }
      }
      for (const name of draft.spells.filter(Boolean)) {
        if (!c.spells.some((s) => s.name === name && s.level === 1)) {
          c.spells.push({
            name,
            level: 1,
            ...(sc.prepares ? { prepared: true } : {}),
          })
        }
      }
      c.preparedLimit = sc.prepares
        ? Math.max(1, abilityMod(c.abilities[sc.ability]) + c.level)
        : 0
    }
    // The domain table, after the player's own picks so a spell they chose
    // themselves keeps the row they made — this only appends what is missing.
    // Deliberately outside `preparedLimit`, which is computed above and never
    // counts these: `preparedCount` looks at `'prepared'` alone.
    //
    // Outside the caster guard too, and that is the point: an always-prepared
    // row is granted by the *subclass*, so it does not depend on the class
    // casting at level 1. No SRD subclass grants one at 1 on a class whose
    // table starts later, but a homebrew one can, and inside the guard those
    // rows would vanish without a word.
    applySubclassSpells(c, subclass, c.level)
  }

  // Appended rather than assigned: nothing else populates `feats` at build time
  // today, but assigning makes this the only writer forever, and a second source
  // would silently clobber whatever came first. `mergeNamed` also gives us the
  // case-insensitive de-dupe for free.
  //
  // The feat's *grant* is applied by `draftGrants` and its half-feat `asi` by
  // `racialAsi`, so what's left is the name — plus the one-line `summary`, so
  // the sheet can say what the feat actually does instead of showing an empty
  // Features row. A feat the tables have never heard of still writes its name
  // and simply carries no text, which is the same shape a hand-typed one has.
  if (race?.grantsFeat && draft.featName.trim()) {
    const summary = draftFeat(draft)?.summary.trim()
    mergeNamed(c.feats, [
      summary
        ? { name: draft.featName.trim(), text: summary }
        : { name: draft.featName.trim() },
    ])
  }

  for (const text of draft.extraItems) {
    const trimmed = text.trim()
    if (!trimmed) continue
    if (
      c.inventory.some((i) => i.text.toLowerCase() === trimmed.toLowerCase())
    ) {
      continue
    }
    c.inventory.push({ text: trimmed, qty: 1, weight: 0, slot: null })
  }

  c.attacks = deriveAttacks(c, c.level)

  // Skills granted twice — a cleric taking Religion that Acolyte already gave —
  // are already deduped by mergeList; drop anything that isn't a real skill so
  // a stray free-text value can't sit in the list unrendered.
  c.skills = c.skills.filter((id) => SKILLS.some((s) => s.id === id))
  // Same for expertise, which the parser filters identically on the way back in.
  c.expertise = c.expertise.filter((id) => SKILLS.some((s) => s.id === id))

  return { character: c, body: buildBody(draft) }
}
