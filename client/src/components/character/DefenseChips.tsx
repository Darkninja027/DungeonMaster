import { useState } from 'react'
import { X } from 'lucide-react'
import type { Character, DamageStance } from '#/lib/character'
import { CONDITIONS, DAMAGE_TYPES, cycleDamage } from '#/lib/character'
import { Combobox } from '#/components/ui/combobox'
import { cn } from '#/lib/utils'

/** What a chip is: one stored defense, with the label to show for it. */
type Defense = {
  id: string
  label: string
  /** 'condition' is its own kind — a condition is only ever an immunity. */
  stance: DamageStance | 'condition'
}

const STANCE_WORD: Record<DamageStance | 'condition', string> = {
  none: '',
  resistant: 'resistant',
  immune: 'immune',
  vulnerable: 'vulnerable',
  condition: 'immune',
}

/**
 * Border tint per stance. The word carries the meaning — this only reinforces
 * it, so the chips stay readable to anyone who can't separate the hues.
 */
const STANCE_RING: Record<DamageStance | 'condition', string> = {
  none: '',
  resistant: 'border-sky-500/45',
  immune: 'border-emerald-500/45',
  vulnerable: 'border-orange-500/45',
  condition: 'border-emerald-500/45',
}

const STANCE_TEXT: Record<DamageStance | 'condition', string> = {
  none: '',
  resistant: 'text-sky-600 dark:text-sky-400',
  immune: 'text-emerald-600 dark:text-emerald-400',
  vulnerable: 'text-orange-600 dark:text-orange-400',
  condition: 'text-emerald-600 dark:text-emerald-400',
}

/**
 * Display name for a stored id. Known ids get their table name; anything else
 * is free text somebody typed or hand-wrote into the frontmatter and passes
 * through untouched — which is the whole reason this list is built from the
 * character's own arrays rather than from DAMAGE_TYPES.
 */
function defenseLabel(id: string): string {
  const dmg = DAMAGE_TYPES.find((t) => t.id === id)
  if (dmg) return dmg.name
  const cond = CONDITIONS.find((t) => t.id === id)
  if (cond) return cond.name
  return id
}

/**
 * Everything this character has set, in a stable order. Built from the stored
 * arrays, never from the tables: a resistance to "nonmagical bludgeoning" is
 * valid on disk and was invisible while this section rendered a fixed grid of
 * the thirteen known types.
 */
function storedDefenses(c: Character): Array<Defense> {
  const out: Array<Defense> = []
  const add = (ids: Array<string>, stance: Defense['stance']) => {
    for (const id of ids) out.push({ id, label: defenseLabel(id), stance })
  }
  add(c.resistances, 'resistant')
  add(c.immunities, 'immune')
  add(c.vulnerabilities, 'vulnerable')
  add(c.conditionImmunities, 'condition')
  return out
}

/**
 * Defenses as chips: one per thing actually set, plus a row to add another.
 *
 * It replaces a fixed grid of 13 damage-type dots and 15 condition checkboxes —
 * 28 controls that are almost always entirely off, and 349px of a sheet that
 * has to scroll. A character with two resistances now costs two chips.
 *
 * Stance changes go through `cycleDamage` so the "a type is never in two lists"
 * invariant stays in the unit-tested helper rather than being re-derived here.
 */
export function DefenseChips({
  character: c,
  onChange,
}: {
  character: Character
  onChange: (next: Character) => void
}) {
  const [stance, setStance] = useState<DamageStance>('resistant')
  const defenses = storedDefenses(c)

  // Only what isn't already set — adding a duplicate is always a mistake.
  const taken = new Set(defenses.map((d) => d.id))
  const options = [
    ...DAMAGE_TYPES.map((t) => t.name),
    ...CONDITIONS.map((t) => t.name),
  ].filter((name) => {
    const id =
      DAMAGE_TYPES.find((t) => t.name === name)?.id ??
      CONDITIONS.find((t) => t.name === name)?.id ??
      name
    return !taken.has(id)
  })

  const remove = (d: Defense) => {
    if (d.stance === 'condition') {
      onChange({
        ...c,
        conditionImmunities: c.conditionImmunities.filter((x) => x !== d.id),
      })
    } else {
      onChange({
        ...c,
        resistances: c.resistances.filter((x) => x !== d.id),
        immunities: c.immunities.filter((x) => x !== d.id),
        vulnerabilities: c.vulnerabilities.filter((x) => x !== d.id),
      })
    }
  }

  // Clicking the stance word cycles it, so the old dot-cycling gesture survives
  // for anyone who preferred it. Conditions have only one stance, so they don't.
  const cycle = (d: Defense) => {
    if (d.stance === 'condition') return
    onChange({ ...c, ...cycleDamage(c, d.id) })
  }

  const add = (typed: string) => {
    const value = typed.trim()
    if (!value) return
    const known =
      DAMAGE_TYPES.find((t) => t.name.toLowerCase() === value.toLowerCase()) ??
      CONDITIONS.find((t) => t.name.toLowerCase() === value.toLowerCase())
    const id = known ? known.id : value
    if (taken.has(id)) return

    const isCondition = CONDITIONS.some((t) => t.id === id)
    if (isCondition) {
      onChange({ ...c, conditionImmunities: [...c.conditionImmunities, id] })
      return
    }
    const key =
      stance === 'immune'
        ? 'immunities'
        : stance === 'vulnerable'
          ? 'vulnerabilities'
          : 'resistances'
    onChange({ ...c, [key]: [...c[key], id] })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {defenses.length === 0 ? (
          <span className="text-muted-foreground text-xs">
            No resistances, immunities or vulnerabilities.
          </span>
        ) : (
          defenses.map((d) => (
            <span
              key={`${d.stance}-${d.id}`}
              className={cn(
                'bg-muted inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
                STANCE_RING[d.stance],
              )}
            >
              {d.label}
              <button
                type="button"
                className={cn(
                  'text-[10px] uppercase',
                  STANCE_TEXT[d.stance],
                  d.stance !== 'condition' && 'hover:underline',
                )}
                title={
                  d.stance === 'condition'
                    ? 'Condition immunity'
                    : 'Click to change: resistant → immune → vulnerable'
                }
                onClick={() => cycle(d)}
              >
                {STANCE_WORD[d.stance]}
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                title={`Remove ${d.label}`}
                onClick={() => remove(d)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Combobox
          options={options}
          placeholder="Damage type or condition"
          className="h-7 max-w-56 text-sm"
          onCommit={add}
        />
        {/* Ignored for a condition, which can only ever be an immunity. */}
        <select
          className="border-input bg-background h-7 rounded-md border px-2 text-sm"
          value={stance}
          title="Stance for the next damage type added"
          onChange={(e) => setStance(e.target.value as DamageStance)}
        >
          <option value="resistant">Resistant</option>
          <option value="immune">Immune</option>
          <option value="vulnerable">Vulnerable</option>
        </select>
        <span className="text-muted-foreground text-xs">
          press Enter to add
        </span>
      </div>
    </div>
  )
}
