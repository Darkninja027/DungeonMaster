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
  proficiencyBonus,
  skillIdFor,
  SKILLS,
} from './character'
import type {
  Ability,
  Character,
  ClassFeature,
  InventoryItem,
  NamedEntry,
} from './character'
import { baseScores } from './abilityMethods'
import {
  draftBackground,
  draftClassInfo,
  draftFeat,
  draftGrants,
  draftKit,
  draftPickLists,
  draftRace,
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
import type { Grant, GrantItem } from './srd'

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

/** Merge the player's resolved pick lists into the right character fields. */
function applyPicks(c: Character, draft: CharacterDraft) {
  for (const pick of draftPickLists(draft)) {
    const values = picked(draft, pick.id).filter(Boolean)
    if (values.length === 0) continue
    switch (pick.kind) {
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
      default:
        // 'other' and 'spell' carry no single home on the sheet; they surface
        // in the body and on the traits the option belongs to.
        break
    }
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
  const hpMax = Math.max(1, hitDie + conMod + (subrace?.hpPerLevel ?? 0))
  c.hp = { current: hpMax, max: hpMax, temp: 0 }

  c.ac = computeAc(c, kit?.unarmoredDefense)

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
    c.features = featuresUpToLevel(kit.features, 1).map((f): ClassFeature => ({
      level: f.level,
      name: f.name,
      ...(f.text ? { text: f.text } : {}),
    }))
    const sc = kit.spellcasting
    if (sc) {
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
