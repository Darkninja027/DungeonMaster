/**
 * The live half of the battlemap store: a module store, hydration, and the
 * relay to the main process.
 *
 * Shaped after `sessionStore.ts` — `useSyncExternalStore`, a race-guarded
 * `hydrate`, a `flush` on world switch and `beforeunload` — with two deliberate
 * differences.
 *
 * **The disk is not ours.** This store used to own an 800ms debounce and write
 * the whole file itself. That is safe with exactly one window and unsafe the
 * moment a map can open in its own: a module store is one copy per renderer
 * PROCESS, and two processes each flushing a whole file lose maps deterministically
 * (see electron/main/statePatch.ts). So the authority moved to the main process,
 * every edit goes up as a one-map patch, and changes made in other windows come
 * back on `maps:changed`. There is no local save timer at all any more, which is
 * what makes "a relayed change must not be re-saved" structurally true rather
 * than merely something the code is careful about.
 *
 * **Two cadences, and they are separate on purpose.** A token drag emits a state
 * change per pointer move:
 *
 *   - **disk** is debounced in main at 800ms, and a drag is one write;
 *   - **the live push** to a player window is throttled here at
 *     `PUSH_THROTTLE_MS`, so the table keeps up with the drag.
 *
 * All the *rules* live in `mapStore.ts` as pure functions. What is testable here
 * is the revision arbitration and the throttle, and both are covered in
 * `useMaps.test.ts`.
 */

import { useSyncExternalStore } from 'react'
import { api } from './api'
import type { StateChange } from './api'
import {
  dropMap,
  emptyMaps,
  findMap,
  forPlayers,
  parseMaps,
  upsertMap,
} from './mapStore'
import type { BattleMap, MapFile } from './mapStore'

/** ~30fps: fast enough that a dragged token does not stutter on the table. */
const PUSH_THROTTLE_MS = 33

let state: MapFile = emptyMaps()
let currentWorldId: string | null = null
/** Main's revision, as last seen here. Everything below turns on this. */
let rev = 0
let lastPush = 0
let pushTimer: ReturnType<typeof setTimeout> | null = null
/** The map this window is showing to players, if any. */
let liveMapId: string | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/**
 * A local edit: show it at once, tell main, push it to the table.
 *
 * Optimistic because main is authority for the *disk*, not for frame timing —
 * waiting for a round trip before a dragged token moved would be unusable.
 */
function applyLocal(next: MapFile, map: BattleMap | null, removeId?: string) {
  state = next
  notify()
  if (currentWorldId) {
    const patch = removeId ? { removeId } : { entry: map }
    void api.maps
      .apply(currentWorldId, patch)
      .then((r) => {
        rev = Math.max(rev, r.rev)
      })
      .catch(() => {
        // Best effort, as the old save was: the map keeps working in memory.
      })
  }
  pushLive()
}

/**
 * A change from another window.
 *
 * Never re-sent and never saved — there is no save here to call. The revision
 * check is what makes that safe in both directions: anything at or below the
 * rev we hold is an echo, a duplicate, or out of order, and a gap means a
 * message was missed and the whole file has to be re-read. Sender-exclusion in
 * main handles the common case; this handles the rest.
 */
function applyRemote(change: StateChange) {
  if (change.worldId !== currentWorldId) return
  if (change.error) return // a failed disk write, not a state change
  if (change.rev <= rev) return
  if (change.rev > rev + 1) {
    // Missed one. Re-read rather than applying a patch onto a file we know is
    // already wrong.
    void hydrateMaps(currentWorldId, { force: true })
    return
  }
  rev = change.rev

  if (change.replace !== undefined) {
    state = parseMaps(change.replace)
  } else if (change.removeId) {
    state = dropMap(state, change.removeId)
  } else if (change.entry) {
    // Through the tolerant parser, so a hand-edited or part-broken row coming
    // from another window is treated exactly as one read off disk would be.
    const parsed = parseMaps({ version: 1, maps: [change.entry] })
    const one = parsed.maps[0]
    if (!one) return
    state = upsertMap(state, one)
  } else {
    return
  }
  notify()
  // A rename in the DM window should reach a player view this window is driving.
  pushLive()
}

