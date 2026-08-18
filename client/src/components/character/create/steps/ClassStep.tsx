import type { CharacterDraft } from '#/lib/characterDraft'
import { draftClassInfo, draftKit } from '#/lib/characterDraft'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { OptionCard } from '../OptionCard'

export function ClassStep({
  draft,
  onChange,
}: {
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  const kit = draftKit(draft)
  const classInfo = draftClassInfo(draft)
  const subclasses = classInfo?.subclasses ?? []
  /**
   * Whether the class brings anything to creation beyond a hit die. A legacy
   * class carries only the three sheet fields, so its kit is otherwise empty.
   */
  const hasStartingKit = Boolean(
    kit &&
    (kit.saves.length > 0 ||
      kit.equipment.length > 0 ||
      kit.features.length > 0 ||
      kit.skillChoices.options.length > 0),
  )

  const chooseClass = (name: string) => {
    // Class-scoped choices belong to the class being replaced.
    const picks = { ...draft.picks }
    if (kit) {
      delete picks[kit.skillChoices.id]
      for (const pick of kit.grant.picks ?? []) delete picks[pick.id]
      for (const choice of kit.equipment) {
        for (const option of choice.options) {
          for (const pick of option.grant.picks ?? []) delete picks[pick.id]
        }
      }
    }
    onChange({
      ...draft,
      className: name,
      subclassName: '',
      picks,
      equipment: {},
      cantrips: [],
      spells: [],
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-medium">Class</h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {draft.kits.map((option) => (
            <OptionCard
              key={option.id}
              title={option.name}
              detail={`d${option.hitDie}`}
              selected={
                draft.className.trim().toLowerCase() ===
                option.name.trim().toLowerCase()
              }
              onSelect={() => chooseClass(option.name)}
            />
          ))}
        </div>
      </div>

      <div className="grid max-w-sm gap-2">
        <Label htmlFor="wizard-class-other">Or type your own</Label>
        <Input
          id="wizard-class-other"
          value={draft.className}
          placeholder="Homebrew class"
          onChange={(e) => onChange({ ...draft, className: e.target.value })}
        />
      </div>

      {/*
        A class with no starting gear — a legacy per-world class, or one typed
        by hand. Tested on the kit's *contents*, not on the kit existing: since
        classes and kits merged, a legacy class does have a kit, just an empty
        one, and gating on `!kit` silently showed nothing at all.
      */}
      {draft.className && !hasStartingKit && (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
          <strong className="text-foreground">
            No starting kit for {draft.className}.
          </strong>{' '}
          {kit
            ? `Its d${kit.hitDie} hit die is used, but you'll pick saving throws, proficiencies and equipment on the sheet.`
            : 'It isn’t in the class list either, so it gets a d8 hit die. Add it under Settings → Homebrew → Classes to change that.'}
        </p>
      )}

      {kit?.subclassAtLevel1 === true && (
        <div className="grid max-w-sm gap-2">
          <Label htmlFor="wizard-subclass">
            {classInfo?.subclassLabel ?? 'Subclass'}
          </Label>
          <Input
            id="wizard-subclass"
            list="wizard-subclasses"
            value={draft.subclassName}
            placeholder={classInfo?.subclassLabel}
            onChange={(e) =>
              onChange({ ...draft, subclassName: e.target.value })
            }
          />
          {/*
            A datalist, not a select: the world's own list is one click away but
            homebrew stays typeable, which the on-disk format requires.
          */}
          <datalist id="wizard-subclasses">
            {subclasses.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      )}

      {hasStartingKit && kit && kit.subclassAtLevel1 !== true && (
        <p className="text-muted-foreground text-sm">
          A {kit.name} chooses their{' '}
          {classInfo?.subclassLabel.toLowerCase() ?? 'subclass'} at 3rd level.
        </p>
      )}

      {hasStartingKit && kit && (
        <div className="text-muted-foreground space-y-1 text-sm">
          <h4 className="text-foreground text-sm font-medium">
            What a {kit.name} starts with
          </h4>
          <p>
            <span className="text-foreground font-medium">Saving throws.</span>{' '}
            {kit.saves.map((s) => s.toUpperCase()).join(' and ')}
          </p>
          {kit.features.map((feature) => (
            <p key={feature.name}>
              <span className="text-foreground font-medium">
                {feature.name}.
              </span>{' '}
              {feature.text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
