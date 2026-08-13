import { useMemo, useState } from 'react'
import { ChevronRight, Pencil, Plus, Search, Tag, X } from 'lucide-react'
import {
  SUGGESTED_NOTE_TAGS,
  allNoteTags,
  filterNotes,
  normalizeTag,
  normalizeTags,
  notePreview,
  preserveLineBreaks,
  sortedNotes,
} from '#/lib/character'
import type { Character, CharacterNote } from '#/lib/character'
import { cn } from '#/lib/utils'
import { useMarkdownEditor } from '#/lib/useMarkdownEditor'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { InlineMarkdown, PANEL_PROSE } from '#/components/Markdown'

/**
 * Session notes, organised. Each note carries an optional title, a date, any
 * number of freeform tags and a markdown body; the list collapses to one row per
 * note so a campaign's worth of recaps stays navigable, and a search box plus
 * tag chips narrow it down.
 *
 * Bodies are full markdown via the app's own renderer, so headings, bullets,
 * [[wiki links]] and clickable dice all behave the way they do in an article.
 */

/** Today as YYYY-MM-DD in local time — `toISOString` would use UTC and can
 *  stamp yesterday's date on an evening session. */
function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The tag chips under a note: click to remove while editing. */
function TagChips({
  tags,
  onRemove,
  onClick,
  active,
}: {
  tags: Array<string>
  onRemove?: (tag: string) => void
  onClick?: (tag: string) => void
  active?: Array<string>
}) {
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]',
            active?.includes(tag)
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground',
            onClick && 'hover:bg-primary/20 cursor-pointer',
          )}
          onClick={onClick ? () => onClick(tag) : undefined}
        >
          #{tag}
          {onRemove && (
            <button
              type="button"
              className="hover:text-destructive"
              title={`Remove #${tag}`}
              onClick={(e) => {
                e.stopPropagation()
                onRemove(tag)
              }}
            >
              <X className="size-2.5" />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

/** Tag input: comma or Enter commits, and known tags are offered as chips. */
function TagEditor({
  tags,
  known,
  onChange,
}: {
  tags: Array<string>
  known: Array<string>
  onChange: (next: Array<string>) => void
}) {
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const tag = normalizeTag(raw)
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setDraft('')
  }

  // Anything already on this note is not worth suggesting again.
  const suggestions = [...new Set([...known, ...SUGGESTED_NOTE_TAGS])]
    .filter((t) => !tags.includes(t))
    .slice(0, 8)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Tag className="text-muted-foreground size-3.5 shrink-0" />
        <Input
          value={draft}
          placeholder="Add a tag, e.g. session"
          className="h-7 flex-1 text-xs"
          onChange={(e) => {
            // Typing a comma commits, which is how people type tag lists.
            if (e.target.value.includes(',')) commit(e.target.value)
            else setDraft(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(draft)
            }
            // Backspace on an empty box pulls back the last tag.
            if (e.key === 'Backspace' && !draft && tags.length > 0) {
              onChange(tags.slice(0, -1))
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
        />
      </div>
      <TagChips
        tags={tags}
        onRemove={(t) => onChange(tags.filter((x) => x !== t))}
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              className="text-muted-foreground hover:bg-muted rounded border border-dashed px-1.5 py-0.5 text-[10px]"
              onClick={() => commit(tag)}
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The composer for a new note. */
function AddNote({
  known,
  onAdd,
}: {
  known: Array<string>
  onAdd: (note: CharacterNote) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [at, setAt] = useState(today())
  const [tags, setTags] = useState<Array<string>>([])
  const editor = useMarkdownEditor({ onFallbackChange: setText })

  const submit = () => {
    if (!text.trim() && !title.trim()) return
    const note: CharacterNote = { at, text: text.trim() }
    if (title.trim()) note.title = title.trim()
    if (tags.length > 0) note.tags = normalizeTags(tags)
    onAdd(note)
    setTitle('')
    setText('')
    setTags([])
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> New note
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={title}
          placeholder="Title, e.g. Ambush at Daggerford"
          className="h-8 min-w-56 flex-1 text-sm font-medium"
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          type="date"
          value={at}
          className="h-8 w-36 text-xs"
          onChange={(e) => setAt(e.target.value)}
        />
      </div>
      <Textarea
        ref={editor.ref}
        value={text}
        placeholder="What happened? Markdown works — ## headings, - bullets, **bold**, [[Wiki links]] and dice like 2d6."
        className="min-h-28 text-sm"
        onChange={(e) => setText(e.target.value)}
        onBeforeInput={editor.onBeforeInput}
        onKeyDown={(e) => {
          // Ctrl+Enter submits; everything else is a formatting shortcut.
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
          else editor.onKeyDown(e)
        }}
      />
      <TagEditor tags={tags} known={known} onChange={setTags} />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!text.trim() && !title.trim()}
          onClick={submit}
        >
          <Plus className="size-3.5" /> Add note
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false)
            setTitle('')
            setText('')
            setTags([])
          }}
        >
          Done
        </Button>
      </div>
    </div>
  )
}

/** One note: a collapsed header row, expanding to the rendered or raw body. */
function NoteRow({
  note,
  expanded,
  editing,
  known,
  worldId,
  articles,
  onCreateMissing,
  onToggle,
  onEdit,
  onChange,
  onRemove,
  onTagClick,
  activeTags,
}: {
  note: CharacterNote
  expanded: boolean
  editing: boolean
  known: Array<string>
  worldId: string
  articles?: Array<{ id: string; title: string }>
  onCreateMissing?: (title: string) => void
  onToggle: () => void
  onEdit: () => void
  onChange: (patch: Partial<CharacterNote>) => void
  onRemove: () => void
  onTagClick: (tag: string) => void
  activeTags: Array<string>
}) {
  const heading =
    note.title?.trim() || notePreview(note.text) || 'Untitled note'
  const editor = useMarkdownEditor({
    onFallbackChange: (value) => onChange({ text: value }),
  })

  return (
    <li className="group rounded-md border">
      <div className="flex items-start gap-2 p-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
          onClick={onToggle}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronRight
            className={cn(
              'size-3.5 transition-transform',
              expanded && 'rotate-90',
            )}
          />
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onToggle}
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="truncate text-sm font-medium">{heading}</span>
            {note.at && (
              <span className="text-muted-foreground shrink-0 text-[11px]">
                {note.at}
              </span>
            )}
          </div>
          {/* When a title is set the first body line is still worth showing
              collapsed — it is usually the sentence you are looking for. */}
          {!expanded && note.title?.trim() && notePreview(note.text) && (
            <p className="text-muted-foreground truncate text-xs">
              {notePreview(note.text)}
            </p>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <TagChips
            tags={note.tags ?? []}
            onClick={onTagClick}
            active={activeTags}
          />
          <button
            type="button"
            className="hover:text-foreground text-muted-foreground opacity-0 group-hover:opacity-100"
            title={editing ? 'Done editing' : 'Edit note'}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            className="hover:text-destructive text-muted-foreground opacity-0 group-hover:opacity-100"
            title="Delete note"
            onClick={onRemove}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 border-t px-2.5 py-2">
          {editing ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={note.title ?? ''}
                  placeholder="Title"
                  className="h-7 min-w-48 flex-1 text-sm font-medium"
                  onChange={(e) =>
                    onChange({ title: e.target.value || undefined })
                  }
                />
                <Input
                  type="date"
                  value={note.at}
                  className="h-7 w-36 text-xs"
                  onChange={(e) => onChange({ at: e.target.value })}
                />
              </div>
              <Textarea
                autoFocus
                ref={editor.ref}
                value={note.text}
                className="min-h-32 text-sm"
                placeholder="Markdown works here."
                onChange={(e) => onChange({ text: e.target.value })}
                onKeyDown={editor.onKeyDown}
                onBeforeInput={editor.onBeforeInput}
              />
              <TagEditor
                tags={note.tags ?? []}
                known={known}
                onChange={(tags) =>
                  onChange({ tags: tags.length > 0 ? tags : undefined })
                }
              />
              <Button size="sm" variant="ghost" onClick={onEdit}>
                Done
              </Button>
            </>
          ) : note.text.trim() ? (
            <InlineMarkdown
              className={PANEL_PROSE}
              worldId={worldId}
              articles={articles}
              onCreateMissing={onCreateMissing}
            >
              {/* Same hard-break handling the sheet uses, or a note written one
                  line per beat collapses into a paragraph here and reads
                  correctly when printed. */}
              {preserveLineBreaks(note.text)}
            </InlineMarkdown>
          ) : (
            <p className="text-muted-foreground text-sm italic">Empty note.</p>
          )}
        </div>
      )}
    </li>
  )
}

