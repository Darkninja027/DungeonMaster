import { SKILLS } from '#/lib/character'
import type { PickList } from '#/lib/srd'
import { Combobox } from '#/components/ui/combobox'
import { Chip } from './OptionCard'

/**
 * A skill id rendered as its display name; anything else passes through.
 *
 * The fallthrough is what makes a `skillOrTool` pick read correctly with no
 * extra branching: a tool name is not a skill id, so it prints as itself.
 */
function optionLabel(pick: PickList, value: string): string {
  if (
    pick.kind !== 'skill' &&
    pick.kind !== 'skillOrTool' &&
    pick.kind !== 'expertise'
  ) {
    return value
  }
  return SKILLS.find((s) => s.id === value)?.name ?? value
}

/**
 * One "choose N of these" group, as a chip cloud.
 *
 * `alreadyGranted` greys out options the character has been given outright —
 * a cleric with the Acolyte background can't spend a class pick on Religion.
 * They are greyed rather than hidden, with the source named, because a silently
 * missing option reads as the app having lost the choice.
 *
 * An `open` pick also gets a free-text combobox: "a language of your choice"
 * must accept a language this app has never heard of. It suggests from
 * `suggestions` when given (spell picks, whose `options` are empty because no
 * table here holds a spell list) and otherwise from the pick's own options.
 */
