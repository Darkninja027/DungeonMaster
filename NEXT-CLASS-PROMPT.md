# Handoff: author the next class's subclass data

Paste this into a fresh Claude Code context in `c:\Projects\DungeonMaster`.

---

## The task

Author per-level subclass features for **one class at a time**. Fighter,
Rogue, Barbarian and Bard are done; the other eight ship `features: []` on
every subclass:

```
Cleric 0/7      Druid 0/2     Monk 0/3      Paladin 0/3
Ranger 0/2      Sorcerer 0/2  Warlock 0/3   Wizard 0/8
```

**Next up: Cleric.** Two things make it unlike the four done so far:

- **Its subclass is chosen at level 1**, so every domain feature starts at 1
  and the wizard offers the choice during *creation* as well as level-up.
  `subclassLevelOf` returns 1 — check your feature levels against it, not 3.
- **Domain spells.** `SubclassInfo.spells` is authored nowhere yet, and Cleric
  is what it was designed for: `{ grantedAt, level, names }` rows that land as
  `alwaysPrepared` and are exempt from `preparedLimit`. Read
  `alwaysPreparedCount` before authoring, and note `srd.test.ts` already asserts
  every bonus-spell row has something that can cast it.

Seven domains is a lot; Life Domain is the SRD one, so start there and see
"Which subclasses belong in `lib/srd/`" below before doing the other six.

Do that one class completely, then stop. Do not batch.

## Which subclasses belong in `lib/srd/`

**SRD 5.1 licenses exactly one subclass per class.** `classKits.ts` seeds every
archetype 5e offers as a *name*, which is fine — a name is not what the licence
is about — but the moment one gains features it is content, and PHB content does
not belong under that folder's CC BY 4.0 attribution.

So there are two homes, and `subclasses.test.ts` enforces the split:

| Class | SRD (author in `lib/srd/`) | Everything else |
|---|---|---|
| Cleric | Life Domain | `lib/subclasses/publishedSubclasses.ts` |
| Druid | Circle of the Land | ” |
| Monk | Way of the Open Hand | ” |
| Paladin | Oath of Devotion | ” |
| Ranger | Hunter | ” |
| Sorcerer | Draconic Bloodline | ” |
| Warlock | The Fiend | ” |
| Wizard | School of Evocation | ” |

`publishedSubclasses.ts` is keyed by class name and overlays the stub via
`layerSubclasses`; it is wired into **both** `SRD_TABLES` and `mergeTables`
(wiring one and not the other is a real trap — there is a test for it).
Precedence is world > global > published > SRD.

Known debt: Battle Master, Eldritch Knight, Assassin and Arcane Trickster are
PHB archetypes whose content sits in `lib/srd/` because it was authored before
this boundary existed. `subclasses.test.ts` pins them in an explicit list so
they cannot be joined by more. Moving them is a mechanical follow-up.

This is **data authoring against a finished mechanism**. If you find yourself
rewriting `levelUp.ts` or `buildCharacter.ts`, stop and re-read this document —
though see "Bugs found by using the app", because the seam between data and
sheet has been where every real bug hid.

## Start here

Read in this order before touching anything:

1. `CLAUDE.md` — especially the `lib/srd/` section. Its rules are load-bearing.
2. `client/src/lib/srd/types.ts` — `ClassFeatureInfo`, `PickList`, `Grant`,
   `SubclassInfo`.
3. `client/src/lib/srd/classKits.ts`, the **Fighter and Rogue kits** — the two
   worked examples.
4. `client/src/lib/srd/srd.test.ts` — the invariants that will fail you.

## The mechanism you are authoring into

A subclass feature is a `ClassFeatureInfo`:

```ts
{ level: number; name: string; text?: string; picks?: PickList[]; resource?: {...} }
```

### `picks` — a choice whose answer is a feature

Use `kind: 'feature'` when the feature *is* a menu (totem spirits, manoeuvres,
invocations, metamagic). The chosen option lands in `Character.features`.

- `featureLabel` prefixes the row: `'Totem Spirit'` → `"Totem Spirit: Bear"`.
  Omit where the option already names itself.
