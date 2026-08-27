import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { BackgroundInfo, ClassKit, FeatInfo, RaceInfo } from '#/lib/srd'
import type { Homebrew } from '#/lib/homebrew'
import {
  homebrewId,
  parseHomebrew,
  serializeHomebrew,
  upsert,
} from '#/lib/homebrew'
import { useHomebrew, useSaveHomebrew } from '#/lib/useHomebrew'
import {
  BackgroundEditor,
  blankBackground,
} from '#/components/settings/homebrew/BackgroundEditor'
import {
  ClassKitEditor,
  blankKit,
} from '#/components/settings/homebrew/ClassKitEditor'
import {
  FeatEditor,
  blankFeat,
} from '#/components/settings/homebrew/FeatEditor'
import {
  RaceEditor,
  blankRace,
} from '#/components/settings/homebrew/RaceEditor'
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

// Re-exported for the callers that imported it from here before it moved.
export { upsert }

export type HomebrewKind = 'race' | 'background' | 'kit' | 'feat'

/**
 * Create a race, class or background without leaving the wizard.
 *
 * Saves to the global store and hands the finished entry back, so the caller
 * can select it immediately and refresh the draft's captured tables — that
 * refresh is the *only* sanctioned one mid-build (see the ref in
 * CreateCharacterDialog), because anything else would wipe work in progress.
 *
 * The entry is round-tripped through the parser on save rather than stored as
 * typed: that is what assigns the derived ids and namespaces the pick ids, so
 * an inline entry is indistinguishable from one authored in settings.
 */
export function HomebrewDialog({
  kind,
  open,
  onClose,
  onCreated,
}: {
  kind: HomebrewKind
  open: boolean
  onClose: () => void
  onCreated: (entry: RaceInfo | BackgroundInfo | ClassKit | FeatInfo) => void
}) {
  const { data: stored } = useHomebrew()
  const save = useSaveHomebrew()
  const [race, setRace] = useState<RaceInfo>(blankRace)
  const [background, setBackground] = useState<BackgroundInfo>(blankBackground)
  const [kit, setKit] = useState<ClassKit>(blankKit)
  const [feat, setFeat] = useState<FeatInfo>(blankFeat)

  useEffect(() => {
    if (!open) return
    setRace(blankRace())
    setBackground(blankBackground())
    setKit(blankKit())
    setFeat(blankFeat())
  }, [open, kind])

  const entry =
    kind === 'race'
      ? race
      : kind === 'kit'
        ? kit
        : kind === 'feat'
          ? feat
          : background
  const name = entry.name.trim()
  const existing =
    kind === 'race'
      ? (stored?.races ?? [])
      : kind === 'kit'
        ? (stored?.kits ?? [])
        : kind === 'feat'
          ? (stored?.feats ?? [])
          : (stored?.backgrounds ?? [])
  const clash =
    name !== '' &&
    existing.some((e) => e.name.trim().toLowerCase() === name.toLowerCase())

  const create = () => {
    if (!stored || name === '') return
    const withId = { ...entry, id: homebrewId(name) }
    const next: Homebrew =
      kind === 'race'
        ? { ...stored, races: upsert(stored.races, withId as RaceInfo) }
        : kind === 'kit'
          ? { ...stored, kits: upsert(stored.kits, withId as ClassKit) }
          : kind === 'feat'
            ? { ...stored, feats: upsert(stored.feats, withId as FeatInfo) }
            : {
                ...stored,
                backgrounds: upsert(
                  stored.backgrounds,
                  withId as BackgroundInfo,
                ),
              }
    save.mutate(next, {
      onSuccess: (saved) => {
        // Hand back the *parsed* entry, not the draft: the parser is what
        // normalises ids and drops unusable rows, so this is what actually
        // landed on disk.
        const normalised = parseHomebrew(serializeHomebrew(saved))
        const list: Array<RaceInfo | BackgroundInfo | ClassKit | FeatInfo> =
          kind === 'race'
            ? normalised.races
            : kind === 'kit'
              ? normalised.kits
              : kind === 'feat'
                ? normalised.feats
                : normalised.backgrounds
        const created = list.find(
          (e) => e.name.trim().toLowerCase() === name.toLowerCase(),
        )
        if (created) onCreated(created)
        onClose()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[min(40rem,88vh)] w-[min(44rem,94vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>
            New {kind === 'kit' ? 'class' : kind}
          </DialogTitle>
          <DialogDescription>
            Saved to your homebrew and offered in every world.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <div className="p-5">
            {kind === 'race' ? (
              <RaceEditor race={race} onChange={setRace} />
            ) : kind === 'kit' ? (
              <ClassKitEditor
                kit={kit}
                classNames={existing.map((e) => e.name)}
                onChange={setKit}
              />
            ) : kind === 'feat' ? (
              <FeatEditor feat={feat} onChange={setFeat} />
            ) : (
              <BackgroundEditor
                background={background}
                onChange={setBackground}
              />
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row items-center justify-between border-t px-5 py-3 sm:justify-between">
          <div className="text-xs">
            {clash && (
              <span className="text-amber-600 dark:text-amber-500">
                You already have a {kind === 'kit' ? 'class' : kind} called
                &ldquo;{name}&rdquo; — saving replaces it.
              </span>
            )}
            {save.error && (
              <span className="text-destructive">{save.error.message}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={name === '' || save.isPending}
              onClick={create}
            >
              <Sparkles /> Save and use
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
