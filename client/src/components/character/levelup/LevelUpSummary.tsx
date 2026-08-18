import { ABILITY_NAMES } from '#/lib/character'
import type { Ability, Character } from '#/lib/character'
import type { LevelUpDraft } from '#/lib/levelUp'
import { levelUpPlan } from '#/lib/levelUp'

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/**
 * What this level-up will do, as a diff rather than a summary.
 *
 * The creation wizard's panel shows a character taking shape; here the
 * character already exists, so the only useful thing to show is **what
 * changes** — current → new, and nothing else. That is what makes "additive and
 * previewed" something you can see rather than something the docs promise.
 *
 * Renders `levelUpPlan`, which is the same function the Apply button's
 * `applyLevelUp` derives its work from. If these two ever disagreed the preview
 * would be a lie, so a test asserts they don't.
 */
export function LevelUpSummary({
  character,
  draft,
}: {
  character: Character
  draft: LevelUpDraft
}) {
  const plan = levelUpPlan(character, draft)
  const asi = Object.entries(plan.abilityIncreases) as Array<[Ability, number]>

  return (
    <aside className="h-full space-y-3 overflow-x-hidden overflow-y-auto border-l p-3 text-sm wrap-break-word">
      <div>
        <p className="font-medium">
          Level {plan.from} → {plan.to}
        </p>
        <p className="text-muted-foreground text-xs">
          {[character.class, character.subclass].filter(Boolean).join(' · ') ||
            'No class set'}
        </p>
      </div>

      <Section title="Changes">
        <Row label="Hit points" from={plan.hpFrom} to={plan.hpTo} />
        <Row
          label="Hit dice"
          from={`${plan.hitDiceFrom}d${character.hitDice.size}`}
          to={`${plan.hitDiceTo}d${character.hitDice.size}`}
        />
        <Row
          label="Proficiency"
          from={signed(plan.proficiencyFrom)}
          to={signed(plan.proficiencyTo)}
        />
        {plan.preparedLimitTo !== undefined && (
          <Row
            label="Prepared limit"
            from={plan.preparedLimitFrom ?? 0}
            to={plan.preparedLimitTo}
          />
        )}
      </Section>

      {plan.subclassName && (
        <Section title="Subclass">
          <p className="text-xs">
            <Added /> {plan.subclassName}
          </p>
        </Section>
      )}

      {asi.length > 0 && (
        <Section title="Ability scores">
          {asi.map(([ability, points]) => (
            <Row
              key={ability}
              label={ABILITY_NAMES[ability]}
              from={character.abilities[ability]}
              to={Math.min(20, character.abilities[ability] + points)}
            />
          ))}
        </Section>
      )}

      {plan.featsTaken.length > 0 && (
        <Section title="Feats">
          {plan.featsTaken.map((name) => (
            <p key={name} className="text-xs">
              <Added /> {name}
            </p>
          ))}
        </Section>
      )}

      <Section title="Features">
        {plan.features.length === 0 ? (
          <p className="text-muted-foreground text-xs">None</p>
        ) : (
          plan.features.map((feature) => (
            <p key={`${feature.level}:${feature.name}`} className="text-xs">
              <Added /> {feature.name}{' '}
              <span className="text-muted-foreground">Lv{feature.level}</span>
            </p>
          ))
        )}
      </Section>

      {plan.slots.length > 0 && (
        <Section title="Spell slots">
          {plan.slots.map((slot) => (
            <Row
              key={slot.level}
              label={`Level ${slot.level}`}
              from={slot.from}
              to={slot.to}
            />
          ))}
          {plan.cantripsTo !== undefined &&
            plan.cantripsTo !== plan.cantripsFrom && (
              <Row
                label="Cantrips known"
                from={plan.cantripsFrom ?? 0}
                to={plan.cantripsTo}
              />
            )}
        </Section>
      )}

      <p className="text-muted-foreground border-t pt-2 text-xs">
        Nothing else on the sheet is touched — current hit points, inventory and
        notes are left exactly as they are.
      </p>
    </aside>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1 border-t pt-2">
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </h4>
      {children}
    </div>
  )
}

/** current → new, with the new value emphasised. */
function Row({
  label,
  from,
  to,
}: {
  label: string
  from: string | number
  to: string | number
}) {
  const changed = String(from) !== String(to)
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 text-right tabular-nums">
        {changed ? (
          <>
            <span className="text-muted-foreground">{from}</span>
            <span className="text-muted-foreground mx-1">→</span>
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {to}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">unchanged</span>
        )}
      </span>
    </div>
  )
}

function Added() {
  return (
    <span className="font-medium text-emerald-700 dark:text-emerald-400">
      +
    </span>
  )
}
