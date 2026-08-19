/**
 * Homebrew races, backgrounds, class kits and classes, shared by every world.
 *
 * Stored as `homebrew.json` in the app's userData folder, not in any world —
 * the point is that a race you invent once is offered everywhere. A world may
 * still carry its own additions in `worldSettings.json`; see lib/tables.ts for
 * how the two are merged with the SRD constants.
 *
 * The tradeoff is deliberate and worth knowing: **global homebrew does not
 * travel with a world folder.** Send a world to someone else and anything
 * defined here falls back to free text on their machine — the name still
 * round-trips, nothing is lost from the sheet, but the traits and bonuses
 * won't follow. Per-world entries do travel.
 *
 * Parsing is tolerant field-by-field, the same contract as `worldSettings.ts`
 * and character frontmatter: this file is hand-editable, and one bad row must
 * never cost you the rest of it.
 */

import type { ClassInfo } from './classes'
import { classId } from './worldSettings'
import type {
  BackgroundInfo,
  ClassKit,
  FeatInfo,
  Grant,
  GrantItem,
  GrantTrait,
  PickKind,
  PickList,
  RaceInfo,
  SubclassInfo,
  SubclassSpells,
  SubraceInfo,
} from './srd'
import {
  ABILITIES,
  ARMOR_PROFICIENCIES,
  CONDITIONS,
  DAMAGE_TYPES,
  WEAPON_CATEGORIES,
} from './character'
import type { Ability } from './character'

export const HOMEBREW_VERSION = 1

export const HOMEBREW_COMMENT =
  'Homebrew shared by every world. Races, backgrounds, classes and feats here ' +
  'are offered alongside the built-in ones, and an entry sharing a built-in’s ' +
  'name replaces it. Everything a character sheet stores is free ' +
  'text, so deleting an entry never breaks a character that used it — the name ' +
  'simply stays as typed. A world can override any of these by defining the ' +
  'same name in its own worldSettings.json.'

export interface Homebrew {
  version: number
  races: Array<RaceInfo>
  backgrounds: Array<BackgroundInfo>
  /** Classes. A kit is the whole definition — hit die and subclasses included. */
  kits: Array<ClassKit>
  /**
   * Feats. Unlike the others this tier has no SRD layer beneath it — 5.1 has no
   * feat list — so in practice every feat a character can pick comes from here
   * or from a world's own settings.
   */
  feats: Array<FeatInfo>
  /**
   * Legacy class list, from files written while classes and kits were separate
   * tables. Still read and re-written so an older build opening the same file
   * finds what it expects, and folded into `kits` by `mergeTables`. Nothing
   * writes new entries here.
   */
  classes?: Array<ClassInfo>
}

export const EMPTY_HOMEBREW: Homebrew = {
  version: HOMEBREW_VERSION,
  races: [],
  backgrounds: [],
  kits: [],
  feats: [],
}

// --- shared coercion (same shapes as worldSettings.ts) ----------------------

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function strList(v: unknown): Array<string> {
  return Array.isArray(v) ? v.map(str) : []
}

/** Trim, drop blanks, drop case-insensitive duplicates, keep authored order. */
function cleanList(values: Array<string>): Array<string> {
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const text = value.trim()
    if (text === '') return []
    const key = text.toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)
    return [text]
  })
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, Math.round(v)))
}

/**
 * The on-disk identity is the name; `id` is derived on the way in and never
 * stored, exactly as `classId` does for classes. Matches the slug convention
 * srd.test.ts asserts for the built-in tables.
 */
export function homebrewId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseAsi(raw: unknown): Partial<Record<Ability, number>> {
  if (typeof raw !== 'object' || raw === null) return {}
  const r = raw as Record<string, unknown>
  const out: Partial<Record<Ability, number>> = {}
  for (const ability of ABILITIES) {
    const value = r[ability]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const n = Math.round(value)
    // A 0 or negative increase is meaningless here and would render as a "+0"
    // chip; drop it rather than display it.
    if (n > 0) out[ability] = Math.min(10, n)
  }
  return out
}

function parseTraits(raw: unknown): Array<GrantTrait> {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.flatMap((entry): Array<GrantTrait> => {
    if (typeof entry !== 'object' || entry === null) return []
    const r = entry as Record<string, unknown>
    const name = str(r.name).trim()
    if (name === '') return []
    const key = name.toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)
    const text = str(r.text).trim()
    return [text ? { name, text } : { name }]
  })
}

