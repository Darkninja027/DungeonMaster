import { ABILITIES } from '#/lib/character'
import type { Ability } from '#/lib/character'
import type { SpellcastingInfo } from '#/lib/srd'
import { Input } from '#/components/ui/input'

/**
 * A spellcasting block, for a class or for a subclass that casts on its own.
 *
 * Extracted from `ClassKitEditor`, which had it inline, so a third-caster
 * archetype — the Arcane Trickster shape — can be authored too. A subclass's
 * block *overrides* the class's; `spellcastingFor` is the one place that
 * precedence lives, and nothing here changes it.
 *
 * `listLabel` is editable, which it was not before. It is not decoration:
 * `spellListClass` derives "whose spell list?" from it, and an Arcane Trickster
 * filtered by "Rogue" got an empty list of suggestions. A homebrew third caster
 * has the same problem and previously no way to say otherwise.
 *
 * The progression tables (`slotsByLevel` and friends) are deliberately absent.
 * They are twenty rows of numbers apiece and want a table editor rather than a
 * form; they round-trip through `homebrew.json` and can be hand-written there.
 * The note at the foot says so rather than leaving it a mystery.
 */
export function SpellcastingFields({
  value,
  onChange,
  /** Prefills `listLabel` on a fresh block — the class or subclass name. */
  ownerName,
  /**
   * What ticking the box means here. A class casts "at 1st level"; a subclass
   * casts from the level its archetype is chosen, which is not always 3.
   */
  enableLabel,
}: {
  value: SpellcastingInfo | undefined
  onChange: (next: SpellcastingInfo | undefined) => void
  ownerName: string
  enableLabel: string
}) {
  const patch = (changes: Partial<SpellcastingInfo>) => {
    if (!value) return
    onChange({ ...value, ...changes })
  }

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={value !== undefined}
          className="accent-primary size-3.5"
          onChange={(e) =>
            onChange(
              e.target.checked
                ? {
                    ability: 'int',
                    slotsAtLevel1: 2,
                    cantripsKnown: 2,
                    spellsKnown: 2,
                    prepares: false,
                    listLabel: `${ownerName.trim() || 'Class'} spells`,
                  }
                : undefined,
            )
          }
        />
        {enableLabel}
      </label>

      {value && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <span className="text-muted-foreground">Ability</span>
              <select
                value={value.ability}
                className="border-input bg-background h-7 rounded-md border px-1"
                onChange={(e) => patch({ ability: e.target.value as Ability })}
              >
                {ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {a.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['slotsAtLevel1', 'Slots'],
                ['cantripsKnown', 'Cantrips'],
                ['spellsKnown', 'Spells'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1">
                <span className="text-muted-foreground">{label}</span>
                <Input
                  value={String(value[key])}
                  inputMode="numeric"
                  className="h-7 w-12 text-center"
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    patch({
                      [key]: Number.isFinite(n)
                        ? Math.max(0, Math.round(n))
                        : 0,
                    })
                  }}
                />
              </label>
            ))}
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={value.prepares}
                className="accent-primary size-3.5"
                onChange={(e) => patch({ prepares: e.target.checked })}
              />
              Prepares from a list
            </label>
          </div>

          <label className="flex items-center gap-1 text-xs">
            <span
              className="text-muted-foreground shrink-0"
              title="Which class's spell list — an Arcane Trickster casts wizard spells"
            >
              Spell list
            </span>
            <Input
              value={value.listLabel}
              placeholder="Wizard spells"
              className="h-7 min-w-0 flex-1 text-sm"
              onChange={(e) => patch({ listLabel: e.target.value })}
            />
          </label>

          <p className="text-muted-foreground text-xs">
            Slot and spells-known tables aren&rsquo;t edited here —
            they&rsquo;re twenty rows of numbers each. Add them to{' '}
            <code>homebrew.json</code> as <code>slotsByLevel</code>,{' '}
            <code>cantripsByLevel</code> and <code>spellsKnownByLevel</code>;
            they round-trip untouched.
          </p>
        </>
      )}
    </div>
  )
}
