/**
 * Shared wording for the consequence half of a destructive confirm.
 *
 * Every delete in this app goes to the OS Recycle Bin via `shell.trashItem`,
 * but the three dialogs that said so disagreed about it: one promised "This
 * cannot be undone", one said "It goes to the Recycle Bin", and one named no
 * consequence at all. Two of those are wrong about the same operation. A
 * constant rather than three strings, so the next delete inherits the true one.
 */
export const RECYCLE_BIN_NOTE = 'It goes to your Recycle Bin.'

/** The same promise for something holding more than one file. */
export const RECYCLE_BIN_NOTE_MANY =
  'Everything inside it goes to your Recycle Bin.'
