# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DungeonMaster is an **Electron desktop app** — a worldbuilding notebook for D&D.
The defining idea: **a "world" is just a folder on disk.** Articles are `.md`
files, folders are real directories, and images live in an `_images/` subfolder.
There is **no server and no database** — world folders are portable and open
fine in Obsidian too.

## Commands

Everything runs from `client/` — there is no root-level `package.json`.

```sh
cd client
npm install
npm run dev      # Vite dev server (port 4280) + Electron with HMR
npm test         # data-layer unit tests (vitest)
npm run lint     # eslint
npm run format   # prettier --write + eslint --fix
npm run check    # prettier --check
```

Run a single test file or test:

```sh
npx vitest run electron/main/worldStore.test.ts
npx vitest -t "round-trips absolute paths"
```

Build and release (Windows):

```sh
npm run dist     # NSIS installer -> client/release/
npm run release  # build + publish a draft GitHub Release (needs GH_TOKEN)
```

Before `release`, bump `"version"` in `client/package.json` — the auto-updater
only offers versions greater than the installed one. Regenerate routes after
adding a route file: `npm run generate-routes`.

## Architecture

### Two processes, one bridge

The React renderer **never touches disk**. It calls
`window.dmApi.invoke(channel, args)`, exposed by `client/electron/preload/index.ts`
via a **channel allowlist**. Adding a new IPC channel means adding it in _both_
the preload allowlist and `ipc.ts`, or the call is rejected.

### Data layer = Electron main (`client/electron/main/`)

- `ipc.ts` — the single place every `ipcMain.handle(...)` lives; maps channels to functions.
- `worldStore.ts` — the filesystem model. `readTree` walks the world folder (directories become folders, `*.md` files become articles). Writes are atomic (temp file + rename) so a crash never truncates an article. Renaming an article calls `rewriteWikiLinks` to fix `[[links]]` across the entire world.
- `sanitize.ts` — **security-critical.** `resolveInWorld` rejects any path that escapes the world root, and **every** handler funnels through it before touching disk. `nameError` validates titles/folder names as filenames. World ids are **hex-encoded** absolute paths — hex (not base64) because the id also rides in the host of `world://` URLs, which get lowercased.
- `images.ts` — serves world images read-only through a custom `world://<hexWorldId>/_images/<path>` protocol; enforces type/size limits on upload. Images live in **nested subfolders** under `_images/`, so it also owns folder create/rename/move/delete and image rename/move — each confined to `_images/` by a local `resolveInImages` (`resolveInWorld` alone would let `_images/../NPCs` through). Renaming or moving an image or image folder calls `rewriteImageRefs` to repoint `_images/` paths across the whole world, the image-side counterpart of `rewriteWikiLinks`. Because a reference on disk may be percent-encoded (what the picker inserts) or plain (what a human types in Obsidian), the rewriter matches both and preserves whichever style it found.
- `recents.ts` — recent-worlds list, stored in `userData/config.json`.

### Client data access

Components go through the typed `api` object in `client/src/lib/api.ts`, which
mirrors the IPC channels. Add methods there — don't scatter raw `invoke` calls
through components.

### SRD tables are an affordance, never a schema

`client/src/lib/srd/` holds SRD 5.1 races, backgrounds, class starting kits and
equipment tables (TypeScript constants, matching `classes.ts`). They exist so
the character creation wizard can offer choices — nothing more.

The rule that governs the whole folder: **`class`, `subclass`, `race` and
`background` are free text on disk.** A lookup is `name in, undefined out`,
mirroring `findClass`. An id in these tables is for React keys only and must
never reach a `.md` file: the wizard writes `race: Hill Dwarf`, never
`race: hill-dwarf`. A race, class or background the tables don't know
contributes its name and nothing else, and the sheet is still perfectly valid —
that is what keeps homebrew and Obsidian hand-edits round-tripping.

