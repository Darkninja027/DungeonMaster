/**
 * Click-to-enlarge for the player window.
 *
 * A map or a handout is the single most common thing a DM puts in front of a
 * table, and the images live deep inside memoised BookView subtrees — passing
 * a callback down would mean threading a prop through createComponents for the
 * one surface that wants it. Same module-level-store shape as paletteActions
 * and rollLog, and for the same reason.
 *
 * The src carried here is already rewritten to world:// (see the img override
 * in Markdown.tsx), so the lightbox needs no knowledge of worlds or paths.
 */

export interface FocusedImage {
  src: string
  alt?: string
}

type Listener = (image: FocusedImage) => void

const listeners = new Set<Listener>()

export function focusImage(image: FocusedImage): void {
  for (const listener of listeners) listener(image)
}

export function onFocusImage(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
