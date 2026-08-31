/**
 * Shapes for the SRD 5.1 reference tables in this folder.
 *
 * These tables are an **editor affordance, not a schema**. Everything they feed
 * ends up on the sheet as plain strings, exactly as if a user had typed it: the
 * wizard writes `race: Hill Dwarf`, never `race: hill-dwarf`. An id here is for
 * React keys and lookups only and must never reach disk — see the note on
 * ARMOR_PROFICIENCIES in lib/character.ts and the header of lib/classes.ts.
 *
 * The corollary is that every lookup is `name in, undefined out`, mirroring
 * `findClass`: a race, background or class the tables don't know contributes its
 * name and nothing else, and the character is still perfectly valid. Homebrew
 * must survive a round trip untouched.
 *
 * There ARE per-level tables here, and there is a line. What a class gains as it
 * levels — features, spell slots, the levels at which it takes an Ability Score
 * Improvement — is in, because the level-up wizard needs it and the alternative
 * is every player looking it up in a book. Static tables, levels 1-20.
 *
 * What stays out: multiclassing, encumbrance rules, conditions, and anything
 * that computes *during play*. The wizard never enforces any of this either —
 * it offers what the table says and the player takes it or ignores it, because
 * the sheet is hand-editable and every value on it is free text.
 *
 * **Feats:** the *definition* is in (`FeatInfo`), the *content* is not — not
 * in this folder, at least. SRD 5.1 has no feat list, so `SRD_FEATS` ships
 * **empty** and always will; the published catalogue lives in `lib/feats/`,
 * outside `srd/`, because PHB, Xanathar's and Tasha's feats are not ours to put
 * under the CC BY 4.0 attribution in ./index.ts.
 *
 * The rule that kept feats out still holds where it counts. What that tier
 * ships is names and mechanical grants — the same strings a player would type —
 * and not rules text. A prerequisite is free text that is displayed and never
 * checked, nothing computes during play, and a feat whose effect is a combat
 * rule this app does not model carries an empty grant. So the sentence above
 * governs feats exactly as written; what changed is only that a feat now has a
 * shape to be authored *into*, instead of being a bare name the sheet could do
 * nothing with.
 *
 * `SubraceInfo.hpPerLevel` remains a one-off; see its doc comment.
 */

import type { Ability, EquipSlot, HalfProficiency } from '../character'

/**
 * A bundle of things granted by a race, background, class kit or equipment
 * choice. Every field is optional and every list is merged into the character
 * additively, then de-duplicated case-insensitively — a race and a background
 * both granting Common yields one Common.
 *
 * Ability scores are deliberately absent: racial increases live on
 * `RaceInfo.asi` because they are applied at commit on top of the rolled base,
 * not merged like a list.
 */
