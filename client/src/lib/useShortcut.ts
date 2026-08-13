import { useEffect, useRef } from 'react'

export interface ShortcutOptions {
  enabled?: boolean
  /** Require Ctrl/Cmd. Default true — every existing shortcut is Ctrl-based. */
  ctrl?: boolean
  /** Require Shift. Default false, and a bare `false` REJECTS a held Shift. */
  shift?: boolean
  /** Require Alt. Default false, and a bare `false` REJECTS a held Alt. */
  alt?: boolean
  /**
   * Skip the shortcut when focus is in a text field. Off by default so the
   * editor's own Ctrl+S / Ctrl+P keep working while typing.
   */
  ignoreInInputs?: boolean
}

/**
 * Nesting depth of open modal surfaces. While non-zero every shortcut is
 * suppressed, so a palette or dialog can own the keyboard without each other
 * shortcut having to know it exists. A counter rather than a boolean so
 * stacked modals can't have the inner one's close re-arm the outer one.
 */
let suspendDepth = 0

/** Suppress all shortcuts (a modal opened). Pair with resumeShortcuts. */
export function suspendShortcuts(): void {
  suspendDepth += 1
}

/** Re-arm shortcuts (a modal closed). */
export function resumeShortcuts(): void {
  suspendDepth = Math.max(0, suspendDepth - 1)
}

export function shortcutsSuspended(): boolean {
  return suspendDepth > 0
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Register a keyboard shortcut for the lifetime of the component. Defaults to
 * Ctrl/Cmd+<key>, which is what every caller in the app wants.
 *
 * Always calls preventDefault on match (stops e.g. the Chromium print dialog
 * on Ctrl+P and the save-page dialog on Ctrl+S).
 *
 * Modifiers are matched EXACTLY: `shift` and `alt` default to false, so a
 * shortcut registered without them will not fire when they are held. That
 * keeps Ctrl+K and Ctrl+Shift+K distinct.
 */
export function useShortcut(
  key: string,
  handler: () => void,
  opts?: ShortcutOptions,
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const enabled = opts?.enabled ?? true
  const ctrl = opts?.ctrl ?? true
  const shift = opts?.shift ?? false
  const alt = opts?.alt ?? false
  const ignoreInInputs = opts?.ignoreInInputs ?? false

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (suspendDepth > 0) return
      if ((e.ctrlKey || e.metaKey) !== ctrl) return
      if (e.shiftKey !== shift) return
      if (e.altKey !== alt) return
      if (e.key.toLowerCase() !== key) return
      if (ignoreInInputs && isTextEntry(e.target)) return
      e.preventDefault()
      handlerRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, enabled, ctrl, shift, alt, ignoreInInputs])
}

/**
 * Suspend every other shortcut while `active` is true. The palette holds this
 * for as long as it is open; the counter unwinds on unmount even if the
 * component is torn down while still open.
 */
export function useSuspendShortcuts(active: boolean): void {
  useEffect(() => {
    if (!active) return
    suspendShortcuts()
    return resumeShortcuts
  }, [active])
}
