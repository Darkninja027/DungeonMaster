# Handoff: give the half casters a casting model

> **STATUS: DONE**, including the level-1 resource gap at the end.
> Kept for its reasoning. Paladin and Ranger now carry half-caster
> `spellcasting` blocks starting at 2nd; `castsAtLevel1` in `lib/tables.ts` is
> what the creation wizard asks so a level-1 build still skips the spells step;
> the four call sites, the four rewritten `srd.test.ts` invariants, the
> all-levels table tests and the `preparedLimit` fix all landed. Oath spells are
> authored at 3/5/9/13/17. Verified in the app: a 1→2 paladin gains
> `Level 1 slots 0→2`, `spellAbility: cha` and `preparedLimit 0→5`.
>
> The level-1 `resource` gap in the last section is closed too:
> `buildCharacter` now applies those counters, so a freshly created Bard has
> Bardic Inspiration on the sheet (verified in the app through the real creation
> wizard). Read the whole document as the record of why the casting model and
> the creation-side counter application look the way they do.

Paste this into a fresh Claude Code context in `c:\Projects\DungeonMaster`.

---

## The task

**Paladin and Ranger cannot cast.** Neither kit has a `spellcasting` block, so
`spellcastingFor` returns `undefined` for both at every level, and three things
follow from that:

1. A paladin or ranger never gets a spells step at level-up, at any level, ever.
2. `spellAbility`, `spellSlots` and `preparedLimit` stay empty on their sheets
   forever — a level-20 paladin has no spell save DC.
3. **No subclass of either can carry `spells`** — which is what blocks oath
   spells and a Ranger conclave's, and is why this document exists.

This is a **mechanism pass**, not a data one. It was split out of the Paladin
subclass pass deliberately: that pass authored all three oaths' features and
left their spells alone rather than half-solving this. Do not fold the two
together again.

## Why this is not a five-minute fix

The obvious move — put a `spellcasting` block on the Paladin kit — fails, and it
fails against a test that is *correct*.

- `client/src/lib/srd/srd.test.ts` — **"only spellcasting classes grant bonus
  spells"** requires `spellcastingFor(kit, sub.name)` be **defined** for any
  subclass with a non-empty `spells` array. Authoring oath spells fails here.
- `client/src/lib/srd/srd.test.ts` — **"the half casters gain spellcasting at
  level 2, not 1"** requires `kit('Paladin').spellcasting` be **undefined**, and
  says why: *"Paladin and Ranger correctly have no level-1 spellcasting block,
  so the creation wizard skips their spells step — the feature lands at 2."*
  Adding the block fails here.

Both tests are defending something real. The first wants an always-prepared
spell to have somewhere to be cast from. The second wants a level-1 paladin not
to be asked which spells they know, because they do not have any yet.

The thing that makes them irreconcilable today is a **gate reading the wrong
field**:

```ts
// client/src/lib/characterDraft.ts, in stepsFor
if (draftKit(draft)?.spellcasting) steps.push('spells')
```

That is truthiness of the *class's* block, not "does this character cast at
level 1". So any block at all — even one whose `slotsByLevel` starts at 2 and
whose `slotsAtLevel1` is 0 — pushes a spells step onto a level-1 paladin, which
`SpellsStep` then renders as "You have 0 level 1 slots". `canAdvance`'s
`'spells'` case reads the same field, a few lines below.

The same gate has a mirror-image bug already latent in it: because it reads
`kit.spellcasting` and never `spellcastingFor`, a homebrew class whose
*subclass* casts from level 1 silently never gets a spells step either.
`buildCharacter.ts` has a comment acknowledging exactly this asymmetry.

## Recommended approach

Add one predicate, point the four call sites at it, then the data becomes
authorable.

### 1. `client/src/lib/tables.ts` — the predicate

Beside `spellcastingFor`:

```ts
export function castsAtLevel1(
  kit: ClassKit | undefined,
  subclassName = '',
): boolean {
  const sc = spellcastingFor(kit, subclassName)
  if (!sc) return false
  return sc.slotsByLevel?.[1] !== undefined || sc.slotsAtLevel1 > 0
}
```

