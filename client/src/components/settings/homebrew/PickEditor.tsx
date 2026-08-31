import { Plus, X } from 'lucide-react'

import type { PickList } from '#/lib/srd'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { Button } from '#/components/ui/button'
import { TokenField } from './GrantEditor'

/**
 * The kinds an author can pick from, in the order they are worth reaching for.
 *
 * `feature` leads because it is the one whose answer becomes a row on the
 * sheet — a Fighting Style, a manoeuvre, an invocation — and it was missing
 * from the old dropdown entirely, along with `spell` and `cantrip`. A pick
 * authored as one of those parsed back as `other`, which records the click and
 * then discards it.
 */
const KINDS: Array<{ id: PickList['kind']; label: string; hint: string }> = [
  { id: 'feature', label: 'feature', hint: 'Becomes a named row on the sheet' },
  { id: 'skill', label: 'skill', hint: 'Skill proficiency, from the 18 ids' },
  { id: 'expertise', label: 'expertise', hint: 'Doubles an existing proficiency' },
  { id: 'skillOrTool', label: 'skill or tool', hint: 'Either, decided per value' },
  { id: 'tool', label: 'tool', hint: 'Tool proficiency' },
  { id: 'language', label: 'language', hint: 'A language' },
  { id: 'weapon', label: 'weapon', hint: 'Weapon proficiency' },
  { id: 'armor', label: 'armor', hint: 'Armor proficiency' },
  { id: 'spell', label: 'spell', hint: 'A spell of 1st level or higher' },
  { id: 'cantrip', label: 'cantrip', hint: 'A cantrip' },
  { id: 'other', label: 'other', hint: 'Free text — recorded, never applied' },
]

/**
 * One choice a feature or a grant poses.
 *
 * Shared by `GrantEditor`'s creation-time choices and `FeatureRows`' per-level
 * ones so the two cannot drift — the same rule that keeps `SubclassPanel` in
 * one piece. A choice is a choice wherever it is authored; only the owner
 * differs, and the owner is what namespaces its id at parse time.
 *
 * `featureGrant` is deliberately not editable here. It is a `Grant` per option
 * — a nested editor inside a list inside a row — and almost every real one is
 * empty, because "+2 to ranged attack rolls" is a combat rule this app does not
 * model. It round-trips untouched and the note below says so.
 */
export function PickEditor({
  pick,
  onChange,
  onRemove,
}: {
  pick: PickList
  onChange: (next: PickList) => void
  onRemove: () => void
}) {
  // Spreads the original, so `featureGrant` and anything else without a form
  // survives every edit made here.
  const patch = (changes: Partial<PickList>) => onChange({ ...pick, ...changes })

  const isFeature = pick.kind === 'feature'
  // A closed pick with nothing to choose from can never be satisfied, and
  // `parsePickList` drops it on the next load rather than trapping the player.
  const unsatisfiable = pick.open !== true && pick.options.length === 0

  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <div className="flex items-center gap-1.5">
        <Input
          value={pick.label}
          placeholder="Choose a Fighting Style"
          className="h-7 min-w-0 flex-1 text-sm"
          onChange={(e) => patch({ label: e.target.value })}
        />
        <Input
          value={String(pick.count)}
          inputMode="numeric"
          title="How many to choose"
          className="h-7 w-12 text-center text-sm"
          onChange={(e) => {
            const n = Number(e.target.value)
            patch({ count: Number.isFinite(n) && n > 0 ? Math.round(n) : 1 })
          }}
        />
        <select
          value={pick.kind}
          aria-label="What kind of choice"
          title={KINDS.find((k) => k.id === pick.kind)?.hint}
          className="border-input bg-background h-7 rounded-md border px-1 text-xs"
          onChange={(e) => patch({ kind: e.target.value as PickList['kind'] })}
        >
          {KINDS.map((kind) => (
            <option key={kind.id} value={kind.id} title={kind.hint}>
              {kind.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Remove choice"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <TokenField
        label="Options"
        placeholder={
          pick.kind === 'skill' || pick.kind === 'expertise'
            ? 'stealth (skill id)'
            : isFeature
              ? 'Dueling'
              : 'An option'
        }
        values={pick.options}
        onChange={(options) => patch({ options })}
      />

      {isFeature && (
        <>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs">
              Row prefix{' '}
              <span className="text-muted-foreground">
                — &ldquo;Fighting Style: Dueling&rdquo; rather than
                &ldquo;Dueling&rdquo;
              </span>
            </span>
            <Input
              value={pick.featureLabel ?? ''}
              placeholder="Fighting Style"
              className="h-7 text-sm"
              onChange={(e) =>
                patch({ featureLabel: e.target.value.trim() || undefined })
              }
            />
          </label>

          {pick.options.length > 0 && (
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs">
                What each one does, in your own words
              </span>
              {pick.options.map((option) => (
                <label key={option} className="block space-y-0.5">
                  <span className="text-muted-foreground text-[11px]">
                    {option}
                  </span>
                  <Textarea
                    value={pick.featureText?.[option] ?? ''}
                    rows={2}
                    placeholder={`What ${option} does.`}
                    className="text-sm"
                    onChange={(e) => {
                      const text = e.target.value
                      const next = { ...(pick.featureText ?? {}) }
                      // Empties back out of the record rather than storing "",
                      // and the record itself back to `undefined` once bare.
                      if (text.trim() === '') delete next[option]
                      else next[option] = text
                      patch({
                        featureText:
                          Object.keys(next).length > 0 ? next : undefined,
                      })
                    }}
                  />
                </label>
              ))}
            </div>
          )}

          {pick.featureGrant && (
            <p className="text-muted-foreground text-xs">
              {Object.keys(pick.featureGrant).length} of these also grant
              something mechanically, kept as you edit. That part is
              homebrew.json only.
            </p>
          )}
        </>
      )}

      <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={pick.open === true}
          className="accent-primary size-3.5"
          onChange={(e) => patch({ open: e.target.checked || undefined })}
        />
        Allow anything else to be typed in
      </label>

      {unsatisfiable && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          No options and nothing can be typed in — this choice can never be
          answered, so it is dropped when the file reloads.
        </p>
      )}
    </div>
  )
}

/** A list of choices, with its own Add button. */
export function PickRows({
  picks,
  onChange,
  addLabel = 'Add choice',
}: {
  picks: Array<PickList>
  onChange: (next: Array<PickList>) => void
  addLabel?: string
}) {
  return (
    <div className="space-y-2">
      {picks.map((pick, i) => (
        <PickEditor
          key={i}
          pick={pick}
          onChange={(next) => onChange(picks.map((p, j) => (i === j ? next : p)))}
          onRemove={() => onChange(picks.filter((_, j) => j !== i))}
        />
      ))}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() =>
          onChange([
            ...picks,
            { id: '', kind: 'feature', label: '', count: 1, options: [] },
          ])
        }
      >
        <Plus className="size-3" /> {addLabel}
      </Button>
    </div>
  )
}