- `featureText` is a `Record<option, string>` — **every** option needs one.
- `featureGrant` is a `Record<option, Grant>`, for an option that lands on a
  number the sheet holds. Most carry nothing, and that is *correct rather than
  incomplete*.
- Pick ids are globally unique. Prefix with the owner: `totem-warrior-3-spirit`.
  A repeated grant at several levels needs a **factory** — see
  `MANEUVER_PICK(owner, count)` and `FIGHTING_STYLE_PICK(owner, only?)`.

A repeated pick's option list must be long enough for every level that draws
from it — `srd.test.ts` asserts it, summing `count` per identical option list.
**Only for closed picks**: the check skips `open` ones, as does the
`featureText` completeness check. If you author an open feature pick, write
your own text-completeness test, because nothing else will.

**`featureLabel` must differ per level when a pick repeats.** This is the
subtlest trap in the file and Totem Warrior is the worked example. `spentElsewhere`
greys out any option already on the sheet under the row name a pick *would*
write, and `applyFeaturePick` de-dupes on that same string. A shared label
therefore means taking the same option twice is impossible — and if the player
manages it, the second row is silently swallowed. Battle Master gets away with
one label because a manoeuvre genuinely cannot be taken twice; a totem can, so
each level writes its own row (`Totem Spirit: Bear` at 3, `Aspect of the
Beast: Bear` at 6). Where a repeated pick's *text* also varies by level, key
the text table by level and have the factory take it — see `TOTEM_TEXT`.

### `resource` — a counter the sheet tracks

`{ name, total, resets?: 'short' | 'long' }`. Offered at level-up, never
auto-applied. A later feature naming the same resource **raises** it (4 → 5,
shown as `4 → 5`, `used` untouched); it never lowers one the player tuned
higher. Cap is `MAX_RESOURCES = 3`.

**Several classes still have no `resource` anywhere** — Monk has no Ki,
Sorcerer no Sorcery Points, Warlock no Mystic Arcanum. Those are class-level
gaps rather than subclass ones; fixing one while you are in that class is
reasonable (Rogue's level-6 Expertise, Barbarian's Rage and Bard's Bardic
Inspiration were all fixed that way), but say so explicitly rather than sliding
it in. Only three counters fit on a sheet, so pick the one the class spends.

A counter is for something with a `used` count. A *scaling number* is not one:
Barbarian's rage damage (+2/+3/+4) and the Bardic Inspiration **die** (d6 → d12)
both stayed out, and so should Monk's martial arts die. The die still gets its
own feature rows at 5/10/15 — a scaling number is not a counter, but it is
still not prose either.

Two limits worth knowing before you author one:

- **The total can be a suggestion.** Bardic Inspiration's is the Charisma
  modifier, which no table can know, so it ships `3` and the step renders an
  editable number box beside the row. A figure the player corrects once beats a
  feature that never reaches the sheet.
- **`resourcesOffered` gates only on `total`.** A feature that changes *when* a
  counter resets without changing its size — Bard's Font of Inspiration, long to
  short at 5th — is dropped and never offered. Say it in the feature text and
  let the player edit the row; do not invent a total change to force an offer.

### Scaling numbers are separate feature rows

De-dupe is keyed on `level:name`, and only a repeated name at the *same* level
is forbidden. So upgrades are their own rows:

```ts
{ level: 5,  name: 'Extra Attack' }
{ level: 11, name: 'Extra Attack (2)' }
```

Never fold "three times at 11th level" into the level-5 row's prose.

## Rules that will bite you

- **Every subclass feature must be at `level >= subclassLevelOf(kit)`.**
  Barbarian is 3; Cleric/Sorcerer/Warlock are 1; Wizard is 2.
- **`sub.spells` needs a `spellcasting` block** — on the class *or* the
  subclass. See "Third casters" below.
- **Ids never reach disk.** `Character.subclass` stores the display name.
- **No rules text you do not own.** Summaries are one line, in our own words.
- **`traits`, `items`, `currency` and nested `picks` are banned in a
  `featureGrant`** — the apply paths drop them.
- A subclass **`grant`** *is* applied now (`applyFeatGrants`, on the level-up
  that chooses the archetype) — see the Assassin's tool proficiencies. It drops
  `traits`/`items`/`currency` just like a feat's.

