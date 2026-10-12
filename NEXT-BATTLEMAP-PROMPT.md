# Handover: the DungeonMaster battlemap

Paste this into a fresh Claude Code context in `c:\Projects\DungeonMaster`.

Branch: `feature/1.6.1-UIStuff`. All the work below is **committed** (`17898d5
battle maps`) and the tree is clean.

---

## What this is

A battlemap feature built from scratch over one session: maps with a background
image, a grid, tokens, fog of war, measurement/AoE templates, and a link between
tokens and the initiative tracker.

Reach it from the **session rail → Battlemaps tab** (DM mode only). The map list
lives in the rail; opening a map hands over to a **full-window overlay**.

## Start here

1. `CLAUDE.md` — the architecture section, especially the IPC/preload rule and
   "Ids are path strings".
2. `client/src/lib/mapStore.ts` — the data model and its doc comments. Every
   design decision that bit us is written down there.
3. `client/src/components/map/MapEditor.tsx` — the overlay that assembles
   everything.

## Files

**Pure layer** (no React, no Electron — all unit tested):

| File | What it owns |
|---|---|
| `client/src/lib/mapStore.ts` | `BattleMap`, `Token`, `GridSpec`; tolerant `parseMaps`; token add/update/move; `forPlayers` |
| `client/src/lib/fog.ts` | Fog as a packed base64 bitmask; reveal/hide/resize |
| `client/src/lib/mapCamera.ts` | screen ↔ map ↔ cell maths, `zoomAt`, `fitCamera`, `cellsBetween` |
| `client/src/lib/mapMeasure.ts` | Distance in feet, circle/cone/line/square templates, `tokensInArea` |
| `client/src/lib/mapTokens.ts` | Token ↔ combatant link, `tokenVitals`, `sizeFromSubtitle`, `freeCell` |
| `client/src/lib/useMaps.ts` | Live store: `useSyncExternalStore`, hydrate, debounced save |

**React layer:**

| File | What it owns |
|---|---|
| `components/map/MapPanel.tsx` | The map **list** in the session rail |
| `components/map/MapEditor.tsx` | The full-window overlay: toolbar, canvas, inspector (899 lines — the biggest thing here) |
| `components/map/MapCanvas.tsx` | SVG layers over the background: grid, fog, tokens, measurement |
| `components/map/MapCreaturePanel.tsx` | The creature drawer: Bestiary / Party / Scene |
| `components/map/MapBackgroundDialog.tsx` | Picks a background image |

**Persistence:** `.dm/maps.json` in the world folder, via `maps:get`/`maps:set`.
Wired in `electron/main/session.ts`, `electron/main/ipc.ts`, the **preload
allowlist**, and `lib/api.ts`. (Adding an IPC channel means editing *both* the
preload allowlist and `ipc.ts`, or the call is rejected.)

## Design decisions that are load-bearing

**The grid is the map; the image is a backdrop.** `grid.cols` and `grid.rows`
are **stored**, not derived from the image. 15 × 30 means 15 × 30, with square
cells, giving a tall grid. The background is painted into the grid's box with
`object-cover`, so a mismatched image **crops** until the counts are set to
match. This was got wrong three times before landing — earlier versions let the
image dictate the shape, which made "15 columns and 30 rows" impossible to
express. Do not reintroduce that.

**Cells are always square.** `grid.size` is one number. There is no rectangular
cell, no "square cells" toggle, and no grid offset — all three were tried and
explicitly rejected by the user.

**Fog is a packed base64 bitmask**, not `boolean[][]`. Measured, JSON
pretty-printed as `writeWorldJson` stores it:

| grid | `boolean[][]` | `"x,y"` keys | bitmask |
|---|---|---|---|
| 200×200 | 416 KB ❌ | 186 KB | **6.5 KB** |
| 500×500 | 2592 KB ❌ | 1227 KB ❌ | **41 KB** |

`MAX_STATE_BYTES` is 256 KB and `writeWorldJson` **throws** rather than
truncating, so the obvious encoding would hard-fail saves on a large map. There
is a test asserting the budget at 500×500.

**Hidden tokens are stripped, never CSS-hidden.** `forPlayers()` removes them
from the payload. There is a test asserting the token's id does not appear in
`container.innerHTML` of a player-audience render. This is a secrecy rule.

**The token → combatant link lives on `Token.combatantId`**, not on `Combatant`.
`parseCombatState` picks its fields explicitly, so a coordinate added to
`Combatant` would survive one save and vanish on the next load.

**A dangling link is tolerated.** Removing a combatant leaves its token on the
map, unlinked — the body may still be lying there. `isOrphaned` surfaces it;
nothing prunes it.