export interface Grant {
  /** Skill ids from `SKILLS`. Validated by srd.test.ts. */
  skills?: Array<string>
  /** Saving throws by `Ability`. In practice only class kits grant these. */
  saves?: Array<Ability>
  /** Armor proficiency ids from `ARMOR_PROFICIENCIES`, or free text. */
  armor?: Array<string>
  /** Weapon category ids from `WEAPON_CATEGORIES`, or individual weapon names. */
  weapons?: Array<string>
  /** Tool names, free text — 5e has no closed tool list worth encoding. */
  tools?: Array<string>
  /** Language names, free text. */
  languages?: Array<string>
  /** Damage type ids from `DAMAGE_TYPES`. */
  resistances?: Array<string>
  /** Condition ids from `CONDITIONS`. */
  conditionImmunities?: Array<string>
  /**
   * Feet added to walking speed, e.g. Mobile's `+10`.
   *
   * Additive, and deliberately not the same thing as `RaceInfo.speed` /
   * `SubraceInfo.speed`, which *set* the base. A race says what your speed is;
   * this says what is added to it, so two sources stack rather than fighting
   * over the same number. `buildCharacter` sums these after assigning the base,
   * and `applyFeatGrants` adds them at level-up.
   */
  speedBonus?: number
  /**
   * Added to `Character.initiativeBonus`, e.g. Alert's `+5`.
   *
   * That field is the *misc* slot `initiativeBonus(c)` adds on top of the DEX
   * modifier, not a derived total, so this stacks with whatever the player has
   * typed there rather than replacing it. Signed on purpose: unlike
   * `speedBonus`, a negative initiative modifier is a legitimate thing for a
   * homebrew grant to carry.
   */
  initiativeBonus?: number
  /**
   * Added to `Character.ac`, e.g. the Defense fighting style's `+1`.
   *
   * Applied on top of whatever `computeAc` derives from armour and Dexterity,
   * so it stacks with the armour a character is actually wearing rather than
   * replacing the calculation.
   *
   * A caveat worth knowing: Defense's +1 applies *only while wearing armour*,
   * and this field cannot say that — `applyGrant` has no view of the sheet's
   * future inventory, and `Character.ac` is a stored number the player edits.
   * `buildCharacter` checks for armour at creation, and beyond that the number
   * is the player's. That is the usual bargain here: the table offers, the
   * sheet is hand-editable, and nothing recomputes behind you.
   */
  acBonus?: number
  /**
   * Extra max HP per character level, e.g. Tough's `2`.
   *
   * The sibling of `SubraceInfo.hpPerLevel`, which has carried the Hill Dwarf's
   * Dwarven Toughness since before feats existed. It is here rather than there
   * because a feat is a `Grant` and a subrace is not, and because the two are
   * read at different moments: a subrace's applies from level 1, while a feat's
   * starts the level it is taken and is owed for every level already held.
   *
   * Additive and never lowered, like every other number on this type. Read by
   * `buildCharacter` at creation and by `applyLevelUp` at level-up; both floor
   * the resulting max at 1.
   */
  hpPerLevel?: number
  /**
   * Spells granted outright, no choice involved — Fey Touched's misty step,
   * Shadow Touched's invisibility, Fey Teleportation's misty step.
   *
   * Distinct from a `kind: 'spell'` pick, which is the *other* half of those
   * same feats: the pick is "one 1st-level divination spell of your choice" and
   * this is the fixed one that comes with it. Without this field a feat could
   * only express the half the player chooses, so the fixed spell was named in
   * the summary and never reached the sheet.
   *
   * These are cast once per long rest without a slot, so they land unprepared
   * and cost nothing against `preparedLimit` — see `applyGrantSpells`.
   */
  spells?: Array<GrantSpell>
  /** Named entries that land in `Character.traits`. */
  traits?: Array<GrantTrait>
  /** Inventory rows. */
  items?: Array<GrantItem>
  /** Starting coin, added to `Character.currency`. */
  currency?: Partial<Record<'cp' | 'sp' | 'ep' | 'gp' | 'pp', number>>
  /**
   * Choices the player must resolve before this grant is complete. Ids share
   * one keyspace across every table, so they are prefixed by owner and asserted
   * globally unique in srd.test.ts — a collision would silently cross-wire two
   * unrelated choices.
   */
  picks?: Array<PickList>
}

/** One spell a grant hands over outright. */
export interface GrantSpell {
  /** Plain text or a `[[wiki link]]`, matching `Character.Spell.name`. */
  name: string
  /** 0 for a cantrip, 1-9 for a levelled spell. */
  level: number
}

export interface GrantTrait {
  name: string
  /** Rules text. `[[wiki links]]` and dice notation stay live on the sheet. */
  text?: string
}

/**
 * One inventory row. `weight` is per unit, matching `InventoryItem.weight`.
 * `fits` is passed through only when set, so an unset value falls back to
 * `guessSlot` on the name rather than pinning the row to nothing.
 */
export interface GrantItem {
  /** The row text as it should appear on the sheet. */
  text: string
  qty?: number
  /** Pounds per unit. Omitted means unweighed, which serializes as a bare row. */
  weight?: number
  fits?: EquipSlot | null
}

/**
 * What kind of thing a `PickList` is choosing, so the UI can render the right
 * control and `buildCharacter` knows which character list to merge it into.
 */
