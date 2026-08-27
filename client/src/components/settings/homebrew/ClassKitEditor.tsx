import { Plus, X } from 'lucide-react'
import { ABILITIES, HIT_DIE_SIZES } from '#/lib/character'
import type { ClassKit, EquipmentChoice } from '#/lib/srd'
import { subclassLevelOf } from '#/lib/tables'
import { homebrewId } from '#/lib/homebrew'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import { Field, GrantEditor, TokenField } from './GrantEditor'
import { FeatureRows } from './FeatureRows'
import { SpellcastingFields } from './SpellcastingFields'
import { SubclassEditor } from './SubclassEditor'

/**
 * A class's subclass label, pluralised for the section heading — "Martial
 * Archetypes", "Bard Colleges".
 *
 * The naive `+ 's'` gave "Subclasss" for the default label, which is the one
 * every newly-created class starts with, so it was the first thing anybody
 * would see. Free text, so this stays a rule of thumb rather than grammar: a
 * label already ending in s is left alone.
 */
function pluralLabel(label: string): string {
  const trimmed = label.trim()
  if (trimmed === '') return 'Subclasses'
  return /s$/i.test(trimmed) ? `${trimmed}es` : `${trimmed}s`
}

export function blankKit(): ClassKit {
  return {
    id: '',
    name: '',
    hitDie: 8,
    subclassLabel: 'Subclass',
    subclasses: [],
    saves: [],
    skillChoices: {
      id: '',
      kind: 'skill',
      label: 'Choose two skills',
      count: 2,
      options: [],
      open: true,
    },
    grant: {},
    equipment: [],
    features: [],
    abilityPriority: [...ABILITIES],
  }
}

/**
 * A class's level 1 starting kit.
 *
 * Keyed by *name* against the world's class list — the kit supplies the
 * starting gear and proficiencies, while the class list still owns the hit die.
 * A kit whose name matches no class simply never gets found, so the name field
 * says so.
 */
