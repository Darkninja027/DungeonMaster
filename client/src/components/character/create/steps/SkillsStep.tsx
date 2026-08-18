import { SKILLS } from '#/lib/character'
import type { CharacterDraft } from '#/lib/characterDraft'
import { draftPickLists, grantedSkills, picked } from '#/lib/characterDraft'
import { PickListGroup } from '../PickListGroup'

export function SkillsStep({
  draft,
  onChange,
}: {
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  const granted = grantedSkills(draft)
  // Weapon picks belong to the equipment step, where the option that created
  // them lives.
  const picks = draftPickLists(draft).filter((p) => p.kind !== 'weapon')

  return (
    <div className="space-y-4">
      {granted.size > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">Already yours</h3>
          <div className="flex flex-wrap gap-1.5">
            {[...granted].map(([id, source]) => (
              <span
                key={id}
                className="bg-muted rounded-full px-2.5 py-1 text-xs"
                title={`Granted by ${source}`}
              >
                {SKILLS.find((s) => s.id === id)?.name ?? id}
                <span className="text-muted-foreground"> · {source}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {picks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing to choose here — your race, class and background didn&rsquo;t
          offer any options. You can add proficiencies on the sheet.
        </p>
      ) : (
        picks.map((pick) => (
          <PickListGroup
            key={pick.id}
            pick={pick}
            chosen={picked(draft, pick.id)}
            alreadyGranted={pick.kind === 'skill' ? granted : undefined}
            onChange={(values) =>
              onChange({
                ...draft,
                picks: { ...draft.picks, [pick.id]: values },
              })
            }
          />
        ))
      )}
    </div>
  )
}
