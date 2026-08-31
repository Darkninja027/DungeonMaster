import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ABILITIES, ABILITY_NAMES } from '#/lib/character'
import type { Ability } from '#/lib/character'
import type { CharacterDraft } from '#/lib/characterDraft'
import {
  assignFlexibleSlot,
  chosenFlexibleMode,
  draftFeat,
  draftRace,
  draftSubrace,
  flexibleAsiComplete,
  flexibleAsiSpec,
  flexibleSlotAbilities,
  grantedFor,
  picked,
  refitFlexibleAsi,
} from '#/lib/characterDraft'
import type { FeatInfo, RaceInfo, SubraceInfo } from '#/lib/srd'
import { describeFlexibleAsi, describeMode } from '#/lib/srd'
import { Combobox } from '#/components/ui/combobox'
import { Label } from '#/components/ui/label'
import { OptionCard } from '../OptionCard'
import { HomebrewDialog } from '../HomebrewDialog'
import { PickListGroup } from '../PickListGroup'

/**
 * "+2 CON, +1 WIS" for an option card's detail line.
 *
 * The Human raises all six by 1, which spelled out is "+1 STR, +1 DEX, +1 CON,
 * +1 INT, +1 WIS, +1 CHA" — three times the width of any other race's label and
 * not how anyone says it out loud. Collapse that case.
 */
function asiLabel(asi: Partial<Record<Ability, number>>): string {
  const entries = Object.entries(asi)
  if (entries.length === ABILITIES.length) {
    const amounts = new Set(entries.map(([, value]) => value))
    if (amounts.size === 1) return `+${entries[0][1]} to every ability`
  }
  return entries
    .map(([key, value]) => `+${value} ${key.toUpperCase()}`)
    .join(', ')
}

/**
 * The whole increase for a race card, fixed part and chosen part.
 *
 * A Variant Human's card was blank here for as long as this only read `asi` —
 * tolerable for one race, but a race whose entire increase is the choice would
 * have had a card that looked broken.
 */
function raceAsiLabel(race: RaceInfo): string {
  return [asiLabel(race.asi), describeFlexibleAsi(race.flexibleAsi)]
    .filter((part) => part !== '')
    .join(', ')
}

