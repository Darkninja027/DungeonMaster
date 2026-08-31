import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { ClassKit } from '#/lib/srd'
import { featuresUpToLevel } from '#/lib/srd'
import type { CharacterDraft } from '#/lib/characterDraft'
import { draftClassInfo, draftKit } from '#/lib/characterDraft'
import { subclassLevelOf } from '#/lib/tables'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { OptionCard } from '../OptionCard'
import { HomebrewDialog } from '../HomebrewDialog'

/**
 * "3rd", "2nd" — for the line telling a player when their class chooses.
 *
 * Local because it exists to render one sentence. The level came from
 * `subclassLevelOf`, so it is 1-20 and any homebrew number in that range reads
 * correctly rather than being hardcoded to the 5e default of 3.
 */
function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

export function ClassStep({
  draft,
  onChange,
}: {
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  const [creating, setCreating] = useState(false)
  const kit = draftKit(draft)
  const classInfo = draftClassInfo(draft)
  const subclasses = classInfo?.subclasses ?? []
  /**
   * Whether this class names its subclass during creation.
   *
   * Through `subclassLevelOf`, not the deprecated `subclassAtLevel1` boolean
   * this used to read: `subclassLevelOf` resolves `subclassLevel` first and
   * falls back to the flag, and it is what the level-up wizard already uses.
   * Reading the flag directly meant a homebrew kit setting only
   * `subclassLevel: 1` got no picker here while level-up agreed it should have
   * one — the two halves of the app disagreeing about the same class.
   */
  const subclassLevel = subclassLevelOf(kit)
  const picksSubclassNow = Boolean(kit) && subclassLevel === 1
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

  /**
   * A class created inline: fold it into the draft's captured kits and select
   * it. The capture is a snapshot on purpose, so without this the new class
   * wouldn't appear until the wizard was reopened.
   */
  const adoptCreated = (created: ClassKit) => {
    const kits = [
      ...draft.kits.filter(
        (k) =>
          k.name.trim().toLowerCase() !== created.name.trim().toLowerCase(),
      ),
      created,
    ]
    onChange({
      ...draft,
      kits,
      className: created.name,
      subclassName: '',
      picks: {},
      equipment: {},
      cantrips: [],
      spells: [],
    })
  }

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
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="hover:bg-accent/50 flex items-center justify-center gap-1.5 rounded-md border border-dashed p-2 text-sm transition-colors"
          >
            <Sparkles className="size-3.5" /> Create a class
          </button>
        </div>
      </div>

      <HomebrewDialog
        kind="kit"
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => adoptCreated(created as ClassKit)}
      />

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

      {picksSubclassNow && (
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

      {hasStartingKit && kit && !picksSubclassNow && (
        <p className="text-muted-foreground text-sm">
          A {kit.name} chooses their{' '}
          {classInfo?.subclassLabel.toLowerCase() ?? 'subclass'} at{' '}
          {ordinal(subclassLevel)} level.
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
          {featuresUpToLevel(kit.features, 1).map((feature) => (
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
