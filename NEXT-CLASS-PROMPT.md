# Handoff: author the next class's subclass data

Paste this into a fresh Claude Code context in `c:\Projects\DungeonMaster`.

---

## The task

Author per-level subclass features for **one class at a time**. Fighter,
Rogue, Barbarian, Bard, **Cleric**, **Druid**, **Sorcerer**, **Paladin**,
**Monk** and **Ranger** are done; the other two ship `features: []` on every
subclass:

```
Warlock 0/3   Wizard 0/8
```

**Next up: your pick of the two.** The **Warlock** is not a pure data pass —
its patron spell lists are "added to your spell list" rather than always
prepared, which is a mechanism question; see below. **The Wizard is data-only**,
and is the larger job at eight schools; its `subclassLevel: 2` is already
declared correctly, and the inert `spellbook.perLevel` gap sits next to it as
its own separate job.

> **The Paladin pass corrected this section's advice, and the half-caster pass
> then closed the hole it found.** Paladin was recommended as the data-only
> class because "its oath spells are genuinely always-prepared, so they fit
> `SubclassInfo.spells` exactly as the cleric domains do" — true of the *field*
> and false of the *tests*: a Paladin had no `spellcasting` block, one invariant
> required `spellcastingFor` be defined for any subclass carrying `spells`, and
> another required the block stay undefined. The oaths' features shipped first
> and their spells followed once **both half casters gained a real casting
> table**. The lesson stands even though the blocker is gone: check that the
> mechanism a data pass assumes actually exists before trusting the advice.

> **The Ranger pass then found the mirror image of that mistake, in this
> document's own advice.** This section used to say "the Ranger's conclaves can
> carry `spells` because the half-caster pass gave it a real casting table" —
> every word true of the *mechanism*, and false of the *book*. The PHB gives
> Hunter and Beast Master **no bonus spells at all**; a conclave spell list is a
> Xanathar's feature (Gloom Stalker, Horizon Walker, Monster Slayer), and this
> repo ships no Xanathar's content.
>
> What makes it worth recording is that **nothing would have caught it**. The
> invariant "only spellcasting classes grant bonus spells" asks only that
> `spellcastingFor(kit, sub)` be *defined* — and for a Ranger it now is, so a
> fabricated table would have passed a fully green suite and quietly handed the
> character ten free always-prepared spells. So the Paladin's lesson has a
> second half: having checked the mechanism exists, check the *source* actually
> says the data exists too. `subclasses.test.ts` now pins the absence.

**Check `subclassLevel` before you author anything.** Two classes have now had
the same bug: the kit declared no `subclassLevel`, so `subclassLevelOf` returned
the default 3 while the class's own `... Circle` / `... School` feature row sat
at 2. The Wizard was fixed earlier; the **Druid** was fixed in its pass. If the
class you are authoring picks at anything other than 3, confirm the kit says so
— `subclasses.test.ts` will reject a legitimate feature below the declared
level, and the level-up wizard asks a level late.

Do one class completely, then stop. Do not batch.

### The Warlock needs a decision first

It looks like the natural next class — it picks at level 1 like the Cleric and
the Sorcerer — but a patron's **expanded spell list is not always-prepared**. In
5e those spells are "added to your spell list", i.e. choosable as spells known;
`applySubclassSpells` writes every `SubclassInfo.spells` row with
`alwaysPrepared: true` (`buildCharacter.ts`), which is right for a domain, an
oath and a circle, and wrong here. Authored as-is, a warlock would get ~10 free
spells they never spent a known-slot on.

Three options, none of them chosen yet: omit the expanded lists and keep them as
feature-text reminders; give `SubclassSpells` an opt-out flag and teach both
appliers about it; or model "added to your list" as suggestions in the picker.
The first is cheap and honest, the third is probably right. **This is a
mechanism question, so it is its own pass** — do not slide it into a data one.

### What the Cleric pass changed (read if you touch creation)

