import { X } from 'lucide-react'
import { useSpellSuggestions } from '#/lib/useGlobalLibrary'
import type { CharacterDraft } from '#/lib/characterDraft'
import { draftKit } from '#/lib/characterDraft'
import { castsAtLevel1, spellcastingFor, spellListClass } from '#/lib/tables'
import { Combobox } from '#/components/ui/combobox'

/**
 * Cantrips and level 1 spells, as free text with suggestions drawn from the
 * world's own `Spells/` folder and the shared library — the same two sources
 * `SpellReference` merges.
 *
 * Free text rather than a picker because a spell on the sheet is just a name:
 * it may be a `[[wiki link]]` to an article that exists, a homebrew spell, or
 * something the DM invented at the table. The `Combobox` suggests without ever
 * constraining, which is why it replaced the `<datalist>` this used to use —
 * that popup is a native Chromium widget and stops scrolling somewhere well
 * short of six hundred spells.
 *
 * The two lists are filtered to the level they're asking for, and to the class
 * whose list you're casting from, using the `level`/`classes` frontmatter every
 * shipped spell article carries. A spell that declares neither still shows:
 * see `filterSpells`.
 */
export function SpellsStep({
  worldId,
  draft,
  onChange,
}: {
  worldId: string
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  const kit = draftKit(draft)
  // Read the pair, never the kit's block alone — an archetype may carry its
  // own, and `castsAtLevel1` below is what decides whether level 1 has
  // anything to ask about.
  const sc = spellcastingFor(kit, draft.subclassName)

  // The list they cast *from*, as the spell frontmatter spells it — "Wizard",
  // "Cleric". Not always the class's own name: a third caster casts from
  // another class's list. Undefined for a homebrew class, so suggestions are
  // never filtered away by a name nobody's spells mention.
  const suggestionsFor = useSpellSuggestions(
    worldId,
    spellListClass(kit, draft.subclassName),
  )

  // Belt and braces: `stepsFor` already keeps this step off the list for a
  // half caster, but the step router could be pointed here directly, and a
  // block whose table starts at 2 would otherwise render "0 level 1 slots".
  if (!sc || !castsAtLevel1(kit, draft.subclassName)) {
    return (
      <p className="text-muted-foreground text-sm">
        This class doesn&rsquo;t cast spells at 1st level.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {sc.listLabel}, cast with{' '}
        <strong className="text-foreground">{sc.ability.toUpperCase()}</strong>.
        You have {sc.slotsAtLevel1} level&nbsp;1{' '}
        {sc.slotsAtLevel1 === 1 ? 'slot' : 'slots'}.
      </p>

      <SpellList
        label="Cantrips"
        count={sc.cantripsKnown}
        values={draft.cantrips}
        suggestions={suggestionsFor(0)}
        onChange={(cantrips) => onChange({ ...draft, cantrips })}
      />

      {sc.spellsKnown > 0 && (
        <SpellList
          label={sc.prepares ? 'Spells in your book' : 'Spells known'}
          count={sc.spellsKnown}
          values={draft.spells}
          suggestions={suggestionsFor(1)}
          onChange={(spells) => onChange({ ...draft, spells })}
        />
      )}

      {sc.prepares && sc.spellsKnown === 0 && (
        <p className="text-muted-foreground text-sm">
          You prepare your spells fresh each day from the whole{' '}
          {sc.listLabel.toLowerCase()} list, so there&rsquo;s nothing to pick
          here — add them on the sheet when you prepare.
        </p>
      )}
    </div>
  )
}

/**
 * A capped list of spell names: chips with a remove button, and a `Combobox`
 * that suggests without ever constraining. Shared with the level-up wizard's
 * own spells step, so learning a spell looks the same at level 1 and level 12.
 */
export function SpellList({
  label,
  count,
  values,
  suggestions,
  onChange,
}: {
  label: string
  count: number
  values: Array<string>
  suggestions: Array<string>
  onChange: (next: Array<string>) => void
}) {
  const filled = values.filter(Boolean)
  const full = filled.length >= count
  const listId = `spells-${label.replace(/\s+/g, '-').toLowerCase()}`

  const add = (raw: string) => {
    const value = raw.trim()
    if (!value || full || filled.includes(value)) return
    onChange([...filled, value])
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={
            full
              ? 'text-muted-foreground text-xs'
              : 'text-xs font-medium text-amber-600 dark:text-amber-500'
          }
        >
          {filled.length} / {count}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {filled.map((name) => (
          <span
            key={name}
            className="bg-muted flex items-center gap-1 rounded-full py-1 pr-1.5 pl-2.5 text-xs"
          >
            {name}
            <button
              type="button"
              aria-label={`Remove ${name}`}
              onClick={() => onChange(filled.filter((v) => v !== name))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      {!full && (
        <Combobox
          id={listId}
          options={suggestions}
          onCommit={add}
          placeholder="Type a spell name…"
          className="h-7 max-w-sm text-sm"
        />
      )}
    </div>
  )
}
