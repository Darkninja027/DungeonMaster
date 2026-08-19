import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'
import type { Character } from '#/lib/character'
import type { LevelUpDraft, LevelUpStepId } from '#/lib/levelUp'
import {
  applyLevelUp,
  canAdvance,
  emptyLevelUpDraft,
  levelUpSteps,
} from '#/lib/levelUp'
import { findKit } from '#/lib/tables'
import { useTables } from '#/lib/useHomebrew'
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
import { cn } from '#/lib/utils'
import { LevelUpSummary } from './LevelUpSummary'
import {
  AsiStep,
  FeaturesStep,
  HpStep,
  ReviewStep,
  SpellsStep,
  SubclassStep,
} from './steps'

const STEP_HEADINGS: Record<LevelUpStepId, { title: string; blurb: string }> = {
  hp: { title: 'Hit points', blurb: 'Roll, average, or type your own.' },
  features: { title: 'Features', blurb: 'What your class gains.' },
  subclass: { title: 'Subclass', blurb: 'Time to choose.' },
  asi: {
    title: 'Ability Score Improvement',
    blurb: 'Two points, or a feat instead.',
  },
  spells: { title: 'Spells', blurb: 'Your slots for the new level.' },
  review: { title: 'Review', blurb: 'Everything this will change.' },
}

const STEP_TITLES: Record<LevelUpStepId, string> = {
  hp: 'Hit points',
  features: 'Features',
  subclass: 'Subclass',
  asi: 'Ability scores',
  spells: 'Spells',
  review: 'Review',
}

/**
 * Levelling an existing character.
 *
 * Owns the draft; **nothing reaches the sheet until Apply**, and even then it
 * only ever adds — see the invariant on `applyLevelUp`. Closing halfway leaves
 * the character exactly as it was, not even marked dirty.
 *
 * Commit is one `onApply(applyLevelUp(...))` call, which the character route
 * turns into its usual `update()` — no new mutation, no new save path.
 */