export type PickKind =
  | 'skill'
  /**
   * A skill *or* a tool, decided per value — Skilled's "any combination of
   * three skills or tools". `applyPicks` routes each chosen value on its own:
   * one that resolves through `skillIdFor` lands in `Character.skills` as that
   * id, anything else lands verbatim in `Character.tools`. Decidable only
   * because skills are a closed list and tools are free text, which is why
   * this is a named kind rather than a general "two lists" mechanism.
   *
   * Always `open`: half the answers are free text, so a closed one is a
   * contradiction. `options` carries the skill ids for the chips; tool names
   * arrive as Combobox suggestions instead, because forty chips is a wall
   * rather than a choice.
   */
  | 'skillOrTool'
  /**
   * A skill to double the proficiency bonus for, landing in
   * `Character.expertise` rather than `Character.skills`. Distinct from
   * `'skill'` because expertise presupposes the proficiency — Skill Expert
   * grants one of each — and filing it as a plain proficiency silently
   * downgrades the feat.
   */
  | 'expertise'
  | 'tool'
  | 'language'
  | 'weapon'
  | 'armor'
  | 'spell'
  | 'cantrip'
  /**
   * A choice whose answer *is* a feature: a Fighter's Fighting Style, a Battle
   * Master's manoeuvres, a Warlock's invocations.
   *
   * These were prose for a long time, and the reason was sound: CLAUDE.md's rule
   * is that a choice becomes a `PickList` only when the sheet has a field for
   * its answer, and as a `kind: 'other'` pick `applyPicks` would record the
   * click and then discard it — worse than prose, which at least promises
   * nothing. This kind exists because `Character.features` *is* that field. The
   * chosen value lands there as a named row, so "Fighting Style: Defense" is on
   * the sheet, in the Features tab, and on the printed page.
   *
   * The rules text rides on the pick as `featureText`, keyed by option, which
   * is why this is the one kind `applyPick(c, kind, values)` can't serve alone
   * — see `applyFeaturePick`.
   *
   * Still not a rules engine: nothing here computes. Choosing Defense writes a
   * row that says Defense gives +1 AC while wearing armour; it does not touch
   * `Character.ac`, because that is a number the player also edits.
   */
  | 'feature'
  /** Anything else — rendered as free text with the options as suggestions. */
  | 'other'

/**
 * "Choose two skills from this list", "choose one artisan's tool", "choose any
 * one language". `open` means the options are suggestions rather than a closed
 * set, which is what keeps a homebrew or DM-invented answer typeable.
 */
export interface PickList {
  /** Globally unique across every SRD table. Prefix with the owner's id. */
  id: string
  kind: PickKind
  /** Shown as the group heading, e.g. "Choose two skills". */
  label: string
  /** How many must be chosen. */
  count: number
  /**
   * The offered values. For `kind: 'skill'` these are `SKILLS` ids; otherwise
   * free-text names shown as chips. Empty with `open: true` means "type
   * anything", which is how "any one language of your choice" is modelled.
   */
  options: Array<string>
  /**
   * Whether a value outside `options` is allowed. When false the UI offers only
   * the listed chips; when true it also offers a free-text input with the
   * options as a datalist.
   */
  open?: boolean
  /**
   * `kind: 'feature'` only: rules text for each option, keyed by the option's
   * own string.
   *
   * It lives here rather than on the character because the answer is a choice
   * *from a table*, and the table is the thing that knows what Defense does. A
   * chosen option with no entry lands as a bare named row, which is exactly
   * what a homebrew or hand-typed answer should do.
   */
  featureText?: Record<string, string>
  /**
   * `kind: 'feature'` only: prefix for the row written to the sheet, so a bare
   * option name becomes "Fighting Style: Defense" rather than "Defense".
   *
   * Omitted where the option already names itself — a Battle Master's
   * "Riposte" needs no prefix to read as a manoeuvre on the Features tab.
   */
  featureLabel?: string
  /**
   * `kind: 'feature'` only: what each option grants mechanically, keyed by the
   * option's own string.
   *
   * Most carry nothing — a fighting style that reads "+2 to attack rolls with a
   * ranged weapon" is a combat rule this app does not model, so Archery's entry
   * is absent and its row is the reminder. The few that land on a number the
   * sheet actually holds say so: Defense raises AC, Superior Technique adds a
   * superiority die.
   *
   * An option with no entry grants nothing, which is correct rather than
   * incomplete — the same rule `grant: {}` follows on a feat.
   */
  featureGrant?: Record<string, Grant>
}

