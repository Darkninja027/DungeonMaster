import { useState } from 'react'
import { ChevronRight, Plus, X } from 'lucide-react'

import type { SubclassInfo } from '#/lib/srd'
import { isBareSubclass } from '#/lib/tables'
import { homebrewId } from '#/lib/homebrew'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { FeatureRows } from './FeatureRows'

/**
 * The subclasses a class offers, each expandable to edit its summary and
 * features.
 *
 * This replaces a `TokenField` of bare names. The data layer has always been
 * able to carry a subclass's features, summary, bonus spells and grant —
 * `parseSubclasses` reads all four and `serializeSubclass` writes them — so a
 * homebrew subclass could be *represented* on disk but not *authored* anywhere.
 * The kit editor listed the names and apologised for the rest.
 *
 * Two things it still does not edit: bonus spells and a subclass `grant`. Both
 * are kept across an edit rather than dropped, and the row says so. Domain
 * spells in particular want a table-shaped editor of their own.
 *
 * Renaming is safe here in a way it was not before. The old field rebuilt the
 * list from names via `reconcileSubclasses`, which matches on name — so a
 * rename read as "delete one, add another" and silently discarded whatever the
 * old one carried. Editing a name in place keeps the object it belongs to.
 */
export function SubclassEditor({
  subclasses,
  onChange,
  /** What this class calls them — "Primal Path", "Bard College". */
  label,
  /** The level this class chooses a subclass at, for the feature-level floor. */
  subclassLevel,
}: {
  subclasses: Array<SubclassInfo>
  onChange: (next: Array<SubclassInfo>) => void
  label: string
  subclassLevel: number
}) {
  const [open, setOpen] = useState<number | null>(null)

  const patchAt = (i: number, patch: Partial<SubclassInfo>) =>
    onChange(subclasses.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  const add = () => {
    // Deliberately *not* through `reconcileSubclasses`: it rebuilds the list
    // from names and drops empty ones, so a blank new row would be discarded
    // and the button would do nothing at all. A row has to exist before it can
    // be named, and its id is derived from the name as that is typed.
    onChange([...subclasses, { id: '', name: '', features: [] }])
    setOpen(subclasses.length)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label || 'Subclasses'}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          aria-label={`Add ${label.replace(/e?s$/i, '') || 'subclass'}`}
          onClick={add}
        >
          <Plus className="size-3" /> Add
        </Button>
      </div>

      {subclasses.length === 0 && (
        <p className="text-muted-foreground text-xs">
          None yet. A class without them is fine — the sheet just won&rsquo;t
          suggest any.
        </p>
      )}

      {subclasses.map((sub, i) => {
        const expanded = open === i
        const extras = [
          sub.spells?.length ? 'bonus spells' : null,
          sub.grant ? 'a grant' : null,
        ].filter(Boolean)
        return (
          <div key={i} className="rounded-md border">
            <div className="flex items-center gap-1.5 p-1.5">
              <button
                type="button"
                aria-label={expanded ? 'Collapse' : 'Expand'}
                aria-expanded={expanded}
                className="text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => setOpen(expanded ? null : i)}
              >
                <ChevronRight
                  className={cn(
                    'size-4 transition-transform',
                    expanded && 'rotate-90',
                  )}
                />
              </button>
              <Input
                value={sub.name}
                placeholder="Champion"
                className="h-7 min-w-0 flex-1 text-sm"
                // The id rides along with the name, matching `parseSubclasses`
                // and `subclassFromName`. It never reaches disk — the sheet
                // stores the display name — but React keys and lookups use it.
                onChange={(e) =>
                  patchAt(i, {
                    name: e.target.value,
                    id: homebrewId(e.target.value),
                  })
                }
              />
              {!expanded && !isBareSubclass(sub) && (
                <span className="text-muted-foreground shrink-0 text-xs">
                  {sub.features.length > 0
                    ? `${sub.features.length} feature${sub.features.length > 1 ? 's' : ''}`
                    : 'has content'}
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${sub.name || 'subclass'}`}
                onClick={() => {
                  onChange(subclasses.filter((_, j) => j !== i))
                  setOpen(null)
                }}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {expanded && (
              <div className="space-y-3 border-t p-2">
                <label className="block space-y-1">
                  <span className="text-muted-foreground text-xs">Summary</span>
                  <Input
                    value={sub.summary ?? ''}
                    placeholder="One line, shown on the option card."
                    className="h-7 text-sm"
                    onChange={(e) => {
                      const value = e.target.value
                      // Cleared back to undefined rather than an empty string,
                      // so `isBareSubclass` still recognises an emptied entry
                      // and it serializes as a bare name again.
                      patchAt(i, {
                        summary: value.trim() === '' ? undefined : value,
                      })
                    }}
                  />
                </label>

                <FeatureRows
                  features={sub.features}
                  minLevel={subclassLevel}
                  placeholder="Improved Critical"
                  onChange={(features) => patchAt(i, { features })}
                />

                {extras.length > 0 && (
                  <p className="text-muted-foreground border-t pt-2 text-xs">
                    This also carries {extras.join(' and ')}, which can&rsquo;t
                    be edited here yet. They&rsquo;re kept as you edit.
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