const PICK_KINDS: Array<PickKind> = [
  'skill',
  'tool',
  'language',
  'weapon',
  'armor',
  'spell',
  'cantrip',
  'other',
]

function parsePickList(raw: unknown, ownerId: string): PickList | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const label = str(r.label).trim()
  const options = cleanList(strList(r.options))
  const open = r.open === true
  // A closed pick with nothing to choose from can never be satisfied, which
  // would trap the player on the skills step with no way forward.
  if (!open && options.length === 0) return null
  const count = int(r.count, 1, 1, Math.max(1, options.length || 99))
  const rawId = str(r.id).trim()
  // Ids share one keyspace across every table, so a homebrew id is namespaced
  // by its owner — a bare "skills" would collide with another entry's.
  const id =
    rawId === '' ? `${ownerId}-pick` : `hb-${ownerId}-${homebrewId(rawId)}`
  const kind = PICK_KINDS.includes(r.kind as PickKind)
    ? (r.kind as PickKind)
    : 'other'
  return {
    id,
    kind,
    label: label === '' ? 'Choose' : label,
    count,
    options,
    ...(open && { open: true }),
  }
}

function parsePicks(raw: unknown, ownerId: string): Array<PickList> {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.flatMap((entry, i): Array<PickList> => {
    const parsed = parsePickList(entry, `${ownerId}-${i}`)
    if (!parsed) return []
    if (seen.has(parsed.id)) return []
    seen.add(parsed.id)
    return [parsed]
  })
}

function parseItems(raw: unknown): Array<GrantItem> {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): Array<GrantItem> => {
    if (typeof entry === 'string') {
      const text = entry.trim()
      return text ? [{ text }] : []
    }
    if (typeof entry !== 'object' || entry === null) return []
    const r = entry as Record<string, unknown>
    const text = str(r.text).trim()
    if (text === '') return []
    const item: GrantItem = { text }
    if (typeof r.qty === 'number' && Number.isFinite(r.qty)) {
      item.qty = int(r.qty, 1, 1, 9999)
    }
    if (typeof r.weight === 'number' && Number.isFinite(r.weight)) {
      item.weight = Math.max(0, r.weight)
    }
    return [item]
  })
}

function parseCurrency(raw: unknown): Grant['currency'] {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const out: NonNullable<Grant['currency']> = {}
  for (const coin of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
    const value = r[coin]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const n = Math.max(0, Math.round(value))
    if (n > 0) out[coin] = n
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * A known token's id, or the value unchanged.
 *
 * The sheet stores these lowercase ids and matches them exactly, but every
 * editor here is a free-text token field — so "Cold", "cold" and "COLD" all
 * have to land on `cold` while a homebrew "Void" passes straight through.
 */
function tokenId(
  table: Array<{ id: string; name: string }>,
  value: string,
): string {
  const key = value.trim().toLowerCase()
  const hit = table.find((t) => t.id === key || t.name.toLowerCase() === key)
  return hit ? hit.id : value
}

function parseGrant(raw: unknown, ownerId: string): Grant {
  if (typeof raw !== 'object' || raw === null) return {}
  const r = raw as Record<string, unknown>
  const grant: Grant = {}
  const lists = [
    'skills',
    'armor',
    'weapons',
    'tools',
    'languages',
    'resistances',
    'conditionImmunities',
  ] as const
  for (const key of lists) {
    const values = cleanList(strList(r[key]))
    if (values.length > 0) grant[key] = values
  }
  // Damage types and conditions are matched by *id* on the sheet
  // (`damageStance` does an exact `includes`), so a hand-typed "Cold" has to
  // become "cold" here or the resistance parses fine, saves fine, and then
  // silently fails to show up in Defences. Anything unrecognised is left
  // exactly as typed — homebrew damage types are still free text.
  if (grant.resistances) {
    grant.resistances = grant.resistances.map((v) => tokenId(DAMAGE_TYPES, v))
  }
  if (grant.conditionImmunities) {
    grant.conditionImmunities = grant.conditionImmunities.map((v) =>
      tokenId(CONDITIONS, v),
    )
  }
  if (grant.armor) {
    grant.armor = grant.armor.map((v) => tokenId(ARMOR_PROFICIENCIES, v))
  }
  if (grant.weapons) {
    grant.weapons = grant.weapons.map((v) => tokenId(WEAPON_CATEGORIES, v))
  }
  const saves = strList(r.saves)
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Ability => ABILITIES.includes(s as Ability))
  if (saves.length > 0) grant.saves = [...new Set(saves)]
  // Whole feet only, and never negative: this is additive, and a grant that
  // *reduced* speed would be the one thing here that takes something away.
  // Capped well above any published feat so a typo can't produce a 900ft dwarf.
  const speedBonus = int(r.speedBonus, 0, 0, 120)
  if (speedBonus > 0) grant.speedBonus = speedBonus
  const traits = parseTraits(r.traits)
  if (traits.length > 0) grant.traits = traits
  const items = parseItems(r.items)
  if (items.length > 0) grant.items = items
  const currency = parseCurrency(r.currency)
  if (currency) grant.currency = currency
  const picks = parsePicks(r.picks, ownerId)
  if (picks.length > 0) grant.picks = picks
  return grant
}

function parseSubrace(raw: unknown): SubraceInfo | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = str(r.name).trim()
  if (name === '') return null
  const id = homebrewId(name)
  const sub: SubraceInfo = {
    id,
    name,
    summary: str(r.summary).trim(),
    asi: parseAsi(r.asi),
    grant: parseGrant(r.grant, id),
  }
  if (typeof r.speed === 'number' && Number.isFinite(r.speed)) {
    sub.speed = int(r.speed, 30, 0, 200)
  }
  if (typeof r.hpPerLevel === 'number' && Number.isFinite(r.hpPerLevel)) {
    const hp = int(r.hpPerLevel, 0, 0, 10)
    if (hp > 0) sub.hpPerLevel = hp
  }
  return sub
}

