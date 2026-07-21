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

export function useSpellPanelRequest(): SpellPanelRequest | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => requested,
  )
}
