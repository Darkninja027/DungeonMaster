import { useEffect, useSyncExternalStore } from 'react'

/**
 * Left sidebar visibility, shared between the world layout that renders it and
 * the app header that toggles it. A module store rather than component state
 * because those two live in different routes — __root.tsx has no way to reach
 * the world route's useState. Same idiom as spellPanel and rollLog.
 */

const STORAGE_KEY = 'dm.sidebar'

/**
 * Remembered visibility, defaulting to OPEN. Note the `!== false` rather than
 * SessionPanel's `=== true`: that panel is closed until asked for, this one has
 * always been on screen, and an upgrade must not make it vanish.
 */
function loadOpen(): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as {
      open?: boolean
    }
    return raw.open !== false
  } catch {
    return true
  }
}

let open = loadOpen()

/**
 * How many sidebars are mounted. A counter rather than a boolean for the same
 * reason as useShortcut's suspendDepth: React can mount the next route before
 * unmounting the last, and a boolean would leave this stuck off.
 */
let mounted = 0

/**
 * How many title rows are currently offering their own toggle. The app
 * header's copy stands down while one is on screen, so the control sits beside
 * the file name rather than appearing twice.
 */
let titleSlots = 0

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function setSidebarOpen(next: boolean): void {
  if (open === next) return
  open = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ open }))
  notify()
}

export function toggleSidebar(): void {
  setSidebarOpen(!open)
}

export function useSidebarOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open)
}

/** Whether a sidebar exists to toggle — false on the home screen. */
export function useSidebarPresent(): boolean {
  return useSyncExternalStore(subscribe, () => mounted > 0)
}

/**
 * Whether the app header should render the toggle: only when no title row is
 * offering one, so there is always exactly one and never zero.
 */
export function useHeaderTogglePreferred(): boolean {
  return useSyncExternalStore(subscribe, () => titleSlots === 0)
}

/**
 * Claim the toggle for this title row for as long as it is mounted. Pass false
 * for the app header's own fallback: claiming there would hide the very button
 * doing the claiming.
 */
export function useClaimSidebarToggle(active = true): void {
  useEffect(() => {
    if (!active) return
    titleSlots += 1
    notify()
    return () => {
      titleSlots = Math.max(0, titleSlots - 1)
      notify()
    }
  }, [active])
}

/** Declare that this component renders the sidebar, for as long as it lives. */
export function useRegisterSidebar(): void {
  useEffect(() => {
    mounted += 1
    notify()
    return () => {
      mounted = Math.max(0, mounted - 1)
      notify()
    }
  }, [])
}
