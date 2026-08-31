import type { FeatInfo } from '#/lib/srd'
import { homebrewId } from '#/lib/homebrew'
import { SRD_TABLES, nameKey } from '#/lib/tables'
import { Input } from '#/components/ui/input'
import { Field, GrantEditor } from './GrantEditor'
import { AsiEditor } from './RaceEditor'

export function blankFeat(): FeatInfo {
  return { id: '', name: '', summary: '', grant: {} }
}

/**
 * A feat.
 *
 * Unlike races and backgrounds there are no built-ins beneath these — SRD 5.1
 * has no feat list — so everything offered in the wizards comes from here or
 * from a world's own settings. The override hint stays anyway: a world can
 * still shadow a global feat by name, and a future built-in would too.
 *
 * The ability field is the half-feat case ("+1 Constitution, and…"). Leaving it
 * empty is the normal thing for a full feat.
 */
export function FeatEditor({
  feat,
  onChange,
}: {
  feat: FeatInfo
  onChange: (next: FeatInfo) => void
}) {
  const patch = (changes: Partial<FeatInfo>) => onChange({ ...feat, ...changes })

  const overrides = SRD_TABLES.feats.some(
    (f) => nameKey(f.name) === nameKey(feat.name),
  )

  return (
    <div className="space-y-3">
      <Field label="Name">
        <Input
          value={feat.name}
          placeholder="Sharpshooter"
          className="h-8"
          onChange={(e) =>
            patch({ name: e.target.value, id: homebrewId(e.target.value) })
          }
        />
        {overrides && (
          <p className="text-muted-foreground text-xs">
            Overrides the built-in {feat.name.trim()}.
          </p>
        )}
      </Field>

      <Field label="Summary" hint="One line, shown beside the name">
        <Input
          value={feat.summary}
          placeholder="Long range shots ignore cover."
          className="h-8"
          onChange={(e) => patch({ summary: e.target.value })}
        />
      </Field>

      <Field
        label="Prerequisite"
        hint="Shown to the player, never enforced"
      >
        <Input
          value={feat.prerequisite ?? ''}
          placeholder="Strength 13 or higher"
          className="h-8"
          onChange={(e) =>
            patch({ prerequisite: e.target.value.trim() || undefined })
          }
        />
      </Field>

      <Field
        label="Ability increase"
        hint="Half-feats only — leave empty for a full feat"
      >
        <AsiEditor
          asi={feat.asi ?? {}}
          onChange={(asi) =>
            patch({ asi: Object.keys(asi).length > 0 ? asi : undefined })
          }
        />
      </Field>

      <div className="border-t pt-3">
        <p className="text-muted-foreground mb-2 text-xs">
          What taking this feat grants. Applied when the feat is chosen, on the
          character sheet — editing it later won&rsquo;t change characters who
          already have it.
        </p>
        <GrantEditor grant={feat.grant} onChange={(grant) => patch({ grant })} />
      </div>
    </div>
  )
}
