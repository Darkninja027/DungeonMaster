import { useEffect, useSyncExternalStore } from 'react'
import type { Ruleset } from './ruleset'

/**
 * The rules edition of the character sheet currently on screen, for the panels
 * that sit beside it.
 *
 * The Spells and Monsters panels are world-scoped — they are mounted by
 * SessionPanel, which knows a worldId and nothing else — and that is right for
 * a campaign, where the world speaks for every character in it. It is wrong for
 * the vault, which holds characters from several different games at once and so
 * carries no `ruleset` of its own: the panel would offer both editions beside a
 * sheet that is definitely one of them.
 *
 * A module store rather than a prop for the same reason sidebarState is one:
 * SessionPanel is mounted by the world layout and the character route is its
 * sibling behind an Outlet, so there is no path to pass this down. Same idiom
 * as spellPanel and rollLog.
 *
 * Null means "no character open, or it defers to its world" — the panels then
 * fall back to the world setting, which is exactly today's behaviour.
 */

let current: Ruleset | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/**
 * Publish this character's edition for as long as its sheet is mounted.
 *
 * Cleared on unmount, so navigating from a 2014 sheet back to the world does
 * not leave the panels filtered to an edition nothing on screen asked for.
 */
export function usePublishCharacterRuleset(ruleset: Ruleset | null): void {
  useEffect(() => {
    current = ruleset
    notify()
    return () => {
      current = null
      notify()
    }
  }, [ruleset])
}

export function useOpenCharacterRuleset(): Ruleset | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}
