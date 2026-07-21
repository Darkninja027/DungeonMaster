import { Dices, Plus, X } from 'lucide-react'
import {
  ABILITIES,
  ABILITY_NAMES,
  SKILLS,
  abilityMod,
  d20,
  initiativeBonus,
  passivePerception,
  proficiencyBonus,
  saveBonus,
  signed,
  skillBonus,
  spellAttackBonus,
  spellSaveDc,
} from '#/lib/character'
import type { Ability, Character } from '#/lib/character'
import { rollDice } from '#/lib/formatMarkdown'
import { logRoll } from '#/lib/rollLog'
import type { RollSource } from '#/lib/rollLog'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import { NumField } from './NumField'

interface SheetProps {
  character: Character
  onChange: (next: Character) => void
  source: RollSource
}

function roll(label: string, notation: string, source: RollSource) {
  const result = rollDice(notation)
  if (result) {
    logRoll({
      notation,
      label,
      total: result.total,
      detail: result.detail,
      source,
    })
  }
}

/** A small "roll this" chip: shows the bonus, clicking rolls + logs it. */
function RollChip({
  label,
  bonus,
  source,
  notation,
}: {
  label: string
  bonus?: number
  source: RollSource
  /** Override for non-d20 rolls (damage, hit dice). */
  notation?: string
}) {
  const n = notation ?? d20(bonus ?? 0)
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-6 gap-1 px-1.5 font-mono text-xs"
      title={`Roll ${label} (${n})`}
      onClick={() => roll(label, n, source)}
    >
      <Dices className="size-3" />
      {notation ?? signed(bonus ?? 0)}
    </Button>
  )
}

function Pips({
  count,
  total,
  onChange,
  className,
}: {
  count: number
  total: number
  onChange: (next: number) => void
  className?: string
}) {
  return (
    <span className="inline-flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          className={cn(
            'size-3.5 rounded-full border',
            i < count ? (className ?? 'bg-primary') : 'bg-transparent',
          )}
          onClick={() => onChange(i + 1 === count ? i : i + 1)}
        />
      ))}
    </span>
  )
}