The Cleric needed mechanism, not just data, and both gaps are now closed:

- **A level-1 subclass reaches the sheet at creation.** The subclass rides
  `draftGrants` / `draftOwnedPickLists` in `characterDraft.ts` — the two
  documented mirrors — so its `grant` lands the way a race's does and its
  level-1 feature picks are offered in the wizard's Class step.
  `buildCharacter` folds in `featuresUpToLevel(subclass.features, 1)` and reads
  `spellcastingFor(kit, subclassName)` rather than `kit.spellcasting`.
- **`SubclassInfo.spells` is wired.** `applySubclassSpells` in
  `buildCharacter.ts` writes always-prepared rows at creation;
  `alwaysPreparedGained` on the level-up plan does the same for rows arriving at
  `grantedAt` 3/5/7/9. It is deliberately *outside* the `plan.subclassName`
  branch — that field is null on every level-up after the archetype is chosen,
  so keying off it delivers the first row and silently drops the rest.

Three further bugs were found by reading the code and fixed with it:

- **`needsSubclass` could never fire for a level-1 class.** It gated on
  `at > from`, and a Cleric's `at` is 1 while every level-up starts at 1 or
  above — so a cleric created without a domain was never asked again, at any
  level, forever. Now gates on `at <= to`; the existing "already has one" guard
  is what stops it re-asking.
- **The creation picker gated on the deprecated `subclassAtLevel1` flag** while
  level-up used `subclassLevelOf`. A homebrew kit setting only
  `subclassLevel: 1` got no picker. Now both use `subclassLevelOf`.
- **"chooses their subclass at 3rd level" was hardcoded** — wrong for a Wizard.
  Now reads the real level (verified in the app: "at 2nd level").

And one test blind spot: **`allGrants()` in `srd.test.ts` never walked
`SubclassInfo.grant`**, so every subclass grant in the tables was unchecked by
the "real ids" invariants. It walks them now — the same class of miss as the
`features[].picks` one before it.

## Which subclasses belong in `lib/srd/`

**SRD 5.1 licenses exactly one subclass per class.** `classKits.ts` seeds every
archetype 5e offers as a *name*, which is fine — a name is not what the licence
is about — but the moment one gains features it is content, and PHB content does
not belong under that folder's CC BY 4.0 attribution.

So there are two homes, and `subclasses.test.ts` enforces the split:

| Class | The SRD-licensed one | Everything else |
|---|---|---|
| Cleric | Life Domain — authored in `lib/srd/` | `lib/subclasses/publishedSubclasses.ts` |
| Druid | Circle of the Land — authored in `lib/srd/` | ” |
| Sorcerer | Draconic Bloodline — **published tier**, see below | ” |
| Monk | Way of the Open Hand | ” |
| Paladin | Oath of Devotion | ” |
| Ranger | Hunter | ” |
| Warlock | The Fiend | ” |
| Wizard | School of Evocation | ” |

**Being the SRD one does not oblige you to author it in `lib/srd/`.** The
Sorcerer pass put Draconic Bloodline in the published tier instead, and that is
the better default from here on. The reasoning: `classKits.ts` seeded it as a
*name only*, and the licence is about the features, not the name — so once
written, its features are the PHB's text restated in our words and sit perfectly
well beside Wild Magic under the published tier's own provenance. Keeping the two
origins of one class in one file also means a reader sees the class whole, and
`layerSubclasses` overlays the bare stub either way.

The rule that actually binds is narrower: **anything you author in `lib/srd/`
must be SRD 5.1, and the pinned list in `subclasses.test.ts` is the gate.** That
list has no Sorcerer entry, so authoring Draconic Bloodline into `classKits.ts`
now *fails* — which is the tripwire doing its job. If you do choose `lib/srd/`
for a future class's licensed archetype, you must add the `Class/Subclass` string
to that list deliberately.

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

