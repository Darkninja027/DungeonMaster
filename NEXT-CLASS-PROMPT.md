# Handoff: author the next class's subclass data

Paste this into a fresh Claude Code context in `c:\Projects\DungeonMaster`.

---

## The task

Author per-level subclass features for **one class at a time**, following the
Fighter as the worked example. Fighter is done (3/3 archetypes); the other
eleven classes ship `features: []` on every subclass:

```
Barbarian 0/2   Bard 0/2      Cleric 0/7    Druid 0/2
Monk 0/3        Paladin 0/3   Ranger 0/2    Rogue 0/3
Sorcerer 0/2    Warlock 0/3   Wizard 0/8
```

Ask which class to do, do that one class completely, stop. Do not batch.

Everything below already exists and works — this is **data authoring against a
finished mechanism**, not a feature build. If you find yourself changing
`levelUp.ts` or `buildCharacter.ts`, stop and re-read this document first.

## Start here

Read in this order before touching anything:

1. `CLAUDE.md` — especially the `lib/srd/` section. Its rules are load-bearing.
2. `client/src/lib/srd/types.ts` — `ClassFeatureInfo`, `PickList`, `Grant`,
   `SubclassInfo`.
3. `client/src/lib/srd/classKits.ts`, the **Fighter kit** — the template for
   everything below.
4. `client/src/lib/srd/srd.test.ts` — the invariants that will fail you.

## The mechanism you are authoring into

A subclass feature is a `ClassFeatureInfo`:

```ts
{ level: number; name: string; text?: string; picks?: PickList[]; resource?: {...} }
```

Three optional parts, each with a rule about when to use it:

### `picks` — a choice whose answer is a feature

Use `kind: 'feature'` when the feature *is* a menu (manoeuvres, invocations,
metamagic, a Fighting Style). The chosen option lands in `Character.features`
as a named row.

- `featureLabel` prefixes the row: `'Manoeuvre'` → `"Manoeuvre: Riposte"`.
  Omit where the option already names itself.
- `featureText` is a `Record<option, string>` — **every** option needs one
  (`srd.test.ts` enforces this).
- `featureGrant` is a `Record<option, Grant>`, for the rare option that lands
  on a number the sheet holds. Most options carry nothing, and that is
  *correct rather than incomplete* — the same bargain the feat catalogue makes.
- Pick ids are globally unique. Prefix with the owner:
  `battle-master-7-maneuvers`. A repeated grant at several levels needs a
  **factory** — see `MANEUVER_PICK(owner, count)`.

Already wired end-to-end: the creation wizard, the level-up picks step,
greying-out of already-taken options, and the gate that blocks Next until every
pick is answered. You add data; the UI appears.

### `resource` — a counter the sheet tracks

`{ name, total, resets?: 'short' | 'long' }`. Rage uses, ki points, sorcery
points, superiority dice, bardic inspiration.

- Offered at level-up, **never auto-applied**. The player accepts, edits or
  declines it.
- A later feature naming the same resource **raises** it: authoring
  `{ name: 'Superiority Dice', total: 5 }` at level 7 turns a tracked 4 into a
  5, shown as `4 → 5`. `used` rides along untouched.
- Never lowers a total the player tuned higher than the table.
- Cap is `MAX_RESOURCES = 3` per character.

### Scaling numbers are separate feature rows

De-dupe is keyed on `level:name`, and `srd.test.ts` only forbids a repeated name
at the *same* level. So Extra Attack's upgrades are **their own rows**:

```ts
{ level: 5,  name: 'Extra Attack' }
{ level: 11, name: 'Extra Attack (2)' }
{ level: 20, name: 'Extra Attack (3)' }
```

Do **not** fold "three times at 11th level" into the level-5 row's prose. That
was the original bug: it scrolled past unread and the sheet stayed wrong.

## Rules that will bite you

From `CLAUDE.md` and `srd.test.ts` — all enforced by tests:

- **Every subclass feature must be at `level >= subclassLevelOf(kit)`.** Fighter
  is 3; Cleric/Sorcerer/Warlock are 1; Wizard is 2.
