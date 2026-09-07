import { useSyncExternalStore } from 'react'

/**
 * Cross-component request: "open the session panel's Spells tab with this
 * spell expanded". Fired by spell names on character sheets; consumed by the
 * panel. Module store, same idiom as rollLog.
 */

export interface SpellPanelRequest {
  articleId: string
}

let requested: SpellPanelRequest | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function openSpellInPanel(articleId: string): void {
  requested = { articleId }
  notify()
}

export function consumeSpellPanelRequest(): void {
  requested = null
  notify()
}

/**
 * The pending request, for callers outside React and for tests. Inside a
 * component use `useSpellPanelRequest` so the read is subscribed.
 */
export function spellPanelRequest(): SpellPanelRequest | null {
  return requested
}

/** Subscribe to changes; returns an unsubscribe fn. What the hook uses. */
export function subscribeSpellPanel(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useSpellPanelRequest(): SpellPanelRequest | null {
  return useSyncExternalStore(subscribeSpellPanel, () => requested)
}