**That exception has now been paid off.** Cleric, Sorcerer and Warlock choose
at level 1, and the creation path used to ignore subclasses entirely. The Cleric
pass built that mechanism and the Sorcerer pass confirmed it holds for a second
class without a line of new mechanism — see "What the Cleric pass changed"
above. The Warlock is level-1 too, but its blocker is its spell lists rather
than the creation path; see the warning near the top.

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

**Two classes still have no `resource` anywhere** — Warlock
(Mystic Arcanum) and Wizard (Arcane Recovery). The **Ranger** also has none,
and its pass deliberately *declined* to add one rather than leaving a gap:
Primeval Awareness spends a spell slot the sheet already tracks, Foe Slayer is
a once-per-turn rule with no pool, and a Beast Master companion's hit points
are a scaling number. Not every class has a counter to find — a pass that goes
looking should be willing to come back empty and say so. The Paladin's were added in its
own pass (Channel Divinity at 3, Divine Sense at 1), and the Monk's Ki in its
own. Barbarian, Bard, Cleric, Druid, Fighter, Monk and Sorcerer each have a
class-level one; Cleric's Channel Divinity, Druid's Wild Shape, the
Sorcerer's Sorcery Points and the Monk's Ki were added in their own passes. The Rogue's only counter is the Arcane
Trickster's level-17 Spell Thief, so a Thief still has none — a *subclass*
resource does not close a class's gap.
Those are class-level
gaps rather than subclass ones; fixing one while you are in that class is
reasonable (Rogue's level-6 Expertise, Barbarian's Rage and Bard's Bardic
Inspiration were all fixed that way), but say so explicitly rather than sliding
it in. Only three counters fit on a sheet, so pick the one the class spends.

A counter is for something with a `used` count. A *scaling number* is not one:
Barbarian's rage damage (+2/+3/+4) and the Bardic Inspiration **die** (d6 → d12)
both stayed out, and so did Monk's martial arts die. The die still gets its
own feature rows — a scaling number is not a counter, but it is still not prose
either.

> This paragraph said those rows sat at **5/10/15** until the Monk pass, and
> that was simply wrong: the die scales at **5/11/17**, and unarmored movement
> at 2/6/10/14/18. The repo had no monk table to check it against, so the guess
> sat here unchallenged. Two lessons, both old ones: a number written while
> documenting a *rule* still needs the same sourcing as a number written into
> the tables, and where the repo has no source of truth, go and get one.

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
  Cleric/Sorcerer/Warlock are 1; Druid and Wizard are 2; everything else is 3.
  Check the kit rather than trusting that list — see the warning above.
- **`sub.spells` needs a `spellcasting` block** — on the class *or* the
  subclass. See "Third casters" below.
- **Ids never reach disk.** `Character.subclass` stores the display name.
- **No rules text you do not own.** Summaries are one line, in our own words.
- **`traits`, `items`, `currency` and nested `picks` are banned in a
  `featureGrant`** — the apply paths drop them.
