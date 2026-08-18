import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ABILITIES, ABILITY_NAMES } from '#/lib/character'
import type { Ability } from '#/lib/character'
import type { CharacterDraft } from '#/lib/characterDraft'
import {
  draftRace,
  draftSubrace,
  flexibleAsiSpec,
  picked,
} from '#/lib/characterDraft'
import type { RaceInfo, SubraceInfo } from '#/lib/srd'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { cn } from '#/lib/utils'
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

export function RaceStep({
  draft,
  onChange,
}: {
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  const race = draftRace(draft)
  const subrace = draftSubrace(draft)
  const flexible = flexibleAsiSpec(draft)
  const [creating, setCreating] = useState(false)

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
    })
  }

  const chooseSubrace = (next: SubraceInfo) => {
    const picks = { ...draft.picks }
    if (subrace) {
      for (const pick of subrace.grant.picks ?? []) delete picks[pick.id]
    }
    onChange({ ...draft, subraceName: next.name, picks })
  }

  const setFlexible = (ability: Ability, on: boolean) => {
    const next = { ...draft.flexibleAsi }
    if (on) next[ability] = flexible?.amount ?? 1
    else delete next[ability]
    onChange({ ...draft, flexibleAsi: next })
  }

  const traits = [
    ...(race?.grant.traits ?? []),
    ...(subrace?.grant.traits ?? []),
  ]
  const flexiblePlaced = Object.keys(draft.flexibleAsi).length
  const flexibleFull = flexible ? flexiblePlaced >= flexible.count : false

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
              detail={asiLabel(option.asi) || undefined}
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

      <div className="grid max-w-sm gap-2">
        <Label htmlFor="wizard-race-other">Or type your own</Label>
        <Input
          id="wizard-race-other"
          value={draft.raceName}
          placeholder="Homebrew race"
          onChange={(e) =>
            onChange({
              ...draft,
              raceName: e.target.value,
              subraceName: '',
              flexibleAsi: {},
            })
          }
        />
        {draft.raceName && !race && (
          <p className="text-muted-foreground text-xs">
            Not an SRD race — the name is kept as-is and you fill in the traits
            on the sheet.
          </p>
        )}
      </div>

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

      {flexible && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">
              Choose {flexible.count} abilities to raise by {flexible.amount}
            </span>
            <span
              className={
                flexibleFull
                  ? 'text-muted-foreground text-xs'
                  : 'text-xs font-medium text-amber-600 dark:text-amber-500'
              }
            >
              {flexiblePlaced} / {flexible.count}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ABILITIES.map((ability) => {
              const on = draft.flexibleAsi[ability] !== undefined
              // Half-Elf's two +1s can't go into the Charisma its race already
              // raised; Variant Human has no such restriction.
              const blocked = (race?.asi[ability] ?? 0) > 0
              return (
                <button
                  key={ability}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={blocked || (flexibleFull && !on)}
                  title={blocked ? 'Already raised by your race' : undefined}
                  onClick={() => setFlexible(ability, !on)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                    (blocked || (flexibleFull && !on)) &&
                      'cursor-not-allowed opacity-50 hover:bg-transparent',
                  )}
                >
                  {ABILITY_NAMES[ability]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {race?.grantsFeat && (
        <div className="grid max-w-sm gap-2">
          <Label htmlFor="wizard-feat">Feat</Label>
          <Input
            id="wizard-feat"
            value={draft.featName}
            placeholder="e.g. Alert, Lucky, Sharpshooter"
            onChange={(e) => onChange({ ...draft, featName: e.target.value })}
          />
          <p className="text-muted-foreground text-xs">
            Feats aren&rsquo;t in the SRD, so type the name and note the details
            on the sheet.
          </p>
        </div>
      )}

      {[...(race?.grant.picks ?? []), ...(subrace?.grant.picks ?? [])].map(
        (pick) => (
          <PickListGroup
            key={pick.id}
            pick={pick}
            chosen={picked(draft, pick.id)}
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