export function RaceStep({
  draft,
  onChange,
}: {
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  const race = draftRace(draft)
  const feat = draftFeat(draft)
  const subrace = draftSubrace(draft)
  const modes = flexibleAsiSpec(draft)
  const mode = chosenFlexibleMode(draft)
  const [creating, setCreating] = useState(false)
  const [creatingFeat, setCreatingFeat] = useState(false)

  /**
   * Same snapshot reasoning as `adoptCreated` below: the draft holds its own
   * copy of the feat table, so a feat invented here has to be added to it or it
   * won't appear in the datalist until the wizard is reopened.
   */
  const adoptCreatedFeat = (created: FeatInfo) => {
    const feats = [
      ...draft.feats.filter(
        (f) =>
          f.name.trim().toLowerCase() !== created.name.trim().toLowerCase(),
      ),
      created,
    ]
    onChange({ ...draft, feats, featName: created.name })
  }

  /**
   * A race created inline is added to the draft's captured table as well as to
   * the global store — the capture is deliberately a snapshot, so without this
   * the new race wouldn't appear until the wizard was reopened.
   */
  const adoptCreated = (created: RaceInfo) => {
    const races = [
      ...draft.races.filter(
        (r) =>
          r.name.trim().toLowerCase() !== created.name.trim().toLowerCase(),
      ),
      created,
    ]
    onChange({
      ...draft,
      races,
      raceName: created.name,
      subraceName: '',
      flexibleAsi: {},
      flexibleAsiMode: 0,
    })
  }

  const chooseRace = (next: RaceInfo) => {
    // Clearing the subrace and any race-scoped picks: they belong to the race
    // being replaced, and carrying them over would silently keep a Dwarf's
    // tool proficiency on an Elf.
    const picks = { ...draft.picks }
    for (const pick of race?.grant.picks ?? []) delete picks[pick.id]
    for (const sub of race?.subraces ?? []) {
      for (const pick of sub.grant.picks ?? []) delete picks[pick.id]
    }
    onChange({
      ...draft,
      raceName: next.name,
      subraceName: '',
      picks,
      flexibleAsi: {},
      flexibleAsiMode: 0,
    })
  }

  const chooseSubrace = (next: SubraceInfo) => {
    const picks = { ...draft.picks }
    if (subrace) {
      for (const pick of subrace.grant.picks ?? []) delete picks[pick.id]
    }
    onChange({ ...draft, subraceName: next.name, picks })
  }

  /** Switching mode keeps the abilities chosen and resizes them; see `refitFlexibleAsi`. */
  const chooseMode = (index: number) => {
    const next = modes?.[index]
    if (!next) return
    onChange({
      ...draft,
      flexibleAsiMode: index,
      flexibleAsi: refitFlexibleAsi(draft.flexibleAsi, next),
    })
  }

  const traits = [
    ...(race?.grant.traits ?? []),
    ...(subrace?.grant.traits ?? []),
  ]
  const slotAbilities = mode
    ? flexibleSlotAbilities(draft.flexibleAsi, mode)
    : []
  const flexiblePlaced = slotAbilities.filter((a) => a !== undefined).length
  // One authority for "is this done" — `flexibleAsiComplete`. This used to
  // count keys while that summed values, which agreed only while every slot was
  // the same size and stopped agreeing the moment a mode mixed them.
  const flexibleFull = flexibleAsiComplete(draft)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-medium">Race</h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {draft.races.map((option) => (
            <OptionCard
              key={option.id}
              title={option.name}
              description={option.summary}
              detail={raceAsiLabel(option) || undefined}
              selected={draft.raceName === option.name}
              onSelect={() => chooseRace(option)}
            />
          ))}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="hover:bg-accent/50 flex items-center justify-center gap-1.5 rounded-md border border-dashed p-2 text-sm transition-colors"
          >
            <Sparkles className="size-3.5" /> Create a race
          </button>
        </div>
      </div>

      <HomebrewDialog
        kind="race"
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => adoptCreated(created as RaceInfo)}
      />

      <HomebrewDialog
        kind="feat"
        open={creatingFeat}
        onClose={() => setCreatingFeat(false)}
        onCreated={(created) => adoptCreatedFeat(created as FeatInfo)}
      />

      {race?.subraces && race.subraces.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">
            Subrace <span className="text-destructive">*</span>
          </h3>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {race.subraces.map((option) => (
              <OptionCard
                key={option.id}
                title={option.name}
                description={option.summary}
                detail={asiLabel(option.asi) || undefined}
                selected={draft.subraceName === option.name}
                onSelect={() => chooseSubrace(option)}
              />
            ))}
          </div>
        </div>
      )}

      {mode && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">
              {modes && modes.length > 1
                ? 'Ability score increase'
                : describeMode(mode)}
            </span>
            <span
              className={
                flexibleFull
                  ? 'text-muted-foreground text-xs'
                  : 'text-xs font-medium text-amber-600 dark:text-amber-500'
              }
            >
              {flexiblePlaced} / {mode.increases.length}
            </span>
          </div>

          {/* Only a race offering a real choice gets a selector; for the one-mode
              races this is absent and the control below reads as it always did. */}
          {modes && modes.length > 1 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {modes.map((option, index) => (
                <OptionCard
                  key={option.label ?? index}
                  title={describeMode(option)}
                  description={`Raise ${option.increases.length} abilities.`}
                  selected={draft.flexibleAsiMode === index}
                  onSelect={() => chooseMode(index)}
                />
              ))}
            </div>
          )}

          {/* Literal slots, one row each. The alternative — chips that quietly
              take the largest increase going — hides the actual choice inside
              click order, which is unguessable the first time you meet it. */}
          <div className="space-y-1.5">
            {slotAbilities.map((held, slot) => {
              const amount = mode.increases[slot]
              return (
                <div key={slot} className="flex items-center gap-2 text-sm">
                  <span className="w-8 font-medium tabular-nums">
                    +{amount}
                  </span>
                  <span className="text-muted-foreground text-xs">to</span>
                  <select
                    value={held ?? ''}
                    aria-label={`Ability to raise by ${amount}`}
                    className="border-input bg-background h-8 min-w-40 rounded-md border px-2 text-sm"
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        flexibleAsi: assignFlexibleSlot(
                          draft.flexibleAsi,
                          mode,
                          slot,
                          e.target.value
                            ? (e.target.value as Ability)
                            : undefined,
                        ),
                      })
                    }
                  >
                    <option value="">Choose an ability…</option>
                    {ABILITIES.map((ability) => {
                      // Half-Elf's +1s can't go into the Charisma its race
                      // already raised. An ability held by *another* slot stays
                      // listed: picking it moves it, which is more forgiving
                      // than making the player clear the old slot first.
                      const blocked = (race?.asi[ability] ?? 0) > 0
                      return (
                        <option
                          key={ability}
                          value={ability}
                          disabled={blocked}
                        >
                          {ABILITY_NAMES[ability]}
                          {blocked ? ' — already raised by your race' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {race?.grantsFeat && (
        <div className="grid max-w-sm gap-2">
          <Label htmlFor="wizard-feat">Feat</Label>
          {/*
            Suggestions only — a name that matches nothing is still accepted and
            still reaches the sheet, exactly as it did before there was a list.
            A combobox rather than a datalist because there are ~85 built-in
            feats now, well past where the native popup stops scrolling.
          */}
          <Combobox
            id="wizard-feat"
            value={draft.featName}
            options={draft.feats.map((f) => f.name)}
            onCommit={(featName) => onChange({ ...draft, featName })}
            placeholder="e.g. Alert, Lucky, Sharpshooter"
          />
          <button
            type="button"
            onClick={() => setCreatingFeat(true)}
            className="hover:bg-accent/50 flex items-center justify-center gap-1.5 self-start rounded-md border border-dashed px-2 py-1 text-xs transition-colors"
          >
            <Sparkles className="size-3.5" /> Create a feat
          </button>
          <p className="text-muted-foreground text-xs">
            {feat ? (
              <>
                {feat.summary || `Grants what ${feat.name} grants.`}
                {feat.prerequisite !== undefined &&
                  ` · Prerequisite: ${feat.prerequisite}`}
              </>
            ) : draft.feats.length === 0 ? (
              <>
                Feats aren&rsquo;t in the SRD. Type a name and note the details
                on the sheet, or add feats in Settings &rsaquo; Homebrew to pick
                them here.
              </>
            ) : (
              <>
                Pick one of yours, or type any name — an unknown feat still
                lands on the sheet.
              </>
            )}
          </p>
        </div>
      )}

      {[...(race?.grant.picks ?? []), ...(subrace?.grant.picks ?? [])].map(
        (pick) => (
          <PickListGroup
            key={pick.id}
            pick={pick}
            chosen={picked(draft, pick.id)}
            // The same greying the Skills step does. These are the very same
            // pick objects rendered a second time, sharing `draft.picks`, so
            // without this a language your race already grants was selectable
            // here and greyed out there.
            alreadyGranted={grantedFor(draft, pick.kind, pick.id)}
            onChange={(values) =>
              onChange({
                ...draft,
                picks: { ...draft.picks, [pick.id]: values },
              })
            }
          />
        ),
      )}

      {/*
        Gated on there being traits, not on a race being chosen: a homebrew race
        may legitimately have none, and a bare "Traits" heading over empty space
        reads as something that failed to load.
      */}
      {traits.length > 0 && (
        <div className="text-muted-foreground space-y-1 text-sm">
          <h4 className="text-foreground text-sm font-medium">Traits</h4>
          {traits.map((trait) => (
            <p key={trait.name}>
              <span className="text-foreground font-medium">{trait.name}.</span>{' '}
              {trait.text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
