import { FolderOpen, Globe } from 'lucide-react'
import { saveLibraryScope } from '#/lib/libraryScope'
import type { LibraryScope } from '#/lib/libraryScope'
import { Button } from '#/components/ui/button'

/**
 * Toggles a Spells or Bestiary list between the merged view and the open
 * world's own articles.
 *
 * One component rather than the same button in three headers, because the
 * Bestiary panel and the encounter builder show the same list and a copy that
 * drifted would have them disagreeing about what "World only" means.
 *
 * The label names the **current** state rather than the action, matching the
 * sheet's "Prepared only" toggle — a button reading "All" while showing a
 * filtered list is the ambiguity that pattern exists to avoid.
 */
export function LibraryScopeButton({
  scope,
  kind,
  onChange,
}: {
  scope: LibraryScope
  /** Which list this is, so the choice is remembered per surface. */
  kind: 'spells' | 'monsters'
  onChange: (scope: LibraryScope) => void
}) {
  const worldOnly = scope === 'world'
  const noun = kind === 'spells' ? 'spells' : 'monsters'
  return (
    <Button
      variant={worldOnly ? 'default' : 'outline'}
      size="sm"
      className="h-7 shrink-0 gap-1 px-2 text-xs"
      aria-pressed={worldOnly}
      title={
        worldOnly
          ? `Showing only this world's ${noun} — click to show the global library too`
          : `Show only this world's own ${noun}`
      }
      onClick={() => {
        const next: LibraryScope = worldOnly ? 'all' : 'world'
        saveLibraryScope(kind, next)
        onChange(next)
      }}
    >
      {worldOnly ? (
        <FolderOpen className="size-3.5" />
      ) : (
        <Globe className="size-3.5" />
      )}
      {worldOnly ? 'World only' : 'All'}
    </Button>
  )
}
