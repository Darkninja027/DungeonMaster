import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'

import type { ClassKit, SubclassInfo } from '#/lib/srd'
import type { HomebrewSubclass } from '#/lib/homebrew'
import { homebrewId, isBareSubclass } from '#/lib/homebrew'
import { nameKey, subclassLevelOf } from '#/lib/tables'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'
import { WizardRail } from '#/components/character/create/WizardRail'
import { Field } from './GrantEditor'
import { blankSubclass } from './StandaloneSubclassEditor'
import { SubclassExtras, SubclassFeatureRows } from './SubclassEditor'

type StepId = 'class' | 'name' | 'features' | 'extras' | 'review'

const STEPS: Array<StepId> = ['class', 'name', 'features', 'extras', 'review']

const STEP_HEADINGS: Record<StepId, { title: string; blurb: string }> = {
  class: {
    title: 'Which class?',
    blurb: 'The subclass is added to it, without duplicating it.',
  },
  name: { title: 'Name it', blurb: 'What players will see on the option card.' },
  features: {
    title: 'Features',
    blurb: 'What it grants, and when. You can add these later.',
  },
  extras: {
    title: 'Anything else',
    blurb: 'Bonus spells, proficiencies, spellcasting — all optional.',
  },
  review: { title: 'Review', blurb: 'What this will add.' },
}

const STEP_TITLES: Record<StepId, string> = {
  class: 'Class',
  name: 'Name',
  features: 'Features',
  extras: 'Extras',
  review: 'Review',
}

/**
 * Whether a step's requirements are met.
 *
 * Only the first two gate, and neither is arbitrary: `parseHomebrewSubclasses`
 * drops any entry with a blank `className` *or* a blank `name`, so these two
 * questions are the difference between an entry that exists and one that
 * silently vanishes on the next load. Everything after them is genuinely
 * optional, and saying so is the whole point — the flat form could not tell you
 * which two of its fields actually mattered.
 */
export function canAdvance(draft: HomebrewSubclass, step: StepId): boolean {
  switch (step) {
    case 'class':
      return draft.className.trim() !== ''
    case 'name':
      return draft.name.trim() !== ''
    case 'features':
    case 'extras':
    case 'review':
      return true
  }
}

/**
 * Creating a subclass, one question at a time.
 *
 * **Create is not edit.** This runs on Add; selecting an existing entry still
 * opens the all-at-once form, because coming back to change one damage
 * resistance should not mean clicking through five steps.
 *
 * The draft lives here and nothing reaches the section's list until the end, so
 * cancelling halfway leaves no trace. That is a change from the old Add, which
 * appended a blank entry immediately: cancelling left an "Untitled" row that
 * marked the file dirty and then vanished on the next load, because every
 * parser drops a nameless entry.
 *
 * One draft object is carried through every step and spread into — never
 * per-step state assembled at the end. `picks`, `resource` and
 * `halfProficiency` have no UI anywhere and survive only because every patch
 * spreads; building a fresh entry here would drop them silently.
 */