**Distance is Chebyshev** (5e's "a diagonal is 5 feet"), so three diagonal steps
reads 15 ft, not 21. Tests pin the *choice*, so swapping in Euclidean fails.

**Map shortcuts are local `window` listeners, not `useShortcut`.** The overlay
calls `useSuspendShortcuts(true)`, which suppresses every `useShortcut` in the
app **including its own**. A `useShortcut('escape')` here could never fire. The
command palette solves this the same way. This bug was shipped and caught by a
test; do not "tidy" it back.

## Shortcuts

`V` select · `P` place · `R`/`H` reveal/hide fog · `M` measure · `B` creature
drawer · `S` stat block popout · `[`/`]` damage/heal · `Del` remove token ·
`Esc` close. No modifiers — the overlay owns the keyboard.

## Testing

163 map tests. `npx vitest run src/components/map/ src/lib/map*.test.ts src/lib/fog.test.ts`

Every behavioural claim above was verified by **sabotaging the implementation
and confirming tests fail** — the secrecy rule, the fog budget, the camera
inverse, the place tool, combatant removal. Keep doing that; several of these
tests would otherwise pass vacuously (the canvas render tests in particular draw
nothing at all in jsdom without a stubbed `clientWidth`/`clientHeight`, so they
pass for free if the stub is removed).

**Known flakes, not yours.** Under full parallel load on Windows these fail
intermittently and pass in isolation every time:
`electron/main/images.test.ts`, `electron/main/tableFlow.test.ts`,
`src/lib/spellCard.test.ts`, and the seed tests. A full run commonly shows 1-2
of them. **Re-run the single file before believing a failure** — all four were
verified clean 3-5x in isolation at handover time.

## What is NOT done

**1. Push to players — the biggest gap.** There is no way to get a map onto a
second screen, a TV, or a LAN guest. `forPlayers()` is written and tested but
**nothing calls it**. This is the thing that makes the feature worth having; a
battlemap only the DM can see is half a feature.

The plan for it (researched, not built):
- Needs a **new route** — `/player/$worldId/$articleId` is article-bound by
  construction (`routeTree.gen.ts`). Add e.g. `/map/$worldId/$mapId`, regenerate
  with `npm run generate-routes`, never hand-edit `routeTree.gen.ts`.
- Keep it a **top-level sibling of `worlds/`**: `worlds:watch` is a singleton in
  main and a second subscriber steals live-reload from the DM window
  (`ArticleViewer.tsx` explains this).
- `playerWindow.ts` keys windows as `${mode}::${worldId}::${articleId}` and
  `player:show` validates with `resolveInWorld(root, articleId + '.md')` — which
  **rejects a map id**. `PlayerContent` is four strings declared in *three*
  places (`playerWindow.ts`, `ipc.ts`, `api.ts`).
- Copy `webPreferences` verbatim: **no `partition`**, or the window silently
  serves no `world://` images.
- For LAN: `tableHost.ts`'s `broadcast(kind, payload)` is already generic, and
  guests fetch images via the existing `/img/` route. A worldId must **never**
  cross the wire. Note `GuestTable.tsx` flags that images on shown content do
  not render guest-side yet — that is a prerequisite.

**2. `MapEditor.tsx` is 899 lines** and wants splitting. The toolbar, the token
inspector and the grid controls are three obvious components.

**3. Toolbar polish.** Flat row of buttons; no segmented control (there is no
`ToggleGroup` in `ui/`, but `radix-ui` is already a dependency so adding one is
cheap), no zoom buttons, no minimap.

**4. Two dead exports** — `fitGridToImage` (mapStore) and `serializeGrid`
(mapStore) have no callers at all. Either wire or delete.

**5. Untested wiring.** The HP `+`/`−` buttons are covered only by types. An
end-to-end "click token → damage it" test was attempted and abandoned because
jsdom hit-testing would not land a click on a token reliably; the canvas-level
test asserts the HP bar shrinks instead.

**6. Never run by the assistant.** Everything is verified by tests and jsdom
rendering. Nobody has checked how it *feels* — token size at real zoom, fog
contrast over a real map, whether the amber template fill reads. The user runs
the app; ask them.

## Also open, unrelated to maps

From the deleted `NEXT-*-PROMPT.md` files, still true:

- **Wizard spellbook.** `SpellcastingInfo.spellbook.perLevel` is declared,
  parsed, and read by nothing that matters (`lib/levelUp.ts` returns 0 because
  nothing authors it). **A Wizard picks cantrips at level-up but never gains
  spells.** Needs a fourth counting rule.
- **Superior Technique** grants a manoeuvre and a d6; only the die is offered.
- **Spell swapping** — deliberately unbuilt; `applyLevelUp` only appends.
- **A stranded commit:** `3641d86` on `origin/publicGame` is remote (internet,
  not LAN) play with a DM approval queue — 2,151 lines, fully tested, orphaned
  because the LAN branch was squash-merged underneath it. Cherry-pick it; do
  **not** merge the branch.
- **The in-app Guide only reaches new worlds.** `scaffoldGuide` writes it at
  world creation and never overwrites, so existing worlds keep the old copy.
  The battlemap is undocumented there.

## House rules worth knowing

- Lint fails on a clean tree (pre-existing errors); grep for your own files.
- `npx tsc --noEmit` skips `electron/`; use `npx tsc -p electron/tsconfig.json`.
  That reports ~5 pre-existing errors in test files.
- The repo is LF. Python edits need `newline=''` or you get whole-file diffs.
- Dev launch writes to `%APPDATA%/DungeonMaster` — the user's live profile.
