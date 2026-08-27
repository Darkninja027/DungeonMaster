import { Dices } from 'lucide-react'
import { abilityMod } from '#/lib/character'
import type { Ability, Character } from '#/lib/character'
import type { AsiChoice, LevelUpDraft } from '#/lib/levelUp'
import {
  ASI_HYBRID_POINTS,
  ASI_POINTS,
  abilitiesBefore,
  asiHeadroom,
  asiLevelsCrossed,
  asiUnlocked,
  asiPointsFor,
  averageHitDie,
  chooseSubclass,
  eligibleExpertiseAt,
  featsAvailable,
  firstIncompleteAsi,
  featuresGained,
  grantedAlreadyAt,
  hpGained,
  levelUpPicks,
  levelUpPlan,
  pickedAt,
  resourcesOffered,
  levelsGained,
  slotsAtLevel,
} from '#/lib/levelUp'
import { findFeat, spellListClass } from '#/lib/tables'
import { useSpellSuggestions } from '#/lib/useGlobalLibrary'
import { PickListGroup } from '../create/PickListGroup'
import { SpellList } from '../create/steps/SpellsStep'
import { AbilityStepperRow } from '../AbilityStepperRow'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Combobox } from '#/components/ui/combobox'
import { cn } from '#/lib/utils'
import { OptionCard } from '#/components/character/create/OptionCard'

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/** One d(size), for the hit-point roll. */
function rollDie(size: number): number {
  return Math.floor(Math.random() * size) + 1
}

