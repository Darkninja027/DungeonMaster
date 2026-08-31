# Handoff: the Cleric — **DONE (2026-08-27)**

> This class is finished: both mechanisms built, all seven domains authored,
> Channel Divinity added as a counter, verified in the running app. The document
> is kept because the *reasoning* in it still applies to Sorcerer and Warlock,
> which also choose at level 1 — but they no longer need mechanism work, only
> data. See "What the Cleric pass changed" in `NEXT-CLASS-PROMPT.md`.
>
> What shipped:
>
> - Subclass features, grants and picks now apply **at creation**, via
>   `draftGrants` / `draftOwnedPickLists` in `characterDraft.ts`.
> - `SubclassInfo.spells` populates always-prepared spells at creation
>   (`applySubclassSpells`) and at level-up (`alwaysPreparedGained` on the plan,
>   deliberately outside the `plan.subclassName` branch).
> - Three extra bugs fixed: `needsSubclass` could never fire for a level-1
>   class; the creation picker gated on the deprecated `subclassAtLevel1`; and
>   "chooses at 3rd level" was hardcoded (a Wizard picks at 2).
> - `srd.test.ts`'s `allGrants()` now walks `SubclassInfo.grant`, which it never
>   did — every subclass grant was unchecked.
> - Life Domain in `lib/srd/`; Knowledge, Light, Nature, Tempest, Trickery and
>   War in `publishedSubclasses.ts`. 1450 tests passing.

---

Paste this into a fresh Claude Code context in `c:\Projects\DungeonMaster`.

**Read `NEXT-CLASS-PROMPT.md` first.** It is the standing guide for authoring
subclass data — the pick mechanism, `resource` counters, the scaling-rows rule,
the SRD/published attribution split, line endings, verification. All of it
applies. This document is only what makes the **Cleric** different, and it is
different enough to need its own page.

---

## Read this before you plan

Fighter, Rogue, Barbarian and Bard were pure data authoring. **The Cleric is
not.** Two mechanisms it depends on do not exist yet, and both are invisible
until you drive the app.

`NEXT-CLASS-PROMPT.md` tells you that if you find yourself editing `levelUp.ts`
or `buildCharacter.ts` you have gone wrong. **For this class, that instruction
does not hold** — it was written for classes that choose an archetype at level
3. Expect to write mechanism, and say so plainly when you report back.

### 1. A level-1 subclass contributes nothing at creation

`buildCharacter` never calls `findSubclass`. It writes `c.subclass` as a name
and applies `featuresUpToLevel(kit.features, 1)` — the **class's** features
only. The subclass's `features`, `grant` and `spells` are all ignored.

This was harmless for every class done so far, because they pick an archetype at
level 3 and the level-up path handles it. A **Cleric picks at level 1**, so a
freshly created Life Domain cleric gets Spellcasting and Divine Domain and
nothing else: no Disciple of Life, no heavy armour, no domain spells.

Verified, not assumed. This probe fails today:

```ts
// give Thief a level-1 feature + grant, set subclassLevel: 1, then:
const { character } = buildCharacter({ ...draft, className: 'Rogue', subclassName: 'Thief' })
expect(character.features.map((f) => f.name)).toContain('PROBE FEATURE') // ✗
expect(character.tools).toContain('PROBE TOOL')                          // ✗
```

Sorcerer and Warlock also choose at level 1, so fixing this unblocks three
classes, not one.

### 2. Domain spells are wired nowhere

`SubclassInfo.spells` — `{ grantedAt, level, names }` — is **read by nothing**.
Not `buildCharacter`, not `levelUp.ts`. It has been a declared-but-inert field
since it was added.