- A subclass **`grant`** is applied on **both** paths now. At level-up it goes
  through `applyFeatGrants` on the level-up that chooses the archetype (see the
  Assassin's tool proficiencies), which drops `traits`/`items`/`currency` just
  like a feat's. At creation — for a class picking at level 1 — it rides
  `draftGrants` instead and goes through `applyGrant`, which keeps all three.
  The asymmetry is real: do not author `items` on a subclass and expect them at
  3rd.

## Third casters — `SubclassInfo.spellcasting`

Added for Arcane Trickster and Eldritch Knight. A **class-wide** `spellcasting`
block would give every Thief a spell step at level 1, so a subclass carries its
own. Read the pair through **`spellcastingFor(kit, subclassName)`** in
`lib/tables.ts` — never `kit.spellcasting` directly.

Related: **`spellListClass(kit, subclassName)`** answers "whose spell list?" —
an Arcane Trickster is a Rogue casting *wizard* spells, and filtering
suggestions by "Rogue" returned an empty list. Derived from `listLabel`.

The pattern to copy if a subclass ever casts. Note `buildCharacter` reads
through `spellcastingFor` too, so a level-1 archetype with its own block works
at creation as well.

## Verification

```sh
cd client
npx vitest run src/lib/srd/srd.test.ts      # the data invariants
npx vitest run src/lib/subclasses/          # the SRD/published boundary
npx vitest run src/lib/levelUp.test.ts      # the mechanism
npx vitest run src/lib/buildCharacter.test.ts   # creation, for a level-1 class
npx vitest run                              # all 1569
npx tsc --noEmit -p tsconfig.json
npm run lint                                # NOTE: 14 pre-existing problems
```

`--reporter=basic` was **removed in Vitest 4** (the repo is on 4.1.10) and fails
with "Failed to load url basic". Use `--reporter=dot` or the default.

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

The Cleric pass drove the app and found no new bug of that kind — but only
because the whole point of the pass was the creation path, which it exercised
directly. Two notes for the next driver: the wizard's rail buttons are
`disabled` until their step is reachable, so navigate with real Playwright
clicks on **Next** rather than a DOM `.click()` (which does not advance), and
the Class step's live summary panel re-renders on every keystroke, so typing a
subclass name is enough to see its grant appear in Proficiencies.

The Sorcerer pass found its by **reading a comment and not believing it**, and
it is the widest-reaching one yet: `srd.test.ts`'s two walkers iterated
`SRD_CLASS_KITS`, the *raw* table, while both `publishedSubclasses.ts`'s header
and `subclasses.test.ts`'s own doc comment claimed the merged `SRD_TABLES` were
walked and that "pick ids, skill ids, feature levels" were therefore covered.
They were not. `SRD_TABLES.kits` is `withPublishedSubclasses(SRD_CLASS_KITS)` — a
different array — so for **every entry in the published tier** pick-id global
uniqueness, skill-id validity, `featureText` completeness, the closed-pick
option-count rule and the banned-`featureGrant`-fields rule all silently skipped.
Nine subclasses' worth of data, including the `totem-warrior-*` pick ids, had
never been shape-checked at all.

Both walkers now read `SRD_TABLES.kits`, which was a two-line change, and the
four invariants started covering the tier at once. Verified by planting a
duplicate pick id and confirming the failure named
`kit Cleric/Knowledge Domain`, then by deleting one `featureText` entry and
confirming it named the option. Scoped to those two walkers deliberately: the
~30 other `SRD_CLASS_KITS` loops assert things *about the SRD table* — the pinned
"authored in lib/srd" list among them — and switching those would change what
they mean. Two comments corrected to describe what is now true, with a note that
narrowing the walkers back silently un-covers the whole tier.

The lesson is the one this file keeps relearning at a new altitude: a comment
asserting that a test covers something is not a test. Grep for the import.

The Druid pass found its bug by **reading** rather than driving, and it is the
kind worth looking for first: the kit declared no `subclassLevel` while its own
feature row sat at 2, so four level-2 circle features could not be authored at
all. A class's own data disagreeing with itself is cheap to check and blocks
everything downstream — do it before you write a line.

Its one driving lesson is about the probe, not the app: `levelUpSteps(draft)`
takes the draft alone, not `(character, draft)`. A wrong-arity call inside
`page.evaluate` throws `Cannot read properties of undefined`, which reads
exactly like an app crash. Check the signature before believing the app broke.

The Monk pass found a **mechanism** hole by reading, and fixed it — the one
place this pass went past pure data. `Grant.spells` on a subclass is applied by
`applyFeatGrants` and reaches the sheet, but `levelUpSteps` opens the spells
step only when slots, cantrips known or spells known change, all of which read a
`spellcasting` block. For a class that does not cast, the step never opens — and
the spells step was the **only** renderer of `plan.spellsGranted`.
`LevelUpSummary`, which is visible on every step including Review, rendered
`spellsAdded` (what the player chose) and never the granted ones. So a subclass
granting a cantrip to a Monk applied it to the sheet having announced it
nowhere: the exact seam that produced bug #3 above, with the data layer entirely
correct and only the surface missing. `LevelUpSummary` renders `spellsGranted`
now, which closes it for every class. Way of Shadow's minor illusion still stays
prose, for the separate reason above — a fix that makes something *visible* does
not make it *honest*.

The generalisable bit: `plan.spellsGranted` was populated correctly the whole
time, and every test asserting on it passed. "The data is right" and "the player
is told" are different claims, and only one of them had a test.

The Monk pass also spent longer fighting its own probe than the app, twice, both
worth knowing. `featuresGained(c, from, to, kit, subclassName)` takes five
arguments, not a draft — a wrong-arity call throws inside `page.evaluate` and
reads exactly like an app crash, which is the same trap the Druid pass hit with
`levelUpSteps`. And `levelUpPicks` returns `{ pick, owner, ownerKind }`
wrappers, not bare `PickList`s. Check the signature before believing the app
broke.

Driving notes for the next author, all found the hard way: the sheet's `Lvl` box
is `type=text` with **no aria-label** — find it by its parent cell's text. A
counter renders as `<input value="Ki">` plus two number boxes in the order
**name, total, used**, so `document.body.innerText` cannot see it at all and a
screenshot is the only other witness. The level-up wizard's rail lists every
step's *name* on every step, so matching dialog text for "Elemental Discipline"
is a false positive on step 1 — break on the control appearing instead. And a
3 → 6 level-up **stops at Ability scores**, correctly, because Next is disabled
until the ASI is spent: the steppers are `aria-label="Raise Dexterity"`. A
driver that does not answer the ASI never reaches the Choices step and looks
exactly like a missing pick.

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

1569 tests passing (`spellCard.test.ts` and `electron/main/*.test.ts` still
flake under full-suite parallel load — re-run alone before investigating; a
`recents.test.ts` failure did exactly that during the Cleric pass). Done and
tested — do not rebuild:

- Subclass features flow through `featuresGained` (class + subclass, one path).
- A shared picks step at level-up; `feature` pick kind rendered as a `<select>`,
  which now honours `open` with an "Other…" free-text entry.
- `Character.resources` — up to 3 counters, on the sheet and the printed page.
- **Fighter** 3/3, **Rogue** 3/3, **Barbarian** 2/2, **Bard** 2/2,
  **Cleric** 7/7, **Druid** 2/2, **Sorcerer** 2/2, **Paladin** 3/3,
  **Monk** 3/3 and **Ranger** 2/2 archetypes authored.
- **Ranger**: both conclaves in `publishedSubclasses.ts`, features at 3/7/11/15.
  The pinned list in `subclasses.test.ts` needed no edit and the kit stubs stay
  bare. `subclassLevel` is absent but defaults to 3 and agrees with the kit's
  own `Ranger Archetype` row — checked first, per the Druid's lesson, and this
  time there was nothing to fix.
  **No conclave spells on either**, which corrects this document's own advice —
  see the note near the top. **No `resource` either**, and the pass says why
  rather than leaving it silent.
  Hunter's four tiered features are four **closed** `kind: 'feature'` picks
  with **per-level ids and labels**. The Totem-vs-Four-Elements label rule is
  *moot* here because the four option lists are **disjoint**, so neither greying
  path in `grantedAlreadyAt` can fire — which makes the label a naming choice,
  and the book's own feature names win ("Hunter's Prey: Colossus Slayer", not
  "Hunter: Volley"). A test pins the disjointness, because that is the property
  the whole design rests on.
  The Beast Master's companion is **prose, not a grant or a pick**: there is no
  companion model on `Character`, so every number it has would describe the
  ranger instead of the beast. A pick offering a list of beasts was considered
  and rejected as a label impersonating a statblock.
