import { useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { sortedFeatures } from '#/lib/character'
import type { Character, ClassFeature, NamedEntry } from '#/lib/character'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { NumField } from './NumField'

/**
 * Racial traits, feats and class features. All three are a title plus a
 * description; class features additionally carry the level they're gained at,
 * and anything above the character's current level is kept and shown muted so
 * a build can be planned ahead.
 *
 * Descriptions are plain textareas here; the sheet preview renders them as
 * markdown so [[wiki links]] and dice notation come alive there.
 */

/** Shared add form: title, description, and an optional level field. */
function AddForm({
  levelValue,
  onLevelChange,
  titlePlaceholder,
  textPlaceholder,
  onAdd,
}: {
  levelValue?: number
  onLevelChange?: (v: number) => void
  titlePlaceholder: string
  textPlaceholder: string
  onAdd: (name: string, text: string) => void
}) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    if (!name.trim()) return
    onAdd(name.trim(), text.trim())
    setName('')
    setText('')
  }

  return (
    <div className="space-y-1.5 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {levelValue !== undefined && onLevelChange && (
          <label className="flex items-center gap-1 text-sm">
            Level
            <NumField
              value={levelValue}
              min={1}
              max={20}
              className="w-12"
              onCommit={onLevelChange}
            />
          </label>
        )}
        <Input
          value={name}
          placeholder={titlePlaceholder}
          className="h-8 min-w-56 flex-1 text-sm"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // Enter in the title jumps to the description rather than
            // submitting, so a description is the norm and not an afterthought.
            if (e.key === 'Enter') {
              e.preventDefault()
              textRef.current?.focus()
            }
          }}
        />
      </div>
      <Textarea
        ref={textRef}
        value={text}
        placeholder={textPlaceholder}
        className="min-h-16 text-sm"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
        }}
      />
      <Button size="sm" disabled={!name.trim()} onClick={submit}>
        <Plus className="size-3.5" /> Add
      </Button>
    </div>
  )
}

/** One editable row: title, optional level, description, delete. */
function EntryRow({
  name,
  text,
  level,
  muted,
  onName,
  onText,
  onLevel,
  onRemove,
}: {
  name: string
  text?: string
  level?: number
  muted?: boolean
  onName: (v: string) => void
  onText: (v: string | undefined) => void
  onLevel?: (v: number) => void
  onRemove: () => void
}) {
  return (
    <li className={cn('group rounded-md border p-2.5', muted && 'opacity-60')}>
      <div className="flex items-center gap-2">
        <Input
          value={name}
          placeholder="Title"
          className="h-7 flex-1 text-sm font-medium"
          onChange={(e) => onName(e.target.value)}
        />
        {level !== undefined && onLevel && (
          <NumField
            value={level}
            min={1}
            max={20}
            className="w-12"
            onCommit={onLevel}
          />
        )}
        <button
          type="button"
          className="hover:text-destructive text-muted-foreground opacity-0 group-hover:opacity-100"
          title="Delete"
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </button>
      </div>
      {/* Always an editable box: an entry is a title *and* a description, so
          the description shouldn't hide behind a hover-only toggle. */}
      <Textarea
        value={text ?? ''}
        placeholder="Description — what it does."
        className="mt-1.5 min-h-14 text-sm"
        onChange={(e) => onText(e.target.value || undefined)}
      />
    </li>
  )
}

/**
 * An un-levelled list — racial traits or feats. Entries keep the order they
 * were added in, since there's no natural sort for either.
 */