export function parseRace(raw: unknown): RaceInfo | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = str(r.name).trim()
  // A nameless race can't be picked, keyed or looked up — drop the row rather
  // than invent a name for it.
  if (name === '') return null
  const id = homebrewId(name)
  const race: RaceInfo = {
    id,
    name,
    summary: str(r.summary).trim(),
    asi: parseAsi(r.asi),
    speed: int(r.speed, 30, 0, 200),
    grant: parseGrant(r.grant, id),
  }
  if (Array.isArray(r.subraces)) {
    const seen = new Set<string>()
    const subraces = r.subraces.flatMap((entry): Array<SubraceInfo> => {
      const parsed = parseSubrace(entry)
      if (!parsed || seen.has(parsed.id)) return []
      seen.add(parsed.id)
      return [parsed]
    })
    if (subraces.length > 0) race.subraces = subraces
  }
  if (typeof r.flexibleAsi === 'object' && r.flexibleAsi !== null) {
    const f = r.flexibleAsi as Record<string, unknown>
    race.flexibleAsi = {
      count: int(f.count, 2, 1, 6),
      amount: int(f.amount, 1, 1, 10),
    }
  }
  if (r.grantsFeat === true) race.grantsFeat = true
  return race
}

export function parseBackground(raw: unknown): BackgroundInfo | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = str(r.name).trim()
  if (name === '') return null
  const id = homebrewId(name)
  const feature =
    typeof r.feature === 'object' && r.feature !== null
      ? (r.feature as Record<string, unknown>)
      : {}
  const featureName = str(feature.name).trim()
  const featureText = str(feature.text).trim()
  return {
    id,
    name,
    summary: str(r.summary).trim(),
    feature: {
      name: featureName === '' ? `${name} Feature` : featureName,
      ...(featureText && { text: featureText }),
    },
    grant: parseGrant(r.grant, id),
  }
}

/**
 * A feat. Same conventions as every other entry here: name required, `id`
 * derived and never stored, grant through `parseGrant` so token normalisation
 * and pick-id namespacing come free.
 *
 * `asi` is omitted entirely when empty rather than written as `{}` — a feat with
 * no ability bump is a full feat, and `parseAsi` already drops zero and negative
 * increases, so an empty object and an absent key mean the same thing.
 */
export function parseFeat(raw: unknown): FeatInfo | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = str(r.name).trim()
  if (name === '') return null
  const id = homebrewId(name)
  const feat: FeatInfo = {
    id,
    name,
    summary: str(r.summary).trim(),
    grant: parseGrant(r.grant, id),
  }
  const prerequisite = str(r.prerequisite).trim()
  if (prerequisite !== '') feat.prerequisite = prerequisite
  const asi = parseAsi(r.asi)
  if (Object.keys(asi).length > 0) feat.asi = asi
  return feat
}