/**
 * One feature a class or subclass gains, at the character level it is gained at.
 *
 * Named rather than repeated inline — it was the same anonymous literal in two
 * places, and `picks` had nowhere to be added without writing it twice.
 *
 * `picks` is what turns a feature that is really a *question* into one the
 * wizard can ask: a Fighter's Fighting Style, a Battle Master's manoeuvres. The
 * feature row still lands on the sheet as prose; the answers land beside it as
 * their own rows. A feature with no `picks` is the ordinary case and behaves
 * exactly as it always has.
 */
export interface ClassFeatureInfo {
  /** Character level this is gained at, 1-20. */
  level: number
  name: string
  /** Rules text. `[[wiki links]]` and dice notation stay live on the sheet. */
  text?: string
  /**
   * Choices this feature poses. Same global id keyspace as every other
   * `PickList`, so ids are prefixed by owner and asserted unique in srd.test.ts.
   */
  picks?: Array<PickList>
  /**
   * A counter this feature implies, offered to the player at level-up as a
   * pre-filled `Character.resources` row they can accept, edit or ignore.
   *
   * Suggestion only, and deliberately so: `total` here is what the book says at
   * the level the feature is gained, and nothing recomputes it afterwards. The
   * player owns the number once it is on their sheet.
   */
  resource?: { name: string; total: number; resets?: 'short' | 'long' }
  /**
   * Half proficiency this feature confers — a Bard's Jack of All Trades, a
   * Fighter's Remarkable Athlete. Sets `Character.halfProficiency`.
   *
   * On the feature rather than on `ClassKit` (where `unarmoredDefense` lives)
   * because it is gained at a *level*: a Bard has it from 2nd and a Fighter
   * from 7th, so a kit-level flag would hand it to a 1st-level character.
   *
   * Unlike `resource`, this is applied rather than offered. It is not a number
   * the player tunes — it is a rule about how another number is computed, and
   * the sheet already lets them override the result if they disagree.
   */
  halfProficiency?: HalfProficiency
}

/** Racial ability score increases, e.g. `{ con: 2 }` for a Dwarf. */
export type AbilityScoreIncrease = Partial<Record<Ability, number>>

/**
 * One shape a player-chosen ability increase can take.
 *
 * `increases` is one entry per ability the player picks, giving that ability's
 * bonus: `[1, 1]` is "two abilities, +1 each"; `[2, 1]` is "+2 to one and +1 to
 * another"; `[1, 1, 1]` is "+1 to each of three". Order is display order only —
 * which ability sits in which slot is not a fact worth keeping.
 */
export interface FlexibleAsiMode {
  /**
   * Shown on the mode card when a race offers a choice. Derived from
   * `increases` when absent, so a single-mode race need not name itself.
   */
  label?: string
  increases: Array<number>
}

export interface RaceInfo {
  /** Lookup/React key only. Never written to disk. */
  id: string
  /** What lands in `Character.race` when there is no subrace. */
  name: string
  /** One line shown on the option card. */
  summary: string
  asi: AbilityScoreIncrease
  /** Walking speed in feet. */
  speed: number
  /** Everything else this race hands out. */
  grant: Grant
  /**
   * Subraces, if any. A race with subraces requires one to be chosen — the
   * wizard gates the step on it.
   */
  subraces?: Array<SubraceInfo>
  /**
   * Increases the player chooses rather than the race fixing.
   *
   * One mode is a fixed spread (Variant Human and Half-Elf both take two +1s);
   * two or more means the player picks which shape to take, as a Goliath picks
   * between "+2 and +1" and "three +1s".
   *
   * This was `{ count, amount }` — N increases all the same size — and its
   * comment called it a flag rather than a mechanism because Variant Human was
   * the sole case. A second, differently-shaped case arrived, so it is a
   * mechanism now, but a deliberately small one: a list of amounts, and nothing
   * that computes. `{ count, amount }` could not express "+2 and +1" for any
   * single amount, which is why the shape changed rather than gaining a sibling
   * field. The legacy shape is still read from disk; see `parseRace`.
   */
  flexibleAsi?: Array<FlexibleAsiMode>
  /** Variant Human only: the player also takes a feat at level 1. */
  grantsFeat?: boolean
}