This asks the honest question — does the *table* start at level 1 — rather than
"does a block exist". It reads through `spellcastingFor`, so it fixes the
latent subclass-caster hole for free.

The `|| sc.slotsAtLevel1 > 0` arm matters: `SpellcastingInfo.slotsByLevel` is
documented as optional ("absent means this class has no progression table"), and
`homebrew.ts` defaults `slotsAtLevel1` to 2, so a homebrew caster authored
through the settings UI with no table still answers true.

### 2. The four call sites

| File | What to change |
|---|---|
| `characterDraft.ts` `stepsFor` | `if (castsAtLevel1(draftKit(draft), draft.subclassName)) steps.push('spells')` |
| `characterDraft.ts` `canAdvance`, `'spells'` case | resolve `sc` via `spellcastingFor(draftKit(draft), draft.subclassName)` |
| `components/character/create/steps/SpellsStep.tsx` | `spellcastingFor(kit, draft.subclassName)`, and bail when `!castsAtLevel1(...)` |
| `buildCharacter.ts` | gate the `if (sc)` block on `castsAtLevel1(...)` |

**Land these four and run the suite before touching any data.** It should be
fully green with zero table changes — that is the proof the refactor is
behaviour-preserving, and it makes the mechanism reviewable separately from the
numbers.

While in `buildCharacter.ts`, consider hoisting `applySubclassSpells` **out** of
the caster guard. It currently sits inside it; a homebrew subclass with
`grantedAt: 1` on a class whose table starts later would silently lose those
rows.

### 3. The tables

Author `spellcasting` on both Paladin and Ranger. Do both — leaving Ranger
asymmetric with Paladin is worse than today, and the level-2 test names both.

- **Paladin**: `ability: 'cha'`, `prepares: true`, `listLabel: 'Paladin spells'`,
  `slotsAtLevel1: 0`, `slotsByLevel` starting at key `2`.
- **Ranger**: `ability: 'wis'`, `prepares: false`, `listLabel: 'Ranger spells'`,
  plus a `spellsKnownByLevel` starting at 2.

**Ask the user to paste the printed half-caster tables rather than transcribing
from memory.** Then write an all-levels test using the `atLevel` helper in
`srd.test.ts` — walk levels 1-20 and assert against the printed table — and
**break one value to confirm the test fails naming that level**. Sparse tables
hide off-by-ones completely; the Arcane Trickster's Spells Known was wrong from
10 to 20 and passed a full green suite.

Update the header comment at the top of `classKits.ts`, which currently states
the opposite of what the file will say.

### 4. Tests that must change

| Test | Change |
|---|---|
| "slots and known counts are sane at level 1" | `slotsAtLevel1 > 0` becomes conditional — assert it only when `slotsByLevel[1]` exists, else assert it is 0. Mirror how the *subclass* version of this test already handles third casters. |
| "a caster with a slot table defines level 1 and agrees with slotsAtLevel1" | If `slotsByLevel[1]` exists, assert agreement; if not, assert `slotsAtLevel1 === 0` **and** that the lowest key is > 1, so a genuinely missing level-1 row on a full caster is still caught. |
| "the half casters gain spellcasting at level 2, not 1" | Invert: the block exists, `slotsByLevel[1]` is undefined, `slotsByLevel[2]` is defined, and **`castsAtLevel1(kit)` is false**. Keep the `Spellcasting` feature-at-level-2 assertion. This becomes a stronger guard than it is today. |
| "non-casters have no spellcasting block" | Currently pins the caster list to six. Rewrite as two lists: classes with a block (now eight), and classes where `castsAtLevel1` is true (still six). Rename to say what it now means. |

### 5. Then the data this unblocks

Oath spells for the three Paladin oaths, and a Ranger conclave's if you author
those. `SubclassInfo.spells` rows, `grantedAt` at the character level and `level`
at the spell level — a paladin's oath spells arrive at 3/5/9/13/17. The
`publishedSubclasses.ts` Paladin entries have a comment pointing here; delete it
when you fill them in, and delete the `carry no oath spells, deliberately` test
in `subclasses.test.ts`, which exists to make that omission a decision rather
than an oversight.

