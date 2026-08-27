# Handoff: turn the homebrew editors into a wizard

Paste this into a fresh Claude Code context in `c:\Projects\DungeonMaster`.

---

## The task

The Homebrew settings section works but is unfriendly. Brent's words: *"the UI
is not very friendly"*, and he asked for creation to be **a wizard** instead.

Make authoring a homebrew entry a guided, stepped flow. Editing an existing one
should stay direct — see "Create is not edit" below, which is the design
decision this whole job turns on.

Do **not** change what the editors can express. Every field is authorable today
and the data layer round-trips all of it. This is a UX job.

## What's actually wrong

Open Settings → Homebrew → Classes → Add. You get, in one scroll:

- 6 top-level `Field`s (name, hit die, subclass label, skill choice, spellcasting,
  unarmored defense)
- a `SubclassEditor` list, each row expanding to a 5-section panel
- a `FeatureRows` list, 1-20 levels
- an equipment-choices builder
- a `GrantEditor` with **13** labelled sections (saves, skills, armor, weapons,
  tools, languages, resistances, equipment, coin, traits, choices…)

Nothing says what's required, what's optional, what to do first, or how far
through you are. A race is smaller but the same shape. `ClassKitEditor.tsx` is
347 lines and `GrantEditor.tsx` is 441.

The tell: **every field is optional and the form has no spine.** A first-time
author can't tell "name + hit die and you're done" from "you must fill this in".

## Start here

Read in this order:

1. `CLAUDE.md` — the `lib/srd/` section, and the homebrew tier notes.
2. `client/src/components/settings/homebrew/HomebrewSection.tsx` — the shell:
   tabs, list, selection, dirty-tracking, Save.
3. `client/src/components/character/create/` — **the wizard that already
   works.** `CreateCharacterDialog.tsx`, `WizardRail.tsx`, `WizardSummary.tsx`,
   `steps/`.
4. `client/src/components/character/levelup/LevelUpDialog.tsx` — the **second**
   wizard, which has its own hand-rolled rail rather than sharing one.

## There are already two wizards, and neither shares a shell

This is the most useful fact in this document.

- `create/` has `WizardRail.tsx` (112 lines) + `WizardSummary.tsx` (237).
- `levelup/LevelUpDialog.tsx` re-implements the same rail inline (~line 175) as
  a `<nav>` over its own step list.

They agree on the shape — a left rail of steps, a body, a live summary panel,
Back/Next, and a per-step "can I advance?" gate — and share no code. A homebrew
wizard would be the **third**.

`WizardRail` is *not* reusable as written: it imports `CharacterDraft` and
`StepId` and switches on step names to build its per-step summary line. Making
it generic is a real refactor, not a rename.

**So decide deliberately, and say which you chose in your final message:**

- **Extract a generic wizard shell** (`steps`, `current`, `canAdvance(step)`,
  `summaryFor(step)`, `onStep`) and move all three onto it. Best end state; the
  riskiest step is not breaking the two working wizards. If you do this, do the
  extraction *first*, get the existing two green, and only then build the third.
- **Write a third rail for homebrew.** Honest and low-risk, and the codebase
  already tolerates the duplication. Note it in the handoff as debt.

Do not half-do it: a "shared" rail that only homebrew uses is worse than either.

## Create is not edit

The single design decision. Get this wrong and the wizard becomes a cage.

A wizard is good for **creating** — it orders the questions, hides what you do
not need yet, and tells you when you are done. It is bad for **editing**: coming
back to change one damage resistance should not mean clicking through six steps.

Suggested shape, but argue with it if you see better:

- **Add** opens a stepped flow: the essentials first (name, and the two or three
  fields that make the entry meaningful), then the optional richness, then a
  review that says what will be created.
- **Selecting an existing entry** keeps the current all-at-once form — possibly
  with the same sections collapsed by default, so it reads as a summary that
  opens rather than a wall.
- A **"back to the full form"** escape from any step in the wizard.

`DuplicateDialog.tsx` already does the "fork a built-in under a new name" path;
it should feed the same flow, and a duplicate arrives with everything filled in
so it probably wants the edit view, not the wizard.

## What the wizard must not break

- **Save is explicit and whole-file.** `HomebrewSection` holds a local `draft`,
  tracks `dirty` against `adoptedRef`, and writes on Save — every write rewrites
  the entire `homebrew.json`. Do not save per step.
- **A half-finished entry must be discardable.** Cancelling out of Add must not
  leave a blank entry in the list. (Today's Add appends immediately — the wizard
  is a chance to fix that, so check what happens on cancel.)
