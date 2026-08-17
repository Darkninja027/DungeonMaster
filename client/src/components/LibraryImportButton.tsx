import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api } from '#/lib/api'
import type { ImportSummary, LibraryFolder } from '#/lib/api'
import { Button } from '#/components/ui/button'
import { ImportSummaryDialog } from '#/components/ImportSummaryDialog'

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
      // One prefix covers both: ['library'] is the useLibrary() key *and* the
      // prefix of the panels' content queries, which deliberately sit outside
      // the ['worlds', …] namespace so they can't collide with the open world.
      void queryClient.invalidateQueries({ queryKey: ['library'] })
      if (!result) return // cancelled at the picker
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
