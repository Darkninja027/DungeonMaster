import { Minus, Plus, X } from 'lucide-react'
import { ABILITIES, ABILITY_NAMES } from '#/lib/character'
import type { Ability } from '#/lib/character'
import type { RaceInfo, SubraceInfo } from '#/lib/srd'
import { homebrewId } from '#/lib/homebrew'
import { SRD_TABLES, nameKey } from '#/lib/tables'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { Field, GrantEditor } from './GrantEditor'

export function blankRace(): RaceInfo {
  return { id: '', name: '', summary: '', asi: {}, speed: 30, grant: {} }
}

function blankSubrace(): SubraceInfo {
  return { id: '', name: '', summary: '', asi: {}, grant: {} }
}

/**
 * Ability score increases as steppers.
 *
 * A 0 is "no increase" and simply isn't stored — the parser drops it, and a
 * "+0" chip on a race card would read as a bonus that does nothing.
 */
export function AsiEditor({
  asi,
  onChange,
}: {
  asi: Partial<Record<Ability, number>>
  onChange: (next: Partial<Record<Ability, number>>) => void
}) {
  const step = (ability: Ability, delta: number) => {
    const next = { ...asi }
    const value = (next[ability] ?? 0) + delta
    if (value <= 0) delete next[ability]
    else next[ability] = Math.min(10, value)
    onChange(next)
  }
  return (
    <div className="flex flex-wrap gap-2">
      {ABILITIES.map((ability) => {
        const value = asi[ability] ?? 0
        return (
          <div
            key={ability}
            className={cn(
              'flex items-center gap-1 rounded-md border px-1.5 py-1',
              value > 0 && 'border-primary bg-accent',
            )}
          >
            <span
              className="text-xs font-medium uppercase"
              title={ABILITY_NAMES[ability]}
            >
              {ability}
            </span>
            <button
              type="button"
              aria-label={`Lower ${ABILITY_NAMES[ability]}`}
              disabled={value === 0}
              onClick={() => step(ability, -1)}
              className="hover:bg-accent flex size-5 items-center justify-center rounded border disabled:opacity-30"
            >
              <Minus className="size-3" />
            </button>
            <span className="w-5 text-center text-xs tabular-nums">
              {value > 0 ? `+${value}` : '—'}
            </span>
            <button
              type="button"
              aria-label={`Raise ${ABILITY_NAMES[ability]}`}
              onClick={() => step(ability, 1)}
              className="hover:bg-accent flex size-5 items-center justify-center rounded border"
            >
              <Plus className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function RaceEditor({
  race,
  onChange,
}: {
  race: RaceInfo
  onChange: (next: RaceInfo) => void
}) {
  const patch = (changes: Partial<RaceInfo>) =>
    onChange({ ...race, ...changes })

  // Matches the hint ClassKitEditor has always shown. Now that built-ins are
  // listed beside your own, a name landing on one should say it overrides it
  // rather than looking like a coincidence.
  const overrides = SRD_TABLES.races.some(
    (r) => nameKey(r.name) === nameKey(race.name),
  )

  const patchSubrace = (i: number, changes: Partial<SubraceInfo>) => {
    const subraces = (race.subraces ?? []).map((s, j) =>
      j === i ? { ...s, ...changes } : s,
    )
    patch({ subraces })
  }

  return (
    <div className="space-y-3">
      <Field label="Name">
        <Input
          value={race.name}
          placeholder="Thri-kreen"
          className="h-8"
          // The id is derived from the name, exactly as it is for classes, so
          // there is no separate id field to get out of step.
          onChange={(e) =>
            patch({ name: e.target.value, id: homebrewId(e.target.value) })
          }
        />
        {overrides && (
          <p className="text-muted-foreground text-xs">
            Overrides the built-in {race.name.trim()}.
          </p>
        )}
      </Field>

      <Field label="Summary" hint="One line, shown on the option card">
        <Input
          value={race.summary}
          placeholder="Insectile wanderers of the wastes."
          className="h-8"
          onChange={(e) => patch({ summary: e.target.value })}
        />
      </Field>

      <Field label="Ability score increases">
        <AsiEditor asi={race.asi} onChange={(asi) => patch({ asi })} />
      </Field>

      <div className="flex gap-3">
        <Field label="Speed">
          <div className="flex items-center gap-1">
            <Input
              value={String(race.speed)}
              inputMode="numeric"
              className="h-8 w-20"
              onChange={(e) => {
                const n = Number(e.target.value)
                patch({
                  speed: Number.isFinite(n) ? Math.max(0, Math.round(n)) : 30,
                })
              }}
            />
            <span className="text-muted-foreground text-xs">ft</span>
          </div>
        </Field>

        <Field label="Extras">
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={race.flexibleAsi !== undefined}
                className="accent-primary size-3.5"
                onChange={(e) =>
                  patch({
                    flexibleAsi: e.target.checked
                      ? { count: 2, amount: 1 }
                      : undefined,
                  })
                }
              />
              Player chooses some increases
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={race.grantsFeat === true}
                className="accent-primary size-3.5"
                onChange={(e) =>
                  patch({ grantsFeat: e.target.checked || undefined })
                }
              />
              Grants a feat
            </label>
          </div>
        </Field>
      </div>

      {race.flexibleAsi && (
        <Field label="Player-chosen increases">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Choose</span>
            <Input
              value={String(race.flexibleAsi.count)}
              inputMode="numeric"
              className="h-7 w-12 text-center"
              onChange={(e) => {
                const n = Number(e.target.value)
                patch({
                  flexibleAsi: {
                    ...race.flexibleAsi!,
                    count: Number.isFinite(n) && n > 0 ? Math.round(n) : 1,
                  },
                })
              }}
            />
            <span className="text-muted-foreground">abilities to raise by</span>
            <Input
              value={String(race.flexibleAsi.amount)}
              inputMode="numeric"
              className="h-7 w-12 text-center"
              onChange={(e) => {
                const n = Number(e.target.value)
                patch({
                  flexibleAsi: {
                    ...race.flexibleAsi!,
                    amount: Number.isFinite(n) && n > 0 ? Math.round(n) : 1,
                  },
                })
              }}
            />
          </div>
        </Field>
      )}

      <div className="border-t pt-3">
        <GrantEditor
          grant={race.grant}
          onChange={(grant) => patch({ grant })}
        />
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Subraces</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              patch({ subraces: [...(race.subraces ?? []), blankSubrace()] })
            }
          >
            <Plus className="size-3" /> Add subrace
          </Button>
        </div>
        {(race.subraces ?? []).length === 0 && (
          <p className="text-muted-foreground text-xs">
            None. A race with subraces makes the wizard require one.
          </p>
        )}
        {(race.subraces ?? []).map((sub, i) => (
          <div key={i} className="space-y-2 rounded-md border p-2">
            <div className="flex items-center gap-1.5">
              <Input
                value={sub.name}
                placeholder="Subrace name"
                className="h-7 min-w-0 flex-1 text-sm"
                onChange={(e) =>
                  patchSubrace(i, {
                    name: e.target.value,
                    id: homebrewId(e.target.value),
                  })
                }
              />
              <button
                type="button"
                aria-label={`Remove ${sub.name || 'subrace'}`}
                onClick={() =>
                  patch({
                    subraces: (race.subraces ?? []).filter((_, j) => j !== i),
                  })
                }
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <Textarea
              value={sub.summary}
              rows={1}
              placeholder="One line."
              className="text-sm"
              onChange={(e) => patchSubrace(i, { summary: e.target.value })}
            />
            <AsiEditor
              asi={sub.asi}
              onChange={(asi) => patchSubrace(i, { asi })}
            />
            <div className="flex gap-3 text-xs">
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Speed override</span>
                <Input
                  value={sub.speed === undefined ? '' : String(sub.speed)}
                  inputMode="numeric"
                  placeholder="—"
                  className="h-7 w-16 text-center"
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    const n = Number(raw)
                    patchSubrace(i, {
                      speed:
                        raw === '' || !Number.isFinite(n)
                          ? undefined
                          : Math.max(0, Math.round(n)),
                    })
                  }}
                />
              </label>
              <label
                className="flex items-center gap-1"
                title="Extra max HP per level, like a Hill Dwarf's Dwarven Toughness"
              >
                <span className="text-muted-foreground">HP per level</span>
                <Input
                  value={
                    sub.hpPerLevel === undefined ? '' : String(sub.hpPerLevel)
                  }
                  inputMode="numeric"
                  placeholder="—"
                  className="h-7 w-16 text-center"
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    const n = Number(raw)
                    patchSubrace(i, {
                      hpPerLevel:
                        raw === '' || !Number.isFinite(n) || n <= 0
                          ? undefined
                          : Math.round(n),
                    })
                  }}
                />
              </label>
            </div>
            <GrantEditor
              grant={sub.grant}
              onChange={(grant) => patchSubrace(i, { grant })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
