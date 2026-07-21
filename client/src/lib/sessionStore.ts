import { useSyncExternalStore } from 'react'
import { api } from './api'
import type { Combatant, SessionFile } from './api'

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

const SAVE_DEBOUNCE_MS = 800

let state: CombatState = emptyCombat()
let currentWorldId: string | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function setState(next: CombatState) {
  state = next
  notify()
  scheduleSave()
}

function scheduleSave() {
  if (!currentWorldId) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushSave()
  }, SAVE_DEBOUNCE_MS)
}

/** Write any pending changes now (world switch, window close). Best effort. */
export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!currentWorldId) return
  try {
    await api.session.set(currentWorldId, state)
  } catch {
    // Persistence is best-effort; combat keeps working in memory.
  }
}

/** Load the world's saved session. Safe to call repeatedly (same world = no-op). */
export async function hydrateSession(worldId: string): Promise<void> {
  if (currentWorldId === worldId) return
  await flushSave() // for the previous world
  currentWorldId = worldId
  state = emptyCombat()
  notify()
  try {
    const raw = await api.session.get(worldId)
    // A world switch may have raced ahead of this load.
    if (currentWorldId !== worldId || raw === null) return
    state = parseCombatState(raw)
    notify()
  } catch {
    // Missing/corrupt file: keep the empty state.
  }
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

export const combatActions = {
  add(input: Omit<Combatant, 'id'>) {
    setState(withCombatantAdded(state, input, crypto.randomUUID()))
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
}
