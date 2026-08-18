import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { api } from '#/lib/api'
import { serializeCharacter } from '#/lib/character'
import { buildCharacter } from '#/lib/buildCharacter'
import type { CharacterDraft, StepId } from '#/lib/characterDraft'
import { canAdvance, emptyDraft, stepsFor } from '#/lib/characterDraft'
import { useTables } from '#/lib/useHomebrew'
import { articleTemplates } from '#/lib/templates'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'
import { WizardRail } from './WizardRail'
import { WizardSummary } from './WizardSummary'
import { AbilitiesStep } from './steps/AbilitiesStep'
import { BackgroundStep } from './steps/BackgroundStep'
import { ClassStep } from './steps/ClassStep'
import { EquipmentStep } from './steps/EquipmentStep'
import { NameStep } from './steps/NameStep'
import { RaceStep } from './steps/RaceStep'
import { ReviewStep } from './steps/ReviewStep'
import { SkillsStep } from './steps/SkillsStep'
import { SpellsStep } from './steps/SpellsStep'

const STEP_HEADINGS: Record<StepId, { title: string; blurb: string }> = {
  name: { title: 'Who are they?', blurb: 'A name to start with.' },
  race: {
    title: 'Race',
    blurb: 'Sets your ability bonuses, speed and traits.',
  },
  class: { title: 'Class', blurb: 'What you do, and how tough you are.' },
  abilities: {
    title: 'Ability scores',
    blurb: 'Five ways to get six numbers.',
  },
  background: {
    title: 'Background',
    blurb: 'What you did before any of this.',
  },
  skills: { title: 'Skills & proficiencies', blurb: 'Spend your choices.' },
  spells: { title: 'Spells', blurb: 'What you can cast at 1st level.' },
  equipment: { title: 'Equipment', blurb: 'What you carry out the door.' },
  review: { title: 'Review', blurb: 'A few last details, then create.' },
}

/**
 * Guided character creation.
 *
 * Owns the whole draft; **nothing is written to disk until Create**. That is
 * why `api.folders.create` sits inside the commit mutation and nowhere else —
 * abandoning the wizard must leave no file and no empty `Characters/` folder.
 */
