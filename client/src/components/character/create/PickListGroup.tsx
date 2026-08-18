import { SKILLS } from '#/lib/character'
import type { PickList } from '#/lib/srd'
import { Input } from '#/components/ui/input'
import { Chip } from './OptionCard'

/** A skill id rendered as its display name; anything else passes through. */
function optionLabel(pick: PickList, value: string): string {
  if (pick.kind !== 'skill') return value
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
 * An `open` pick also gets a free-text input: "a language of your choice" must
 * accept a language this app has never heard of.
 */
export function PickListGroup({
  pick,
  chosen,
  alreadyGranted,
  onChange,
}: {
  pick: PickList
  chosen: Array<string>
  /** value -> where it came from, for the disabled tooltip. */
  alreadyGranted?: Map<string, string>
  onChange: (values: Array<string>) => void
}) {
  const full = chosen.length >= pick.count
  // Free-text answers the option list doesn't contain, shown as their own chips
  // so they can be removed the same way as any other choice.
  const extras = chosen.filter((v) => !pick.options.includes(v))

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
      <div className="flex flex-wrap gap-1.5">
        {pick.options.map((value) => {
          const source = alreadyGranted?.get(value)
          const selected = chosen.includes(value)
          return (
            <Chip
              key={value}
              label={optionLabel(pick, value)}
              selected={selected}
              disabled={Boolean(source) || (full && !selected)}
              title={source ? `Already granted by ${source}` : undefined}
              onToggle={() => toggle(value)}
            />
          )
        })}
        {extras.map((value) => (
          <Chip
            key={value}
            label={value}
            selected
            onToggle={() => toggle(value)}
          />
        ))}
      </div>
      {pick.open && !full && (
        <Input
          list={`picklist-${pick.id}`}
          placeholder="Or type your own…"
          className="h-7 text-sm"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            addFreeText(e.currentTarget.value)
            e.currentTarget.value = ''
          }}
          onBlur={(e) => {
            addFreeText(e.currentTarget.value)
            e.currentTarget.value = ''
          }}
        />
      )}
      {pick.open && (
        <datalist id={`picklist-${pick.id}`}>
          {pick.options.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      )}
    </div>
  )
}
