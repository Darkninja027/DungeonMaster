import { X } from 'lucide-react'
import { useSpellSuggestions } from '#/lib/useGlobalLibrary'
import { useWorldRuleset } from '#/lib/useWorldSettings'
import type { CharacterDraft } from '#/lib/characterDraft'
import { draftKit } from '#/lib/characterDraft'
import {
  castsAtLevel1,
  expandedSpellsFor,
  spellcastingFor,
  spellListClass,
} from '#/lib/tables'
import { cn } from '#/lib/utils'
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
  // The edition, so the picker offers the same spells the Spells panel shows.
  // Inherited rather than asked again: a character built in a 2024 world is a
  // 2024 character, and a second control here would be a second place the
  // answer could live. `draft.ruleset` is the vault's case — that folder has no
  // edition of its own, so the dialog seeds one onto the draft.
  const worldRuleset = useWorldRuleset(worldId)
  const ruleset = draft.ruleset ?? worldRuleset
  const suggestionsFor = useSpellSuggestions(
    worldId,
    spellListClass(kit, draft.subclassName),
    ruleset,
  )

  // The patron's expanded list at 1st level, for a class that picks its
  // archetype at creation. Empty for every other class and every other level,
  // so the block below simply doesn't render.
  const expandedAt1 = expandedSpellsFor(kit, draft.subclassName, 1)

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
          expanded={
            expandedAt1.length > 0
              ? {
                  label: `${draft.subclassName} adds to your spell list`,
                  names: expandedAt1,
                }
              : undefined
          }
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
  expanded,
  onChange,
}: {
  label: string
  count: number
  values: Array<string>
  suggestions: Array<string>
  /**
   * A subclass's expanded spell list — patron spells, offered as one-click
   * chips above the picker rather than blended into its suggestions. Absent
   * for every class that has no such list, which is nearly all of them.
   */
  expanded?: { label: string; names: Array<string> }
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
      {expanded && (
        <ExpandedSpellOffer
          label={expanded.label}
          names={expanded.names}
          chosen={filled}
          disabled={full}
          onAdd={add}
        />
      )}
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

/**
 * A patron's expanded spell list, as one-click additions to the picker below.
 *
 * Not merged into the `Combobox`'s options, for two reasons that between them
 * rule the merge out. The names would be indistinguishable from the library's
 * own suggestions — a warlock offered Burning Hands has no way to learn *why*,
 * and "because your patron is the Fiend" is the most useful thing the app can
 * say at that moment. And `Combobox` reorders its options by prefix match on
 * every keystroke, so no ordering convention here could survive typing.
 *
 * Chips rather than a second `Combobox` because the list is short and fixed —
 * two names per spell level — so there is nothing to search, and a picker over
 * four items is more clicks than the items are worth.
 *
 * These bypass `filterSpells` entirely, which is the point: a world whose
 * `Spells/` folder holds no Burning Hands article must still offer it, because
 * the patron is the authority on what it grants access to.
 *
 * Adding one calls the *same* `onAdd` the `Combobox` does, so a patron spell
 * lands as a perfectly ordinary known spell and spends from the same count.
 * Nothing marks it as patron-derived on the sheet, because nothing is: it is a
 * warlock spell you learned.
 */
function ExpandedSpellOffer({
  label,
  names,
  chosen,
  disabled,
  onAdd,
}: {
  /** e.g. "The Fiend adds to your spell list". */
  label: string
  names: Array<string>
  /** Names already on the list, so a taken one reads as taken. */
  chosen: Array<string>
  /** True when the list above is full — nothing more can be added. */
  disabled: boolean
  onAdd: (name: string) => void
}) {
  if (names.length === 0) return null
  const taken = new Set(chosen.map((n) => n.trim().toLowerCase()))
  return (
    <div className="space-y-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {names.map((name) => {
          const have = taken.has(name.trim().toLowerCase())
          return (
            <button
              key={name}
              type="button"
              disabled={have || disabled}
              onClick={() => onAdd(name)}
              className={cn(
                'rounded-full border border-dashed px-2.5 py-1 text-xs',
                have || disabled
                  ? 'text-muted-foreground opacity-60'
                  : 'hover:bg-accent',
              )}
            >
              {name}
              {have && ' ✓'}
            </button>
          )
        })}
      </div>
      {/*
        The load-bearing sentence of this whole feature. The level-up step
        renders an always-prepared block reading "they don't count against how
        many spells you can prepare" — these two must not read alike, because
        the difference between them is the entire mechanism.
      */}
      <p className="text-muted-foreground text-xs">
        Always available to you, but you still spend a choice to learn one.
      </p>
    </div>
  )
}
