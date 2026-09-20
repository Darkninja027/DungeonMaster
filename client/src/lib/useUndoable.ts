import { useToast } from '#/components/ToastProvider'

/**
 * "Renamed Strahd → Stradh. **Undo**" — a toast whose action puts a structural
 * change back.
 *
 * This exists for one operation in particular. Renaming an article rewrites
 * `[[links]]` across the entire world, and moving one can too; the OS Recycle
 * Bin, which is the app's only other safety net, cannot reverse either. So a
 * mistaken rename is destructive in a way nothing else here can undo, and the
 * cheapest honest fix is to offer the inverse call while the user is still
 * looking at the result.
 *
 * Deliberately **single-level**. There is no undo stack: the offer lives as long
 * as its toast and then it is gone. A stack would need every intervening edit to
 * be reconciled against it, which is a much larger design than the problem
 * justifies — and a half-built one that silently applies a stale inverse is
 * worse than no undo at all.
 *
 * Only reversible operations belong here. Delete deliberately does **not**:
 * `shell.trashItem` has no programmatic restore, and recreating the file from a
 * captured copy would quietly redefine what "in your Recycle Bin" means and can
 * resurrect a file the user has since emptied. Delete keeps its confirm dialog
 * as its safety net instead.
 */
export function useUndoable() {
  const toast = useToast()

  return function offerUndo(options: {
    /** Past tense, naming what happened: `Renamed "Strahd" to "Stradh".` */
    message: string
    /** The inverse. Throwing surfaces as an error toast rather than silence. */
    undo: () => Promise<unknown>
    /** What to say when the inverse itself fails. */
    undoFailed?: string
  }) {
    toast.show({
      kind: 'success',
      message: options.message,
      action: {
        label: 'Undo',
        onClick: () => {
          void options.undo().catch((error: Error) => {
            // The undo is the last safety net, so its own failure has to be
            // loud: silently swallowing it would leave the user believing the
            // change was put back.
            toast.show({
              kind: 'error',
              message: options.undoFailed ?? 'Could not undo that.',
              detail: error.message,
            })
          })
        },
      },
    })
  }
}