- Ranger test-coverage note worth keeping: **`srd.test.ts`'s "repeatable
  feature pick offers enough" rule iterates the raw `SRD_CLASS_KITS`**, so it
  does *not* reach the published tier — only the two walkers were switched to
  `SRD_TABLES.kits` by the Sorcerer pass. Hunter's option counts are asserted by
  hand in `subclasses.test.ts` instead. Widening that loop was deliberately left
  alone: ~30 other loops there assert things *about the SRD table*, and changing
  them changes what they mean.
- **Monk**: all three traditions in `publishedSubclasses.ts` — including Way of
  the Open Hand, which SRD 5.1 licenses, on the Sorcerer's precedent that a
  name-only stub's features are PHB content wherever they end up. Features at
  3/6/11/17, the pinned list in `subclasses.test.ts` untouched.
  Way of the Four Elements' disciplines are an **open** `kind: 'feature'` pick
  at each of the four levels, and the option list *narrows by level* — that is
  how the 6th/11th/17th prerequisites are modelled, with no runtime gate.
  Its `featureLabel` is **shared** across all four levels, which inverts the
  Totem Warrior rule: a totem may be taken twice so it needs per-level labels,
  a discipline may not, so one shared label is what makes `grantedAlreadyAt`
  grey out disciplines already learned. Battle Master is the precedent.
  **Eternal Mountain Defense is 17th, not 11th** — the PHB's first printing said
  11 and errata moved it, so most sources online still have it wrong. It has its
  own test. The discipline list came from dnd5e.wikidot.com and was checked
  against WotC's errata PDF, because the repo ships no monk table at all.
  Way of Shadow's minor illusion is deliberately **prose, not `grant.spells`**:
  a monk has no spell ability, DC or slots, so the sheet cannot hold it
  honestly. A test pins it.