function Section({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-md border p-3', className)}>
      <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function SheetTab({ character: c, onChange, source }: SheetProps) {
  const set = (patch: Partial<Character>) => onChange({ ...c, ...patch })
  const prof = proficiencyBonus(c.level)

  const toggleSave = (ability: Ability) =>
    set({
      saves: c.saves.includes(ability)
        ? c.saves.filter((a) => a !== ability)
        : [...c.saves, ability],
    })

  // none -> proficient -> expertise -> none
  const cycleSkill = (id: string) => {
    if (c.expertise.includes(id)) {
      set({ expertise: c.expertise.filter((s) => s !== id) })
    } else if (c.skills.includes(id)) {
      set({
        skills: c.skills.filter((s) => s !== id),
        expertise: [...c.expertise, id],
      })
    } else {
      set({ skills: [...c.skills, id] })
    }
  }

  return (
    <div className="grid gap-3 p-3 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-3">
        <Section title="Abilities">
          <div className="grid grid-cols-3 gap-2">
            {ABILITIES.map((ability) => {
              const mod = abilityMod(c.abilities[ability])
              return (
                <div key={ability} className="rounded border p-2 text-center">
                  <div className="text-muted-foreground text-xs uppercase">
                    {ability}
                  </div>
                  <NumField
                    value={c.abilities[ability]}
                    min={1}
                    max={30}
                    className="mx-auto my-1 w-14"
                    title={ABILITY_NAMES[ability]}
                    onCommit={(v) =>
                      set({ abilities: { ...c.abilities, [ability]: v } })
                    }
                  />
                  <RollChip
                    label={`${ABILITY_NAMES[ability]} check`}
                    bonus={mod}
                    source={source}
                  />
                </div>
              )
            })}
          </div>
        </Section>

        <Section title="Saving throws">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {ABILITIES.map((ability) => (
              <div key={ability} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.saves.includes(ability)}
                  title="Proficient"
                  onChange={() => toggleSave(ability)}
                />
                <span className="min-w-0 flex-1 truncate">
                  {ABILITY_NAMES[ability]}
                </span>
                <RollChip
                  label={`${ABILITY_NAMES[ability]} save`}
                  bonus={saveBonus(c, ability)}
                  source={source}
                />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Skills">
          <p className="text-muted-foreground mb-1 text-xs">
            Click the dot to cycle: none → proficient → expertise
          </p>
          <div className="grid gap-y-1">
            {SKILLS.map((skill) => {
              const expert = c.expertise.includes(skill.id)
              const proficient = c.skills.includes(skill.id)
              return (
                <div key={skill.id} className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    title={
                      expert ? 'Expertise' : proficient ? 'Proficient' : '—'
                    }
                    className={cn(
                      'size-3.5 shrink-0 rounded-full border',
                      expert && 'bg-primary ring-primary/40 ring-2',
                      proficient && !expert && 'bg-primary',
                    )}
                    onClick={() => cycleSkill(skill.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {skill.name}
                    <span className="text-muted-foreground ml-1 text-xs uppercase">
                      {skill.ability}
                    </span>
                  </span>
                  <RollChip
                    label={skill.name}
                    bonus={skillBonus(c, skill.id)}
                    source={source}
                  />
                </div>
              )
            })}
          </div>
        </Section>
      </div>

      <div className="space-y-3">
        <Section title="Combat">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5">
              AC
              <NumField
                value={c.ac}
                min={0}
                className="w-12"
                onCommit={(v) => set({ ac: v })}
              />
            </label>
            <span className="flex items-center gap-1.5">
              Initiative
              <RollChip
                label="Initiative"
                bonus={initiativeBonus(c)}
                source={source}
              />
              <NumField
                value={c.initiativeBonus}
                className="w-10"
                title="Misc initiative bonus (added to DEX)"
                onCommit={(v) => set({ initiativeBonus: v })}
              />
            </span>
            <label className="flex items-center gap-1.5">
              Speed
              <NumField
                value={c.speed}
                min={0}
                className="w-12"
                onCommit={(v) => set({ speed: v })}
              />
            </label>
            <span>
              Proficiency <strong>{signed(prof)}</strong>
            </span>
            <span>
              Passive Perception <strong>{passivePerception(c)}</strong>
            </span>
          </div>

          <Separator className="my-3" />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5">
              HP
              <NumField
                value={c.hp.current}
                min={0}
                className="w-14"
                onCommit={(v) => set({ hp: { ...c.hp, current: v } })}
              />
              /
              <NumField
                value={c.hp.max}
                min={1}
                className="w-14"
                onCommit={(v) => set({ hp: { ...c.hp, max: v } })}
              />
            </label>
            <label className="flex items-center gap-1.5">
              Temp
              <NumField
                value={c.hp.temp}
                min={0}
                className="w-12"
                onCommit={(v) => set({ hp: { ...c.hp, temp: v } })}
              />
            </label>
            <span className="flex items-center gap-1.5">
              Hit dice d{c.hitDice.size}
              <NumField
                value={c.hitDice.total - c.hitDice.used}
                min={0}
                max={c.hitDice.total}
                className="w-10"
                title="Hit dice remaining"
                onCommit={(v) =>
                  set({
                    hitDice: { ...c.hitDice, used: c.hitDice.total - v },
                  })
                }
              />
              / {c.hitDice.total}
              <RollChip
                label="Hit die"
                notation={`d${c.hitDice.size}${
                  abilityMod(c.abilities.con) !== 0
                    ? signed(abilityMod(c.abilities.con))
                    : ''
                }`}
                source={source}
              />
            </span>
          </div>

          <div className="mt-3 flex items-center gap-5 text-sm">
            <span className="flex items-center gap-2">
              Death saves
              <Pips
                count={c.deathSaves.success}
                total={3}
                className="bg-green-600"
                onChange={(v) =>
                  set({ deathSaves: { ...c.deathSaves, success: v } })
                }
              />
              /
              <Pips
                count={c.deathSaves.fail}
                total={3}
                className="bg-destructive"
                onChange={(v) =>
                  set({ deathSaves: { ...c.deathSaves, fail: v } })
                }
              />
            </span>
          </div>
        </Section>

        <Section title="Attacks">
          <div className="space-y-1.5">
            {c.attacks.map((attack, i) => (
              <div key={i} className="flex items-center gap-1.5 text-sm">
                <Input
                  value={attack.name}
                  placeholder="Attack"
                  className="h-7 min-w-0 flex-1 text-sm"
                  onChange={(e) =>
                    set({
                      attacks: c.attacks.map((a, j) =>
                        j === i ? { ...a, name: e.target.value } : a,
                      ),
                    })
                  }
                />
                <NumField
                  value={attack.bonus}
                  className="w-12"
                  title="To-hit bonus"
                  onCommit={(v) =>
                    set({
                      attacks: c.attacks.map((a, j) =>
                        j === i ? { ...a, bonus: v } : a,
                      ),
                    })
                  }
                />
                <RollChip
                  label={`${attack.name || 'Attack'} (to hit)`}
                  bonus={attack.bonus}
                  source={source}
                />
                <Input
                  value={attack.damage}
                  placeholder="1d8+3"
                  className="h-7 w-20 text-sm"
                  onChange={(e) =>
                    set({
                      attacks: c.attacks.map((a, j) =>
                        j === i ? { ...a, damage: e.target.value } : a,
                      ),
                    })
                  }
                />
                {attack.damage && (
                  <RollChip
                    label={`${attack.name || 'Attack'} damage`}
                    notation={attack.damage}
                    source={source}
                  />
                )}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  title="Remove attack"
                  onClick={() =>
                    set({ attacks: c.attacks.filter((_, j) => j !== i) })
                  }
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                set({
                  attacks: [...c.attacks, { name: '', bonus: 0, damage: '' }],
                })
              }
            >
              <Plus className="size-3.5" /> Add attack
            </Button>
          </div>
        </Section>

        <Section title="Spellcasting">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5">
              Ability
              <select
                className="bg-background h-7 rounded border px-1 text-sm"
                value={c.spellAbility ?? ''}
                onChange={(e) =>
                  set({
                    spellAbility: (e.target.value || null) as Ability | null,
                  })
                }
              >
                <option value="">None</option>
                {ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {ABILITY_NAMES[a]}
                  </option>
                ))}
              </select>
            </label>
            {c.spellAbility && (
              <>
                <span>
                  Save DC <strong>{spellSaveDc(c)}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  Spell attack
                  <RollChip
                    label="Spell attack"
                    bonus={spellAttackBonus(c) ?? 0}
                    source={source}
                  />
                </span>
              </>
            )}
          </div>
          {c.spellAbility && (
            <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1.5">
              {Array.from({ length: 9 }, (_, i) => i + 1).map((lvl) => {
                const slot = c.spellSlots[lvl] ?? { total: 0, used: 0 }
                return (
                  <div key={lvl} className="flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground w-6 text-xs">
                      L{lvl}
                    </span>
                    <NumField
                      value={slot.total}
                      min={0}
                      max={9}
                      className="w-9"
                      title={`Level ${lvl} slots`}
                      onCommit={(v) =>
                        set({
                          spellSlots: {
                            ...c.spellSlots,
                            [lvl]: { total: v, used: Math.min(slot.used, v) },
                          },
                        })
                      }
                    />
                    {slot.total > 0 && (
                      <Pips
                        count={slot.used}
                        total={slot.total}
                        onChange={(v) =>
                          set({
                            spellSlots: {
                              ...c.spellSlots,
                              [lvl]: { ...slot, used: v },
                            },
                          })
                        }
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="Currency">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map((coin) => (
              <label key={coin} className="flex items-center gap-1">
                <span className="text-muted-foreground text-xs uppercase">
                  {coin}
                </span>
                <NumField
                  value={c.currency[coin]}
                  min={0}
                  className="w-14"
                  onCommit={(v) =>
                    set({ currency: { ...c.currency, [coin]: v } })
                  }
                />
              </label>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