## Two traps worth knowing before you start

**`preparedLimit` never initialises.** `levelUp.ts`'s `preparedLimitTo` is gated
on `sc?.prepares && c.preparedLimit > 0`. A paladin created at level 1 has
`preparedLimit === 0`, so levelling to 2 will **not** set one — it stays 0
forever. This is the most likely silent breakage in the whole change. Either
relax that guard to also fire when the limit is 0 and the table has just begun,
or accept it knowingly and say so. Decide explicitly; do not discover it later.

**Existing saved sheets change behaviour.** Today `slotsAtLevel` returns
`undefined` for a paladin at every level, so the level-up spells step never
appears. Afterwards, an existing level-7 paladin doing 7→8 is suddenly shown one
and gets slots. That is *correct*, and the slot merge only ever increases, so
nothing is lost — but it is a visible change for characters people already have.
Check it against a real saved sheet by driving the app, not just by reading.

## A smaller gap found alongside, worth folding in

**A level-1 `resource` reaches no sheet by any path.** `buildCharacter` never
writes `Character.resources` at all, and `resourcesOffered` only considers
features in the levels being *gained*, so level 1 is outside every level-up
range. Verified empirically: a freshly built Bard and Paladin both come out with
`resources: []`.

That makes the **Bard's Bardic Inspiration** and the **Paladin's Divine Sense**
authored-but-inert. Both are correct data with no plumbing behind them. Fixing
it is a creation-path job — `buildCharacter` would offer or apply level-1
resources the way the level-up wizard does — and it is small, but it is not
free, because a counter is opt-in at level-up and creation has no equivalent
step. `levelUp.test.ts` has a test named `carries Divine Sense as a counter that
no path yet delivers` pinning the current behaviour; it names what should change.

## Verification

```sh
cd client
npx vitest run src/lib/srd/srd.test.ts
npx vitest run src/lib/subclasses/
npx vitest run src/lib/levelUp.test.ts
npx vitest run src/lib/buildCharacter.test.ts
npx vitest run src/lib/characterDraft.test.ts   # the stepsFor gate
npx vitest run                                  # all ~1516
npx tsc --noEmit -p tsconfig.json
npm run lint                                    # 14 pre-existing problems
```

`spellCard.test.ts` and `electron/main/*.test.ts` flake under full-suite
parallel load — if the suite reports exactly one failure, re-run that file alone
before investigating.

**New tests worth adding:** `stepsFor` on a level-1 Paladin draft does *not*
include `'spells'` while a Cleric's does (the regression guard for the whole
change); a level-1 Paladin builds with `spellAbility === null` and
`preparedLimit === 0`; and a Paladin 1→2 level-up produces a spells step with
slots and sets `spellAbility` to `'cha'`.

**Then drive the app.** Every real bug in this feature has hidden in the seam
between the data layer and what reaches the sheet, and this change is entirely
in that seam. Create a level-1 paladin and confirm there is no spells step;
level to 2 and confirm slots and a save DC appear. The memory note
`driving-dungeonmaster-e2e` has a verified Playwright recipe — patch the
single-instance lock **by regex**, poll for the non-DevTools window, and note
that the level-up wizard opens by typing a higher number into the `Lvl` field
and pressing Enter. The tracker toggle on the Choices step is a
`button[role="checkbox"]` whose own text is the counter name.

**Back up `%APPDATA%` first.** Which folder the app writes to is not stable —
`Electron/` and `DungeonMaster/` both exist on this machine and the latter holds
the user's real `homebrew.json`. Back up whichever exists and restore in a
`finally`.

## Line endings

`src/lib/levelUp.ts` and `src/lib/buildCharacter.ts` are **CRLF**; most files
are LF. This change touches both. Prettier silently flips them and turns a
300-line diff into a 4000-line one. After formatting, check with the loop in
`NEXT-CLASS-PROMPT.md` and restore with a Python round-trip rather than
re-running prettier.