function parseSpellcasting(raw: unknown): ClassKit['spellcasting'] {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const ability = str(r.ability).trim().toLowerCase()
  if (!ABILITIES.includes(ability as Ability)) return undefined
  const out: NonNullable<ClassKit['spellcasting']> = {
    ability: ability as Ability,
    slotsAtLevel1: int(r.slotsAtLevel1, 2, 0, 20),
    cantripsKnown: int(r.cantripsKnown, 0, 0, 20),
    spellsKnown: int(r.spellsKnown, 0, 0, 40),
    prepares: r.prepares === true,
    listLabel: str(r.listLabel).trim() || 'Spells',
  }
  const slots = parseLevelTable(r.slotsByLevel, (v) =>
    Array.isArray(v)
      ? v
          .filter(
            (n): n is number => typeof n === 'number' && Number.isFinite(n),
          )
          .map((n) => Math.max(0, Math.round(n)))
      : null,
  )
  if (slots) out.slotsByLevel = slots
  const cantrips = parseLevelTable(r.cantripsByLevel, (v) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.max(0, Math.round(v))
      : null,
  )
  if (cantrips) out.cantripsByLevel = cantrips
  return out
}

/**
 * A `Record<characterLevel, T>` from hand-written JSON. Keys outside 1-20 and
 * values the coercer rejects are dropped rather than defaulted — a malformed
 * row in a progression table should vanish, not silently become zero slots.
 */
function parseLevelTable<T>(
  raw: unknown,
  coerce: (value: unknown) => T | null,
): Record<number, T> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const out: Record<number, T> = {}
  for (const [key, value] of Object.entries(raw)) {
    const level = Number(key)
    if (!Number.isInteger(level) || level < 1 || level > 20) continue
    const parsed = coerce(value)
    if (parsed !== null) out[level] = parsed
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function parseEquipment(raw: unknown, ownerId: string): ClassKit['equipment'] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.flatMap((entry, i): ClassKit['equipment'] => {
    if (typeof entry !== 'object' || entry === null) return []
    const r = entry as Record<string, unknown>
    if (!Array.isArray(r.options)) return []
    const options = r.options.flatMap((o, j) => {
      if (typeof o !== 'object' || o === null) return []
      const or = o as Record<string, unknown>
      const label = str(or.label).trim()
      if (label === '') return []
      return [{ label, grant: parseGrant(or.grant, `${ownerId}-eq${i}-${j}`) }]
    })
    // A single-option "choice" is really a grant; one option can't be chosen
    // between, and the UI would render a pointless one-card group.
    if (options.length < 2) return []
    const id = `hb-${ownerId}-eq-${i}`
    if (seen.has(id)) return []
    seen.add(id)
    return [{ id, label: str(r.label).trim() || 'Equipment', options }]
  })
}

/**
 * Features by level, tolerant row by row.
 *
 * Shared by classes and subclasses because they are the same shape and the
 * same rules — a second copy is how the three `parseClass` variants happened.
 */
export function parseFeatures(
  raw: unknown,
): Array<{ level: number; name: string; text?: string }> {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(
    (entry): Array<{ level: number; name: string; text?: string }> => {
      if (typeof entry !== 'object' || entry === null) return []
      const f = entry as Record<string, unknown>
      const fname = str(f.name).trim()
      if (fname === '') return []
      const text = str(f.text).trim()
      // Defaults to 1: a file written before features had levels, or a
      // homebrew author who didn't say, means "you have it from the start".
      const level = int(f.level, 1, 1, 20)
      return [text ? { level, name: fname, text } : { level, name: fname }]
    },
  )
}

/** A subclass's always-prepared spell rows. */
function parseSubclassSpells(raw: unknown): Array<SubclassSpells> {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): Array<SubclassSpells> => {
    if (typeof entry !== 'object' || entry === null) return []
    const row = entry as Record<string, unknown>
    const names = cleanList(strList(row.names))
    // A row with no spells left after cleaning is an empty header, not data.
    if (names.length === 0) return []
    return [
      {
        grantedAt: int(row.grantedAt, 1, 1, 20),
        // Spell levels, not character levels — 1-9, not 1-20.
        level: int(row.level, 1, 1, 9),
        names,
      },
    ]
  })
}

/**
 * Subclasses, from either shape on disk.
 *
 * **This is the compatibility boundary.** Every file written before subclasses
 * carried features holds a bare string array, and a world file is never
 * rewritten just because it was opened, so both shapes have to be read forever.
 * The union dies here: everything downstream sees `SubclassInfo`.
 *
 * Tolerance follows the rest of this file — a bad row costs you that row and
 * nothing more. A malformed feature drops while its subclass survives; a
 * nameless subclass drops entirely, because it cannot be picked, keyed or
 * looked up; `features: "Improved Critical"` yields no features rather than
 * throwing.
 */