export function SubclassWizard({
  open,
  kits,
  onCancel,
  onCreate,
}: {
  open: boolean
  /** The merged class list, for suggestions and the archetype level. */
  kits: Array<ClassKit>
  onCancel: () => void
  onCreate: (subclass: HomebrewSubclass) => void
}) {
  const [draft, setDraft] = useState<HomebrewSubclass>(blankSubclass)
  const [step, setStep] = useState<StepId>('class')

  useEffect(() => {
    if (!open) return
    setDraft(blankSubclass())
    setStep('class')
  }, [open])

  const patch = (changes: Partial<HomebrewSubclass>) =>
    setDraft((d) => ({ ...d, ...changes }))

  const kit = kits.find((k) => nameKey(k.name) === nameKey(draft.className))
  const subclassLevel = subclassLevelOf(kit)
  const attached = draft.className.trim() !== ''

  const index = STEPS.indexOf(step)
  const isLast = index === STEPS.length - 1
  const ready = canAdvance(draft, step)
  const named = canAdvance(draft, 'class') && canAdvance(draft, 'name')

  const go = (delta: number) => {
    const next = index + delta
    if (next < 0 || next >= STEPS.length) return
    setStep(STEPS[next])
  }

  const collides =
    kit?.subclasses.some((s) => nameKey(s.name) === nameKey(draft.name)) ?? false
  // Bare *and* colliding is the one combination that silently does nothing:
  // `layerSubclasses` skips an incoming bare subclass whose name the class
  // already has, so it would save to disk and never appear anywhere. A bare
  // subclass under a new name is fine — it simply appends.
  const inert = isBareSubclass(draft) && collides

  // `SubclassInfo` has no `className`, so the shared parts drop it. Re-attached
  // exactly as `StandaloneSubclassEditor` does.
  const keepClass = (next: SubclassInfo) =>
    setDraft({ ...next, className: draft.className })

  const summaryFor = (s: StepId): string | null => {
    switch (s) {
      case 'class':
        return draft.className.trim() || null
      case 'name':
        return draft.name.trim() || null
      case 'features':
        return draft.features.length > 0
          ? `${draft.features.length} added`
          : null
      case 'extras':
      case 'review':
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="flex h-[min(40rem,88vh)] w-[min(52rem,94vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>{STEP_HEADINGS[step].title}</DialogTitle>
          <DialogDescription>{STEP_HEADINGS[step].blurb}</DialogDescription>
        </DialogHeader>

        {/* min-h-0 on the grid and every scrolling child, or the panes grow the
            dialog past the viewport instead of scrolling inside it. */}
        <div className="grid min-h-0 flex-1 grid-cols-[9rem_1fr]">
          <WizardRail
            steps={STEPS}
            current={step}
            onGo={setStep}
            isComplete={(s) => canAdvance(draft, s)}
            label={(s) => STEP_TITLES[s]}
            summary={summaryFor}
          />

          <ScrollArea className="min-h-0 min-w-0">
            <div className="p-5">
              {step === 'class' && (
                <Field
                  label="Class"
                  hint="Which class offers this — the subclass is added to it"
                >
                  <Input
                    value={draft.className}
                    list="subclass-wizard-classes"
                    placeholder="Bard"
                    className="h-8"
                    onChange={(e) => patch({ className: e.target.value })}
                  />
                  <datalist id="subclass-wizard-classes">
                    {kits.map((k) => (
                      <option key={k.id} value={k.name} />
                    ))}
                  </datalist>
                  {attached && !kit && (
                    // Kept rather than dropped — the class may live in a world
                    // this global file cannot see — but worth saying, because
                    // the usual cause is a typo and the subclass would then
                    // never appear anywhere.
                    <p className="text-muted-foreground text-xs">
                      No class called {draft.className.trim()} yet. This is
                      kept, but it won&rsquo;t show up until one exists.
                    </p>
                  )}
                  {kit && (
                    <p className="text-muted-foreground text-xs">
                      Added alongside the {kit.subclasses.length}{' '}
                      {kit.subclassLabel.toLowerCase()}
                      {kit.subclasses.length === 1 ? '' : 's'} {kit.name} already
                      has.
                    </p>
                  )}
                </Field>
              )}

              {step === 'name' && (
                <Field label={kit ? kit.subclassLabel : 'Subclass name'}>
                  <Input
                    value={draft.name}
                    placeholder="College of Swords"
                    className="h-8"
                    onChange={(e) =>
                      patch({
                        name: e.target.value,
                        id: homebrewId(e.target.value),
                      })
                    }
                  />
                  {collides && (
                    <p className="text-muted-foreground text-xs">
                      Overrides the existing {draft.name.trim()}.
                    </p>
                  )}
                </Field>
              )}

              {step === 'features' && (
                <SubclassFeatureRows
                  subclass={draft}
                  subclassLevel={subclassLevel}
                  onChange={keepClass}
                />
              )}

              {step === 'extras' && (
                <div className="space-y-3">
                  <label className="block space-y-1">
                    <span className="text-muted-foreground text-xs">
                      Summary
                    </span>
                    <Input
                      value={draft.summary ?? ''}
                      placeholder="One line, shown on the option card."
                      className="h-7 text-sm"
                      onChange={(e) => {
                        const value = e.target.value
                        patch({
                          summary: value.trim() === '' ? undefined : value,
                        })
                      }}
                    />
                  </label>
                  <SubclassExtras
                    subclass={draft}
                    subclassLevel={subclassLevel}
                    onChange={keepClass}
                  />
                </div>
              )}

              {step === 'review' && (
                <div className="space-y-3 text-sm">
                  <p>
                    Adds{' '}
                    <strong className="font-medium">{draft.name.trim()}</strong>{' '}
                    to the{' '}
                    <strong className="font-medium">
                      {draft.className.trim()}
                    </strong>
                    .
                  </p>
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    <li>
                      {draft.features.length === 0
                        ? 'No features yet.'
                        : `${draft.features.length} feature${
                            draft.features.length === 1 ? '' : 's'
                          }, from level ${Math.min(
                            ...draft.features.map((f) => f.level),
                          )}.`}
                    </li>
                    {draft.summary && <li>Summary: {draft.summary}</li>}
                    {draft.spells && draft.spells.length > 0 && (
                      <li>
                        {draft.spells.length} bonus spell row
                        {draft.spells.length === 1 ? '' : 's'}.
                      </li>
                    )}
                    {draft.grant && <li>Grants proficiencies or the like.</li>}
                    {draft.spellcasting && (
                      <li>Casts spells from level {subclassLevel}.</li>
                    )}
                  </ul>
                  {!kit && (
                    <p className="text-muted-foreground text-xs">
                      No class called {draft.className.trim()} yet — this is
                      saved, but won&rsquo;t show up until one exists.
                    </p>
                  )}
                  {inert && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      {draft.className.trim()} already has a {draft.name.trim()},
                      and this one carries nothing yet — so it would be ignored.
                      Add a feature, a summary or a grant to override it.
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    Nothing is written until you press Save in the Homebrew
                    section.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t px-5 py-3 sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={index === 0}
              onClick={() => go(-1)}
            >
              <ChevronLeft /> Back
            </Button>
            {/* The escape hatch. A wizard is good for ordering questions and bad
                for being trapped in — once the two required answers are given,
                the full form is always one click away. */}
            {!isLast && named && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCreate(draft)}
                title="Create it now and edit the rest in the full form"
              >
                Skip to the full form
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            {isLast ? (
              <Button size="sm" onClick={() => onCreate(draft)}>
                <Sparkles /> Create subclass
              </Button>
            ) : (
              <Button size="sm" disabled={!ready} onClick={() => go(1)}>
                Next <ChevronRight />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
