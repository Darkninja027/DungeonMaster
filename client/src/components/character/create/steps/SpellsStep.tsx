import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '#/lib/api'
import { collectSpells, mergeEntries } from '#/lib/bestiary'
import { useLibraryEntries } from '#/lib/useGlobalLibrary'
import type { CharacterDraft } from '#/lib/characterDraft'
import { draftKit } from '#/lib/characterDraft'
import { Input } from '#/components/ui/input'

/**
 * Cantrips and level 1 spells, as free text with suggestions drawn from the
 * world's own `Spells/` folder and the shared library — the same two sources
 * `SpellReference` merges.
 *
 * Free text rather than a picker because a spell on the sheet is just a name:
 * it may be a `[[wiki link]]` to an article that exists, a homebrew spell, or
 * something the DM invented at the table.
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
  const sc = kit?.spellcasting

  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })
  const library = useLibraryEntries('Spells')
  const suggestions = useMemo(
    () =>
      mergeEntries(
        collectSpells(worldId, tree.data, undefined, { folder: 'Spells' }),
        library.entries,
      ).map((entry) => entry.title),
    [worldId, tree.data, library.entries],
  )

  if (!sc) {
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
        suggestions={suggestions}
        onChange={(cantrips) => onChange({ ...draft, cantrips })}
      />

      {sc.spellsKnown > 0 && (
        <SpellList
          label={sc.prepares ? 'Spells in your book' : 'Spells known'}
          count={sc.spellsKnown}
          values={draft.spells}
          suggestions={suggestions}
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

function SpellList({
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
        <Input
          list={listId}
          placeholder="Type a spell name…"
          className="h-7 max-w-sm text-sm"
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
      )}
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  )
}