export interface SubraceInfo {
  id: string
  /**
   * What lands in `Character.race` — the full "Hill Dwarf", not "Hill". A sheet
   * should read the way a player would say it out loud.
   */
  name: string
  summary: string
  /**
   * Stacks on top of the parent race's `asi`.
   *
   * There is deliberately no `flexibleAsi` here. The draft holds one record of
   * placed increases, so a subrace offering its own spread would fight the
   * parent's over the same keys — that needs placements keyed by owner, which
   * is a mechanism rather than a field, and nothing needs it.
   */
  asi: AbilityScoreIncrease
  /** Overrides the parent's speed when set (Wood Elf's 35). */
  speed?: number
  grant: Grant
  /**
   * Extra max HP per level. Exists for exactly one SRD subrace — the Hill
   * Dwarf's Dwarven Toughness — and is read once in `buildCharacter`.
   *
   * If you are here to add a second one, add the field to that subrace and move
   * on. If you are here to add a fifth, the answer is still not a rules engine:
   * this app is a notebook, and the sheet is hand-editable for a reason.
   */
  hpPerLevel?: number
}

export interface BackgroundInfo {
  id: string
  /** What lands in `Character.background`. */
  name: string
  summary: string
  /** The background's named feature, e.g. Acolyte's "Shelter of the Faithful". */
  feature: GrantTrait
  grant: Grant
  /**
   * A few suggested personality traits/ideals/bonds/flaws to seed the markdown
   * body. Trimmed to a handful rather than the full d8 tables — the wizard only
   * needs enough to prompt, and the player types over it anyway.
   */
  suggestions?: {
    traits?: Array<string>
    ideals?: Array<string>
    bonds?: Array<string>
    flaws?: Array<string>
  }
}

/**
 * A feat — Alert, Sharpshooter, Resilient.
 *
 * Homebrew-authored in practice: `SRD_FEATS` is empty because SRD 5.1 has no
 * feat list, and the built-in tier exists only so a world (or a future
 * SRD-safe entry) can supply one without changing the merge layer.
 *
 * Deliberately built on `Grant` rather than a bespoke shape, so taking a feat
 * runs through the same `applyGrant` every race, background and kit already
 * uses. That is what makes a feat grant skills and proficiencies for real
 * instead of being a decorative name on the sheet.
 */
export interface FeatInfo {
  id: string
  /** What lands in `Character.feats`. */
  name: string
  summary: string
  /**
   * Shown to the player, **never checked**. Prerequisites are the part of feats
   * this app deliberately does not model: the table offers, the player decides.
   */
  prerequisite?: string
  /**
   * The half-feat ability bump ("+1 Constitution, and…"), applied like a racial
   * increase rather than merged like a list. Absent for a full feat.
   *
   * Fixed. When the feat lets the *player* choose which ability to raise, use
   * `asiChoice` instead — a feat should carry one or the other, never both.
   */
  asi?: AbilityScoreIncrease
  /**
   * The abilities a half-feat lets the player choose between, when its +1 is
   * theirs to place — Resilient's "one ability of your choice", Skill Expert's,
   * Weapon Master's "Strength or Dexterity".
   *
   * These used to be impossible to say. `asi` is a fixed record, so each of the
   * six choosable half-feats named the ability it is most often built around
   * and wrote "of your choice" in its summary — which meant a Skill Expert
   * quietly got +1 Dexterity whether or not that is what they wanted, and the
   * summary said something the app then did not do.
   *
   * That workaround existed because there was nowhere to *ask*. There is now:
   * the level-up picks step resolves it like any other choice, and creation
   * resolves it the same way. Still one point, still not a spread — the reason
   * feats were denied a chooseable spread stands; this is only about *which*
   * ability the single point lands on.
   *
   * Always the whole point: a feat offering a choice grants exactly 1.
   */
  asiChoice?: Array<Ability>
  /**
   * Whether the saving-throw proficiency follows the `asiChoice` the player
   * made. Exactly one feat needs it — Resilient, whose whole text is "choose an
   * ability, gain +1 and its save".
   *
   * A `grant.saves` cannot express that: it is a fixed list written before
   * anyone has chosen, which is why Resilient shipped a hardcoded Constitution
   * save and handed a Resilient (Strength) character the wrong one.
   */
  grantsSaveForAsiChoice?: boolean
  grant: Grant
}

