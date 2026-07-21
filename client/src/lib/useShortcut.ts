import { useEffect, useRef } from 'react'

/**
 * Register a Ctrl/Cmd+<key> shortcut for the lifetime of the component.
 * Always calls preventDefault on match (stops e.g. the Chromium print
 * dialog on Ctrl+P and the save-page dialog on Ctrl+S).
 */
export function useShortcut(
  key: string,
  handler: () => void,
  opts?: { enabled?: boolean },
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const enabled = opts?.enabled ?? true

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === key
      ) {
        e.preventDefault()
        handlerRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, enabled])
}