/**
 * Relay the current map to a player window, if this window is showing one.
 *
 * `forPlayers` is applied HERE, before the payload crosses the bridge, and that
 * placement is the secrecy rule rather than a convenience: a hidden token then
 * never enters the main process's relay, never enters the player window's heap,
 * and never appears in a devtools IPC trace on a projector. Doing it in main or
 * in the viewer would move the rule out of the pure, tested layer.
 *
 * Throttled with a TRAILING call. A leading-edge-only throttle drops the last
 * frame of a drag, which leaves the token on the table visibly short of where
 * the DM actually put it until some unrelated edit shakes it loose.
 */
function pushLive() {
  if (!liveMapId || !currentWorldId) return
  const now = Date.now()
  const wait = PUSH_THROTTLE_MS - (now - lastPush)
  if (wait > 0) {
    if (!pushTimer) pushTimer = setTimeout(() => {
      pushTimer = null
      pushLive()
    }, wait)
    return
  }
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  lastPush = now
  const map = findMap(state, liveMapId)
  if (!map) return
  void api.mapView.push(currentWorldId, liveMapId, forPlayers(map)).catch(() => {
    // No window watching, or it closed mid-push. Nothing to do.
  })
}

/**
 * Start or stop pushing a map to the player view.
 *
 * Only the window DISPLAYING a map pushes it, so a rename in the DM window's
 * list cannot open a player window that was never asked for.
 */
export function setLiveMap(mapId: string | null): void {
  liveMapId = mapId
  if (mapId) pushLive()
}

export function liveMap(): string | null {
  return liveMapId
}

/** Write any pending change now (world switch, window close). Best effort. */
export async function flushMaps(): Promise<void> {
  if (!currentWorldId) return
  try {
    await api.maps.flush(currentWorldId)
  } catch {
    // Persistence is best-effort; main still holds the state and its own timer.
  }
}

/** Load this world's maps. Safe to call repeatedly (same world = no-op). */
export async function hydrateMaps(
  worldId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  if (currentWorldId === worldId && !options.force) return
  if (currentWorldId !== worldId) {
    await flushMaps() // for the previous world
    currentWorldId = worldId
    state = emptyMaps()
    rev = 0
    notify()
  }
  try {
    const snapshot = await api.maps.get(worldId)
    // A world switch may have raced ahead of this load.
    if (currentWorldId !== worldId || !snapshot) return
    state = parseMaps(snapshot.file)
    rev = snapshot.rev
    notify()
  } catch {
    // Missing or corrupt: keep the empty file, exactly as parseMaps would.
  }
}

/**
 * The current file, without subscribing.
 *
 * For callers outside React — and for tests, which need to assert on what a
 * relayed change actually did rather than on whether it happened to trigger a
 * side effect.
 */
export function mapsSnapshot(): MapFile {
  return state
}

export function useMaps(): MapFile {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export const mapActions = {
  /** Add a map, or replace one with the same id. */
  save(map: BattleMap) {
    const stamped = { ...map, savedAt: new Date().toISOString() }
    applyLocal(upsertMap(state, stamped), stamped)
  },
  /**
   * Change one map in place.
   *
   * Every token drag, fog stroke and grid tweak comes through here, so it
   * deliberately does **not** stamp `savedAt` — that field orders the map list,
   * and re-sorting the list under the DM every time a goblin moves would make
   * it unusable mid-fight.
   */
  update(id: string, change: (map: BattleMap) => BattleMap) {
    const before = findMap(state, id)
    if (!before) return
    const after = change(before)
    applyLocal(upsertMap(state, after), after)
  },
  remove(id: string) {
    applyLocal(dropMap(state, id), null, id)
  },
}

/** Read one map without subscribing to the whole file. */
export function useMap(id: string | null): BattleMap | undefined {
  const file = useMaps()
  return id ? findMap(file, id) : undefined
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => void flushMaps())
  // Changes from other windows. Subscribed once at module load, for the life of
  // the renderer — there is no unsubscribe because there is no point at which
  // this window stops caring. Guarded on the bridge: this module is imported
  // by tests and by the guest build, neither of which has a preload.
  if (window.dmApi) api.maps.onChanged(applyRemote)
}