/**
 * One "(a) or (b)" equipment decision. Resolved by index into `options`, so a
 * draft stores a number and the option's grant is applied at commit.
 */
export interface EquipmentChoice {
  /** Globally unique, same keyspace rule as `PickList.id`. */
  id: string
  label: string
  options: Array<EquipmentOption>
}

export interface EquipmentOption {
  /** Shown on the card, e.g. "chain mail" or "a martial weapon and a shield". */
  label: string
  grant: Grant
}

export interface SpellcastingInfo {
  ability: Ability
  /** Level 1 slots. Cantrips are level 0 and cost nothing. */
  slotsAtLevel1: number
  cantripsKnown: number
  /**
   * How many level 1 spells to pick. For preparers (cleric, druid, paladin,
   * wizard) this is the size of the starting pick, not a permanent cap.
   */
  spellsKnown: number
  /**
   * Whether this class prepares from a list each day rather than knowing a
   * fixed set. Drives `Character.preparedLimit`, which is `mod + level` for
   * preparers and 0 for everyone else.
   */
  prepares: boolean
  /** Label for the spell list, e.g. "Cleric spells". Shown on the step. */
  listLabel: string
  /**
   * Spell slots by character level: `slotsByLevel[3] = [4, 2]` means four 1st
   * and two 2nd level slots at character level 3. Only levels where the row
   * changes need an entry — `slotsAtLevel(kit, n)` walks back to the highest
   * defined level at or below `n`.
   *
   * Absent means this class has no progression table, and the level-up wizard
   * leaves its slots alone rather than guessing.
   */
  slotsByLevel?: Record<number, Array<number>>
  /**
   * Cantrips known, at the levels where the number changes. Same lookup rule as
   * `slotsByLevel`; absent means it never changes.
   */
  cantripsByLevel?: Record<number, number>
  /**
   * Spells known, at the levels where the number changes. Same lookup rule
   * again. Only the "known" casters have one — Bard, Ranger, Sorcerer and
   * Warlock. A preparer has no cap to track, and a wizard's spellbook grows by
   * a flat amount per level instead; see `spellbook`.
   */
  spellsKnownByLevel?: Record<number, number>
  /**
   * A wizard adds a fixed number of spells to their spellbook each level,
   * independent of how many they can prepare. `prepares` alone can't say this:
   * a cleric prepares from the whole list and adds nothing.
   */
  spellbook?: { perLevel: number }
}

/**
 * A subclass: the archetype chosen at level 1, 2 or 3 depending on the class.
 *
 * `Character.subclass` stores only this name, as free text, so everything here
 * is an affordance — a subclass the tables don't know contributes its name and
 * nothing else, exactly like a race or a class.
 *
 * Features use the same `{ level, name, text }` shape as `ClassKit.features`,
 * which is what lets `featuresGained` take class and subclass as two sources
 * through one code path.
 */
