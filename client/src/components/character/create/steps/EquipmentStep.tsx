import { X } from 'lucide-react'
import type { CharacterDraft } from '#/lib/characterDraft'
import { draftKit, draftPickLists, picked } from '#/lib/characterDraft'
import { Input } from '#/components/ui/input'
import { OptionCard } from '../OptionCard'
import { PickListGroup } from '../PickListGroup'

export function EquipmentStep({
  draft,
  onChange,
}: {
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  const kit = draftKit(draft)
  // Only the weapon picks that a *currently chosen* option created — picking
  // "a greataxe" instead removes its pick from this list entirely.
  const weaponPicks = draftPickLists(draft).filter((p) => p.kind === 'weapon')

  const choose = (choiceId: string, index: number) => {
    const choice = kit?.equipment.find((c) => c.id === choiceId)
    const picks = { ...draft.picks }
    // Drop picks belonging to the option being replaced, or they linger as
    // ghost proficiencies from a branch no longer taken.
    for (const option of choice?.options ?? []) {
      for (const pick of option.grant.picks ?? []) delete picks[pick.id]
    }
    onChange({
      ...draft,
      equipment: { ...draft.equipment, [choiceId]: index },
      picks,
    })
  }

  const addExtra = (raw: string) => {
    const value = raw.trim()
    if (!value || draft.extraItems.includes(value)) return
    onChange({ ...draft, extraItems: [...draft.extraItems, value] })
  }

  return (
    <div className="space-y-4">
      {!kit && (
        <p className="text-muted-foreground text-sm">
          No starting kit for this class — add your gear below, or on the sheet
          once you&rsquo;re done.
        </p>
      )}

      {kit?.equipment.map((choice) => (
        <div key={choice.id}>
          <h3 className="mb-2 text-sm font-medium">{choice.label}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {choice.options.map((option, i) => (
              <OptionCard
                key={option.label}
                title={option.label}
                selected={draft.equipment[choice.id] === i}
                onSelect={() => choose(choice.id, i)}
              />
            ))}
          </div>
        </div>
      ))}

      {weaponPicks.map((pick) => (
        <PickListGroup
          key={pick.id}
          pick={pick}
          chosen={picked(draft, pick.id)}
          onChange={(values) =>
            onChange({ ...draft, picks: { ...draft.picks, [pick.id]: values } })
          }
        />
      ))}

      <div className="space-y-1.5">
        <h3 className="text-sm font-medium">Anything else</h3>
        <div className="flex flex-wrap gap-1.5">
          {draft.extraItems.map((item) => (
            <span
              key={item}
              className="bg-muted flex items-center gap-1 rounded-full py-1 pr-1.5 pl-2.5 text-xs"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() =>
                  onChange({
                    ...draft,
                    extraItems: draft.extraItems.filter((v) => v !== item),
                  })
                }
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <Input
          placeholder="Add an item…"
          className="h-7 max-w-sm text-sm"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            addExtra(e.currentTarget.value)
            e.currentTarget.value = ''
          }}
          onBlur={(e) => {
            addExtra(e.currentTarget.value)
            e.currentTarget.value = ''
          }}
        />
      </div>
    </div>
  )
}
