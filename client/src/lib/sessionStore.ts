import { useSyncExternalStore } from 'react'
import { api, bridged } from './api'
import type { Combatant, SessionFile, StateChange } from './api'

/**
 * Combat/session state for the initiative tracker. Module-level store (same
 * pattern as rollLog). State is persisted per-world to .dm/session.json via
 * the session IPC channels, debounced, so a restart mid-combat restores the
 * roster, HP, round and whose turn it is.
 *
 * The `with*` functions are pure (state in, state out) so they can be
 * unit-tested without React or Electron.
 */

export type CombatState = SessionFile

export function emptyCombat(): CombatState {
  return { version: 1, combatants: [], activeId: null, round: 1 }
}

/** Turn order: initiative desc; ties keep insertion order (stable sort). */
export function turnOrder(state: CombatState): Array<Combatant> {
  return [...state.combatants].sort((a, b) => b.initiative - a.initiative)
}

/** Duplicate names get auto-suffixed: Goblin, Goblin 2, Goblin 3… */
export function withCombatantAdded(
  state: CombatState,
  input: Omit<Combatant, 'id' | 'name'> & { name: string },
  id: string,
): CombatState {
  const base = input.name.trim() || 'Combatant'
  const taken = new Set(state.combatants.map((c) => c.name.toLowerCase()))
  let name = base
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`
  const combatant: Combatant = { ...input, id, name, hp: Math.max(0, input.hp) }
  return { ...state, combatants: [...state.combatants, combatant] }
}

export function withCombatantUpdated(
  state: CombatState,
  id: string,
  patch: Partial<Omit<Combatant, 'id'>>,
): CombatState {
  return {
    ...state,
    combatants: state.combatants.map((c) => {
      if (c.id !== id) return c
      const next = { ...c, ...patch }
      next.hp = Math.max(0, next.hp)
      return next
    }),
  }
}

export function withCombatantRemoved(
  state: CombatState,
  id: string,
): CombatState {
  const combatants = state.combatants.filter((c) => c.id !== id)
  if (combatants.length === 0)
    return { ...state, combatants, activeId: null, round: 1 }
  let activeId = state.activeId
  if (activeId === id) {
    // Hand the turn to whoever is next in the order (no round increment).
    const order = turnOrder(state)
    const idx = order.findIndex((c) => c.id === id)
    activeId = order[(idx + 1) % order.length].id
  }
  return { ...state, combatants, activeId }
}

export function withNextTurn(state: CombatState): CombatState {
  const order = turnOrder(state)
  if (order.length === 0) return state
  if (state.activeId === null) return { ...state, activeId: order[0].id }
  const idx = order.findIndex((c) => c.id === state.activeId)
  const nextIdx = idx < 0 ? 0 : idx + 1
  if (nextIdx >= order.length) {
    return { ...state, activeId: order[0].id, round: state.round + 1 }
  }
  return { ...state, activeId: order[nextIdx].id }
}

/** Validate a loaded session file; anything malformed falls back to empty. */
export function parseCombatState(raw: unknown): CombatState {
  if (typeof raw !== 'object' || raw === null) return emptyCombat()
  const s = raw as Partial<SessionFile>
  if (s.version !== 1 || !Array.isArray(s.combatants)) return emptyCombat()
  const combatants: Array<Combatant> = []
  for (const entry of s.combatants as Array<unknown>) {
    if (typeof entry !== 'object' || entry === null) return emptyCombat()
    const c = entry as Partial<Combatant>
    if (typeof c.id !== 'string' || typeof c.name !== 'string')
      return emptyCombat()
    if (typeof c.initiative !== 'number' || typeof c.hp !== 'number')
      return emptyCombat()
    combatants.push({
      id: c.id,
      name: c.name,
      initiative: c.initiative,
      hp: Math.max(0, c.hp),
      maxHp: typeof c.maxHp === 'number' ? c.maxHp : null,
      ac: typeof c.ac === 'number' ? c.ac : null,
      note: typeof c.note === 'string' ? c.note : '',
      articleId: typeof c.articleId === 'string' ? c.articleId : undefined,
      // Absent on every session file written before global monsters could be
      // added; readers treat that as "the open world". Parsed explicitly
      // because this function picks fields rather than spreading — an
      // unparsed one survives a save and vanishes on the next load.
      worldId: typeof c.worldId === 'string' ? c.worldId : undefined,
    })
  }
  return {
    version: 1,
    combatants,
    activeId:
      typeof s.activeId === 'string' &&
      combatants.some((c) => c.id === s.activeId)
        ? s.activeId
        : null,
    round:
      typeof s.round === 'number' && s.round >= 1 ? Math.floor(s.round) : 1,
  }
}

// --- Store + persistence glue (renderer-only from here down) ---------------

/**
 * The disk is not ours any more.
 *
 * This store used to own an 800ms debounce and write `.dm/session.json` itself.
 * That was safe while the DM window was the only thing editing combat — but the
 * battlemap's damage keys write combatants from a window of their own, and a
 * module store is one copy per renderer PROCESS. Two processes each flushing a
 * whole file lose the fight in progress, which is a worse thing to lose than a
 * token position. So the authority is in the main process now (see
 * electron/main/stateAuthority.ts), and this relays.
 *
 * Whole-state rather than per-combatant patches, unlike maps: `activeId` and
 * `round` live beside the array, so "next turn" is not expressible as a change
 * to one row. Main still serialises it, still bumps a rev, and still fans it
 * out, so the cross-window guarantee is the same one.
 */

let state: CombatState = emptyCombat()
let currentWorldId: string | null = null
/** Main's revision, as last seen here. */
let rev = 0
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function setState(next: CombatState) {
  state = next
  notify()
  if (currentWorldId) {
    void api.session
      .set(currentWorldId, next)
      .then((r) => {
        rev = Math.max(rev, r.rev)
      })
      .catch(() => {
        // Best effort, as the old save was: combat keeps working in memory.
      })
  }
  // LAN guests are NOT sent this. It is the DM's whole fight — hidden
  // monsters, HP, notes — and it used to be mirrored raw. Guests now get turn
  // order only beside a shared battlemap, redacted by `forPlayersSession`
  // (see `pushLive` in lib/useMaps.ts).
}

/**
 * A change from another window — the map window damaging a combatant, usually.
 *
 * Never re-sent and never saved; there is no save here to call. The rev check
 * is what tells an echo from a real update, and a gap means a message was
 * missed and the state has to be re-read rather than trusted.
 */
function applyRemote(change: StateChange) {
  if (change.worldId !== currentWorldId) return
  if (change.error) return
  if (change.rev <= rev) return
  if (change.rev > rev + 1) {
    void hydrateSession(currentWorldId, { force: true })
    return
  }
  rev = change.rev
  if (change.replace === undefined) return
  state = parseCombatState(change.replace)
  notify()
}

/** Write any pending changes now (world switch, window close). Best effort. */
export async function flushSave(): Promise<void> {
  if (!currentWorldId) return
  try {
    await api.session.flush(currentWorldId)
  } catch {
    // Persistence is best-effort; main still holds the state and its own timer.
  }
}

/** Load the world's saved session. Safe to call repeatedly (same world = no-op). */
export async function hydrateSession(
  worldId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  if (currentWorldId === worldId && !options.force) return
  if (currentWorldId !== worldId) {
    await flushSave() // for the previous world
    currentWorldId = worldId
    state = emptyCombat()
    rev = 0
    notify()
  }
  try {
    const snapshot = await api.session.get(worldId)
    // A world switch may have raced ahead of this load.
    if (currentWorldId !== worldId || !snapshot) return
    state = parseCombatState(snapshot.file)
    rev = snapshot.rev
    notify()
  } catch {
    // Missing/corrupt file: keep the empty state.
  }
}

/**
 * The current state and a raw subscription, for callers outside React — the
 * battlemap's live push, which re-sends the players' initiative whenever combat
 * changes. Inside a component use `useCombat`.
 */
export function combatSnapshot(): CombatState {
  return state
}

export function subscribeCombat(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCombat(): CombatState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

function addReturningId(input: Omit<Combatant, 'id'>): string {
  const id = crypto.randomUUID()
  setState(withCombatantAdded(state, input, id))
  return id
}

export const combatActions = {
  add(input: Omit<Combatant, 'id'>) {
    addReturningId(input)
  },
  /**
   * Add, and hand back the id that was minted.
   *
   * The battlemap needs it: a token links to its combatant by
   * `Token.combatantId`, so "add this token to initiative" has to know what it
   * just created. `add` cannot say, because the id is minted in here and the
   * name may be rewritten on the way past (duplicates get suffixed), so a
   * caller cannot find the new row by searching for what it passed either.
   */
  addReturningId(input: Omit<Combatant, 'id'>): string {
    return addReturningId(input)
  },
  update(id: string, patch: Partial<Omit<Combatant, 'id'>>) {
    setState(withCombatantUpdated(state, id, patch))
  },
  remove(id: string) {
    setState(withCombatantRemoved(state, id))
  },
  nextTurn() {
    setState(withNextTurn(state))
  },
  reset() {
    setState(emptyCombat())
  },
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => void flushSave())
  // Changes from other windows (the battlemap damaging a combatant). Guarded
  // on the bridge like the LAN mirror above: this module is imported by tests
  // and by the guest build, neither of which has a preload.
  if (bridged()) api.session.onChanged(applyRemote)
}