export interface SubclassInfo {
  /** React keys and lookups only. Never reaches disk. */
  id: string
  /** What lands in `Character.subclass`. */
  name: string
  summary?: string
  /** Features by the character level they are gained at. */
  features: Array<ClassFeatureInfo>
  /**
   * Domain, oath and circle spells: always prepared and exempt from the
   * prepared limit, which is what `Character.Spell.alwaysPrepared` models.
   * Keyed by the *spell* level, granted at the character level 5e says — the
   * level-up wizard reads `grantedAt` for that.
   */
  spells?: Array<SubclassSpells>
  /**
   * A patron's **expanded spell list** — spells added to the class list you may
   * learn from, not spells you are given.
   *
   * The Warlock's patrons are the reason this exists, and the distinction is
   * the whole point of the field. "The Fiend lets you choose burning hands and
   * command as warlock spells" is not the sentence `spells` above says. A
   * domain spell is handed over; a patron spell is merely *offered*, and the
   * warlock still spends one of their very scarce `spellsKnown` to learn it —
   * gaining nothing at all if they spend it elsewhere. Modelled as `spells`, a
   * 1st-level Fiend warlock would be handed two free spells on top of the two
   * they choose, doubling the scarcest resource the class has.
   *
   * So this is **not** `Array<SubclassSpells>` and must never become one.
   * `SubclassSpells` carries `grantedAt` because it is *applied*:
   * `applySubclassSpells` and `alwaysPreparedGained` compare it against the
   * character's level to decide what to write onto the sheet. Nothing here is
   * ever written anywhere. Keyed by **spell level** alone, because the only
   * consumer is a picker already filtered to the levels the character has
   * slots for — a patron's 3rd-level spells and a warlock's 3rd-level slots
   * arrive at the same character level by construction, so a `grantedAt` here
   * would be a second copy of a rule the slot table already states, free to
   * drift from it and silent when it does.
   *
   * **Contract: suggestion-only. No applier reads this field.** Its one reader
   * is `expandedSpellsFor` in lib/tables.ts, whose only callers are the two
   * spells steps' pickers. A name here reaches `Character.spells` solely by the
   * player choosing it, at which point it is an ordinary known spell and
   * nothing marks it otherwise. `buildCharacter.ts` and `levelUp.ts` do not
   * mention this field, and `expandedSpells.test.ts` asserts they never will.
   *
   * Level 0 is meaningless here — no published expanded list holds a cantrip —
   * but a homebrew author can write one, so the lookup handles the key rather
   * than assuming it absent.
   */
  expandedSpells?: Record<number, Array<string>>
  /** Rare, but real: Life Domain's heavy armor, Valor Bard's martial weapons. */
  grant?: Grant
  /**
   * A third-caster archetype's own spell progression — the Arcane Trickster's,
   * the Eldritch Knight's.
   *
   * Separate from `ClassKit.spellcasting` because the *class* is not a caster:
   * only this archetype is, and only from the level the archetype is chosen. A
   * block on the kit would hand every Thief a spell step at level 1 and claim a
   * progression a Rogue does not have, which is why these were prose for so
   * long — there was nowhere subclass-shaped to put them.
   *
   * Read through `spellcastingFor(kit, subclassName)`, never directly: it is
   * the one place the precedence rule lives, and it prefers this over the
   * class's own. `slotsByLevel` here is keyed by *character* level like every
   * other table, so a Rogue's starts at 3 rather than 1 — which is exactly why
   * `slotsAtLevel1` is 0 on one of these and the srd tests check a subclass's
   * numbers against `subclassLevelOf` instead.
   *
   * Nothing here is enforced, as ever. The wizard offers what the table says.
   */
  spellcasting?: SpellcastingInfo
}

/** One row of a subclass's always-prepared spell table. */
export interface SubclassSpells {
  /** The character level at which these are granted. */
  grantedAt: number
  /** Spell level, 1-9. */
  level: number
  names: Array<string>
}