- Monk class-level fixes that came with it: **Ki is a real counter**
  (2 uses, short rest, offered on the level-2 level-up that grants it) — the
  class is built around spending it and the sheet had nothing to tick, while
  Stunning Strike, Diamond Soul and Empty Body all told the player to spend it.
  `total` is the monk *level*, so it ships at the granting level and the text
  says to raise it, the same call Sorcery Points and Bardic Inspiration make —
  but `resets: 'short'`, where Sorcery Points is `'long'`. Copying that
  precedent wholesale gets it wrong and no existing test would catch it.
  **The martial arts die is three rows** at 5/11/17 and **unarmored movement
  five** at 2/6/10/14/18, instead of prose promising that they scale. And
  `subclassLevel: 3` is now declared rather than defaulted — it was already
  right, but that is the exact implicit shape that shipped bugs in the Wizard
  and the Druid.
- **Paladin**: all three oaths in `publishedSubclasses.ts`, features at
  3/7/15/20. Each oath's two Channel Divinity options are **two feature rows**,
  not one — `featuresGained` de-dupes on `level:name`, so a single row naming
  both would be indistinguishable on the sheet. No oath carries `picks`
  (the options are fixed features, not a menu) or `grant` (the rest are combat
  rules this app does not model).
  Their **oath spells** arrive at 3/5/9/13/17 — not a domain's 1/3/5/7/9,
  because a paladin swears at 3rd and their slots lag a full caster's. They
  were deferred at first and landed with the half-caster pass below.
- Paladin class-level fixes that came with it: **Channel Divinity is a real
  counter** and was missing entirely — every oath grants options that spend it,
  so without a class row those features referenced a resource the sheet had
  never heard of. One row, not the Cleric's three, because a paladin's uses
  never scale. **Divine Sense** gained a counter too (1 + Cha mod, shipped as 3
  the way Bardic Inspiration is), and **Lay on Hands deliberately did not**: its
  pool is 5 x the paladin level, a hit-point pool rather than a use count, and
  nothing recomputes a total once it is on a sheet.