- **`sub.spells` only for a class with a `spellcasting` block.** This is a live
  trap for Eldritch Knight and Arcane Trickster — give them their spellcasting
  as *feature text*, never a spell table. Do not add a `spellcasting` block to
  Fighter or Rogue to get around it.
- **Ids never reach disk.** `Character.subclass` stores the display name.
- **No rules text you do not own.** Summaries are one line, in our own words.
  A feature whose effect this app cannot model carries prose and no grant.
- **`traits`, `items`, `currency` and nested `picks` are banned in a
  `featureGrant`** — the apply paths drop them.
- **A repeatable pick's option list must be long enough** for every level that
  draws from it (Battle Master: 18 manoeuvres for the 9 taken).

## Worked example to copy

`classKits.ts`, the Fighter kit:

- `FIGHTING_STYLES` — a `Record<string, {text, grant?, resource?}>` with
  per-class subsets (`FIGHTER_STYLES`, `PALADIN_STYLES`, `RANGER_STYLES`) and a
  `FIGHTING_STYLE_PICK(owner, only?)` factory. **Bard, Monk, Rogue and Warlock
  do not get Fighting Style; Paladin and Ranger already have theirs.**
- `MANEUVER_TEXT` + `MANEUVER_PICK(owner, count)` — the repeated-pick pattern.
- Battle Master — picks at 3/7/10/15, a resource that grows 4 → 5 → 6 at
  3/7/15, d8→d10→d12 upgrades as separate text-only rows at 10/18.
- Champion — a second Fighting Style at 10 reusing the same factory.
- Eldritch Knight — spellcasting as prose, no `spells` rows.

## Verification

```sh
cd client
npx vitest run src/lib/srd/srd.test.ts      # the data invariants
npx vitest run src/lib/levelUp.test.ts      # the mechanism
npx vitest run                              # all 1206
npx tsc --noEmit -p tsconfig.json
npm run lint                                # NOTE: 14 pre-existing problems
```

`npm run lint` **does not reach zero on a clean tree** — 9 errors and 5 warnings
exist in files unrelated to this work. Grep the output for the files you
touched; do not try to fix the rest.

`src/lib/spellCard.test.ts` and `electron/main/seed.test.ts` intermittently time
out under parallel load. Re-run the file alone before investigating.

Add tests for the class you author, mirroring the Fighter blocks in
`levelUp.test.ts` (`describe('archetype features')`, `'manoeuvres already
known'`, `'a tracked resource that grows with the class'`).

## Line endings — read this

Most files in this repo are **LF**, but `src/lib/levelUp.ts` and
`src/lib/buildCharacter.ts` are **CRLF**. Prettier and Python rewrites will
silently flip them and turn a 300-line diff into a 4000-line one. After
formatting, verify:

```sh
cd c:/Projects/DungeonMaster
for f in $(git diff --name-only); do
  o=$(git show HEAD:"$f" | file - | grep -c CRLF); n=$(file "$f" | grep -c CRLF)
  [ "$o" != "$n" ] && echo "MISMATCH $f"
done
```

## Where things stand

Last commit: `73b896f`. Working tree clean. All of the following is **done and
tested** — do not rebuild it:

- Subclass features flow through `featuresGained` (class + subclass, one path).
- A shared picks step at level-up; feat picks work there (14 published feats
  that previously granted nothing).
- `feature` pick kind, rendered as a `<select>` with the description beneath.
- `Grant.acBonus` (Defense +1 AC) and `Grant.hpPerLevel` (Tough).
- `FeatInfo.asiChoice` — six half-feats let the player pick the ability;
  Resilient's save follows that choice.
- Retroactive HP when an ASI raises the CON modifier.
- `Character.resources` — up to 3 counters, parsed, serialized, on the sheet and
  the printed page.
- ASI levels show running scores and lock until earlier ones are complete.

Two known gaps, deliberately left:

- **Superior Technique** (Fighting Style) grants a manoeuvre *and* a d6 die. The
  die is offered; the manoeuvre is not — that needs a pick that poses another
  pick, which this table cannot express. It says so in its row.
- **Nothing has been verified by driving the app.** Tests and build only. The
  printed sheet's tracker line especially: page budgets there must be
  *measured* in the running app, not eyeballed — a short window fakes a
  bottom-edge cut, so assert on overflow numbers rather than screenshots.
