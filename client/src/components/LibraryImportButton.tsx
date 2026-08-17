import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api } from '#/lib/api'
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
 * The result of an import. A dialog rather than the app's usual alert() because
 * a skip list is a table, not a sentence — alert() would render several hundred
 * rows as one unscrollable wall of text.
 */
function ImportSummaryDialog({
  summary,
  target,
  onClose,
}: {
  summary: ImportSummary | null
  target: LibraryFolder
  onClose: () => void
}) {
  const noun = target === 'Monsters' ? 'monsters' : 'spells'
  const listed = summary?.skipped.slice(0, MAX_LISTED_SKIPS) ?? []
  const hidden = (summary?.skipped.length ?? 0) - listed.length

  return (
    <Dialog open={summary !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {summary?.copied === 0
              ? `No ${noun} imported`
              : `Imported ${summary?.copied} ${summary?.copied === 1 ? noun.slice(0, -1) : noun}`}
          </DialogTitle>
          <DialogDescription>
            {summary?.truncated
              ? 'The folder was very large, so the import stopped early. Run it again to continue.'
              : `Copied into your global library, available in every world.`}
          </DialogDescription>
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

/**
 * Import a folder of markdown into the global library, creating the library at
 * its default location if this is the first time. The folder dialog is native
 * and owned by the main process, so the renderer never sees a disk path.
 */
export function LibraryImportButton({ target }: { target: LibraryFolder }) {
  const queryClient = useQueryClient()
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  const run = useMutation({
    // One dialog, not two: the main process creates the default library
    // (%APPDATA%/dungeonmaster/Library) if there isn't one, so the only thing
    // worth asking is which folder to import.
    mutationFn: () => api.library.import(target),
    onSuccess: (result) => {
      // The library may have just been created, so refresh it either way.
      void queryClient.invalidateQueries({ queryKey: ['library'] })
      if (!result) return // cancelled at the picker
      void queryClient.invalidateQueries({ queryKey: ['worlds'] })
      setSummary(result)
    },
    onError: (error: Error) => alert(error.message),
  })

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        disabled={run.isPending}
        title={`Import ${target.toLowerCase()} into your global library`}
        onClick={() => run.mutate()}
      >
        <Download className="size-3.5" />
      </Button>
      <ImportSummaryDialog
        summary={summary}
        target={target}
        onClose={() => setSummary(null)}
      />
    </>
  )
}