- **Paladin and Ranger are real half casters.** Both kits gained a
  `spellcasting` block whose `slotsByLevel` starts at 2 and whose
  `slotsAtLevel1` is 0. Before this neither could cast at *any* level:
  `spellAbility`, `spellSlots` and `preparedLimit` stayed empty forever, and no
  subclass of either could carry `spells`. The block is safe because
  **`castsAtLevel1(kit, subclassName)`** in `lib/tables.ts` is what the creation
  wizard now asks — the table, not the block's existence. Four call sites moved
  onto it (`stepsFor`, `canAdvance`, `SpellsStep`, `buildCharacter`), which also
  fixed the mirror bug where a *subclass* casting from level 1 would silently
  never get a spells step. Four `srd.test.ts` invariants were rewritten to say
  what is now true, and an all-levels test walks both tables 1-20.
- Half-caster fix that came with it: **`preparedLimitTo` was gated on
  `c.preparedLimit > 0`**, and a paladin is built at level 1 with 0 because they
  do not cast yet — so the guard could never open and the limit stayed 0 at
  every level, forever. `sc?.prepares` was always the check that mattered.
- **A level-1 `resource` now reaches the sheet.** `buildCharacter` applies the
  counters a class's (and a level-1 archetype's) level-1 features imply, capped
  at `MAX_RESOURCES` and deduped by name. It had no delivery path at all before:
  creation never wrote `Character.resources`, and `resourcesOffered` only looks
  at the levels being *gained* — you never gain the level you started at — so
  the Bard's Bardic Inspiration was inert from the day it was authored.
  **Applied rather than offered**, which is the one deviation from level-up:
  there a tick-box asks before raising a number the player may have tuned, while
  at creation there is nothing to overwrite and no step to ask in, and the row
  is editable and deletable on the sheet anyway.
- **Sorcerer**: both origins in `publishedSubclasses.ts` — SRD 5.1 licenses
  Draconic Bloodline, but `classKits.ts` only ever seeded it as a name, so the
  features are PHB content and belong in the published tier. Both kit stubs stay
  bare and the pinned list in `subclasses.test.ts` needed no edit.
  Dragon Ancestor is a **closed** `kind: 'feature'` pick over the five damage
  types — closed rather than open because the choice is made once, so nothing
  ever greys out and no per-level `featureLabel` dance is needed. Draconic
  Resilience's grant carries `hpPerLevel: 1` and **deliberately no `acBonus`**:
  the feature *replaces* 10 + Dex with 13 + Dex while unarmoured, and `acBonus`
  is additive, so any value would be a lie the moment armour goes on. The text
  says what the number cannot. Wild Magic has no grant and no picks — a d100
  surge table is not modelled here and not ours to reproduce.
- Sorcerer class-level fixes that came with it: **Sorcery Points is a real
  counter** (2, long rest, offered at the level-2 level-up that grants it) — the
  class is built around spending them and the sheet had nothing to tick. `total`
  is the sorcerer *level*, which no static table can track, so it ships the value
  at the granting level and the text says to raise it, the same call Bardic
  Inspiration makes. And **Metamagic is three rows** at 3/10/17 instead of one
  whose prose mentioned the upgrades; which options you take stays prose, because
  `Character` has no field for the answer.
- **Druid**: Circle of the Land in `lib/srd/` (SRD), Circle of the Moon in
  `publishedSubclasses.ts`. The kit gained **`subclassLevel: 2`** — a druid
  picks their circle at 2nd and the kit's own feature row always said so, but
  with no declaration the default of 3 won, so four level-2 circle features
  could not be authored at all. Circle Forms scales at 6 as its own row.
  Circle of the Land's terrain is a closed `kind: 'feature'` pick with all
  eight lands; its circle *spells* stay in the option text because
  `SubclassInfo.spells` is one flat table with no way to branch on a pick's
  answer — see the note in the entry.
- Druid class-level fix that came with it: **Wild Shape is a real counter**
  (2 uses, short rest), offered on the level-2 level-up that grants it. It was
  prose — "twice per short or long rest" inside the feature text — so a druid's
  sheet had nothing to tick. The number never changes with level, so it is one
  row; Archdruid's "unlimited" at 20 stays prose because `total` is a number,
  the same call the Barbarian's Rage makes.
