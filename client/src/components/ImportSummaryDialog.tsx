import type { ImportSummary, LibraryFolder } from '#/lib/api'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'

/** Skips beyond this are summarised as a count — a 400-row list helps nobody. */
const MAX_LISTED_SKIPS = 50

/**
 * The result of copying files into the library. A dialog rather than the app's
 * usual alert() because a skip list is a table, not a sentence — alert() would
 * render several hundred rows as one unscrollable wall of text.
 *
 * Shared by import and restore, which differ only in wording: import copied from
 * a folder the user picked, restore put back what shipped with the app. `verb`
 * carries that difference so the two can't drift into two near-identical dialogs.
 */
export function ImportSummaryDialog({
  summary,
  target,
  verb = 'import',
  onClose,
}: {
  summary: ImportSummary | null
  target: LibraryFolder
  /** How the copy happened, for the title and description. */
  verb?: 'import' | 'restore'
  onClose: () => void
}) {
  const noun = target === 'Monsters' ? 'monsters' : 'spells'
  const listed = summary?.skipped.slice(0, MAX_LISTED_SKIPS) ?? []
  const hidden = (summary?.skipped.length ?? 0) - listed.length
  const copied = summary?.copied ?? 0
  const one = copied === 1
  const restoring = verb === 'restore'

  // Nothing copied is the *expected* result of a restore on a complete library,
  // so it reads as reassurance rather than the "no files found" import implies.
  const title = restoring
    ? copied === 0
      ? `Your ${noun} are already complete`
      : `Restored ${copied} ${one ? noun.slice(0, -1) : noun}`
    : copied === 0
      ? `No ${noun} imported`
      : `Imported ${copied} ${one ? noun.slice(0, -1) : noun}`

  const description = summary?.truncated
    ? `The folder was very large, so the ${verb} stopped early. Run it again to continue.`
    : restoring
      ? copied === 0
        ? `Every ${noun.slice(0, -1)} that ships with the app is already in your library. Nothing was changed.`
        : `Put back into your global library. Files you already had were left untouched, so any edits are intact.`
      : 'Copied into your global library, available in every world.'

  return (
    <Dialog open={summary !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {listed.length > 0 && (
          <div className="min-w-0">
            <p className="mb-1.5 text-sm font-medium">
              {summary?.skipped.length} skipped
            </p>
            <ScrollArea className="max-h-56">
              <ul className="space-y-1 pr-3 text-xs">
                {listed.map((skip) => (
                  <li key={skip.file} className="min-w-0">
                    <span className="block truncate font-medium">
                      {skip.file}
                    </span>
                    <span className="text-muted-foreground block">
                      {skip.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
            {hidden > 0 && (
              <p className="text-muted-foreground mt-1.5 text-xs">
                +{hidden} more
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
