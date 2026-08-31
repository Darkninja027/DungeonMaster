import type { CharacterDraft } from '#/lib/characterDraft'
import { nameProblem } from '#/lib/characterDraft'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'

const ALIGNMENTS = [
  'LG',
  'NG',
  'CG',
  'LN',
  'N',
  'CN',
  'LE',
  'NE',
  'CE',
] as const

const ALIGNMENT_NAMES: Record<string, string> = {
  LG: 'Lawful Good',
  NG: 'Neutral Good',
  CG: 'Chaotic Good',
  LN: 'Lawful Neutral',
  N: 'True Neutral',
  CN: 'Chaotic Neutral',
  LE: 'Lawful Evil',
  NE: 'Neutral Evil',
  CE: 'Chaotic Evil',
}

export function NameStep({
  draft,
  onChange,
}: {
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  // Only complain once they have typed something — an error on an untouched
  // field is nagging, not helping.
  const problem = draft.name ? nameProblem(draft.name) : null

  return (
    <div className="max-w-lg space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="wizard-name">Name</Label>
        <Input
          id="wizard-name"
          autoFocus
          value={draft.name}
          placeholder="e.g. Thrain Stonebrook"
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        {problem ? (
          <p className="text-destructive text-sm">{problem}</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            This becomes the filename, so it can&rsquo;t contain \ / : * ?
            &quot; &lt; &gt; or |.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="wizard-alignment">Alignment</Label>
        <Input
          id="wizard-alignment"
          list="wizard-alignments"
          value={draft.alignment}
          placeholder="Optional"
          className="w-40"
          onChange={(e) => onChange({ ...draft, alignment: e.target.value })}
        />
        <datalist id="wizard-alignments">
          {ALIGNMENTS.map((a) => (
            <option key={a} value={a}>
              {ALIGNMENT_NAMES[a]}
            </option>
          ))}
        </datalist>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="wizard-backstory">Backstory</Label>
        <Textarea
          id="wizard-backstory"
          value={draft.backstory}
          rows={4}
          placeholder="Where they came from, and what they are running toward. You can leave this for later."
          onChange={(e) => onChange({ ...draft, backstory: e.target.value })}
        />
      </div>
    </div>
  )
}