Do not confuse it with `subclass.grant.spells`, which *is* wired
(`levelUp.ts:1105`, the Arcane Trickster's Mage Hand). Different field,
different purpose: `grant.spells` is a fixed spell handed over once,
`sub.spells` is the always-prepared domain table.

The sheet side already exists and works: `Character.Spell.alwaysPrepared`,
`preparationState` (which makes `alwaysPrepared` win over `prepared`), and
`alwaysPreparedCount`. What is missing is anything that *populates* it from a
subclass, at creation or at level-up.

A Cleric is the reason that field exists. If you author domain spells without
wiring this, they will look right in `classKits.ts` and never reach a sheet.

## Suggested order

1. **Wire the two mechanisms first, with Life Domain as the only data.** Get one
   domain end-to-end — created at level 1, levelled to 3, domain spells on the
   sheet as always-prepared — before authoring six more.
2. **Then author the remaining domains.** By then the mechanism is proven and
   the rest is transcription.

Doing it the other way round means writing seven domains' worth of data against
a path you have not tested.

## Which domains, and where they go

SRD 5.1 licenses **Life Domain** only. The other six are PHB.

| Domain | Home |
|---|---|
| Life Domain | `client/src/lib/srd/classKits.ts` |
| Knowledge, Light, Nature, Tempest, Trickery, War | `client/src/lib/subclasses/publishedSubclasses.ts` |

`subclasses.test.ts` enforces this and pins the exact list of subclasses
carrying content in `lib/srd/`; adding a PHB domain there fails two tests. See
"Which subclasses belong in `lib/srd/`" in `NEXT-CLASS-PROMPT.md`.

Seven domains is a lot. **Life Domain alone is a complete, shippable piece of
work** — do that, verify it, and stop if the mechanism work has been large.

## Cleric specifics

- **`subclassLevelOf(kit)` is 1.** Every domain feature must be at level >= 1,
  and the wizard offers the choice during *creation*, not just level-up. The kit
  already sets both `subclassAtLevel1: true` and `subclassLevel: 1`.
- Domain features land at **1, 2, 6, 8, 17** for most domains. Channel Divinity
  arrives at 2 as a class feature and each domain adds its own option at 2 —
  those are separate rows.
- **Channel Divinity is a `resource`** (1 use at 2nd, 2 at 6th, 3 at 18th) and
  the Cleric has none today. That is a class-level gap; `NEXT-CLASS-PROMPT.md`
  says fixing one while you are in the class is reasonable *if you say so
  explicitly*. The upgrades are their own feature rows.
- **Divine Strike vs Potent Spellcasting** at 8 — domains differ, and both are
  prose (a damage rule this app does not model).
- **Life Domain's heavy armour** is a subclass `grant`
  (`grant: { armor: ['heavy'] }`) — the shape `SubclassInfo.grant`'s own doc
  comment names. Its feature row is the reminder; the grant is what lands.
- The Cleric **prepares** (`prepares: true`), so `preparedLimit` is
  `mod + level`. Domain spells must be exempt — that is what `alwaysPrepared`
  is for, and `alwaysPreparedCount` is how the sheet counts them separately.

## Ask, do not guess

`NEXT-CLASS-PROMPT.md` says to ask Brent to paste a printed table rather than
guessing, and two conflicting sources in this repo were resolved that way. For
the Cleric the tables worth confirming are **Channel Divinity uses per level**
and **each domain's spell list by level**. Getting a domain spell wrong is
silent — it just becomes the wrong always-prepared spell on somebody's sheet.

## Verification

Everything in `NEXT-CLASS-PROMPT.md` applies. Additionally:

- **A creation test is now as important as a level-up test.** Build a level-1
  Life Domain cleric through `buildCharacter` and assert the domain's feature,
  its heavy armour, and its 1st-level domain spells with `alwaysPrepared: true`.
  No class before this one needed that.
- **Assert domain spells do not eat the prepared limit** — `alwaysPreparedCount`
  counts them, `preparedSpellLimit` must not.
- If you author Channel Divinity as a resource, mirror
  `describe('a tracked resource that grows with the class')` in
  `levelUp.test.ts`, and break one total to confirm the test bites.

## Drive the app

Non-negotiable — see the "Bugs found by using the app" section in
`NEXT-CLASS-PROMPT.md`, which now lists five, every one found by hand.

For the Cleric specifically:

- **Create a level-1 cleric in the wizard** and pick a domain. This is the step
  no previous class exercised, and it is where mechanism 1 fails today.
- Check the sheet: domain feature present, heavy armour ticked, domain spells
  listed and marked always-prepared, and the prepared count *not* including
  them.
- Then level 1 → 3 and confirm the 2nd-level Channel Divinity option and the
  next domain-spell row arrive.

`driving-dungeonmaster-e2e` (memory) has the Playwright recipe. Note the
`%APPDATA%` warning in it — the folder the app writes to has differed between
sessions, and one of them is the user's real homebrew file.

## Where things stand

1377 tests passing. Working tree has uncommitted work — `git status` first.

The other open thread is `NEXT-WIZARD-PROMPT.md` (making the homebrew editors a
guided wizard). It does not overlap with this, but both are live.

Recently done, do not rebuild:

- **Fighter** 3/3, **Rogue** 3/3, **Barbarian** 2/2, **Bard** 2/2 archetypes.
- Every `SubclassInfo` field is authorable in Homebrew settings, and
  `Homebrew.subclasses` attaches a subclass to a class by name.
- `Character.halfProficiency` computes Jack of All Trades / Remarkable Athlete.
