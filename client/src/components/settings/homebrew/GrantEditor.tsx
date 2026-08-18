import { Plus, X } from 'lucide-react'
import { ABILITIES, ABILITY_NAMES, SKILLS } from '#/lib/character'
import type { Ability } from '#/lib/character'
import type { Grant, GrantTrait, PickList } from '#/lib/srd'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

/**
 * The `Grant` sub-form — the "what does this hand out" block shared by races,
 * backgrounds and class kits.
 *
 * Everything here is optional and everything is free text, matching the type.
 * The skills row is the one exception: it offers the eighteen real ids as
 * toggles, because a mistyped skill is silently dropped when the sheet parses
 * it back and the user would never know.
 */
export function GrantEditor({
  grant,
  onChange,
  showSaves = false,
}: {
  grant: Grant
  onChange: (next: Grant) => void
  /** Only class kits grant saving throws. */
  showSaves?: boolean
}) {
  /**
   * Set a field, dropping the key entirely when it empties out. `Grant` treats
   * an absent key as "grants nothing", so writing `skills: []` would serialize
   * empty arrays into every homebrew entry for no reason.
   */
  const set = <TKey extends keyof Grant>(key: TKey, value: Grant[TKey]) => {
    const next = { ...grant }
    const empty =
      value === undefined ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'object' && Object.keys(value).length === 0)
    if (empty) delete next[key]
    else next[key] = value
    onChange(next)
  }

  const toggleSkill = (id: string) => {
    const current = grant.skills ?? []
    set(
      'skills',
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    )
  }

  const toggleSave = (ability: Ability) => {
    const current = grant.saves ?? []
    set(
      'saves',
      current.includes(ability)
        ? current.filter((s) => s !== ability)
        : [...current, ability],
    )
  }

  return (
    <div className="space-y-3">
      {showSaves && (
        <Field label="Saving throws">
          <div className="flex flex-wrap gap-1">
            {ABILITIES.map((ability) => (
              <Toggle
                key={ability}
                label={ability.toUpperCase()}
                title={ABILITY_NAMES[ability]}
                on={(grant.saves ?? []).includes(ability)}
                onToggle={() => toggleSave(ability)}
              />
            ))}
          </div>
        </Field>
      )}

      <Field label="Skill proficiencies">
        <div className="flex flex-wrap gap-1">
          {SKILLS.map((skill) => (
            <Toggle
              key={skill.id}
              label={skill.name}
              on={(grant.skills ?? []).includes(skill.id)}
              onToggle={() => toggleSkill(skill.id)}
            />
          ))}
        </div>
      </Field>

      <TokenField
        label="Armor"
        placeholder="light, medium, heavy, shields…"
        values={grant.armor ?? []}
        onChange={(v) => set('armor', v)}
      />
      <TokenField
        label="Weapons"
        placeholder="simple, martial, or a named weapon"
        values={grant.weapons ?? []}
        onChange={(v) => set('weapons', v)}
      />
      <TokenField
        label="Tools"
        placeholder="Smith’s tools"
        values={grant.tools ?? []}
        onChange={(v) => set('tools', v)}
      />
      <TokenField
        label="Languages"
        placeholder="Common"
        values={grant.languages ?? []}
        onChange={(v) => set('languages', v)}
      />
      <TokenField
        label="Damage resistances"
        placeholder="poison, fire…"
        values={grant.resistances ?? []}
        onChange={(v) => set('resistances', v)}
      />

      <TraitsField
        traits={grant.traits ?? []}
        onChange={(v) => set('traits', v)}
      />

      <TokenField
        label="Starting equipment"
        placeholder="Crowbar"
        values={(grant.items ?? []).map((i) => i.text)}
        onChange={(v) =>
          set(
            'items',
            v.map((text) => ({ text })),
          )
        }
      />

      <Field label="Starting coin">
        <div className="flex flex-wrap gap-2">
          {(['cp', 'sp', 'ep', 'gp', 'pp'] as const).map((coin) => (
            <label key={coin} className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground uppercase">{coin}</span>
              <Input
                value={String(grant.currency?.[coin] ?? '')}
                inputMode="numeric"
                placeholder="0"
                className="h-7 w-16 text-sm"
                onChange={(e) => {
                  const n = Number(e.target.value)
                  const currency = { ...grant.currency }
                  if (!e.target.value.trim() || !Number.isFinite(n) || n <= 0) {
                    delete currency[coin]
                  } else {
                    currency[coin] = Math.round(n)
                  }
                  set('currency', currency)
                }}
              />
            </label>
          ))}
        </div>
      </Field>

      <PicksField picks={grant.picks ?? []} onChange={(v) => set('picks', v)} />
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium">{label}</span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function Toggle({
  label,
  title,
  on,
  onToggle,
}: {
  label: string
  title?: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      title={title}
      onClick={onToggle}
      className={cn(
        'rounded-full border px-2 py-0.5 text-xs transition-colors',
        on
          ? 'border-primary bg-primary text-primary-foreground'
          : 'hover:bg-accent',
      )}
    >
      {label}
    </button>
  )
}