export function LevelUpDialog({
  worldId,
  character,
  /** The level being levelled *to*; null closes the dialog. */
  toLevel,
  onClose,
  onApply,
}: {
  worldId: string
  character: Character
  toLevel: number | null
  onClose: () => void
  onApply: (next: Character) => void
}) {
  const tables = useTables(worldId)
  const kit = useMemo(
    () => findKit(tables.kits, character.class),
    [tables.kits, character.class],
  )

  const [draft, setDraft] = useState<LevelUpDraft | null>(null)
  const [step, setStep] = useState<LevelUpStepId>('hp')

  /**
   * A fresh draft each time the dialog opens for a new target level.
   *
   * Keyed on `toLevel` alone, deliberately: `kit` re-memoises whenever homebrew
   * refetches, and `character` changes on every keystroke elsewhere on the
   * sheet — depending on either would throw away an in-progress level-up. Both
   * are read through a ref, and the draft then holds the character as its own
   * `base` so nothing downstream reads the live one.
   */
  const seedRef = useRef({ character, kit, feats: tables.feats })
  seedRef.current = { character, kit, feats: tables.feats }

  useEffect(() => {
    if (toLevel === null) return
    const { character: c, kit: k, feats } = seedRef.current
    setDraft(emptyLevelUpDraft(c, toLevel, k, feats))
    setStep('hp')
  }, [toLevel])

  /**
   * Adopt the tables if they arrive after the dialog opened.
   *
   * `useTables` merges homebrew with world settings, and either query can still
   * be in flight on the first render — seeding then gives a draft with no kit,
   * which silently means no features, no ASI and no subclass step. Reseeding
   * once they resolve is the difference between "this class grants nothing"
   * and "we asked too early".
   *
   * Guarded on the draft still *missing* what arrived, so this can only ever
   * fill a gap and never discard choices already made. Note it checks the kit
   * and the feats independently: a guard that only asked about the kit would
   * leave the feat datalist permanently empty whenever the kit happened to
   * resolve first, which is exactly the shape of bug this comment exists for.
   */
  useEffect(() => {
    if (toLevel === null) return
    setDraft((current) => {
      if (!current) return current
      const needsKit = !current.kit && kit !== undefined
      const needsFeats = current.feats.length === 0 && tables.feats.length > 0
      if (!needsKit && !needsFeats) return current
      return emptyLevelUpDraft(
        current.base,
        current.to,
        current.kit ?? kit,
        current.feats.length > 0 ? current.feats : tables.feats,
      )
    })
  }, [toLevel, kit, tables.feats])

  const steps = useMemo(() => (draft ? levelUpSteps(draft) : []), [draft])
  const index = steps.indexOf(step)
  const isLast = index === steps.length - 1
  const ready = draft ? canAdvance(draft, step) : false

  const go = (delta: number) => {
    const next = index + delta
    if (next < 0 || next >= steps.length) return
    setStep(steps[next])
  }

  return (
    <Dialog open={toLevel !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[min(42rem,90vh)] w-[min(64rem,95vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>
            {draft
              ? `Level ${draft.from} → ${draft.to}: ${STEP_HEADINGS[step].title}`
              : 'Level up'}
          </DialogTitle>
          <DialogDescription>{STEP_HEADINGS[step].blurb}</DialogDescription>
        </DialogHeader>

        {draft && (
          <>
            {/* min-h-0 on the grid and every scrolling child, or the panes grow
                the dialog past the viewport instead of scrolling inside it. */}
            <div className="grid min-h-0 flex-1 grid-cols-[10rem_1fr] lg:grid-cols-[10rem_1fr_17rem]">
              <nav className="flex h-full min-h-0 flex-col gap-0.5 overflow-y-auto border-r p-2">
                {steps.map((id, i) => {
                  const reachable =
                    i <= index ||
                    steps.slice(0, i).every((s) => canAdvance(draft, s))
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!reachable}
                      onClick={() => setStep(id)}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                        id === step && 'bg-accent font-medium',
                        id !== step && reachable && 'hover:bg-accent/50',
                        !reachable && 'cursor-not-allowed opacity-40',
                      )}
                    >
                      <span className="text-muted-foreground text-[10px] tabular-nums">
                        {i + 1}
                      </span>
                      <span className="min-w-0 truncate">
                        {STEP_TITLES[id]}
                      </span>
                    </button>
                  )
                })}
              </nav>

              <ScrollArea className="min-h-0 min-w-0">
                <div className="p-5">
                  {step === 'hp' && (
                    <HpStep
                      character={draft.base}
                      draft={draft}
                      onChange={setDraft}
                    />
                  )}
                  {step === 'features' && (
                    <FeaturesStep
                      character={draft.base}
                      draft={draft}
                      onChange={setDraft}
                    />
                  )}
                  {step === 'subclass' && (
                    <SubclassStep
                      character={draft.base}
                      draft={draft}
                      onChange={setDraft}
                    />
                  )}
                  {step === 'asi' && (
                    <AsiStep
                      character={draft.base}
                      draft={draft}
                      onChange={setDraft}
                    />
                  )}
                  {step === 'spells' && (
                    <SpellsStep character={draft.base} draft={draft} />
                  )}
                  {step === 'review' && (
                    <ReviewStep character={draft.base} draft={draft} />
                  )}
                </div>
              </ScrollArea>

              <div className="hidden h-full min-h-0 min-w-0 lg:block">
                <LevelUpSummary character={draft.base} draft={draft} />
              </div>
            </div>

            <DialogFooter className="flex-row items-center justify-between border-t px-5 py-3 sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => go(-1)}
              >
                <ChevronLeft /> Back
              </Button>
              {isLast ? (
                <Button
                  onClick={() => {
                    onApply(applyLevelUp(draft.base, draft))
                    onClose()
                  }}
                >
                  <TrendingUp /> Apply
                </Button>
              ) : (
                <Button disabled={!ready} onClick={() => go(1)}>
                  Next <ChevronRight />
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
