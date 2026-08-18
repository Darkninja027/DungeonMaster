import {
  ABILITIES,
  SKILLS,
  abilityMod,
  carriedWeight,
  initiativeBonus,
  passivePerception,
  proficiencyBonus,
  proficiencyLabel,
  saveBonus,
  skillBonus,
  spellSaveDc,
} from '#/lib/character'
import { buildCharacter } from '#/lib/buildCharacter'
import type { CharacterDraft } from '#/lib/characterDraft'

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/**
 * The live character, updating as the wizard is filled in.
 *
 * Calls **the same `buildCharacter` the Create button calls**, then reads the
 * result with the sheet's own helpers. That is the point: the panel cannot
 * drift from what actually gets written, because it *is* what gets written.
 *
 * Undetermined fields show an em-dash rather than a default, so the panel
 * visibly fills in rather than quietly lying about a value nobody chose.
 */
export function WizardSummary({ draft }: { draft: CharacterDraft }) {
  const { character } = buildCharacter(draft)
  const hasClass = character.class.length > 0
  const weight = carriedWeight(character)

  return (
    <aside className="h-full space-y-3 overflow-x-hidden overflow-y-auto border-l p-3 text-sm wrap-break-word">
      <div>
        <p className="font-medium">{draft.name.trim() || 'Unnamed'}</p>
        <p className="text-muted-foreground text-xs">
          {[character.race, character.class, character.subclass]
            .filter(Boolean)
            .join(' ') || 'Level 1'}
        </p>
        {character.background && (
          <p className="text-muted-foreground text-xs">
            {character.background}
          </p>
        )}
      </div>

      <Section title="Combat">
        <Row label="Armor Class" value={character.ac} />
        <Row label="Hit Points" value={character.hp.max} />
        <Row label="Initiative" value={signed(initiativeBonus(character))} />
        <Row label="Speed" value={`${character.speed} ft`} />
        <Row
          label="Hit die"
          value={hasClass ? `d${character.hitDice.size}` : '—'}
        />
        <Row
          label="Proficiency"
          value={signed(proficiencyBonus(character.level))}
        />
      </Section>

      <Section title="Abilities">
        <div className="grid grid-cols-3 gap-1">
          {ABILITIES.map((ability) => (
            <div
              key={ability}
              className="bg-muted/40 rounded border px-1 py-1 text-center"
            >
              <div className="text-muted-foreground text-[10px] uppercase">
                {ability}
              </div>
              <div className="font-medium tabular-nums">
                {character.abilities[ability]}
              </div>
              <div className="text-muted-foreground text-[10px] tabular-nums">
                {signed(abilityMod(character.abilities[ability]))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {character.saves.length > 0 && (
        <Section title="Saving throws">
          <p className="text-xs">
            {character.saves
              .map(
                (s) => `${s.toUpperCase()} ${signed(saveBonus(character, s))}`,
              )
              .join(' · ')}
          </p>
        </Section>
      )}

      <Section title="Skills">
        {character.skills.length === 0 ? (
          <p className="text-muted-foreground text-xs">—</p>
        ) : (
          <p className="text-xs">
            {character.skills
              .map((id) => {
                const name = SKILLS.find((s) => s.id === id)?.name ?? id
                return `${name} ${signed(skillBonus(character, id))}`
              })
              .join(' · ')}
          </p>
        )}
        <Row label="Passive Perception" value={passivePerception(character)} />
      </Section>

      {(character.armor.length > 0 ||
        character.weapons.length > 0 ||
        character.tools.length > 0 ||
        character.languages.length > 0) && (
        <Section title="Proficiencies">
          <Tokens label="Armor" values={character.armor} />
          <Tokens label="Weapons" values={character.weapons} />
          <Tokens label="Tools" values={character.tools} />
          <Tokens label="Languages" values={character.languages} />
        </Section>
      )}

      {character.spellAbility && (
        <Section title="Spellcasting">
          <Row label="Ability" value={character.spellAbility.toUpperCase()} />
          <Row label="Save DC" value={spellSaveDc(character) ?? 0} />
          <Row
            label="Level 1 slots"
            value={
              // Record<number, ...> types the index as always present, but a
              // caster with no level 1 slots really has no key here.
              (character.spellSlots[1] as { total: number } | undefined)
                ?.total ?? 0
            }
          />
          <Row
            label="Spells"
            value={`${character.spells.filter((s) => s.level === 0).length} cantrips, ${
              character.spells.filter((s) => s.level > 0).length
            } spells`}
          />
        </Section>
      )}

      {(character.traits.length > 0 || character.features.length > 0) && (
        <Section title="Traits & features">
          <p className="text-muted-foreground text-xs">
            {[...character.traits, ...character.features]
              .map((t) => t.name)
              .join(' · ')}
          </p>
        </Section>
      )}

      {character.inventory.length > 0 && (
        <Section title="Inventory">
          <Row label="Items" value={character.inventory.length} />
          <Row label="Weight" value={`${Math.round(weight * 10) / 10} lb`} />
          {character.currency.gp > 0 && (
            <Row label="Gold" value={`${character.currency.gp} gp`} />
          )}
        </Section>
      )}
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

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 text-right font-medium tabular-nums">
        {value}
      </span>
    </div>
  )
}

function Tokens({ label, values }: { label: string; values: Array<string> }) {
  if (values.length === 0) return null
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{label}: </span>
      {values.map(proficiencyLabel).join(', ')}
    </div>
  )
}
