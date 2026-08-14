/**
 * A tiny event channel for palette commands that need to drive UI owned by
 * another component — the sidebar's creation dialogs and the formatting
 * reference. The palette can't call into WorldSidebar's local state, and
 * lifting that state to a context would touch far more code than a one-way
 * "please open this" signal needs. Same module-level-store shape as rollLog.
 */

export type PaletteAction =
  { kind: 'new-article' } | { kind: 'new-folder' } | { kind: 'new-character' }

type Listener = (action: PaletteAction) => void

const listeners = new Set<Listener>()

export function emitPaletteAction(action: PaletteAction): void {
  for (const listener of listeners) listener(action)
}

export function onPaletteAction(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
