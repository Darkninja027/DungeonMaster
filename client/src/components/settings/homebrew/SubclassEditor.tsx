import { useState } from 'react'
import { ChevronRight, Plus, X } from 'lucide-react'

import type { SubclassInfo } from '#/lib/srd'
import { isBareSubclass } from '#/lib/tables'
import { homebrewId, isEmptyGrant } from '#/lib/homebrew'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { FeatureRows } from './FeatureRows'
import { GrantEditor } from './GrantEditor'
import { SpellcastingFields } from './SpellcastingFields'
import { SubclassSpellRows } from './SubclassSpellRows'

/**
 * The subclasses a class offers, each expandable to edit its summary and
 * features.
 *
 * This replaces a `TokenField` of bare names. The data layer could always
 * carry a subclass's features, summary, bonus spells, grant and spellcasting —
 * so a homebrew subclass was *representable* on disk but not *authorable*
 * anywhere. The kit editor listed the names and apologised for the rest.
 *
 * Every field `SubclassInfo` has is editable here now, which is what makes a
 * fully custom subclass possible. Each one empties back to `undefined` rather
 * than to `{}` or `[]`, so `isBareSubclass` still recognises a subclass that
 * has been cleared out and `serializeSubclass` writes it back as a plain name.
 *
 * The one thing left in JSON is the progression *tables* — twenty rows of
 * numbers each. `SpellcastingFields` says so where an author will see it.
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
              <div className="border-t p-2">
                <SubclassPanel
                  subclass={sub}
                  subclassLevel={subclassLevel}
                  onChange={(next) => patchAt(i, next)}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Everything a subclass carries, as one editable panel.
 *
 * Extracted so the two places a subclass can be authored offer exactly the same
 * fields: inline inside a class kit, and standalone in the Subclasses tab where
 * it attaches to a class by name. They were going to drift otherwise, and a
 * field present in one and missing in the other is the kind of gap nobody
 * notices until their work is silently not saved.
 *
 * The rule every handler here follows: **empty back to `undefined`**, never to
 * `{}` or `[]`. `isBareSubclass` decides whether `serializeSubclass` writes a
 * plain name or an object, so a stray empty array turns a cleared subclass into
 * noise in a file people hand-edit.
 */
export function SubclassPanel({
  subclass,
  subclassLevel,
  onChange,
}: {
  subclass: SubclassInfo
  /** The level this class chooses an archetype at — the feature-level floor. */
  subclassLevel: number
  onChange: (next: SubclassInfo) => void
}) {
  return (
    <div className="space-y-3">
      <SubclassSummaryField subclass={subclass} onChange={onChange} />

      <SubclassFeatureRows
        subclass={subclass}
        subclassLevel={subclassLevel}
        onChange={onChange}
      />

      <SubclassExtras
        subclass={subclass}
        subclassLevel={subclassLevel}
        onChange={onChange}
      />
    </div>
  )
}

/**
 * The pieces of a subclass, as parts both callers compose.
 *
 * Split out for the creation wizard, which puts features on their own step and
 * everything else on the next one. They are *parts of the same panel* rather
 * than a copy of its contents, so the tab, the inline kit editor and the wizard
 * still cannot drift — which is the whole reason `SubclassPanel` exists.
 *
 * Every handler keeps the panel's rule: **empty back to `undefined`**, never
 * `{}` or `[]`, or `isBareSubclass` stops recognising a cleared subclass.
 */
export function SubclassSummaryField({
  subclass,
  onChange,
}: {
  subclass: SubclassInfo
  onChange: (next: SubclassInfo) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="text-muted-foreground text-xs">Summary</span>
      <Input
        value={subclass.summary ?? ''}
        placeholder="One line, shown on the option card."
        className="h-7 text-sm"
        onChange={(e) => {
          const value = e.target.value
          onChange({
            ...subclass,
            summary: value.trim() === '' ? undefined : value,
          })
        }}
      />
    </label>
  )
}

export function SubclassFeatureRows({
  subclass,
  subclassLevel,
  onChange,
}: {
  subclass: SubclassInfo
  subclassLevel: number
  onChange: (next: SubclassInfo) => void
}) {
  return (
    <FeatureRows
      features={subclass.features}
      minLevel={subclassLevel}
      placeholder="Improved Critical"
      onChange={(features) => onChange({ ...subclass, features })}
    />
  )
}

/** Bonus spells, grants and spellcasting — everything past the features list. */
export function SubclassExtras({
  subclass,
  subclassLevel,
  onChange,
}: {
  subclass: SubclassInfo
  subclassLevel: number
  onChange: (next: SubclassInfo) => void
}) {
  const patch = (changes: Partial<SubclassInfo>) =>
    onChange({ ...subclass, ...changes })

  return (
    <div className="space-y-3">
      <div className="border-t pt-3">
        <SubclassSpellRows
          spells={subclass.spells ?? []}
          minLevel={subclassLevel}
          onChange={(spells) =>
            patch({ spells: spells.length > 0 ? spells : undefined })
          }
        />
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <span className="text-xs font-medium">Grants</span>
        <p className="text-muted-foreground text-xs">
          Proficiencies and the like, applied on the level-up that chooses this
          archetype.
        </p>
        <GrantEditor
          grant={subclass.grant ?? {}}
          onChange={(grant) =>
            patch({ grant: isEmptyGrant(grant) ? undefined : grant })
          }
        />
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <span className="text-xs font-medium">Spellcasting</span>
        <SpellcastingFields
          value={subclass.spellcasting}
          ownerName={subclass.name}
          enableLabel={`Casts spells from level ${subclassLevel}`}
          onChange={(spellcasting) => patch({ spellcasting })}
        />
      </div>
    </div>
  )
}