## Third casters — `SubclassInfo.spellcasting`

Added for Arcane Trickster and Eldritch Knight. A **class-wide** `spellcasting`
block would give every Thief a spell step at level 1, so a subclass carries its
own. Read the pair through **`spellcastingFor(kit, subclassName)`** in
`lib/tables.ts` — never `kit.spellcasting` directly.

Related: **`spellListClass(kit, subclassName)`** answers "whose spell list?" —
an Arcane Trickster is a Rogue casting *wizard* spells, and filtering
suggestions by "Rogue" returned an empty list. Derived from `listLabel`.

Not relevant to Barbarian, but the pattern to copy if a subclass ever casts.

## Verification

```sh
cd client
npx vitest run src/lib/srd/srd.test.ts      # the data invariants
npx vitest run src/lib/levelUp.test.ts      # the mechanism
npx vitest run                              # all 1259
npx tsc --noEmit -p tsconfig.json
npm run lint                                # NOTE: 14 pre-existing problems
```

`npm run lint` **does not reach zero on a clean tree** — 9 errors and 5 warnings
in unrelated files. Grep for the files you touched; do not fix the rest.

`electron/main/*.test.ts` (temp folders) and `src/lib/spellCard.test.ts`
intermittently fail under parallel load. **If the full suite reports exactly one
failure, re-run before investigating** — re-run the file alone to confirm.

Add tests mirroring the Fighter and Rogue blocks in `levelUp.test.ts`
(`describe('archetype features')`, `'manoeuvres already known'`, `'a tracked
resource that grows with the class'`).

### Progression tables: assert every level

Tables are **sparse** — only levels where a number changes get a row, and
lookups walk back to the highest row at or below the level asked for. That hides
off-by-ones completely: the Arcane Trickster's Spells Known was wrong from level
10 to 20 and passed a full green suite.

If you author any table of numbers, write a test that walks **every level** and
asserts against the printed one (see `atLevel` in `srd.test.ts`), then **break
one value and confirm the test fails naming that level**. A test that passes
vacuously is worse than none. Ask the user to paste the printed table rather
than guessing — the two conflicting sources in this repo were resolved that way.

## Bugs found by using the app, not by tests

Four bugs shipped green in the Rogue work and were only caught by the user
trying the level-up wizard. All lived in the seam between the data layer and
what reaches the sheet:

1. Spell suggestions filtered by class name → **empty list** for a third caster.
2. Suggestions filtered to only the *highest* slot level → 1st-level spells
   hidden from a 7th-level character.
3. A granted spell (Mage Hand) not shown during selection, so the picker read as
   though it were still owed.
4. `spellAbility` never set at level-up → **spell save DC and attack bonus both
   `null`**.

The pattern: tests asserted on *counts* and *plan fields*, never on what the UI
actually offers. **Drive the app before calling a class done.** `npm run dev`,
level a character of that class through the archetype levels, and look at the
sheet.

The Barbarian pass added a fifth, found the same way: a `feature` pick renders
through `FeatureSelects`, a **native `<select>` that ignored `pick.open`
entirely**. So an open feature pick offered a closed dropdown — the data layer
accepted a typed answer the whole time and only the UI refused to ask. Fixed
there (an "Other…" entry that swaps in a text box), with
`PickListGroup.test.tsx` covering it. The lesson generalises: a field's meaning
in `lib/` proves nothing about whether the control honours it. Grep the
component for the field before trusting it.

The memory note `driving-dungeonmaster-e2e` has a verified Playwright recipe —
lock patch by regex, poll for the non-DevTools window, hash-history deep links.
Also: the level-up wizard opens by **typing a higher number into the `Lvl`
field** and pressing Enter, not from a button.

## Line endings — read this

Most files are **LF**, but `src/lib/levelUp.ts` and `src/lib/buildCharacter.ts`
are **CRLF**. Prettier silently flips them and turns a 300-line diff into a
4000-line one. After formatting:

```sh
cd c:/Projects/DungeonMaster
for f in $(git diff --name-only); do
  o=$(git show HEAD:"$f" | file - | grep -c CRLF); n=$(file "$f" | grep -c CRLF)
  [ "$o" != "$n" ] && echo "MISMATCH $f"
done
```