It is deliberately **not a rules engine**, and level 1 only. No per-level
feature tables, no slot progression, no multiclassing. There are two
derived-number exceptions, and both are fields rather than mechanisms on
purpose: `SubraceInfo.hpPerLevel` (Hill Dwarf), and
`ClassFeatureInfo.halfProficiency`, which sets `Character.halfProficiency` so
`skillBonus` can compute a Bard's Jack of All Trades and a Fighter's Remarkable
Athlete. The second is deliberately *partial*: 5e applies half proficiency to
any ability check, and it reaches the eighteen skill rows because those are the
only checks the sheet has a row for. The feature text still describes the whole
rule; the number only claims what it can honestly compute.
`srd.test.ts` asserts data integrity — every skill
id real, every `PickList.id` globally unique — because a transcription error
here is silent: a mistyped skill just vanishes when the sheet parses it back.

`lib/srd/` carries **per-level progression** — features by level, spell slot
tables, ASI levels — and there is a line. What a class gains as it levels is in,
because the level-up wizard needs it. Multiclassing, encumbrance rules and
anything computed _during play_ stay out, and nothing here is ever enforced: the
wizard offers what the table says and the player takes it or ignores it.

A class's level-1 **feature that is really a choice** becomes a `PickList` only
when the sheet has a field for its answer. Rogue Expertise qualifies —
`Character.expertise` exists and `skillBonus` doubles it — so it is a real
`kind: 'expertise'` pick on the kit's grant. Fighter's Fighting Style and
Ranger's Favored Enemy / Natural Explorer do not, and stay feature text: as
`kind: 'other'` picks `applyPicks` would record the click and then discard it,
which is worse than prose that at least promises nothing. An expertise pick's
authored `options` are the _class's ceiling_, narrowed at render to the
character's own proficiencies by `eligibleExpertise` — the table stays authored
data `srd.test.ts` can validate, and "two of _your_ skill proficiencies" is a
fact about the draft, not about the Rogue. A choice that stops being eligible is
shown as a removable chip rather than pruned, because deleting a player's work
on an unrelated edit is what this codebase doesn't do.

**Feats** are where that line first moved, and only halfway. `FeatInfo` lives
here but `SRD_FEATS` is deliberately **empty** and stays that way — SRD 5.1 has
no feat list. The ~85 built-in feats live in **`lib/feats/publishedFeats.ts`**,
outside `lib/srd/` on purpose: PHB, Xanathar's, Tasha's, Fizban's and Bigby's
feats are not SRD content and cannot sit under that folder's CC BY 4.0
attribution. `mergeTables` layers them between the empty SRD tier and the user's
homebrew, so precedence reads **world > global > published > SRD**. `SRD_TABLES`
carries them too — it is what every "is this a built-in?" check in the settings
UI reads, and updating only `mergeTables` leaves the Homebrew tab showing none.

What that tier ships is **names and mechanical grants, never rules text**: a
`summary` is a one-line reminder in our own words, and a feat whose effect is a
combat rule this app doesn't model (Lucky, Sentinel, Great Weapon Master) carries
`grant: {}`, which is correct rather than incomplete. `traits`, `items` and
`currency` are never authored on a feat because `applyFeatGrants` drops all
three — they would apply at level 1 and vanish at every level-up. `srd.test.ts`
enforces all of this, and its `allGrants()` walker deliberately reaches out of
`srd/` into `lib/feats/` so feat picks are checked against the same global pick-id
keyspace as every race and background.

