import type { BackgroundInfo } from '#/lib/srd'
import { homebrewId } from '#/lib/homebrew'
import { SRD_TABLES, nameKey } from '#/lib/tables'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { Field, GrantEditor } from './GrantEditor'

export function blankBackground(): BackgroundInfo {
  return {
    id: '',
    name: '',
    summary: '',
    feature: { name: '' },
    grant: {},
  }
}

export function BackgroundEditor({
  background,
  onChange,
}: {
  background: BackgroundInfo
  onChange: (next: BackgroundInfo) => void
}) {
  const patch = (changes: Partial<BackgroundInfo>) =>
    onChange({ ...background, ...changes })

  // Same hint as the other two editors — see RaceEditor.
  const overrides = SRD_TABLES.backgrounds.some(
    (b) => nameKey(b.name) === nameKey(background.name),
  )

  return (
    <div className="space-y-3">
      <Field label="Name">
        <Input
          value={background.name}
          placeholder="Smuggler"
          className="h-8"
          onChange={(e) =>
            patch({ name: e.target.value, id: homebrewId(e.target.value) })
          }
        />
        {overrides && (
          <p className="text-muted-foreground text-xs">
            Overrides the built-in {background.name.trim()}.
          </p>
        )}
      </Field>

      <Field label="Summary" hint="One line, shown on the option card">
        <Input
          value={background.summary}
          placeholder="You moved cargo nobody was meant to see."
          className="h-8"
          onChange={(e) => patch({ summary: e.target.value })}
        />
      </Field>

      <Field label="Feature" hint="Every 5e background has one">
        <div className="space-y-1">
          <Input
            value={background.feature.name}
            placeholder="Safe Harbour"
            className="h-8"
            onChange={(e) =>
              patch({
                feature: { ...background.feature, name: e.target.value },
              })
            }
          />
          <Textarea
            value={background.feature.text ?? ''}
            rows={2}
            placeholder="What it lets you do."
            className="text-sm"
            onChange={(e) =>
              patch({
                feature: { ...background.feature, text: e.target.value },
              })
            }
          />
        </div>
      </Field>

      <div className="border-t pt-3">
        <p className="text-muted-foreground mb-2 text-xs">
          5e backgrounds grant two skills.
        </p>
        <GrantEditor
          grant={background.grant}
          onChange={(grant) => patch({ grant })}
        />
      </div>
    </div>
  )
}