Restore with a Python round-trip (`newline=''`, `.replace('\r\n','\n')` then
`.replace('\n','\r\n')`) rather than re-running prettier.

## Where things stand

1341 tests passing (`spellCard.test.ts` still flakes under full-suite parallel
load — re-run it alone). Done and tested — do not rebuild:

- Subclass features flow through `featuresGained` (class + subclass, one path).
- A shared picks step at level-up; `feature` pick kind rendered as a `<select>`,
  which now honours `open` with an "Other…" free-text entry.
- `Character.resources` — up to 3 counters, on the sheet and the printed page.
- **Fighter** 3/3, **Rogue** 3/3, **Barbarian** 2/2 and **Bard** 2/2 archetypes
  authored.
- Barbarian class-level fixes that came with it: Rage is a real counter
  (2/3/4/5/6 at 1/3/6/12/17, unlimited at 20 left as prose — `total` is a
  number), and Brutal Critical is three rows at 9/13/17 instead of one row
  whose prose mentioned the upgrades.
- Bard class-level fixes: Expertise is a real `kind: 'expertise'` pick at 3
  **and** 10 (it was prose at 3 and missing entirely at 10), Bardic Inspiration
  is a counter with its die scaling at 5/10/15, and Magical Secrets is three
  rows at 10/14/18.
- **`lib/subclasses/publishedSubclasses.ts`** — the tier for PHB archetypes,
  matching `publishedFeats.ts` and `publishedRaces.ts`. Holds Path of the Totem
  Warrior and College of Valor; wired into `SRD_TABLES` *and* `mergeTables` via
  `withPublishedSubclasses`, and guarded by `subclasses.test.ts`.
- `SubclassInfo.spellcasting` + `spellcastingFor` + `spellListClass`.
- `SubclassInfo.grant` applied at level-up (was declared but inert).
- Spell/cantrip **picking** at level-up: `LevelUpDraft.cantrips`/`.spells`,
  `cantripsToPick`/`spellsToPick`/`spellsGranted` on the plan, a shared
  `SpellList` control and `useSpellSuggestions` hook.
- `spellsKnownByLevel` authored for Bard, Sorcerer, Warlock, Arcane Trickster
  and Eldritch Knight, each with an all-levels test.
- `srd.test.ts`'s `allPickLists()` now walks `features[].picks` — those escaped
  four invariants for as long as they existed.

Two things landed alongside the Bard pass, both answers to "does that actually
work?" rather than data authoring:

- **Half proficiency computes.** `Character.halfProficiency` is `'all' |
  'physical' | null`, read by `skillBonus` and set at level-up from a new
  `ClassFeatureInfo.halfProficiency`. Jack of All Trades (all skills, rounded
  down) and Remarkable Athlete (Str/Dex/Con, rounded **up**) were both prose
  that computed nothing. A real field rather than a feature-name lookup, because
  `ClassFeature` carries no id and a rename in Obsidian would silently drop the
  bonus. Editable on the sheet, omitted from frontmatter when absent.
  It reaches the eighteen skill rows and stops there — 5e applies it to bare
  ability checks too, and the sheet has no row for those.
- **Custom subclasses are editable.** `SubclassEditor` + `FeatureRows` replace
  the old names-only `TokenField`, which lost a subclass's features on rename.
  The data layer already round-tripped all of this; only the UI was missing.
  Bonus spells and a subclass `grant` still have no editor — they are *kept*
  across an edit and the panel says so. Domain spells will want one; see Cleric.

Known gaps, deliberately left:

- **Wizard spellbook.** `SpellcastingInfo.spellbook.perLevel` is declared,
  authored nowhere and read nowhere. A Wizard picks cantrips at level-up but no
  spells. Wiring it is a fourth counting rule and its own job.
- **Superior Technique** (Fighting Style) grants a manoeuvre *and* a d6. The die
  is offered; the manoeuvre is not — that needs a pick that poses another pick.
- **Spell swapping.** 5e lets a caster replace one spell per level. Deliberately
  not built: `applyLevelUp` only ever appends, and a swap deletes a player's
  work.
- **School restrictions** (a Trickster's enchantment/illusion rule) are prose,
  never validated.