export function ClassKitEditor({
  kit,
  classNames,
  onChange,
}: {
  kit: ClassKit
  /** Names from the merged class list, so the name field can warn on a typo. */
  classNames: Array<string>
  onChange: (next: ClassKit) => void
}) {
  const patch = (changes: Partial<ClassKit>) => onChange({ ...kit, ...changes })
  const overrides = classNames.some(
    (n) => n.trim().toLowerCase() === kit.name.trim().toLowerCase(),
  )

  const patchChoice = (i: number, changes: Partial<EquipmentChoice>) =>
    patch({
      equipment: kit.equipment.map((c, j) =>
        j === i ? { ...c, ...changes } : c,
      ),
    })

  return (
    <div className="space-y-3">
      <Field label="Class name">
        <Input
          value={kit.name}
          list="homebrew-kit-classes"
          placeholder="Blood Hunter"
          className="h-8"
          onChange={(e) =>
            patch({ name: e.target.value, id: homebrewId(e.target.value) })
          }
        />
        {/*
          Existing names as suggestions, so typing one deliberately overrides
          it rather than creating a confusing near-duplicate.
        */}
        <datalist id="homebrew-kit-classes">
          {classNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {overrides && (
          <p className="text-muted-foreground text-xs">
            Overrides the existing {kit.name.trim()}.
          </p>
        )}
      </Field>

      <div className="flex flex-wrap gap-3">
        <Field label="Hit die">
          <select
            value={String(kit.hitDie)}
            className="border-input bg-background h-8 rounded-md border px-2 text-sm"
            onChange={(e) => patch({ hitDie: Number(e.target.value) })}
          >
            {HIT_DIE_SIZES.map((size) => (
              <option key={size} value={size}>
                d{size}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Subclass label" hint="What this class calls its subclass">
          <Input
            value={kit.subclassLabel}
            placeholder="Martial Archetype"
            className="h-8 w-48"
            onChange={(e) => patch({ subclassLabel: e.target.value })}
          />
        </Field>
      </div>

      <SubclassEditor
        subclasses={kit.subclasses}
        label={pluralLabel(kit.subclassLabel)}
        subclassLevel={subclassLevelOf(kit)}
        onChange={(subclasses) => patch({ subclasses })}
      />

      <Field label="Skill choice" hint="The class's own skill list">
        <div className="flex items-center gap-1.5">
          <Input
            value={kit.skillChoices.label}
            placeholder="Choose two skills"
            className="h-7 min-w-0 flex-1 text-sm"
            onChange={(e) =>
              patch({
                skillChoices: { ...kit.skillChoices, label: e.target.value },
              })
            }
          />
          <Input
            value={String(kit.skillChoices.count)}
            inputMode="numeric"
            title="How many"
            className="h-7 w-12 text-center text-sm"
            onChange={(e) => {
              const n = Number(e.target.value)
              patch({
                skillChoices: {
                  ...kit.skillChoices,
                  count: Number.isFinite(n) && n > 0 ? Math.round(n) : 1,
                },
              })
            }}
          />
        </div>
        <TokenField
          label="From these skills"
          placeholder="athletics (skill id)"
          values={kit.skillChoices.options}
          onChange={(options) =>
            patch({ skillChoices: { ...kit.skillChoices, options } })
          }
        />
      </Field>

      <Field label="Spellcasting">
        <SpellcastingFields
          value={kit.spellcasting}
          ownerName={kit.name}
          enableLabel="Casts spells at 1st level"
          onChange={(spellcasting) => patch({ spellcasting })}
        />
      </Field>

      <Field label="Unarmored defense" hint="Barbarian and Monk style AC">
        <select
          value={kit.unarmoredDefense ?? ''}
          className="border-input bg-background h-7 rounded-md border px-1 text-xs"
          onChange={(e) =>
            patch({
              unarmoredDefense:
                e.target.value === ''
                  ? undefined
                  : (e.target.value as 'con' | 'wis'),
            })
          }
        >
          <option value="">None</option>
          <option value="con">10 + DEX + CON</option>
          <option value="wis">10 + DEX + WIS</option>
        </select>
      </Field>

      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={kit.subclassAtLevel1 === true}
          className="accent-primary size-3.5"
          onChange={(e) =>
            patch({ subclassAtLevel1: e.target.checked || undefined })
          }
        />
        Subclass is chosen at 1st level
      </label>

      <div className="border-t pt-3">
        <FeatureRows
          features={kit.features}
          placeholder="Rage"
          onChange={(features) => patch({ features })}
        />
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Equipment choices</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              patch({
                equipment: [
                  ...kit.equipment,
                  {
                    id: '',
                    label: '',
                    // Two options minimum: one option is a grant, not a choice,
                    // and the parser drops a single-option group.
                    options: [
                      { label: '', grant: {} },
                      { label: '', grant: {} },
                    ],
                  },
                ],
              })
            }
          >
            <Plus className="size-3" /> Add choice
          </Button>
        </div>
        {kit.equipment.map((choice, i) => (
          <div key={i} className="space-y-1.5 rounded-md border p-2">
            <div className="flex items-center gap-1.5">
              <Input
                value={choice.label}
                placeholder="Armor"
                className="h-7 min-w-0 flex-1 text-sm"
                onChange={(e) => patchChoice(i, { label: e.target.value })}
              />
              <button
                type="button"
                aria-label="Remove equipment choice"
                onClick={() =>
                  patch({ equipment: kit.equipment.filter((_, j) => j !== i) })
                }
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
            {choice.options.map((option, j) => (
              <div key={j} className="flex items-center gap-1.5 pl-3">
                <Input
                  value={option.label}
                  placeholder="Chain mail"
                  className="h-7 min-w-0 flex-1 text-sm"
                  onChange={(e) =>
                    patchChoice(i, {
                      options: choice.options.map((o, k) =>
                        k === j ? { ...o, label: e.target.value } : o,
                      ),
                    })
                  }
                />
                <Input
                  placeholder="Items, comma separated"
                  value={(option.grant.items ?? [])
                    .map((it) => it.text)
                    .join(', ')}
                  className="h-7 min-w-0 flex-1 text-sm"
                  onChange={(e) => {
                    const items = e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .map((text) => ({ text }))
                    patchChoice(i, {
                      options: choice.options.map((o, k) =>
                        k === j ? { ...o, grant: { ...o.grant, items } } : o,
                      ),
                    })
                  }}
                />
                <button
                  type="button"
                  aria-label="Remove option"
                  onClick={() =>
                    patchChoice(i, {
                      options: choice.options.filter((_, k) => k !== j),
                    })
                  }
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="ml-3 h-6 text-xs"
              onClick={() =>
                patchChoice(i, {
                  options: [...choice.options, { label: '', grant: {} }],
                })
              }
            >
              <Plus className="size-3" /> Add option
            </Button>
          </div>
        ))}
      </div>

      <div className="border-t pt-3">
        <GrantEditor
          grant={kit.grant}
          onChange={(grant) => patch({ grant })}
          showSaves
        />
      </div>
    </div>
  )
}
