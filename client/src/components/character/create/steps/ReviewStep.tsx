import type { CharacterDraft } from '#/lib/characterDraft'
import { draftBackground } from '#/lib/characterDraft'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'

/**
 * The last step: the four personality lines that seed the markdown body, and a
 * plain statement of what is about to be written where.
 *
 * The full stat readout lives in the summary panel on the right, which has been
 * visible the whole way through — repeating it here would be noise.
 */
export function ReviewStep({
  draft,
  onChange,
}: {
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  const background = draftBackground(draft)
  const s = background?.suggestions

  const set = (key: keyof CharacterDraft['personality'], value: string) =>
    onChange({ ...draft, personality: { ...draft.personality, [key]: value } })

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-muted-foreground text-sm">
        These four lines go into the article body under <em>Personality</em>.
        All optional, and all editable later.
      </p>

      <Field
        id="trait"
        label="Personality trait"
        value={draft.personality.trait}
        suggestion={s?.traits?.[0]}
        onChange={(v) => set('trait', v)}
      />
      <Field
        id="ideal"
        label="Ideal"
        value={draft.personality.ideal}
        suggestion={s?.ideals?.[0]}
        onChange={(v) => set('ideal', v)}
      />
      <Field
        id="bond"
        label="Bond"
        value={draft.personality.bond}
        suggestion={s?.bonds?.[0]}
        onChange={(v) => set('bond', v)}
      />
      <Field
        id="flaw"
        label="Flaw"
        value={draft.personality.flaw}
        suggestion={s?.flaws?.[0]}
        onChange={(v) => set('flaw', v)}
      />

      <p className="text-muted-foreground border-t pt-3 text-xs">
        Creating <strong className="text-foreground">{draft.name}</strong> in{' '}
        <code>Characters/</code>. Nothing has been written to disk yet.
      </p>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  suggestion,
  onChange,
}: {
  id: string
  label: string
  value: string
  suggestion?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`wizard-${id}`}>{label}</Label>
      <Textarea
        id={`wizard-${id}`}
        value={value}
        rows={2}
        placeholder={suggestion ?? 'Optional'}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
