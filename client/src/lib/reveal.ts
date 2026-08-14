import { api } from '#/lib/api'

/**
 * Build a "show this file in the OS file manager" callback for a world.
 *
 * `relPath` is world-relative: `<articleId>.md` for an article — including the
 * characters, spells and monsters that are just articles — a folder id for a
 * folder, and nothing at all for the world folder itself.
 *
 * Failures surface through alert(), matching every other mutation in the app;
 * the message comes from the main process, which is the only side that knows
 * whether the file is still there.
 */
export function revealer(worldId: string) {
  return (relPath?: string) => {
    api.shell.reveal(worldId, relPath).catch((error: Error) => {
      alert(error.message)
    })
  }
}

/** Label and title text, so every reveal affordance reads the same. */
export const REVEAL_LABEL = 'Reveal in File Explorer'
