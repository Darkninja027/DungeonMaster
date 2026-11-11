import { api } from '#/lib/api'

/**
 * Build a "show this file in the OS file manager" callback for a world.
 *
 * `relPath` is world-relative: `<articleId>.md` for an article — including the
 * characters, spells and monsters that are just articles — a folder id for a
 * folder, and nothing at all for the world folder itself.
 *
 * `onError` reports a failure — the message comes from the main process, which
 * is the only side that knows whether the file is still there. It is a
 * parameter rather than a toast raised in here because this is a plain module:
 * a hook would make every caller a component, and two of them already are not.
 * A caller that omits it gets a console warning, which is the honest floor for
 * "the folder did not open" — never silence.
 */
export function revealer(worldId: string, onError?: (message: string) => void) {
  return (relPath?: string) => {
    api.shell.reveal(worldId, relPath).catch((error: Error) => {
      if (onError) onError(error.message)
      else console.warn('Reveal failed:', error.message)
    })
  }
}

/** Label and title text, so every reveal affordance reads the same. */
export const REVEAL_LABEL = 'Reveal in File Explorer'