function FlatSection({
  heading,
  subtitle,
  entries,
  titlePlaceholder,
  textPlaceholder,
  empty,
  onChange,
}: {
  heading: string
  subtitle?: string
  entries: Array<NamedEntry>
  titlePlaceholder: string
  textPlaceholder: string
  empty: string
  onChange: (next: Array<NamedEntry>) => void
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">
        {heading}
        {subtitle && (
          <span className="text-muted-foreground font-normal">
            {' '}
            — {subtitle}
          </span>
        )}
      </h2>
      <AddForm
        titlePlaceholder={titlePlaceholder}
        textPlaceholder={textPlaceholder}
        onAdd={(name, text) =>
          onChange([...entries, text ? { name, text } : { name }])
        }
      />
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, i) => (
            <EntryRow
              key={`${entry.name}-${i}`}
              name={entry.name}
              text={entry.text}
              onName={(v) =>
                onChange(
                  entries.map((e, j) => (j === i ? { ...e, name: v } : e)),
                )
              }
              onText={(v) =>
                onChange(
                  entries.map((e, j) => (j === i ? { ...e, text: v } : e)),
                )
              }
              onRemove={() => onChange(entries.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export function FeaturesTab({
  character,
  onChange,
}: {
  character: Character
  onChange: (next: Character) => void
}) {
  const [level, setLevel] = useState(character.level)

  // --- class features (grouped by level) -----------------------------------
  const addFeature = (name: string, text: string) =>
    onChange({
      ...character,
      features: [
        ...character.features,
        text ? { level, name, text } : { level, name },
      ],
    })

  // Rows are edited by identity, not index: the list renders sorted, so an
  // index into the sorted view would not match the stored array.
  const updateFeature = (target: ClassFeature, patch: Partial<ClassFeature>) =>
    onChange({
      ...character,
      features: character.features.map((f) =>
        f === target ? { ...f, ...patch } : f,
      ),
    })

  const removeFeature = (target: ClassFeature) =>
    onChange({
      ...character,
      features: character.features.filter((f) => f !== target),
    })

  const sorted = sortedFeatures(character.features)
  const levels = [...new Set(sorted.map((f) => f.level))]

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <FlatSection
        heading="Racial traits"
        subtitle={character.race || undefined}
        entries={character.traits}
        titlePlaceholder="Title, e.g. Darkvision"
        textPlaceholder="Description, e.g. See in dim light within 60 feet as if it were bright light."
        empty="No racial traits yet — Darkvision, Lucky, Fey Ancestry and the like."
        onChange={(traits) => onChange({ ...character, traits })}
      />

      <FlatSection
        heading="Feats"
        entries={character.feats}
        titlePlaceholder="Title, e.g. Sharpshooter"
        textPlaceholder="Description, e.g. Attacking at long range doesn't impose disadvantage, and you ignore half and three-quarters cover."
        empty="No feats yet — taken with an Ability Score Improvement, or at level 1 as a variant human."
        onChange={(feats) => onChange({ ...character, feats })}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Class features
          {character.class && (
            <span className="text-muted-foreground font-normal">
              {' '}
              — {character.class}
            </span>
          )}
        </h2>
        <AddForm
          levelValue={level}
          onLevelChange={setLevel}
          titlePlaceholder="Title, e.g. Cunning Action"
          textPlaceholder="Description, e.g. Can use a bonus action to Dash, Disengage or Hide. [[Wiki links]] and dice like 2d6 stay live on the sheet."
          onAdd={addFeature}
        />
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No features yet. Add what your class grants at each level — a
            rogue's Cunning Action at 2, a subclass feature at 3 — and they
            appear on the sheet preview grouped by level.
          </p>
        ) : (
          <div className="space-y-4">
            {levels.map((lvl) => {
              const earned = lvl <= character.level
              return (
                <section key={lvl}>
                  <h3
                    className={cn(
                      'mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide',
                      earned
                        ? 'text-muted-foreground'
                        : 'text-muted-foreground/60',
                    )}
                  >
                    Level {lvl}
                    {!earned && (
                      <span className="font-normal normal-case tracking-normal">
                        — not yet gained
                      </span>
                    )}
                  </h3>
                  <ul className="space-y-2">
                    {sorted
                      .filter((f) => f.level === lvl)
                      .map((feature, i) => (
                        <EntryRow
                          key={`${feature.name}-${i}`}
                          name={feature.name}
                          text={feature.text}
                          level={feature.level}
                          muted={!earned}
                          onName={(v) => updateFeature(feature, { name: v })}
                          onText={(v) => updateFeature(feature, { text: v })}
                          onLevel={(v) => updateFeature(feature, { level: v })}
                          onRemove={() => removeFeature(feature)}
                        />
                      ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