A feat is built on `Grant`, the same bundle races and backgrounds use, so taking
one grants its skills and proficiencies through `applyGrant` rather than any new
mechanism; a half-feat's `+1` rides `racialAsi` at creation and `mergedAsi` at
level-up. `asi` is a fixed record, so a feat offering a _choice_ of ability
(Resilient, Skill Expert) picks the usual one and says "of your choice" in its
summary — the sheet is hand-editable, and giving `FeatInfo` a chooseable `asi`
was considered and rejected. (Races since gained one, below; feats did not, and
the reasoning there is unchanged — a feat's bump is one point, not a spread.) `prerequisite` is free text that is **shown and
never checked**. So feat _definitions_ and their grants are in; feat _rules text
and enforcement_ remain out, exactly as the paragraph above still requires.

That split is now a **pattern rather than an exception**:
`lib/races/publishedRaces.ts` exists for the same attribution reason and layers
the same way, though it currently ships **nothing** — the tier is wiring, so a
race from a published book has somewhere to go that is not `lib/srd/`. Two
differences from feats if you ever fill it: this tier sits on top of a
*non-empty* SRD one, so `SRD_RACES.length` is not the built-in race count, and a
published race must never collide by name with one of the SRD nine or `layer`
would silently hide it. `srd.test.ts` asserts both.

**`lib/subclasses/publishedSubclasses.ts`** is the third tier, and the one that
actually ships something. SRD 5.1 licenses exactly **one subclass per class** —
Champion, Thief, Life Domain, College of Lore — while `classKits.ts` seeds every
archetype 5e offers as a bare *name*, so a player who picks Battle Master still
gets a working sheet. A name is not what the licence is about; features are. So
the moment a non-SRD archetype gains them it belongs here.

Two differences from the other tiers, both structural. A subclass is **not a
top-level list** — it lives inside the kit that offers it — so this one is keyed
by class name and folded in by `withPublishedSubclasses`, which reuses
`layerSubclasses`. And it has to be wired into **both** `SRD_TABLES` and
`mergeTables`: the first is what every "is this a built-in?" check in settings
reads, and wiring only one leaves half the app disagreeing with the other half.

The invariant is the attribution boundary itself: a published entry may overlay
a name-only *stub* — that is the whole point — but never a subclass `lib/srd/`
authored, which `layerSubclasses` would silently replace. `subclasses.test.ts`
asserts that, and pins the exact list of subclasses carrying content in
`lib/srd/` so a future pass cannot quietly add a PHB one. That list currently
holds four knowing exceptions — Battle Master, Eldritch Knight, Assassin and
Arcane Trickster — authored before the boundary existed.

**A race's ability increase can be the player's**, and `flexibleAsi` is the one
field here that graduated from flag to mechanism. It was `{ count, amount }` — N
increases all the same size — with a comment conceding it was a flag because
Variant Human was the only case. A Goliath-style race offers "+2 and +1" *or*
"three +1s", which that shape cannot say at any single `amount`, so it became a
list of modes, each a list of increase amounts. It is still not a rules engine:
nothing is enforced, `racialAsi` just sums whatever the player placed, and the
draft already stored a per-ability amount so the commit path did not move at
all. Two things it deliberately cannot express — a per-slot restriction ("+2 to
Str or Con") and a flexible spread on a *subrace*, which would need placements
keyed by owner. `parseRace` still reads the legacy `{ count, amount }` off disk
and `serializeHomebrew` writes it back whenever a spec is still sayable that
way, so an older build reading a newer file gets the right answer rather than a
plausible wrong one.

`lib/levelUp.ts` is the level-up wizard's pure layer, and its invariant is the
thing to preserve: **`applyLevelUp` only appends to arrays and raises numbers.**
It never rewrites `hp.current`, never edits an existing feature, never lowers a
slot total. A character is somebody's work. The draft carries its own `base`
snapshot so the step list can't change shape while the dialog is open.

A `ClassKit` is the **whole definition of a class** — hit die and subclasses for
the character sheet, starting gear and features for the wizard. These were two
tables once (`ClassInfo` per-world, kits global, joined by name); they were
merged so a class is edited in one place and travels as one thing. `ClassInfo`
survives only as the shape `classesFrom(tables)` hands the sheet, and as the
legacy `worldSettings.classes` key, which `mergeTables` folds into kits at read
time. **A world file is never rewritten just because it was opened**, so an old
world keeps its `classes` key and an older build opening the same folder still
finds what it expects.

Since v1.4.x the tables are **user-extensible**. `lib/homebrew.ts` parses
`homebrew.json` from the app's userData folder (global — shared by every world,
written by `electron/main/homebrew.ts`), and `worldSettings.json` gained
optional `races`/`backgrounds`/`kits` beside the legacy `classes` (per-world,
and the only tier that travels with a world folder). `lib/tables.ts` merges the three:
**world > global > SRD**, matched case-insensitively on name, so overriding a
built-in replaces it in place rather than duplicating it.

The one genuinely dangerous spot is `findSubrace`. `Character.race` stores only
the full subrace name ("Hill Dwarf"), so the parent race is recovered by
searching every race — and with homebrew merged in, two parents can offer the
same subrace name. Picking the wrong one silently yields the wrong speed and HP
rather than an error, which is why `subraceIndex` is built once over the merged
list and covered directly by `tables.test.ts`.

Editors live in `components/settings/homebrew/` (a Homebrew settings section,
app-wide like Library) and `components/character/create/HomebrewDialog.tsx`
(inline creation from the wizard). The inline path is the **only** sanctioned
refresh of the draft's captured tables — see the ref in `CreateCharacterDialog`,
which exists so a background refetch can't wipe work in progress.

The wizard's pure layer lives beside it and is fully unit-tested without React:
`abilityMethods.ts` (five score methods, including the 3×3 grid), `characterDraft.ts`
(wizard state and step gating — the draft **carries its own merged tables**, so
every derived helper stays a pure function of the draft) and `buildCharacter.ts`
(draft → `Character` +
markdown body). `buildCharacter` must stay **total** — the live summary panel
calls it on every keystroke against a half-filled draft.

### Ids are path strings (not DB keys)

- **World id** = hex of the absolute folder path.
- **Article id** = world-relative path minus `.md` (e.g. `NPCs/Strahd`).
- **Folder id** = world-relative directory path. `null` folder = world root.
- **Image id / image folder id** = path relative to **`_images/`**, not the world
  root (e.g. `Maps/City/tavern.png`). `null` folder = the `_images` root. Markdown
  stores `_images/` + that path; `ImageInfo.encodedRelPath` is the ready-to-paste
  form. Encode paths **per segment** — whole-path `encodeURIComponent` turns the
  separators into `%2F`, which the app tolerates but Obsidian does not.

### Markdown rendering

`client/src/components/Markdown.tsx` + `client/src/lib/formatMarkdown.ts` handle
`[[wiki links]]`, clickable dice notation (`2d6+3`), rollable `d100` tables, and
Homebrewery-style `\page` / `\columns` markers. Book pages are fixed
816×1056 sheets; a hidden off-screen measurer counts CSS columns to decide the
sheet count. Images on disk use portable relative paths (`_images/foo.png`); the
renderer rewrites them to `world://` URLs at display time.

### Build pipeline

- Vite builds the renderer into `dist/`.
- **esbuild** (`esbuild.electron.mjs`) bundles main + preload into `dist-electron/` as **`.cjs`** files — the package is `"type": "module"`, so the Electron entry points must be CommonJS.
- `prepare-electron-dist.mjs` copies Electron's dist to `.electron-dist` minus `default_app.asar`, because corporate antivirus holds fresh `.asar` files open and makes electron-builder's normal unlink fail (EBUSY).

### Frontend stack

React 19 + TanStack Router (file-based routes in `client/src/routes/`; do **not**
hand-edit the generated `routeTree.gen.ts`) + TanStack Query. Tailwind CSS 4 and
shadcn/ui — add components with `pnpm dlx shadcn@latest add <name>`, they land in
`client/src/components/ui/`.

## Gotchas

- `client/README.md` is **stale TanStack Start boilerplate** (Nitro servers, server functions, API routes) — none of it applies. Ignore it.
- `server/` (an empty `Data/` dir) and `scripts/migrate-sqlite.mjs` are **dead remnants** of a removed .NET/SQLite server, kept only for one-time migration. They are not part of the running app.
- Deletes go to the OS Recycle Bin via `shell.trashItem`, not `fs.rm`.
- "Reveal in File Explorer" is two channels, not one: `shell:reveal` for articles/folders/the world root, and `images:reveal` for images (`revealImage` in `images.ts`, ids relative to `_images/`). Both go through a path guard. `shell:reveal` takes a **world-relative `relPath`** and resolves it inline in `ipc.ts` via `resolveInWorld` — the _caller_ appends `.md` for an article, passes a bare folder id for a folder, and passes nothing at all for the world root. That keeps `worldStore.ts` Electron-free so it stays testable without mocks; `images.ts` already imports `shell`, so its reveal sits there. Renderer side, always go through `revealer(worldId)` and the `REVEAL_LABEL` constant in `client/src/lib/reveal.ts` rather than calling the channel directly, so every reveal affordance reads and behaves the same.
