import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { BookOpen, RotateCcw } from 'lucide-react'
import { api } from '#/lib/api'
import type { ImportSummary, LibraryFolder } from '#/lib/api'
import { useLibrary } from '#/lib/useGlobalLibrary'
import { Button } from '#/components/ui/button'
import { ImportSummaryDialog } from '#/components/ImportSummaryDialog'

const RESTORABLE: Array<{
  target: LibraryFolder
  label: string
  description: string
}> = [
  {
    target: 'Spells',
    label: 'Restore spell list',
    description:
      'Puts back any spell that ships with the app but is missing from your library, across both the 2014 and 2024 rules.',
  },
  {
    target: 'Monsters',
    label: 'Restore bestiary',
    description:
      'Puts back any monster that ships with the app but is missing from your library, across both the 2014 and 2024 rules.',
  },
]

/**
 * One restore action. Kept as its own component so each button owns its own
 * pending state and result dialog — sharing them would grey out both buttons
 * while one ran, and leave the dialog unsure which folder it was reporting on.
 */
function RestoreButton({
  target,
  label,
  description,
  disabled,
}: {
  target: LibraryFolder
  label: string
  description: string
  disabled: boolean
}) {
  const queryClient = useQueryClient()
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  const run = useMutation({
    mutationFn: () => api.library.restore(target),
    onSuccess: (result) => {
      // The library's content queries are keyed under this prefix, so one
      // invalidation refreshes the panels without waiting out their staleTime.
      void queryClient.invalidateQueries({ queryKey: ['library'] })
      // Null means the build shipped no bundled content — nothing to report,
      // and a dialog claiming "0 restored" would misread as a failure.
      if (result) setSummary(result)
    },
    onError: (error: Error) => alert(error.message),
  })

  return (
    <div className="grid gap-2 rounded-md border px-3 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3">
      <div className="grid min-w-0 gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="justify-self-start sm:justify-self-end"
        disabled={disabled || run.isPending}
        onClick={() => run.mutate()}
      >
        <RotateCcw className="size-3.5" />
        {run.isPending ? 'Restoring…' : 'Restore'}
      </Button>
      <ImportSummaryDialog
        summary={summary}
        target={target}
        verb="restore"
        onClose={() => setSummary(null)}
      />
    </div>
  )
}

/**
 * The global library: where it lives, and how to put back content that shipped
 * with the app.
 *
 * The odd one out on this page — every other section writes worldSettings.json
 * in the open world, while this one is app-wide and the same in every world.
 * It sits here anyway because there is nowhere else a user would think to look.
 *
 * Restoring exists because the automatic seed is version-gated: it runs once per
 * content version, so a file deleted afterwards stays gone until the next
 * release bumps that version. These buttons are the way back without waiting.
 *
 * "Open library" is how you *write* reference material rather than import it.
 * The library is a world folder, so it opens in the ordinary editor and a spell
 * is just an article from the Spell template. That matters most in Player mode,
 * which hides the content tree — this is then the only route to authoring one.
 */
export function LibrarySection() {
  const library = useLibrary()
  const info = library.data ?? null

  return (
    <div className="grid max-w-2xl gap-4">
      <div className="grid gap-1.5">
        <h2 className="text-sm font-medium">Global library</h2>
        <p className="text-muted-foreground text-xs">
          Shared reference material — a bestiary and a spell list — available in
          every world, not just this one.
        </p>
      </div>

      <div className="grid gap-1 rounded-md border px-3 py-2.5">
        <span className="text-muted-foreground text-xs">Library folder</span>
        {library.isPending ? (
          <span className="text-muted-foreground text-sm">Loading…</span>
        ) : info ? (
          <>
            <code className="text-sm break-all">{info.path}</code>
            {info.available && (
              <div className="pt-1.5">
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to="/worlds/$worldId"
                    params={{ worldId: info.worldId }}
                  >
                    <BookOpen className="size-3.5" />
                    Open library
                  </Link>
                </Button>
              </div>
            )}
            {!info.available && (
              <span className="text-destructive text-xs">
                This folder isn’t there right now. If it’s on a drive that’s
                disconnected, reconnect it — the path is remembered either way.
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground text-sm">
            No library yet. One is created automatically the first time you
            import or restore content.
          </span>
        )}
      </div>

      <div className="grid gap-1.5">
        <h3 className="text-sm font-medium">Restore bundled content</h3>
        <p className="text-muted-foreground text-xs">
          Copies back anything missing. Entries you already have are left
          exactly as they are, so your own edits are safe and nothing is
          duplicated.
        </p>
      </div>

      <div className="grid gap-1.5">
        {RESTORABLE.map((entry) => (
          <RestoreButton
            key={entry.target}
            {...entry}
            disabled={info !== null && !info.available}
          />
        ))}
      </div>
    </div>
  )
}
