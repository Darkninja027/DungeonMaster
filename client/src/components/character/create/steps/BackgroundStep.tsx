import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { SKILLS } from '#/lib/character'
import type { CharacterDraft } from '#/lib/characterDraft'
import { draftBackground } from '#/lib/characterDraft'
import type { BackgroundInfo } from '#/lib/srd'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { OptionCard } from '../OptionCard'
import { HomebrewDialog } from '../HomebrewDialog'

function skillNames(ids: Array<string> | undefined): string {
  return (ids ?? [])
    .map((id) => SKILLS.find((s) => s.id === id)?.name ?? id)
    .join(', ')
}

export function BackgroundStep({
  draft,
  onChange,
}: {
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  const background = draftBackground(draft)
  const [creating, setCreating] = useState(false)

  /** Same snapshot refresh as the race step — see adoptCreated there. */
  const adoptCreated = (created: BackgroundInfo) => {
    const backgrounds = [
      ...draft.backgrounds.filter(
        (b) =>
          b.name.trim().toLowerCase() !== created.name.trim().toLowerCase(),
      ),
      created,
    ]
    onChange({ ...draft, backgrounds, backgroundName: created.name })
  }

  const choose = (next: BackgroundInfo) => {
    const picks = { ...draft.picks }
    for (const pick of background?.grant.picks ?? []) delete picks[pick.id]
    onChange({ ...draft, backgroundName: next.name, picks })
  }

  /** One suggestion each, so the body starts with something rather than nothing. */
  const applySuggestions = () => {
    const s = background?.suggestions
    if (!s) return
    onChange({
      ...draft,
      personality: {
        trait: s.traits?.[0] ?? draft.personality.trait,
        ideal: s.ideals?.[0] ?? draft.personality.ideal,
        bond: s.bonds?.[0] ?? draft.personality.bond,
        flaw: s.flaws?.[0] ?? draft.personality.flaw,
      },
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-medium">Background</h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {draft.backgrounds.map((option) => (
            <OptionCard
              key={option.id}
              title={option.name}
              description={option.summary}
              detail={skillNames(option.grant.skills)}
              selected={draft.backgroundName === option.name}
              onSelect={() => choose(option)}
            />
          ))}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="hover:bg-accent/50 flex items-center justify-center gap-1.5 rounded-md border border-dashed p-2 text-sm transition-colors"
          >
            <Sparkles className="size-3.5" /> Create a background
          </button>
        </div>
      </div>

      <HomebrewDialog
        kind="background"
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => adoptCreated(created as BackgroundInfo)}
      />

      <div className="grid max-w-sm gap-2">
        <Label htmlFor="wizard-background-other">Or type your own</Label>
        <Input
          id="wizard-background-other"
          value={draft.backgroundName}
          placeholder="Homebrew background"
          onChange={(e) =>
            onChange({ ...draft, backgroundName: e.target.value })
          }
        />
      </div>

      {background && (
        <div className="text-muted-foreground space-y-1 text-sm">
          <p>
            <span className="text-foreground font-medium">
              {background.feature.name}.
            </span>{' '}
            {background.feature.text}
          </p>
          {background.suggestions && (
            <button
              type="button"
              onClick={applySuggestions}
              className="text-foreground text-xs underline"
            >
              Fill in suggested personality traits
            </button>
          )}
        </div>
      )}
    </div>
  )
}
