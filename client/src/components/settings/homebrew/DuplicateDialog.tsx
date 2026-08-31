import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { nameKey } from '#/lib/tables'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

/**
 * Name the copy before forking a built-in.
 *
 * The name is the whole decision, because names are how the merge layer works:
 * keeping it makes the copy *override* the built-in, changing it makes a new
 * entry that sits alongside. Both are legitimate, and neither is guessable from
 * the click, so it asks.
 */
export function DuplicateDialog({
  open,
  sourceName,
  kindLabel,
  existingNames,
  onCancel,
  onConfirm,
}: {
  open: boolean
  /** The built-in being copied; also the pre-filled name. */
  sourceName: string
  /** "race" / "background" / "class", for the prose. */
  kindLabel: string
  /** Names already in homebrew, to warn about replacing one. */
  existingNames: Array<string>
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const [name, setName] = useState(sourceName)

  useEffect(() => {
    if (open) setName(sourceName)
  }, [open, sourceName])

  const trimmed = name.trim()
  const overridesBuiltIn = nameKey(trimmed) === nameKey(sourceName)
  const replacesExisting = existingNames.some(
    (e) => nameKey(e) === nameKey(trimmed),
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="w-[min(28rem,94vw)]">
        <DialogHeader>
          <DialogTitle>Duplicate {sourceName}</DialogTitle>
          <DialogDescription>
            Copies this built-in {kindLabel} into your homebrew, where you can
            edit it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <span className="text-xs font-medium">Name</span>
          <Input
            value={name}
            autoFocus
            className="h-8"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && trimmed !== '') onConfirm(trimmed)
            }}
          />
          <p className="text-muted-foreground text-xs">
            {trimmed === '' ? (
              'Give it a name.'
            ) : replacesExisting ? (
              <span className="text-amber-600 dark:text-amber-500">
                Replaces your existing {kindLabel} &ldquo;{trimmed}&rdquo;.
              </span>
            ) : overridesBuiltIn ? (
              <>
                Keeping the name means your copy <strong>overrides</strong> the
                built-in everywhere.
              </>
            ) : (
              <>Offered alongside the built-in {sourceName}.</>
            )}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={trimmed === ''}
            onClick={() => onConfirm(trimmed)}
          >
            <Copy /> Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
