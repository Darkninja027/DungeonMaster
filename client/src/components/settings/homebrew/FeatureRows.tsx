import { Plus, X } from 'lucide-react'

import type { ClassFeatureInfo } from '#/lib/srd'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'

/**
 * The level/name/text rows a class or subclass gains as it levels.
 *
 * Extracted from `ClassKitEditor`, which had this inline for the kit's own
 * features, so a subclass could gain the same editor rather than a second copy
 * of it. A subclass's features were previously uneditable anywhere — the kit
 * editor listed subclasses as bare names and apologised for the rest.
 *
 * Deliberately edits only `level`, `name` and `text`. A `ClassFeatureInfo` can
 * also carry `picks`, `resource` and `halfProficiency`, and those are **kept
 * across an edit** rather than dropped — see `patchAt`. They have no UI yet,
 * which is honest: a pick needs its own editor, and silently discarding one
 * because this form cannot show it would be the worst of the options.
 */
export function FeatureRows({
  features,
  onChange,
  /** Shown on the name input, e.g. "Rage" or "Cutting Words". */
  placeholder = 'Feature name',
  /** The lowest level a feature here may be gained at. */
  minLevel = 1,
}: {
  features: Array<ClassFeatureInfo>
  onChange: (next: Array<ClassFeatureInfo>) => void
  placeholder?: string
  minLevel?: number
}) {
  /**
   * Replace one row, spreading the original first so everything this form does
   * not show — picks, resource, halfProficiency — survives the edit.
   */
  const patchAt = (i: number, patch: Partial<ClassFeatureInfo>) =>
    onChange(features.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Features by level</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onChange([...features, { level: minLevel, name: '' }])}
        >
          <Plus className="size-3" /> Add feature
        </Button>
      </div>
      {features.length === 0 && (
        <p className="text-muted-foreground text-xs">
          No features yet — add one to say what this grants and when.
        </p>
      )}
      {features.map((feature, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <label
                className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs"
                title="Character level this feature is gained at"
              >
                Lv
                <Input
                  value={String(feature.level)}
                  inputMode="numeric"
                  className="h-7 w-12 text-center text-sm"
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    patchAt(i, {
                      level:
                        Number.isFinite(n) && n >= minLevel && n <= 20
                          ? Math.round(n)
                          : minLevel,
                    })
                  }}
                />
              </label>
              <Input
                value={feature.name}
                placeholder={placeholder}
                className="h-7 min-w-0 flex-1 text-sm"
                onChange={(e) => patchAt(i, { name: e.target.value })}
              />
            </div>
            <Textarea
              value={feature.text ?? ''}
              rows={2}
              placeholder="What it does."
              className="text-sm"
              onChange={(e) => patchAt(i, { text: e.target.value })}
            />
            {/*
              Says what this form is keeping but cannot show, so an editor who
              sees a feature they authored elsewhere knows their picks and
              counters are still there rather than assuming they were lost.
            */}
            {(feature.picks?.length || feature.resource) && (
              <p className="text-muted-foreground text-xs">
                Also carries{' '}
                {[
                  feature.picks?.length
                    ? `${feature.picks.length} choice${feature.picks.length > 1 ? 's' : ''}`
                    : null,
                  feature.resource
                    ? `a ${feature.resource.name} counter`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' and ')}
                , kept as you edit.
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={`Remove ${feature.name || 'feature'}`}
            onClick={() => onChange(features.filter((_, j) => j !== i))}
            className="text-muted-foreground hover:text-destructive mt-1.5"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