- **Empty back to `undefined`, never `{}` or `[]`.** `isBareSubclass` decides
  whether `serializeSubclass` writes a plain name or an object, and the same
  discipline governs `grant` via `isEmptyGrant`. A wizard step that initialises
  a field to an empty object turns every entry into noise on disk.
- **An edit spreads the original.** `picks`, `resource` and `halfProficiency`
  have no UI; they survive because every patch spreads. A wizard that builds an
  entry from its own state instead of patching would silently drop them.
- **Ids are derived from names and never reach disk** (`homebrewId`). The sheet
  stores display names as free text.
- `SubclassPanel` (in `SubclassEditor.tsx`) is shared by the Subclasses tab and
  the inline kit editor **so the two cannot drift** — keep it that way.

## The five tabs

`races`, `kits` (Classes), `subclasses`, `backgrounds`, `feats`. They differ
enough that one generic step list will not fit all five:

| Tab | Essentials | The bulk of the form |
|---|---|---|
| Races | name, ability increases, speed | grant, subraces, flexible ASI |
| Classes | name, hit die | subclasses, features 1-20, equipment, grant |
| Subclasses | **class**, name | features, spells, grant, spellcasting |
| Backgrounds | name, feature | grant |
| Feats | name, summary | grant, prerequisite, ASI |

Subclasses is the one to build first: it is the newest, the smallest, and
choosing the class is a genuine first question that the current form buries
halfway down. It is also the one Brent hit the wall on.

## Verification

```sh
cd client
npx vitest run                              # 1377 currently
npx tsc --noEmit -p tsconfig.json
npm run lint                                # NOTE: 14 pre-existing problems
```

`npm run lint` **does not reach zero on a clean tree** — 9 errors and 5 warnings
in unrelated files. Grep for the files you touched; do not fix the rest.
`HomebrewSection.tsx` also has pre-existing prettier drift — leave it.

`electron/main/*.test.ts` and `src/lib/spellCard.test.ts` intermittently fail
under parallel load. **One failure → re-run that file alone before
investigating.**

There are component tests to model on and to keep passing:
`SubclassEditor.test.tsx` (15), `StandaloneSubclassEditor.test.tsx` (9),
`PickListGroup.test.tsx` (7). They use `@testing-library/react` with a `Harness`
holding state and an `<output data-testid="state">` — copy that idiom.

## Drive the app — this is not optional

Every real bug in this codebase was found by using it, not by tests going green.
A wizard is a UX change; it *has* to be looked at.

The memory note `driving-dungeonmaster-e2e` has a verified Playwright recipe.
Three things that cost time recently:

- **Settings is world-scoped**: `#/worlds/<hexId>/settings`, then click the
  Homebrew nav button. **Poll until the nav has mounted** — tagging elements too
  early finds nothing and reads as a broken feature.
- Tab labels carry counts (`Classes1`), so `textContent === 'Classes'` never
  matches. Use a regex.
- **Check which `%APPDATA%` folder the app writes to before driving anything
  that saves.** It has been `Electron/` in one session and `DungeonMaster/` in
  another — and `DungeonMaster/` is the user's **real** homebrew file. Back up
  whichever exists, restore in a `finally`. I wrote test data into Brent's real
  file this way.

## Where things stand

1377 tests passing. Uncommitted work in the tree — check `git status` before
starting, and read `NEXT-CLASS-PROMPT.md`, which is the *other* open thread
(authoring subclass data, Cleric is next). They do not overlap, but both touch
`components/settings/homebrew/`.

Recently done and working — do not rebuild:

- Every `SubclassInfo` field is authorable: summary, features, always-prepared
  spells, grant, spellcasting.
- **Standalone subclasses.** `Homebrew.subclasses` attaches one to a class by
  name, so adding a College to the Bard no longer means duplicating the Bard.
  Its own tab, merged by `attachSubclasses` in `lib/tables.ts`.
- Half proficiency computes (`Character.halfProficiency`).

Known gaps, deliberately left:

- Spell **progression tables** (`slotsByLevel`, `cantripsByLevel`,
  `spellsKnownByLevel`) are JSON-only — twenty rows of numbers each. A wizard
  step could be where a table editor finally earns its place, but it is a
  separate decision; they round-trip untouched today.
- `ClassKitEditor`'s equipment builder is the roughest surface in the section
  and would benefit most from steps.
- Four PHB archetypes (Battle Master, Eldritch Knight, Assassin, Arcane
  Trickster) still sit in `lib/srd/` — attribution debt, unrelated to this job,
  pinned by `subclasses.test.ts`.
