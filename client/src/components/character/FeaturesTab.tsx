import { useMemo, useRef, useState } from 'react'
import { ChevronRight, Plus, Search, X } from 'lucide-react'
import {
  FEATURE_SOURCE_NAMES,
  addFeatureEntry,
  featureBadge,
  featureEntries,
  filterFeatures,
  isUnearned,
  preserveLineBreaks,
  removeFeatureEntry,
  updateFeatureEntry,
} from '#/lib/character'
import type { Character, FeatureEntry, FeatureSource } from '#/lib/character'
import { cn } from '#/lib/utils'
import { useMarkdownEditor } from '#/lib/useMarkdownEditor'
import { useWikiLinkOpener } from '#/lib/useWikiLinkOpener'
import { MarkdownContextMenu } from '#/components/MarkdownContextMenu'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { InlineMarkdown, PANEL_PROSE } from '#/components/Markdown'
import { NumField } from './NumField'

/**
 * Racial traits, feats and class features in a single badged list. They live in
 * three separate frontmatter arrays (only class features carry a level), but
 * three stacked sections made anything hard to find, so the editor merges them
 * and marks each row with where it came from.
 *
 * Rows collapse to a title line and expand to an editor — a level 12 character
 * has twenty-odd features, and always-open textareas turned that into a page of
 * scrolling. Descriptions render as markdown when collapsed-open for reading and
 * swap to a raw textarea while editing.
 */

type Filter = 'all' | FeatureSource

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'trait', label: 'Racial' },
  { id: 'feat', label: 'Feats' },
  { id: 'class', label: 'Class' },
]

/** Per-source colour, so the eye can sort the list without reading badges. */
const BADGE_CLASS: Record<FeatureSource, string> = {
  trait: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  feat: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  class: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
}

function Badge({ entry }: { entry: FeatureEntry }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        BADGE_CLASS[entry.source],
      )}
    >
      {featureBadge(entry)}
    </span>
  )
}

/** The add form, which picks a source and only asks for a level when relevant. */
function AddForm({
  character,
  onAdd,
  onWikiLinkOpen,
}: {
  character: Character
  onAdd: (
    source: FeatureSource,
    name: string,
    text: string,
    level: number,
  ) => void
  onWikiLinkOpen?: (title: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<FeatureSource>('class')
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [level, setLevel] = useState(character.level)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const editor = useMarkdownEditor({
    ref: textRef,
    onFallbackChange: setText,
    onWikiLinkOpen,
  })

  const submit = () => {
    if (!name.trim()) return
    onAdd(source, name.trim(), text.trim(), level)
    setName('')
    setText('')
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Add feature
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Source first: it decides whether a level is even meaningful. */}
        <div className="flex gap-1">
          {(['trait', 'feat', 'class'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={cn(
                'rounded px-2 py-1 text-xs',
                source === id
                  ? BADGE_CLASS[id]
                  : 'text-muted-foreground hover:bg-muted',
              )}
              onClick={() => setSource(id)}
            >
              {FEATURE_SOURCE_NAMES[id]}
            </button>
          ))}
        </div>
        {source === 'class' && (
          <label className="flex items-center gap-1 text-sm">
            Level
            <NumField
              value={level}
              min={1}
              max={20}
              className="w-12"
              onCommit={setLevel}
            />
          </label>
        )}
      </div>
      <Input
        autoFocus
        value={name}
        placeholder={
          source === 'trait'
            ? 'Title, e.g. Darkvision'
            : source === 'feat'
              ? 'Title, e.g. Sharpshooter'
              : 'Title, e.g. Cunning Action'
        }
        className="h-8 text-sm"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          // Enter in the title jumps to the description rather than submitting,
          // so a description is the norm and not an afterthought.
          if (e.key === 'Enter') {
            e.preventDefault()
            textRef.current?.focus()
          }
        }}
      />
      <MarkdownContextMenu editor={editor}>
        <Textarea
          ref={textRef}
          value={text}
          placeholder="Description — what it does. [[Wiki links]] and dice like 2d6 stay live."
          className={cn(
            'min-h-16 text-sm',
            editor.wikiLinkHovered && 'cursor-pointer',
          )}
          onChange={(e) => setText(e.target.value)}
          onClick={editor.onClick}
          onMouseMove={editor.onMouseMove}
          onMouseLeave={editor.onMouseLeave}
          onBeforeInput={editor.onBeforeInput}
          onKeyDown={(e) => {
            // Ctrl+Enter opens a [[link]] when the caret is in one, and
            // otherwise submits the feature.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              editor.onKeyDown(e)
              if (!e.defaultPrevented) submit()
            } else editor.onKeyDown(e)
          }}
        />
      </MarkdownContextMenu>
      <div className="flex gap-2">
        <Button size="sm" disabled={!name.trim()} onClick={submit}>
          <Plus className="size-3.5" /> Add
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false)
            setName('')
            setText('')
          }}
        >
          Done
        </Button>
      </div>
    </div>
  )
}