export function parseSubclasses(
  raw: unknown,
  ownerId: string,
): Array<SubclassInfo> {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.flatMap((entry): Array<SubclassInfo> => {
    // The legacy shape, and still what most entries are: just a name.
    if (typeof entry === 'string') {
      const name = entry.trim()
      if (name === '') return []
      const key = name.toLowerCase()
      if (seen.has(key)) return []
      seen.add(key)
      return [{ id: homebrewId(name), name, features: [] }]
    }
    if (typeof entry !== 'object' || entry === null) return []
    const r = entry as Record<string, unknown>
    const name = str(r.name).trim()
    if (name === '') return []
    const key = name.toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)

    const id = homebrewId(name)
    const sub: SubclassInfo = { id, name, features: parseFeatures(r.features) }
    const summary = str(r.summary).trim()
    if (summary !== '') sub.summary = summary
    const spells = parseSubclassSpells(r.spells)
    if (spells.length > 0) sub.spells = spells
    if (r.grant !== undefined) {
      // Namespaced by owner: two classes can both have a "Hunter" subclass, and
      // `parsePickList` builds globally-unique pick ids from this.
      sub.grant = parseGrant(r.grant, `${ownerId}-${id}`)
    }
    return [sub]
  })
}

/** A grant without its pick ids, which are derived rather than stored. */
function stripPicks(grant: Grant): unknown {
  const { picks, ...rest } = grant
  return {
    ...rest,
    ...(picks && {
      picks: picks.map(({ id: _id, ...pick }) => pick),
    }),
  }
}

/**
 * On-disk shape for a subclass: a bare string when that is all it is, an object
 * only when there is more to say.
 *
 * The string form is what an older build knows how to read — its `strList`
 * drops anything that isn't one — so writing an object for a name-only subclass
 * would make it silently vanish there. Every subclass on disk today is
 * name-only, so this keeps existing files byte-identical until someone actually
 * authors a feature. A subclass that genuinely carries one can't be a string,
 * and an old build loses that entry from its dropdown and nothing else: the
 * character who took it is unaffected, because `Character.subclass` is free
 * text.
 */
export function serializeSubclass(sub: SubclassInfo): unknown {
  const bare =
    sub.features.length === 0 &&
    sub.summary === undefined &&
    sub.spells === undefined &&
    sub.grant === undefined
  if (bare) return sub.name
  const { id: _id, grant, ...rest } = sub
  return grant ? { ...rest, grant: stripPicks(grant) } : rest
}

export function parseKit(raw: unknown): ClassKit | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = str(r.name).trim()
  if (name === '') return null
  const id = homebrewId(name)

  const saves = strList(r.saves)
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Ability => ABILITIES.includes(s as Ability))

  const skillChoices = parsePickList(r.skillChoices, `${id}-skills`) ?? {
    id: `hb-${id}-skills`,
    kind: 'skill' as const,
    label: 'Choose two skills',
    count: 2,
    options: [],
    open: true,
  }

  const features = parseFeatures(r.features)

  const priority = strList(r.abilityPriority)
    .map((a) => a.trim().toLowerCase())
    .filter((a): a is Ability => ABILITIES.includes(a as Ability))
  // The auto-assign button needs all six exactly once; top up anything missing
  // in canonical order rather than dropping the feature for a partial list.
  const abilityPriority = [
    ...new Set([...priority, ...ABILITIES]),
  ] as Array<Ability>

  const kit: ClassKit = {
    id,
    name,
    // A kit is the whole class now, so it carries the three fields the sheet
    // reads. Deliberately *not* clampHitDie: that snaps to the nearest real die,
    // which is right for a character sheet field (a d7 is a typo) but wrong
    // here, where the user has defined the class and a d7 class is their call.
    hitDie: int(r.hitDie, 8, 2, 100),
    subclassLabel: str(r.subclassLabel).trim() || 'Subclass',
    subclasses: parseSubclasses(r.subclasses, id),
    saves: [...new Set(saves)],
    skillChoices: { ...skillChoices, kind: 'skill' },
    grant: parseGrant(r.grant, id),
    equipment: parseEquipment(r.equipment, id),
    features,
    abilityPriority,
  }
  const asiLevels = Array.isArray(r.asiLevels)
    ? [
        ...new Set(
          r.asiLevels
            .filter(
              (v): v is number => typeof v === 'number' && Number.isFinite(v),
            )
            .map((v) => Math.round(v))
            .filter((v) => v >= 1 && v <= 20),
        ),
      ].sort((a, b) => a - b)
    : []
  if (asiLevels.length > 0) kit.asiLevels = asiLevels

  const spellcasting = parseSpellcasting(r.spellcasting)
  if (spellcasting) kit.spellcasting = spellcasting
  if (r.unarmoredDefense === 'con' || r.unarmoredDefense === 'wis') {
    kit.unarmoredDefense = r.unarmoredDefense
  }
  if (r.subclassAtLevel1 === true) kit.subclassAtLevel1 = true
  return kit
}