export function PickListGroup({
  pick,
  chosen,
  options,
  alreadyGranted,
  suggestions,
  suggestionsLabel,
  suggestionsPlaceholder,
  source,
  onChange,
}: {
  pick: PickList
  chosen: Array<string>
  /**
   * Overrides `pick.options` as the offered chips.
   *
   * For an expertise pick, whose authored options are the class's ceiling and
   * whose real answer set is the character's own proficiencies — see
   * `eligibleExpertise`. Narrowing here rather than in the table keeps
   * `pick.options` the authored thing srd.test.ts validates, and it means a
   * choice that *stops* being offered falls out of `extras` below as a chip the
   * player can still see and still remove, rather than silently vanishing.
   */
  options?: Array<string>
  /** value -> where it came from, for the disabled tooltip. */
  alreadyGranted?: Map<string, string>
  /**
   * Extra values for the free-text box that aren't chips.
   *
   * Spell and cantrip picks ship `options: []` on purpose — no table here
   * knows the spell list, which lives in the user's articles — so without this
   * a pick like Magic Initiate's "two cantrips" was an empty box you had to
   * type into blind. These are offered as suggestions only; anything typed is
   * still accepted.
   */
  suggestions?: Array<string>
  /**
   * Names what the combobox holds, turning it into a labelled half of the
   * choice rather than an afterthought below the chips.
   *
   * This exists for `skillOrTool`, whose two halves live in different controls:
   * the skills are chips and the ~40 tools are suggestions, because every tool
   * as a chip is a wall rather than a choice. Without a label the tools were
   * invisible — the group promised "skills or tools" and showed eighteen skills
   * over an "or type your own" box that reads as an escape hatch for homebrew.
   * Given, the chips get a heading too, so neither half looks like the primary
   * one.
   */
  suggestionsLabel?: string
  /** Overrides the combobox placeholder, to say what's behind it. */
  suggestionsPlaceholder?: string
  /**
   * Where this pick came from — "the Skilled feat". Shown under the heading,
   * because a pick's own label is written from the player's side and can't say
   * why they have it: three extra skill slots sit beside the race's one and the
   * class's four with nothing tying them to the feat that granted them.
   */
  source?: string
  onChange: (values: Array<string>) => void
}) {
  const offered = options ?? pick.options
  const full = chosen.length >= pick.count
  // Free-text answers the option list doesn't contain, shown as their own chips
  // so they can be removed the same way as any other choice.
  //
  // Against `offered`, not `pick.options`: a narrowed pick's no-longer-eligible
  // choice lands here too, which is how a stale expertise pick stays visible
  // and removable instead of being pruned out of the draft behind the player.
  const extras = chosen.filter((v) => !offered.includes(v))
  // Whether an extra is a stale narrowing casualty rather than something typed.
  // A value the table itself never offered is free text and needs no warning.
  const staleExtra = (value: string) =>
    options !== undefined && pick.options.includes(value)

  const toggle = (value: string) => {
    if (chosen.includes(value)) {
      onChange(chosen.filter((v) => v !== value))
    } else if (!full) {
      onChange([...chosen, value])
    }
  }

  const addFreeText = (raw: string) => {
    const value = raw.trim()
    if (!value || full || chosen.includes(value)) return
    onChange([...chosen, value])
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{pick.label}</span>
        <span
          className={
            full
              ? 'text-muted-foreground text-xs'
              : 'text-xs font-medium text-amber-600 dark:text-amber-500'
          }
        >
          {chosen.length} / {pick.count}
        </span>
      </div>
      {source && <p className="text-muted-foreground text-xs">From {source}</p>}
      {/*
        A `feature` pick is a menu, not a cloud: its options are long-named and
        each carries a paragraph of rules text, so eleven chips is a wall and
        the text has nowhere to go. A select shows one at a time with its
        description underneath — which is also the only way to read what you are
        choosing *before* you choose it.

        A native select rather than a portalled popup: these render inside a
        modal Dialog whose focus trap kills portalled content, and the sheet
        already uses native selects for exactly this reason.
      */}
      {pick.kind === 'feature' ? (
        <FeatureSelects
          pick={pick}
          chosen={chosen}
          offered={offered}
          alreadyGranted={alreadyGranted}
          onChange={onChange}
        />
      ) : (
        <>
          {/*
        Only when the combobox is a labelled half of the choice: on its own,
        "Skills" over the one and only chip cloud is noise.
      */}
          {suggestionsLabel && (
            <p className="text-muted-foreground text-xs">Skills</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {offered.map((value) => {
              // `spentBy`, not `source`: this is who already took the value, where
              // the `source` prop above is who handed out the pick itself.
              const spentBy = alreadyGranted?.get(value)
              const selected = chosen.includes(value)
              return (
                <Chip
                  key={value}
                  label={optionLabel(pick, value)}
                  selected={selected}
                  disabled={Boolean(spentBy) || (full && !selected)}
                  // "from", not "granted by": the source may be a choice made in
                  // another pick — your Skilled skills, your race's free skill —
                  // rather than something handed over outright, and the player
                  // needs to know which of their own picks already spent it.
                  title={spentBy ? `Already taken from ${spentBy}` : undefined}
                  onToggle={() => toggle(value)}
                />
              )
            })}
            {extras.map((value) => (
              <Chip
                key={value}
                label={optionLabel(pick, value)}
                selected
                title={
                  staleExtra(value)
                    ? 'No longer one of your proficiencies — click to remove'
                    : undefined
                }
                onToggle={() => toggle(value)}
              />
            ))}
          </div>
          {offered.length < pick.count && (
            // A narrowed pick whose source hasn't been filled in yet. The group
            // stays rendered rather than hiding, because a vanishing choice reads as
            // the app having lost it; the line says what to do instead.
            <p className="text-muted-foreground text-xs">
              Choose your skills above first — expertise applies to skills
              you&rsquo;re already proficient in.
            </p>
          )}
          {pick.open && !full && (
            // The label lives inside the same guard as the box it names: once the
            // pick is full the combobox goes away, and a "Tools" heading with
            // nothing under it reads as a half-rendered list.
            <div className="space-y-1.5">
              {suggestionsLabel && (
                <p className="text-muted-foreground text-xs">
                  {suggestionsLabel}
                </p>
              )}
              <Combobox
                id={`picklist-${pick.id}`}
                // Suggestions first: for a spell pick they're the only content, and
                // for an open skill pick the options are already chips above.
                options={suggestions ?? pick.options}
                onCommit={addFreeText}
                placeholder={
                  suggestionsPlaceholder ??
                  (suggestions && suggestions.length > 0
                    ? 'Search, or type your own…'
                    : 'Or type your own…')
                }
                className="h-7 text-sm"
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * One `<select>` per slot the pick asks for, each with the chosen option's
 * rules text below it.
 *
 * One control per slot rather than a multi-select: "choose two manoeuvres" is
 * two decisions, and a native multi-select is famously hard to operate. Each
 * select excludes what the *others* have taken, so the same answer cannot be
 * given twice, and excludes anything `alreadyGranted` names — a style or
 * manoeuvre already on the sheet.
 */
function FeatureSelects({
  pick,
  chosen,
  offered,
  alreadyGranted,
  onChange,
}: {
  pick: PickList
  chosen: Array<string>
  offered: Array<string>
  alreadyGranted?: Map<string, string>
  onChange: (values: Array<string>) => void
}) {
  const setAt = (index: number, value: string) => {
    const next = [...chosen]
    if (value === '') next.splice(index, 1)
    else next[index] = value
    onChange(next.filter(Boolean))
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: pick.count }, (_, i) => {
        const value = chosen[i] ?? ''
        const text = value ? pick.featureText?.[value] : undefined
        return (
          <div key={i} className="space-y-1">
            <select
              className="bg-background text-foreground h-8 w-full rounded border px-2 text-sm"
              value={value}
              onChange={(e) => setAt(i, e.target.value)}
            >
              <option value="">Choose…</option>
              {offered.map((option) => {
                // Taken by another slot of this same pick, or already on the
                // sheet. Kept in the list but unselectable, with the reason —
                // a silently missing option reads as the app having lost it.
                const takenHere = chosen.includes(option) && option !== value
                const takenBefore = alreadyGranted?.get(option)
                return (
                  <option
                    key={option}
                    value={option}
                    disabled={takenHere || Boolean(takenBefore)}
                    className="bg-background text-foreground"
                  >
                    {option}
                    {takenBefore
                      ? ` — already from ${takenBefore}`
                      : takenHere
                        ? ' — already chosen'
                        : ''}
                  </option>
                )
              })}
            </select>
            {text && (
              <p className="text-muted-foreground text-xs leading-snug">
                {text}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
