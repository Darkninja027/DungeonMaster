import { Dices, Minus, Plus } from 'lucide-react'
import { ABILITIES, ABILITY_NAMES, abilityMod } from '#/lib/character'
import type { Ability, Character } from '#/lib/character'
import type { AsiChoice, LevelUpDraft } from '#/lib/levelUp'
import {
  ASI_HYBRID_POINTS,
  ASI_POINTS,
  asiPointsFor,
  asiLevelsCrossed,
  averageHitDie,
  cantripsAtLevel,
  featuresGained,
  hpGained,
  levelsGained,
  slotsAtLevel,
} from '#/lib/levelUp'
import { findFeat } from '#/lib/tables'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
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
  const offered = featuresGained(character, draft.from, draft.to, draft.kit)
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
            onSelect={() => onChange({ ...draft, subclassName: sub.name })}
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
          onChange={(e) => onChange({ ...draft, subclassName: e.target.value })}
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
        const choice = draft.asi[level] ?? {
          kind: 'abilities' as const,
          abilities: {},
          featName: '',
        }
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
          <div key={level} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium">
                Level {level} — Ability Score Improvement
              </h3>
              {choice.kind !== 'feat' && (
                <span
                  className={
                    placed === asiPointsFor(choice.kind)
                      ? 'text-muted-foreground text-xs'
                      : 'text-xs font-medium text-amber-600 dark:text-amber-500'
                  }
                >
                  {placed} / {asiPointsFor(choice.kind)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <OptionCard
                title="Raise ability scores"
                description={`Add ${ASI_POINTS} points, split as you like.`}
                selected={choice.kind === 'abilities'}
                onSelect={() => setKind(level, 'abilities')}
              />
              <OptionCard
                title="Take a feat"
                description="Type its name; note the details on the sheet."
                selected={choice.kind === 'feat'}
                onSelect={() => setKind(level, 'feat')}
              />
              <OptionCard
                title={`+${ASI_HYBRID_POINTS} and a feat`}
                description="A common house rule — one point and a feat."
                selected={choice.kind === 'both'}
                onSelect={() => setKind(level, 'both')}
              />
            </div>

            {choice.kind !== 'feat' && (
              <div className="flex flex-wrap gap-2">
                {ABILITIES.map((ability) => {
                  const points = choice.abilities[ability] ?? 0
                  const score = character.abilities[ability]
                  // 20 is the RAW cap an ASI can raise a score to.
                  const capped = score + points >= 20
                  return (
                    <div
                      key={ability}
                      className={cn(
                        'flex items-center gap-1 rounded-md border px-1.5 py-1',
                        points > 0 && 'border-primary bg-accent',
                      )}
                    >
                      <span
                        className="text-xs font-medium uppercase"
                        title={ABILITY_NAMES[ability]}
                      >
                        {ability}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {score}
                      </span>
                      <button
                        type="button"
                        aria-label={`Lower ${ABILITY_NAMES[ability]}`}
                        disabled={points === 0}
                        onClick={() => step(ability, -1)}
                        className="hover:bg-accent flex size-5 items-center justify-center rounded border disabled:opacity-30"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="w-5 text-center text-xs tabular-nums">
                        {points > 0 ? `+${points}` : '—'}
                      </span>
                      <button
                        type="button"
                        aria-label={`Raise ${ABILITY_NAMES[ability]}`}
                        disabled={placed >= asiPointsFor(choice.kind) || capped}
                        title={capped ? 'Already at 20' : undefined}
                        onClick={() => step(ability, 1)}
                        className="hover:bg-accent flex size-5 items-center justify-center rounded border disabled:opacity-30"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {choice.kind !== 'abilities' && (
              <>
                <Input
                  value={choice.featName}
                  list="levelup-feat-options"
                  placeholder="e.g. Sharpshooter"
                  className="h-8 max-w-sm"
                  onChange={(e) => patch(level, { featName: e.target.value })}
                />
                {/* Suggestions only; any name is still accepted. */}
                <datalist id="levelup-feat-options">
                  {draft.feats.map((f) => (
                    <option key={f.id} value={f.name} />
                  ))}
                </datalist>
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

export function SpellsStep({
  character,
  draft,
}: {
  character: Character
  draft: LevelUpDraft
}) {
  const before = slotsAtLevel(draft.kit, draft.from) ?? []
  const after = slotsAtLevel(draft.kit, draft.to) ?? []
  const cantripsFrom = cantripsAtLevel(draft.kit, draft.from)
  const cantripsTo = cantripsAtLevel(draft.kit, draft.to)

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
      {cantripsTo !== undefined && cantripsTo !== cantripsFrom && (
        <p className="text-sm">
          You learn a new cantrip — {cantripsFrom ?? 0} →{' '}
          <strong>{cantripsTo}</strong>. Add it on the sheet&rsquo;s Spells
          section.
        </p>
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