export function NotesTab({
  character,
  onChange,
  worldId,
  articles,
  onCreateMissing,
}: {
  character: Character
  onChange: (next: Character) => void
  worldId: string
  articles?: Array<{ id: string; title: string }>
  onCreateMissing?: (title: string) => void
}) {
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<Array<string>>([])
  // Keyed by stored-array index, not note object. Object identity would be
  // correct until something upstream reparses the character (an autosave
  // round-trip does exactly that), at which point every note is a fresh object
  // and the row you were typing in silently collapses. Notes carry no id of
  // their own — adding one would leak into the YAML and out of Obsidian — so
  // the position in `character.notes` is the stable handle.
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<number | null>(null)

  const known = useMemo(() => allNoteTags(character.notes), [character.notes])
  // Carry each note's stored index through the sort/filter so the view can map
  // a row back to its slot in `character.notes`.
  const shown = useMemo(() => {
    const indexOf = new Map(character.notes.map((n, i) => [n, i]))
    return sortedNotes(filterNotes(character.notes, query, activeTags)).map(
      (note) => ({ note, index: indexOf.get(note) as number }),
    )
  }, [character.notes, query, activeTags])

  const patch = (index: number, changes: Partial<CharacterNote>) => {
    onChange({
      ...character,
      notes: character.notes.map((n, i) =>
        i === index ? { ...n, ...changes } : n,
      ),
    })
  }

  const toggleTag = (tag: string) =>
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            placeholder="Search notes…"
            className="h-8 pl-7 text-sm"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {(activeTags.length > 0 || query) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery('')
              setActiveTags([])
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {known.length > 0 && (
        <TagChips tags={known} onClick={toggleTag} active={activeTags} />
      )}

      <AddNote
        known={known}
        onAdd={(note) => {
          // Prepending shifts every stored index by one; slide the open rows
          // along with them so nothing collapses when a note is added.
          onChange({ ...character, notes: [note, ...character.notes] })
          setExpanded((prev) => new Set([...prev].map((i) => i + 1)))
          setEditing((prev) => (prev === null ? null : prev + 1))
        }}
      />

      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {character.notes.length === 0
            ? 'No notes yet. Session recaps, world lore this character learned, grudges sworn — give each one a title and a tag or two and they stay findable.'
            : 'No notes match that search.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map(({ note, index }) => (
            <NoteRow
              key={index}
              note={note}
              expanded={expanded.has(index)}
              editing={editing === index}
              known={known}
              worldId={worldId}
              articles={articles}
              onCreateMissing={onCreateMissing}
              onToggle={() =>
                setExpanded((prev) => {
                  const next = new Set(prev)
                  if (next.has(index)) next.delete(index)
                  else next.add(index)
                  return next
                })
              }
              onEdit={() => {
                setExpanded((prev) => new Set(prev).add(index))
                setEditing(editing === index ? null : index)
              }}
              onChange={(changes) => patch(index, changes)}
              onRemove={() => {
                onChange({
                  ...character,
                  notes: character.notes.filter((_, i) => i !== index),
                })
                // Everything after the removed slot shifts down one.
                const shift = (i: number) => (i > index ? i - 1 : i)
                setExpanded((prev) => {
                  const next = new Set<number>()
                  for (const i of prev) if (i !== index) next.add(shift(i))
                  return next
                })
                setEditing((prev) =>
                  prev === null || prev === index ? null : shift(prev),
                )
              }}
              onTagClick={toggleTag}
              activeTags={activeTags}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