/**
 * A class: what it is, and what it starts with.
 *
 * This is the *whole* definition. It used to be split in two — a per-world
 * `ClassInfo` (name, hit die, subclasses) that the character sheet read, and a
 * global kit that only the creation wizard read — which meant a homebrew class
 * travelled with a world folder while its starting gear did not, and you edited
 * one class in two places. They were always joined by name anyway.
 *
 * `hitDie` / `subclassLabel` / `subclasses` are the three fields the sheet
 * needs; everything else is creation-time. A class the tables don't know still
 * works on a sheet — `Character.class` is free text, and always was.
 */
export interface ClassKit {
  id: string
  name: string
  /** Hit die size, e.g. 10 for a d10. Read by the sheet, not just the wizard. */
  hitDie: number
  /**
   * What this class calls its subclass choice — "Sacred Oath" for a paladin,
   * "Otherworldly Patron" for a warlock. Used as the subclass field's
   * placeholder so the prompt matches the class you picked.
   */
  subclassLabel: string
  /**
   * Subclasses, always as full definitions **in memory**.
   *
   * On disk this field is a union: every build before subclasses carried
   * features wrote a bare string array, and a world file is never rewritten
   * just because it was opened, so `Array<string | SubclassInfo>` has to be
   * readable forever. That union is erased at the parsers — `parseSubclasses`
   * in `lib/homebrew.ts` — so no consumer ever sees a string.
   *
   * Keeping the union out of the in-memory type is deliberate. Were it here,
   * the obvious fix at each call site would be an inline
   * `typeof s === 'string' ? s : s.name`, which compiles, reads fine, and
   * quietly drops the features. A non-union type makes the compiler name every
   * site that has to be thought about.
   *
   * `serializeSubclass` writes a name-only entry back as a bare string, so a
   * file only gains objects for subclasses that genuinely carry something.
   */
  subclasses: Array<SubclassInfo>
  saves: Array<Ability>
  /** The class's skill list and how many to choose from it. */
  skillChoices: PickList
  grant: Grant
  equipment: Array<EquipmentChoice>
  /**
   * Features by the character level they are gained at, 1-20. Sorted by level
   * for display; `buildCharacter` takes the level 1 ones and the level-up
   * wizard takes the rest.
   */
  features: Array<ClassFeatureInfo>
  /**
   * Levels at which this class gains an Ability Score Improvement — [4, 8, 12,
   * 16, 19] for most, with Fighter and Rogue getting extras. Absent means the
   * wizard never offers one, which is right for a homebrew class that hasn't
   * said.
   */
  asiLevels?: Array<number>
  /**
   * The class's own spell progression, for a class that casts from level 1 (or
   * 2, for the half casters).
   *
   * Absent on a class whose *archetype* casts and whose base class does not —
   * a Rogue is not a caster because an Arcane Trickster is. That case is
   * `SubclassInfo.spellcasting`, which overrides this when both are present.
   * Always read the pair through `spellcastingFor`.
   */
  spellcasting?: SpellcastingInfo
  /**
   * Barbarian and Monk compute AC from ability scores rather than armor.
   * Without this they show a visibly wrong starting AC.
   */
  unarmoredDefense?: 'con' | 'wis'
  /**
   * Whether the subclass is chosen at level 1 (Cleric, Sorcerer, Warlock) or
   * later. Drives whether the Class step shows a subclass picker or a muted
   * "chosen at level 3" note.
   *
   * @deprecated Superseded by `subclassLevel`, which can say "2". Still read
   * from disk — files written by older builds only have this — and still
   * written, so an older build opening the same file finds what it expects.
   * `subclassLevelOf` in `lib/tables.ts` resolves the two.
   */
  subclassAtLevel1?: boolean
  /**
   * The character level at which this class chooses its subclass. 1 for Cleric,
   * Sorcerer and Warlock, 2 for Wizard, 3 for everyone else.
   *
   * The boolean above could not express Wizard's level 2, so a Wizard fell
   * through to the level-3 default. Harmless while a subclass was only a name;
   * once it carries features, an Evocation Wizard got Sculpt Spells a level
   * late.
   */
  subclassLevel?: number
  /**
   * A sensible ability priority for the one-click auto-assign on the standard
   * array and rolled methods. Highest first.
   */
  abilityPriority: Array<Ability>
}