/** One row: collapsed to a title line, expanded to a reader/editor. */
function FeatureRow({
  entry,
  muted,
  expanded,
  editing,
  worldId,
  articles,
  onCreateMissing,
  onWikiLinkOpen,
  onToggle,
  onEdit,
  onChange,
  onRemove,
}: {
  entry: FeatureEntry
  muted: boolean
  expanded: boolean
  editing: boolean
  worldId?: string
  articles?: Array<{ id: string; title: string }>
  onCreateMissing?: (title: string) => void
  onWikiLinkOpen?: (title: string) => void
  onToggle: () => void
  onEdit: () => void
  onChange: (patch: { name?: string; text?: string; level?: number }) => void
  onRemove: () => void
}) {
  const editor = useMarkdownEditor({
    onFallbackChange: (value) => onChange({ text: value }),
    onWikiLinkOpen,
  })
  return (
    <li className={cn('group rounded-md border', muted && 'opacity-60')}>
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onToggle}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 transition-transform',
              expanded && 'rotate-90',
            )}
          />
          <span className="text-foreground truncate text-sm font-medium">
            {entry.name || 'Untitled'}
          </span>
          <Badge entry={entry} />
          {muted && (
            <span className="text-muted-foreground shrink-0 text-[10px]">
              not yet gained
            </span>
          )}
        </button>
        <button
          type="button"
          className="hover:text-destructive text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100"
          title="Delete"
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t px-2.5 py-2">
          {editing ? (
            <>
              <div className="flex items-center gap-2">
                <Input
                  value={entry.name}
                  placeholder="Title"
                  className="h-7 flex-1 text-sm font-medium"
                  onChange={(e) => onChange({ name: e.target.value })}
                />
                {entry.source === 'class' && (
                  <label className="text-muted-foreground flex items-center gap-1 text-xs">
                    Lv
                    <NumField
                      value={entry.level ?? 1}
                      min={1}
                      max={20}
                      className="w-12"
                      onCommit={(v) => onChange({ level: v })}
                    />
                  </label>
                )}
              </div>
              <MarkdownContextMenu editor={editor}>
                <Textarea
                  autoFocus
                  ref={editor.ref}
                  value={entry.text ?? ''}
                  placeholder="Description — what it does."
                  className={cn(
                    'min-h-24 text-sm',
                    editor.wikiLinkHovered && 'cursor-pointer',
                  )}
                  onChange={(e) => onChange({ text: e.target.value })}
                  onClick={editor.onClick}
                  onMouseMove={editor.onMouseMove}
                  onMouseLeave={editor.onMouseLeave}
                  onKeyDown={editor.onKeyDown}
                  onBeforeInput={editor.onBeforeInput}
                />
              </MarkdownContextMenu>
              <Button size="sm" variant="ghost" onClick={onEdit}>
                Done
              </Button>
            </>
          ) : (
            <>
              {/* Rendered, not raw: wiki links and dice are live here the same
                  as they are on the printed sheet. */}
              {entry.text?.trim() ? (
                <InlineMarkdown
                  className={PANEL_PROSE}
                  worldId={worldId}
                  articles={articles}
                  onCreateMissing={onCreateMissing}
                >
                  {preserveLineBreaks(entry.text)}
                </InlineMarkdown>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  No description yet.
                </p>
              )}
              <Button size="sm" variant="ghost" onClick={onEdit}>
                Edit
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

export function FeaturesTab({
  character,
  onChange,
  worldId,
  articles,
  onCreateMissing,
}: {
  character: Character
  onChange: (next: Character) => void
  worldId?: string
  articles?: Array<{ id: string; title: string }>
  onCreateMissing?: (title: string) => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  // Ctrl+Click / Ctrl+Enter on a [[link]] while editing a feature's markdown.
  const openWikiLink = useWikiLinkOpener({
    worldId,
    articles,
    onMissing: onCreateMissing,
  })
  // Keyed by source+index rather than by object identity: rows are recreated on
  // every edit, so identity would collapse the row you are typing in.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<string | null>(null)

  const entries = useMemo(() => featureEntries(character), [character])
  const shown = useMemo(() => {
    const byFilter =
      filter === 'all' ? entries : entries.filter((e) => e.source === filter)
    return filterFeatures(byFilter, query)
  }, [entries, filter, query])

  const keyOf = (e: FeatureEntry) => `${e.source}:${e.index}`
  const counts = {
    all: entries.length,
    trait: character.traits.length,
    feat: character.feats.length,
    class: character.features.length,
  }

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            placeholder="Search features…"
            className="h-8 pl-7 text-sm"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={cn(
                'rounded px-2 py-1 text-xs',
                filter === f.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
              onClick={() => setFilter(f.id)}
            >
              {f.label} ({counts[f.id]})
            </button>
          ))}
        </div>
      </div>

      <AddForm
        character={character}
        onWikiLinkOpen={openWikiLink}
        onAdd={(source, name, text, level) =>
          onChange({
            ...character,
            ...addFeatureEntry(character, source, name, text, level),
          })
        }
      />

      {entries.length > 0 && shown.length > 1 && (
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(new Set(shown.map(keyOf)))}
          >
            Expand all
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              setExpanded(new Set())
              setEditing(null)
            }}
          >
            Collapse all
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {entries.length === 0
            ? 'Nothing yet. Add a racial trait like Darkvision, a feat like Sharpshooter, or a class feature such as Cunning Action at level 2 — they all land in this one list, badged by where they came from.'
            : 'No features match that search.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((entry) => {
            const key = keyOf(entry)
            return (
              <FeatureRow
                key={key}
                entry={entry}
                muted={isUnearned(entry, character)}
                expanded={expanded.has(key)}
                editing={editing === key}
                worldId={worldId}
                articles={articles}
                onCreateMissing={onCreateMissing}
                onWikiLinkOpen={openWikiLink}
                onToggle={() => toggle(key)}
                onEdit={() => {
                  // Editing implies expanded — clicking Edit on a collapsed row
                  // should never leave you typing into something invisible.
                  setExpanded((prev) => new Set(prev).add(key))
                  setEditing(editing === key ? null : key)
                }}
                onChange={(patch) =>
                  onChange({
                    ...character,
                    ...updateFeatureEntry(character, entry, patch),
                  })
                }
                onRemove={() => {
                  setEditing(null)
                  onChange({
                    ...character,
                    ...removeFeatureEntry(character, entry),
                  })
                }}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}