function parseClass(raw: unknown): ClassInfo | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = str(r.name).trim()
  if (name === '') return null
  const label = str(r.subclassLabel).trim()
  return {
    id: classId(name),
    name,
    hitDie: int(r.hitDie, 8, 2, 100),
    subclassLabel: label === '' ? 'Subclass' : label,
    subclasses: cleanList(strList(r.subclasses)),
  }
}

/** First entry wins on a duplicate id, matching how the lookups behave. */
function dedupe<T extends { id: string }>(entries: Array<T>): Array<T> {
  const seen = new Set<string>()
  return entries.flatMap((entry) => {
    if (entry.id === '' || seen.has(entry.id)) return []
    seen.add(entry.id)
    return [entry]
  })
}

/**
 * Parse the raw JSON from disk.
 *
 * A missing or corrupt file yields empty lists — unlike world settings, there
 * is no built-in default to fall back to, because the SRD tables are merged in
 * separately (see lib/tables.ts). An explicit `[]` and an absent key therefore
 * mean the same thing here, and both are correct.
 */
export function parseHomebrew(raw: unknown): Homebrew {
  if (typeof raw !== 'object' || raw === null) return EMPTY_HOMEBREW
  const r = raw as Record<string, unknown>
  const list = <T extends { id: string }>(
    value: unknown,
    parse: (entry: unknown) => T | null,
  ): Array<T> =>
    Array.isArray(value)
      ? dedupe(
          value.flatMap((entry) => {
            const parsed = parse(entry)
            return parsed ? [parsed] : []
          }),
        )
      : []

  return {
    version:
      typeof r.version === 'number' && Number.isFinite(r.version)
        ? r.version
        : HOMEBREW_VERSION,
    races: list(r.races, parseRace),
    backgrounds: list(r.backgrounds, parseBackground),
    kits: list(r.kits, parseKit),
    feats: list(r.feats, parseFeat),
    // Only carried when the file has one; nothing writes a new legacy list.
    ...(Array.isArray(r.classes) && { classes: list(r.classes, parseClass) }),
  }
}

/**
 * Back to the on-disk shape. `id` is dropped throughout — it is derived from
 * the name on the way in, so writing it would create a second source of truth
 * that a hand-edit could contradict.
 */
export function serializeHomebrew(homebrew: Homebrew): unknown {
  return {
    version: homebrew.version,
    _comment: HOMEBREW_COMMENT,
    races: homebrew.races.map(({ id: _id, subraces, grant, ...race }) => ({
      ...race,
      grant: stripPicks(grant),
      ...(subraces && {
        subraces: subraces.map(({ id: _subId, grant: subGrant, ...sub }) => ({
          ...sub,
          grant: stripPicks(subGrant),
        })),
      }),
    })),
    backgrounds: homebrew.backgrounds.map(({ id: _id, grant, ...bg }) => ({
      ...bg,
      grant: stripPicks(grant),
    })),
    feats: homebrew.feats.map(({ id: _id, grant, ...feat }) => ({
      ...feat,
      grant: stripPicks(grant),
    })),
    kits: homebrew.kits.map(
      ({ id: _id, grant, equipment, skillChoices, subclasses, ...kit }) => ({
        ...kit,
        // Downgraded to bare strings wherever a subclass is just a name, so an
        // older build's `strList` still reads them instead of dropping the lot.
        subclasses: subclasses.map(serializeSubclass),
        skillChoices: (({ id: _pickId, ...rest }) => rest)(skillChoices),
        grant: stripPicks(grant),
        equipment: equipment.map(({ id: _eqId, options, ...choice }) => ({
          ...choice,
          options: options.map((o) => ({
            label: o.label,
            grant: stripPicks(o.grant),
          })),
        })),
      }),
    ),
    ...(homebrew.classes && {
      classes: homebrew.classes.map(({ id: _id, ...cl }) => cl),
    }),
  }
}