/** A free-text list as removable chips plus an add box. */
export function TokenField({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string
  placeholder: string
  values: Array<string>
  onChange: (next: Array<string>) => void
}) {
  const add = (raw: string) => {
    const value = raw.trim()
    if (!value) return
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) return
    onChange([...values, value])
  }
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-1">
        {values.map((value) => (
          <span
            key={value}
            className="bg-muted flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs"
          >
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Input
          placeholder={placeholder}
          className="h-7 w-40 text-sm"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            add(e.currentTarget.value)
            e.currentTarget.value = ''
          }}
          onBlur={(e) => {
            add(e.currentTarget.value)
            e.currentTarget.value = ''
          }}
        />
      </div>
    </Field>
  )
}

function TraitsField({
  traits,
  onChange,
}: {
  traits: Array<GrantTrait>
  onChange: (next: Array<GrantTrait>) => void
}) {
  const patch = (i: number, changes: Partial<GrantTrait>) => {
    onChange(traits.map((t, j) => (i === j ? { ...t, ...changes } : t)))
  }
  return (
    <Field label="Traits" hint="Named features shown on the sheet">
      <div className="space-y-1.5">
        {traits.map((trait, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1 space-y-1">
              <Input
                value={trait.name}
                placeholder="Darkvision"
                className="h-7 text-sm"
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              <Textarea
                value={trait.text ?? ''}
                rows={2}
                placeholder="What it does."
                className="text-sm"
                onChange={(e) => patch(i, { text: e.target.value })}
              />
            </div>
            <button
              type="button"
              aria-label={`Remove ${trait.name || 'trait'}`}
              onClick={() => onChange(traits.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive mt-1.5"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onChange([...traits, { name: '' }])}
        >
          <Plus className="size-3" /> Add trait
        </Button>
      </div>
    </Field>
  )
}

/**
 * "Choose N of these" lists.
 *
 * Ids are assigned by the parser on save, namespaced by owner, so the editor
 * never sets one — two entries offering a bare "tools" pick would otherwise
 * silently share one choice.
 */
function PicksField({
  picks,
  onChange,
}: {
  picks: Array<PickList>
  onChange: (next: Array<PickList>) => void
}) {
  const patch = (i: number, changes: Partial<PickList>) => {
    onChange(picks.map((p, j) => (i === j ? { ...p, ...changes } : p)))
  }
  return (
    <Field label="Choices" hint="Things the player picks at creation">
      <div className="space-y-2">
        {picks.map((pick, i) => (
          <div key={i} className="space-y-1.5 rounded-md border p-2">
            <div className="flex items-center gap-1.5">
              <Input
                value={pick.label}
                placeholder="Choose one tool"
                className="h-7 min-w-0 flex-1 text-sm"
                onChange={(e) => patch(i, { label: e.target.value })}
              />
              <Input
                value={String(pick.count)}
                inputMode="numeric"
                title="How many to choose"
                className="h-7 w-12 text-center text-sm"
                onChange={(e) => {
                  const n = Number(e.target.value)
                  patch(i, {
                    count: Number.isFinite(n) && n > 0 ? Math.round(n) : 1,
                  })
                }}
              />
              <select
                value={pick.kind}
                className="border-input bg-background h-7 rounded-md border px-1 text-xs"
                onChange={(e) =>
                  patch(i, { kind: e.target.value as PickList['kind'] })
                }
              >
                {['skill', 'tool', 'language', 'weapon', 'armor', 'other'].map(
                  (kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ),
                )}
              </select>
              <button
                type="button"
                aria-label="Remove choice"
                onClick={() => onChange(picks.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <TokenField
              label="Options"
              placeholder={
                pick.kind === 'skill' ? 'stealth (skill id)' : 'An option'
              }
              values={pick.options}
              onChange={(options) => patch(i, { options })}
            />
            <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={pick.open === true}
                className="accent-primary size-3.5"
                onChange={(e) =>
                  patch(i, { open: e.target.checked || undefined })
                }
              />
              Allow anything else to be typed in
            </label>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            onChange([
              ...picks,
              { id: '', kind: 'tool', label: '', count: 1, options: [] },
            ])
          }
        >
          <Plus className="size-3" /> Add choice
        </Button>
      </div>
    </Field>
  )
}