- **Cleric**: Life Domain in `lib/srd/` (SRD), the six PHB domains in
  `publishedSubclasses.ts`, all with domain-spell tables at `grantedAt`
  1/3/5/7/9. Channel Divinity is a real counter (1/2/3 at 2/6/18, short rest) —
  a class-level gap fixed alongside, replacing prose that folded the upgrades
  into the level-2 row. Knowledge's Blessings of Knowledge is a real
  `kind: 'expertise'` pick; War Priest is deliberately prose, not a second
  counter.
- **Subclasses reach the sheet at creation**, and `SubclassInfo.spells` is no
  longer inert — see "What the Cleric pass changed" at the top.
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
- `srd.test.ts`'s walkers have been widened three times, each time because a
  whole category was silently unchecked: `allPickLists()` gained
  `features[].picks`, `allGrants()` gained `SubclassInfo.grant`, and both now
  iterate **`SRD_TABLES.kits`** rather than the raw `SRD_CLASS_KITS` so the
  published tier is covered at all. Assume the next category is also unwalked
  and check before trusting a green suite.

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
- **Subclasses are fully authorable.** Every field `SubclassInfo` has now has an
  editor: summary and features (`FeatureRows`), always-prepared spells
  (`SubclassSpellRows`), the `grant` (the existing `GrantEditor`, reused) and a
  third-caster block (`SpellcastingFields`, extracted from the kit editor so
  both share it). Each empties back to `undefined` rather than `{}` or `[]`, so
  `isBareSubclass` still recognises a cleared subclass and it serializes as a
  plain name. Only the progression *tables* stay JSON-only — twenty rows of
  numbers each — and the panel says where to put them.

  Three data-layer bugs fell out of building it, all silent data loss:
  `parseSubclasses` never read `spellcasting` back though `serializeSubclass`
  wrote it; `isBareSubclass` did not count it, so a subclass carrying only that
  was written back as a bare string and lost outright; and
  `parseSpellcasting` dropped `spellsKnownByLevel` and `spellbook` for kits too.
  `isBareSubclass` was also duplicated in `tables.ts` and `homebrew.ts` and the
  copies had drifted — it now lives in `homebrew.ts` and is re-exported.

  **Relevant to Cleric:** domain spells are `SubclassInfo.spells`, and
  `grantedAt` (character level) and `level` (spell level) are different numbers.
  The editor labels them as such because conflating them is the easy mistake.

- **Standalone subclasses.** `Homebrew.subclasses` (and the world-level twin)
  attaches a subclass to a class *by name*, merged by `attachSubclasses` in
  `lib/tables.ts`. Adding one College to the Bard no longer means duplicating
  the Bard and inheriting a frozen copy of its features and spell tables. It has
  its own **Subclasses tab**, whose built-in column is every subclass carrying
  content, flattened out of every kit.

## The other open threads

- **`NEXT-CLERIC-PROMPT.md`** — **done**, kept for its reasoning. It works
  through the two mechanism gaps a level-1 subclass exposed. The Sorcerer pass
  has since confirmed that mechanism holds for a second level-1 class with no
  new code, so read it as background rather than as work. It still describes the
  creation path the Warlock will use — but the Warlock's blocker is its spell
  lists, not creation; see the warning near the top.
- **`NEXT-HALF-CASTER-PROMPT.md`** — **fully done**, kept for its reasoning.
  Paladin and Ranger have real half-caster tables starting at 2nd, gated by
  `castsAtLevel1` so a level-1 build still skips the spells step. The level-1
  `resource` gap it described is closed too — `buildCharacter` applies those
  counters now.
- **`NEXT-WIZARD-PROMPT.md`** — making the homebrew editors a guided wizard.
  Pure UX, but it touches `components/settings/homebrew/`, so check
  `git status` before starting. Partly landed already (`PickEditor`,
  `PickRows`), so read the diff before assuming it is untouched.

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