export function HpStep({
  character,
  draft,
  onChange,
}: {
  character: Character
  draft: LevelUpDraft
  onChange: (next: LevelUpDraft) => void
}) {
  const die = character.hitDice.size
  const con = abilityMod(character.abilities.con)
  const levels = levelsGained(draft.from, draft.to)
  const gained = hpGained(character, draft)

  const setMethod = (method: LevelUpDraft['hp']['method']) =>
    onChange({ ...draft, hp: { ...draft.hp, method } })

  const rollAll = () =>
    onChange({
      ...draft,
      hp: { ...draft.hp, rolls: levels.map(() => rollDie(die)) },
    })

  const rollOne = (i: number) =>
    onChange({
      ...draft,
      hp: {
        ...draft.hp,
        rolls: draft.hp.rolls.map((r, j) => (j === i ? rollDie(die) : r)),
      },
    })

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Each level adds a d{die}
        {con !== 0 && <> plus your Constitution modifier ({signed(con)})</>}.
        {con < 0 && ' A level never gains you less than 1 hit point.'}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <OptionCard
          title="Average"
          description={`Take ${averageHitDie(die)} per level — the usual table rule.`}
          selected={draft.hp.method === 'average'}
          onSelect={() => setMethod('average')}
        />
        <OptionCard
          title="Roll"
          description={`Roll a d${die} for each level.`}
          selected={draft.hp.method === 'roll'}
          onSelect={() => setMethod('roll')}
        />
        <OptionCard
          title="Enter a total"
          description="Type the number yourself."
          selected={draft.hp.method === 'manual'}
          onSelect={() => setMethod('manual')}
        />
      </div>

      {draft.hp.method === 'roll' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {levels.map((level, i) => {
              const roll = draft.hp.rolls[i] ?? null
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => rollOne(i)}
                  title={`Reroll level ${level}`}
                  className={cn(
                    'flex w-20 flex-col items-center rounded-md border p-1.5 transition-colors',
                    roll === null ? 'border-dashed' : 'hover:bg-accent',
                  )}
                >
                  <span className="text-muted-foreground text-[10px]">
                    Level {level}
                  </span>
                  <span className="text-lg leading-none font-semibold tabular-nums">
                    {roll ?? '—'}
                  </span>
                  {roll !== null && (
                    <span className="text-muted-foreground mt-0.5 text-[10px]">
                      {roll} {signed(con)} = {Math.max(1, roll + con)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <Button variant="outline" size="sm" onClick={rollAll}>
            <Dices />{' '}
            {draft.hp.rolls.some((r) => r !== null) ? 'Reroll all' : 'Roll'}
          </Button>
        </div>
      )}

      {draft.hp.method === 'manual' && (
        <label className="flex items-center gap-2 text-sm">
          Hit points gained
          <Input
            value={String(draft.hp.manual)}
            inputMode="numeric"
            className="h-8 w-20 text-center"
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange({
                ...draft,
                hp: {
                  ...draft.hp,
                  manual: Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0,
                },
              })
            }}
          />
        </label>
      )}

      <p className="text-sm">
        Hit point maximum{' '}
        <span className="text-muted-foreground">{character.hp.max}</span>
        <span className="text-muted-foreground mx-1.5">→</span>
        <strong className="text-emerald-700 dark:text-emerald-400">
          {character.hp.max + gained}
        </strong>
      </p>
    </div>
  )
}

export function FeaturesStep({
  character,
  draft,
  onChange,
}: {
  character: Character
  draft: LevelUpDraft
  onChange: (next: LevelUpDraft) => void
}) {
  const offered = featuresGained(
    character,
    draft.from,
    draft.to,
    draft.kit,
    draft.subclassName || character.subclass,
  )
  const taking = new Set(draft.takeFeatures.map((n) => n.trim().toLowerCase()))

  const toggle = (name: string) => {
    const key = name.trim().toLowerCase()
    onChange({
      ...draft,
      takeFeatures: taking.has(key)
        ? draft.takeFeatures.filter((n) => n.trim().toLowerCase() !== key)
        : [...draft.takeFeatures, name],
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        What your class gains across these levels. All optional — untick
        anything you don&rsquo;t want on the sheet.
      </p>
      {offered.map((feature) => {
        const on = taking.has(feature.name.trim().toLowerCase())
        return (
          <button
            key={`${feature.level}:${feature.name}`}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(feature.name)}
            className={cn(
              'block w-full rounded-md border p-2 text-left transition-colors',
              on ? 'border-primary bg-accent' : 'hover:bg-accent/50 opacity-60',
            )}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{feature.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                Level {feature.level}
              </span>
            </span>
            {feature.text && (
              <span className="text-muted-foreground mt-0.5 block text-xs">
                {feature.text}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function SubclassStep({
  character,
  draft,
  onChange,
}: {
  character: Character
  draft: LevelUpDraft
  onChange: (next: LevelUpDraft) => void
}) {
  const options = draft.kit?.subclasses ?? []
  const label = draft.kit?.subclassLabel ?? 'Subclass'

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        A {character.class} chooses their {label.toLowerCase()} at this level.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((sub) => (
          <OptionCard
            key={sub.id}
            title={sub.name}
            description={sub.summary}
            selected={draft.subclassName === sub.name}
            onSelect={() => onChange(chooseSubclass(draft, sub.name))}
          />
        ))}
      </div>
      <label className="grid max-w-sm gap-1.5 text-sm">
        Or type your own
        {/*
          A plain input, not a select: subclass is free text on the sheet and
          always has been, so homebrew must stay typeable here too.
        */}
        <Input
          value={draft.subclassName}
          placeholder={label}
          onChange={(e) => onChange(chooseSubclass(draft, e.target.value))}
        />
      </label>
    </div>
  )
}

export function AsiStep({
  character,
  draft,
  onChange,
}: {
  character: Character
  draft: LevelUpDraft
  onChange: (next: LevelUpDraft) => void
}) {
  const levels = asiLevelsCrossed(draft.from, draft.to, draft.kit)

  /**
   * Switching kind re-budgets the points already placed. Going from two points
   * to the house rule's one has to drop something, and silently keeping both
   * would leave the step gated on a total it no longer accepts — so trim from
   * the end and let the player re-place.
   */
  const setKind = (level: number, kind: AsiChoice['kind']) => {
    const current = draft.asi[level] ?? {
      kind: 'abilities' as const,
      abilities: {},
      featName: '',
    }
    const budget = asiPointsFor(kind)
    const abilities: Partial<Record<Ability, number>> = {}
    let spent = 0
    for (const [ability, points] of Object.entries(current.abilities)) {
      const room = Math.min(points, budget - spent)
      if (room <= 0) continue
      abilities[ability as Ability] = room
      spent += room
    }
    patch(level, { kind, abilities })
  }

  const patch = (level: number, changes: Partial<AsiChoice>) =>
    onChange({
      ...draft,
      asi: {
        ...draft.asi,
        [level]: {
          ...(draft.asi[level] ?? {
            kind: 'abilities',
            abilities: {},
            featName: '',
          }),
          ...changes,
        },
      },
    })

  return (
    <div className="space-y-5">
      {levels.map((level) => {
        const before = abilitiesBefore(draft, level)
        const choice = draft.asi[level] ?? {
          kind: 'abilities' as const,
          abilities: {},
          featName: '',
        }
        // Locked until every earlier ASI is settled. A later level's numbers
        // are a claim about what your scores will be when you reach it, and
        // that answer moves while an earlier level is still being edited —
        // filling them out of order meant watching your own choices rewrite
        // themselves above you.
        const unlocked = asiUnlocked(draft, level)
        // What this level can actually ask for. Normally the full 2, but a
        // character whose scores are all at 20 has nowhere to put them, and
        // demanding two would leave Next dead with nothing to click.
        const wanted = Math.min(
          asiPointsFor(choice.kind),
          asiHeadroom(draft, level),
        )
        const placed = Object.values(choice.abilities).reduce<number>(
          (sum, n) => sum + n,
          0,
        )
        const step = (ability: Ability, delta: number) => {
          const next = { ...choice.abilities }
          const value = (next[ability] ?? 0) + delta
          if (value <= 0) delete next[ability]
          else next[ability] = value
          patch(level, { abilities: next })
        }
        return (
          <div
            key={level}
            className={cn('space-y-2', !unlocked && 'opacity-50')}
            // Dimmed *and* inert: opacity alone still lets a click through, and
            // a control that looks unavailable but answers anyway is worse than
            // one that plainly is not there.
            aria-disabled={!unlocked || undefined}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium">
                Level {level} — Ability Score Improvement
              </h3>
              {!unlocked ? (
                <span className="text-muted-foreground text-xs">
                  Finish level {firstIncompleteAsi(draft)} first
                </span>
              ) : (
                choice.kind !== 'feat' && (
                  <span
                    className={
                      placed === wanted
                        ? 'text-muted-foreground text-xs'
                        : 'text-xs font-medium text-amber-600 dark:text-amber-500'
                    }
                  >
                    {placed} / {wanted}
                  </span>
                )
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <OptionCard
                title="Raise ability scores"
                description={`Add ${ASI_POINTS} points, split as you like.`}
                selected={choice.kind === 'abilities'}
                disabled={!unlocked}
                onSelect={() => setKind(level, 'abilities')}
              />
              <OptionCard
                title="Take a feat"
                description="Type its name; note the details on the sheet."
                selected={choice.kind === 'feat'}
                disabled={!unlocked}
                onSelect={() => setKind(level, 'feat')}
              />
              <OptionCard
                title={`+${ASI_HYBRID_POINTS} and a feat`}
                description="A common house rule — one point and a feat."
                selected={choice.kind === 'both'}
                disabled={!unlocked}
                onSelect={() => setKind(level, 'both')}
              />
            </div>

            {choice.kind !== 'feat' && (
              <AbilityStepperRow
                state={(ability) => {
                  const points = choice.abilities[ability] ?? 0
                  // What the score is *by the time this level is reached* —
                  // the character's own plus everything spent at earlier ASI
                  // levels in this same level-up. Reading `character` directly
                  // showed every ASI the starting score, so a Fighter's five
                  // could each "raise Strength 16 -> 18" while the summary
                  // correctly totalled 20.
                  const score = before[ability]
                  // 20 is the RAW cap an ASI can raise a score to.
                  const capped = score + points >= 20
                  return {
                    value: points,
                    before: score,
                    canRaise: unlocked && placed < wanted && !capped,
                    canLower: unlocked && points > 0,
                    title: capped ? 'Already at 20' : undefined,
                  }
                }}
                onStep={step}
              />
            )}

            {choice.kind !== 'abilities' && (
              <>
                {/*
                  Suggestions only; any name is still accepted. Feats the
                  character already has, or has taken at another ASI level
                  in this same level-up, are left out: feats are not
                  repeatable, and `applyLevelUp` would drop the duplicate,
                  spending the ASI on nothing.
                */}
                <Combobox
                  value={choice.featName}
                  options={featsAvailable(character, draft, level).map(
                    (f) => f.name,
                  )}
                  disabled={!unlocked}
                  onCommit={(featName) => patch(level, { featName })}
                  placeholder="e.g. Sharpshooter"
                  className="h-8 max-w-sm"
                />
                {(() => {
                  const feat = findFeat(draft.feats, choice.featName)
                  if (!feat) return null
                  return (
                    <p className="text-muted-foreground text-xs">
                      {feat.summary || `Grants what ${feat.name} grants.`}
                      {feat.prerequisite !== undefined &&
                        ` · Prerequisite: ${feat.prerequisite}`}
                    </p>
                  )
                })()}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Every choice this level-up poses, in one step.
 *
 * Renders through `PickListGroup` — the creation wizard's own control — so a
 * feat's picks look and behave identically whether they were answered at level
 * 1 or level 12. That symmetry is the point: the two paths diverging is what
 * made Skilled grant three proficiencies to a Variant Human and none to anybody
 * else.
 */
export function PicksStep({
  character,
  draft,
  onChange,
}: {
  character: Character
  draft: LevelUpDraft
  onChange: (next: LevelUpDraft) => void
}) {
  const picks = levelUpPicks(draft)
  const offers = resourcesOffered(draft)

  const setValues = (id: string, values: Array<string>) =>
    onChange({ ...draft, picks: { ...draft.picks, [id]: values } })

  const toggleResource = (name: string) => {
    const next = { ...draft.resources }
    if (next[name]) delete next[name]
    else {
      const offer = offers.find((o) => o.name === name)
      if (offer) {
        next[name] = offer.resets
          ? { total: offer.total, resets: offer.resets }
          : { total: offer.total }
      }
    }
    onChange({ ...draft, resources: next })
  }

  const setTotal = (name: string, total: number) => {
    const current = draft.resources[name]
    if (!current) return
    onChange({
      ...draft,
      resources: { ...draft.resources, [name]: { ...current, total } },
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">
        What your new feats and features let you choose. These land on the sheet
        with everything else when you apply.
      </p>

      {picks.map(({ pick, owner, ownerKind }) => (
        <PickListGroup
          key={pick.id}
          pick={pick}
          chosen={pickedAt(draft, pick.id)}
          source={ownerKind === 'feat' ? `the ${owner} feat` : owner}
          // Expertise doubles a proficiency, so the real answer set is this
          // character's own skills — including any granted moments ago by
          // another pick in this same step.
          options={
            pick.kind === 'expertise'
              ? eligibleExpertiseAt(character, draft, pick)
              : undefined
          }
          alreadyGranted={grantedAlreadyAt(character, draft, pick, picks)}
          suggestionsLabel={pick.kind === 'skillOrTool' ? 'Tools' : undefined}
          onChange={(values) => setValues(pick.id, values)}
        />
      ))}

      {offers.length > 0 && (
        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium">Trackers</p>
            <p className="text-muted-foreground text-xs">
              Counters these features imply. Add the ones you want to track on
              the sheet — the number is yours to change, now or later. A counter
              you already track is raised, never reset.
            </p>
          </div>
          {offers.map((offer) => {
            const kept = draft.resources[offer.name]
            return (
              <div
                key={offer.name}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={Boolean(kept)}
                  onClick={() => toggleResource(offer.name)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-left',
                    kept ? 'border-primary' : 'opacity-60',
                  )}
                >
                  {offer.name}
                  {/*
                    A raise reads as a change, not a new row: "Superiority Dice
                    4 -> 5" says what actually happens, where the bare name plus
                    a 5 looks like a counter the player is being asked to create
                    a second time.
                  */}
                  {offer.from !== undefined && (
                    <span className="text-muted-foreground">
                      {' '}
                      {offer.from} → {offer.total}
                    </span>
                  )}
                  {offer.resets && (
                    <span className="text-muted-foreground">
                      {' '}
                      · per {offer.resets} rest
                    </span>
                  )}
                </button>
                {kept && (
                  <Input
                    type="number"
                    min={0}
                    value={kept.total}
                    onChange={(e) =>
                      setTotal(offer.name, Math.max(0, Number(e.target.value)))
                    }
                    className="h-7 w-20 text-sm"
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function SpellsStep({
  worldId,
  character,
  draft,
  onChange,
}: {
  worldId: string
  character: Character
  draft: LevelUpDraft
  onChange: (next: LevelUpDraft) => void
}) {
  // The archetype in force, resolved exactly as `levelUpPlan` and
  // `levelUpSteps` do. Without it this reads the *class* table, and a Rogue has
  // none — so an Arcane Trickster reached this step (which gates on the
  // subclass table) and then saw an empty one.
  const castingAs = draft.subclassName || draft.base.subclass
  const before = slotsAtLevel(draft.kit, draft.from, castingAs) ?? []
  const after = slotsAtLevel(draft.kit, draft.to, castingAs) ?? []
  const plan = levelUpPlan(character, draft)
  const { cantripsToPick, spellsToPick, spellsGranted, alwaysPreparedGained } =
    plan
  // Every spell level the character now has slots for, not just the highest:
  // "a spell of a level for which you have spell slots" means a 7th-level
  // Arcane Trickster may learn a 1st *or* a 2nd level spell. `filterSpells`
  // keeps every entry that declares no level, so homebrew is never hidden.
  const highestSpellLevel = Math.max(1, after.length)
  // The list they cast *from*, not the class they are. An Arcane Trickster is a
  // Rogue casting wizard spells, and filtering by "Rogue" matched nothing at
  // all — every wizard spell's frontmatter says Wizard.
  const suggestionsFor = useSpellSuggestions(
    worldId,
    spellListClass(draft.kit, castingAs),
  )
  /**
   * Suggestions minus what the character already has, so a choice cannot be
   * spent on a spell they would get anyway.
   *
   * Covers both halves of "already": rows on the sheet, and rows this level-up
   * is about to grant but has not written yet — the archetype's Mage Hand only
   * lands at Apply. Typing one anyway is still harmless, since the commit
   * de-dupes; this just stops the list inviting it.
   */
  const offer = (level: number, upTo = false) => {
    const have = new Set([
      ...character.spells.map((sp) => sp.name.trim().toLowerCase()),
      ...spellsGranted.map((sp) => sp.name.trim().toLowerCase()),
      // Domain spells too — they land at Apply like the archetype's grant, and
      // spending a choice on one you are about to be given anyway is the same
      // waste.
      ...alwaysPreparedGained.map((sp) => sp.name.trim().toLowerCase()),
    ])
    return suggestionsFor(level, upTo).filter(
      (name) => !have.has(name.trim().toLowerCase()),
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Your spell slots for the new level. A slot you have already tuned higher
        than the table is left alone.
      </p>
      <div className="space-y-1">
        {after.map((total, i) => {
          const level = i + 1
          const current =
            (character.spellSlots[level] as { total: number } | undefined)
              ?.total ?? 0
          const was = (before[i] as number | undefined) ?? 0
          if (total === 0 && current === 0) return null
          return (
            <div
              key={level}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <span className="text-muted-foreground">Level {level} slots</span>
              <span className="tabular-nums">
                <span className="text-muted-foreground">{current}</span>
                <span className="text-muted-foreground mx-1.5">→</span>
                <strong
                  className={cn(
                    total > current && 'text-emerald-700 dark:text-emerald-400',
                  )}
                >
                  {Math.max(current, total)}
                </strong>
                {was === 0 && total > 0 && (
                  <span className="text-muted-foreground ml-2 text-xs">
                    new
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {(cantripsToPick > 0 ||
        spellsToPick > 0 ||
        spellsGranted.length > 0 ||
        alwaysPreparedGained.length > 0) && (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            What you learn at this level. Suggestions come from this
            world&rsquo;s Spells folder and your library — anything else you
            type is kept as written.
          </p>

          {/*
            Shown, not offered. The archetype's own spells land at Apply, so
            until then the sheet does not list them — and a picker reading
            "0 / 2" beside a Mage Hand that is nowhere to be seen reads as
            though it were still owed.
          */}
          {spellsGranted.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">
                Granted by your archetype
              </span>
              <div className="flex flex-wrap gap-1.5">
                {spellsGranted.map((spell) => (
                  <span
                    key={`${spell.level}:${spell.name}`}
                    className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs"
                  >
                    {spell.name}
                    {spell.level === 0 && ' · cantrip'}
                  </span>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                Already yours — it doesn&rsquo;t use up a choice below.
              </p>
            </div>
          )}

          {/*
            Domain, oath and circle spells. Shown for the same reason as the
            grant above, but they are a different thing and say so: these are
            always prepared and sit outside the prepared limit, which is the
            whole point of the field and not obvious from a chip.
          */}
          {alwaysPreparedGained.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Always prepared</span>
              <div className="flex flex-wrap gap-1.5">
                {alwaysPreparedGained.map((spell) => (
                  <span
                    key={`${spell.level}:${spell.name}`}
                    className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs"
                  >
                    {spell.name}
                    {spell.level === 0 && ' · cantrip'}
                  </span>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                Always prepared, and they don&rsquo;t count against how many
                spells you can prepare.
              </p>
            </div>
          )}

          {cantripsToPick > 0 && (
            <SpellList
              label="New cantrips"
              count={cantripsToPick}
              values={draft.cantrips}
              suggestions={offer(0)}
              onChange={(cantrips) => onChange({ ...draft, cantrips })}
            />
          )}

          {spellsToPick > 0 && (
            <SpellList
              label="New spells"
              count={spellsToPick}
              values={draft.spells}
              suggestions={offer(highestSpellLevel, true)}
              onChange={(spells) => onChange({ ...draft, spells })}
            />
          )}

          <p className="text-muted-foreground text-xs">
            Pick them later if you&rsquo;d rather — this never blocks, and the
            sheet is yours to edit.
          </p>
        </div>
      )}
    </div>
  )
}

export function ReviewStep({
  character,
  draft,
}: {
  character: Character
  draft: LevelUpDraft
}) {
  return (
    <div className="max-w-xl space-y-3">
      <p className="text-sm">
        Levelling <strong>{character.class || 'this character'}</strong> from{' '}
        {draft.from} to {draft.to}.
      </p>
      <p className="text-muted-foreground text-sm">
        Everything this will change is listed on the right. It only ever adds:
        your current hit points, inventory, notes and existing features are left
        exactly as they are, and nothing is written until you apply.
      </p>
    </div>
  )
}