export function CreateCharacterDialog({
  worldId,
  open,
  onClose,
}: {
  worldId: string
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const tables = useTables(worldId)

  const [draft, setDraft] = useState<CharacterDraft>(() => emptyDraft(tables))
  const [step, setStep] = useState<StepId>('name')

  /**
   * Read through a ref so the reset below can depend on `open` alone.
   * `useTables` re-memoises whenever homebrew or world settings load or
   * refetch — depending on it directly would wipe an in-progress draft the
   * moment that happened.
   */
  const tablesRef = useRef(tables)
  tablesRef.current = tables

  // A fresh draft each time the wizard opens, picking up any class list changes
  // made since it was last closed.
  useEffect(() => {
    if (open) {
      setDraft(emptyDraft(tablesRef.current))
      setStep('name')
    }
  }, [open])

  const steps = useMemo(() => stepsFor(draft), [draft])
  const index = steps.indexOf(step)
  const isLast = index === steps.length - 1
  const ready = canAdvance(draft, step)

  const create = useMutation({
    mutationFn: async (input: CharacterDraft) => {
      // Characters live in a top-level Characters/ folder by convention.
      // Created here and not a moment earlier, so an abandoned wizard leaves
      // no trace at all.
      try {
        await api.folders.create({
          worldId,
          parentFolderId: null,
          name: 'Characters',
        })
      } catch {
        // already exists
      }
      const { character, body } = buildCharacter(input)
      return api.articles.create({
        worldId,
        folderId: 'Characters',
        title: input.name.trim(),
        content: serializeCharacter(character, body),
      })
    },
    onSuccess: (article) => {
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
      onClose()
      navigate({
        to: '/worlds/$worldId/characters/$articleId',
        params: { worldId, articleId: article.id },
      })
    },
  })

  /** The old name-only path, for a DM statting six NPCs who wants none of this. */
  const skip = useMutation({
    mutationFn: async (name: string) => {
      try {
        await api.folders.create({
          worldId,
          parentFolderId: null,
          name: 'Characters',
        })
      } catch {
        // already exists
      }
      const template = articleTemplates.find((t) => t.id === 'character')
      return api.articles.create({
        worldId,
        folderId: 'Characters',
        title: name.trim(),
        content: template?.body ?? '',
      })
    },
    onSuccess: (article) => {
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
      onClose()
      navigate({
        to: '/worlds/$worldId/characters/$articleId',
        params: { worldId, articleId: article.id },
      })
    },
  })

  const pending = create.isPending || skip.isPending
  const error = create.error ?? skip.error

  const go = (delta: number) => {
    const next = index + delta
    if (next < 0 || next >= steps.length) return
    setStep(steps[next])
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={!pending}
        className="flex h-[min(46rem,92vh)] w-[min(72rem,95vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none"
      >
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>{STEP_HEADINGS[step].title}</DialogTitle>
          <DialogDescription>{STEP_HEADINGS[step].blurb}</DialogDescription>
        </DialogHeader>

        {/*
          min-h-0 on the grid and every scrolling child, or the panes grow the
          dialog past the viewport instead of scrolling inside it.
        */}
        <div className="grid min-h-0 flex-1 grid-cols-[11rem_1fr] lg:grid-cols-[11rem_1fr_17rem]">
          <WizardRail
            draft={draft}
            steps={steps}
            current={step}
            onGo={setStep}
          />

          <ScrollArea className="min-h-0 min-w-0">
            <div className="p-5">
              {step === 'name' && (
                <NameStep draft={draft} onChange={setDraft} />
              )}
              {step === 'race' && (
                <RaceStep draft={draft} onChange={setDraft} />
              )}
              {step === 'class' && (
                <ClassStep draft={draft} onChange={setDraft} />
              )}
              {step === 'abilities' && (
                <AbilitiesStep draft={draft} onChange={setDraft} />
              )}
              {step === 'background' && (
                <BackgroundStep draft={draft} onChange={setDraft} />
              )}
              {step === 'skills' && (
                <SkillsStep draft={draft} onChange={setDraft} />
              )}
              {step === 'spells' && (
                <SpellsStep
                  worldId={worldId}
                  draft={draft}
                  onChange={setDraft}
                />
              )}
              {step === 'equipment' && (
                <EquipmentStep draft={draft} onChange={setDraft} />
              )}
              {step === 'review' && (
                <ReviewStep draft={draft} onChange={setDraft} />
              )}
            </div>
          </ScrollArea>

          {/*
            The summary is the first thing to go when the window is narrow.
            h-full is load-bearing: the panel scrolls itself, and without a
            bound height it grows to fit its content and spills past the
            dialog's footer instead.
          */}
          <div className="hidden h-full min-h-0 min-w-0 lg:block">
            <WizardSummary draft={draft} />
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t px-5 py-3 sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={index === 0 || pending}
              onClick={() => go(-1)}
            >
              <ChevronLeft /> Back
            </Button>
            {step === 'name' && (
              <Button
                variant="ghost"
                size="sm"
                disabled={!canAdvance(draft, 'name') || pending}
                onClick={() => skip.mutate(draft.name)}
                title="Create a blank sheet and fill it in yourself"
              >
                Skip setup
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {error && (
              <p className="text-destructive text-sm">{error.message}</p>
            )}
            {isLast ? (
              <Button
                disabled={!canAdvance(draft, 'name') || pending}
                onClick={() => create.mutate(draft)}
              >
                <Sparkles /> Create character
              </Button>
            ) : (
              <Button disabled={!ready || pending} onClick={() => go(1)}>
                Next <ChevronRight />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
