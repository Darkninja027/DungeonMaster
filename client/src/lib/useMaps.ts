/**
 * The live half of the battlemap store: a module store, hydration, and the
 * debounced save to `.dm/maps.json`.
 *
 * Shaped after `sessionStore.ts` — `useSyncExternalStore`, a race-guarded
 * `hydrate`, and a `flushSave` on world switch and `beforeunload` — with one
 * deliberate difference. That store saves on an 800 ms debounce tuned for typed
 * HP edits. A token drag emits a state change per pointer move, and 800 ms is
 * both too slow to feel live on a player's screen and far too eager to hit the
 * disk. So the two cadences are separate here:
 *
 *   - **disk** is debounced at `SAVE_DEBOUNCE_MS`, and a drag is one write;
 *   - **the live push** to a player window or a LAN guest is throttled at
 *     `PUSH_THROTTLE_MS`, so the table keeps up with the drag.
 *
 * The push is deliberately not wired yet — that is step 5 and 6 of the feature,
 * and `pushLive` is the single place it will attach. Doing it here would mean
 * inventing the payload before the window that consumes it exists.
 *
 * All the *rules* live in `mapStore.ts` as pure functions; this file is glue and
 * holds no logic worth testing without React.
 */

import { useSyncExternalStore } from 'react'
import { api } from './api'
import { emptyMaps, findMap, parseMaps, upsertMap, withMap } from './mapStore'
import type { BattleMap, MapFile } from './mapStore'

const SAVE_DEBOUNCE_MS = 800
/** ~30fps: fast enough that a dragged token does not stutter on the table. */
const PUSH_THROTTLE_MS = 33

let state: MapFile = emptyMaps()
let currentWorldId: string | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastPush = 0
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function setState(next: MapFile) {
  state = next
  notify()
  scheduleSave()
  pushLive()
}

/**
 * Relay the current map to anything showing it live.
 *
 * A no-op until the player window and the LAN `map` frame exist; the throttle
 * is here now so the drag path is right from the start rather than being
 * retrofitted onto something that already writes every pointer move.
 */
function pushLive() {
  const now = Date.now()
  if (now - lastPush < PUSH_THROTTLE_MS) return
  lastPush = now
}

function scheduleSave() {
  if (!currentWorldId) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushMaps()
  }, SAVE_DEBOUNCE_MS)
}

/** Write any pending changes now (world switch, window close). Best effort. */
export async function flushMaps(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!currentWorldId) return
  try {
    await api.maps.set(currentWorldId, state)
  } catch {
    // Persistence is best-effort; the map keeps working in memory. A payload
    // over MAX_STATE_BYTES throws here rather than silently truncating.
  }
}

/** Load this world's maps. Safe to call repeatedly (same world = no-op). */
export async function hydrateMaps(worldId: string): Promise<void> {
  if (currentWorldId === worldId) return
  await flushMaps() // for the previous world
  currentWorldId = worldId
  state = emptyMaps()
  notify()
  try {
    const raw = await api.maps.get(worldId)
    // A world switch may have raced ahead of this load.
    if (currentWorldId !== worldId || raw === null) return
    state = parseMaps(raw)
    notify()
  } catch {
    // Missing or corrupt: keep the empty file, exactly as parseMaps would.
  }
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
    setState(upsertMap(state, { ...map, savedAt: new Date().toISOString() }))
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
    setState(withMap(state, id, change))
  },
  remove(id: string) {
    setState({
      version: 1,
      maps: state.maps.filter((m) => m.id !== id),
    })
  },
}

/** Read one map without subscribing to the whole file. */
export function useMap(id: string | null): BattleMap | undefined {
  const file = useMaps()
  return id ? findMap(file, id) : undefined
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => void flushMaps())
}
