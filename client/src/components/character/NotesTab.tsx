import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Columns2,
  ListTree,
  Plus,
  Search,
  Tag,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import {
  SUGGESTED_NOTE_TAGS,
  allNoteTags,
  filterNotes,
  normalizeTag,
  notePreview,
  preserveLineBreaks,
  sortedNotes,
  todayLocal,
} from '#/lib/character'
import type { Character, CharacterNote } from '#/lib/character'
import { cn } from '#/lib/utils'
import { useMarkdownEditor } from '#/lib/useMarkdownEditor'
import { useWikiLinkOpener } from '#/lib/useWikiLinkOpener'
import { MarkdownContextMenu } from '#/components/MarkdownContextMenu'
import type { ContextMenuEditor } from '#/components/MarkdownContextMenu'
import { LiveMarkdownEditor } from '#/components/LiveMarkdownEditor'
import type { LiveEditorHandle } from '#/components/LiveMarkdownEditor'
import { padBlock } from '#/lib/markdownEditing'
import { useWorldSettings } from '#/lib/useWorldSettings'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { InlineMarkdown, PANEL_PROSE } from '#/components/Markdown'

/**
 * Session notes, organised. Each note carries an optional title, a date, any
 * number of freeform tags and a markdown body. The tab is a three-pane
 * workspace — a note list on the left to navigate a campaign's worth of recaps,
 * the selected note's body in the middle, and an optional rendered preview —
 * with a search box and tag chips narrowing the list.
 *
 * Bodies are full markdown via the app's own renderer, so headings, bullets,
 * [[wiki links]] and clickable dice all behave the way they do in an article.
 */

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

/**
 * Which panes the Notes tab shows, remembered across sessions.
 *
 * Live edit deliberately reads the SAME key the article editor and the Story
 * tab use: it is a preference about the editing surface itself, not about one
 * tab, and finding it on in one place and off in another is the surprise.
 */
const NOTES_PANES_KEY = 'dm.characterNotesPanes'
const LIVE_EDIT_KEY = 'dm.articleLiveEdit'

function loadPanes(): { list: boolean; preview: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTES_PANES_KEY) ?? '') as {
      list?: boolean
      preview?: boolean
    }
    return { list: raw.list !== false, preview: raw.preview === true }
  } catch {
    // The list is the navigation, so it defaults ON; the preview does not.
    return { list: true, preview: false }
  }
}

function loadLiveEdit(): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(LIVE_EDIT_KEY) ?? '') as {
      on?: boolean
    }
    return raw.on === true
  } catch {
    return false
  }
}

/** A row in the left-hand note list. */
function NoteListRow({
  note,
  selected,
  onSelect,
  onTagClick,
  activeTags,
}: {
  note: CharacterNote
  selected: boolean
  onSelect: () => void
  onTagClick: (tag: string) => void
  activeTags: Array<string>
}) {
  const heading =
    note.title?.trim() || notePreview(note.text) || 'Untitled note'
  return (
    <li>
      <button
        type="button"
        className={cn(
          'w-full border-l-2 px-3 py-2 text-left',
          selected
            ? 'border-primary bg-accent'
            : 'hover:bg-accent/50 border-transparent',
        )}
        onClick={onSelect}
      >
        <span className="block truncate text-xs font-medium">{heading}</span>
        <span className="text-muted-foreground mt-0.5 block text-[10px] tabular-nums">
          {note.at}
        </span>
        {note.tags && note.tags.length > 0 && (
          <span className="mt-1 block">
            <TagChips
              tags={note.tags}
              onClick={onTagClick}
              active={activeTags}
            />
          </span>
        )}
      </button>
    </li>
  )
}

/**
 * Session notes as a three-pane workspace: the note list navigates, the middle
 * pane edits the selected note's markdown body, and an optional preview renders
 * it. Title, date and tags ride in a header strip above the editor, because a
 * note is a record rather than a document and those fields have nowhere else to
 * live.
 *
 * A note carries no id of its own — adding one would leak into the YAML and out
 * of Obsidian — so a note is addressed by its index in `character.notes`, and
 * every mutation below has to slide the selection along with it.
 */
export function NotesTab({
  character,
  onChange,
  worldId,
  articles,
  noteTitles,
  onOpenNote,
  onCreateMissing,
  selectIndex,
  onSelectIndexHandled,
}: {
  character: Character
  onChange: (next: Character) => void
  worldId: string
  articles?: Array<{ id: string; title: string }>
  noteTitles?: Array<string>
  onOpenNote?: (title: string) => void
  onCreateMissing?: (title: string) => void
  /**
   * Select this note index once, then call `onSelectIndexHandled`. The vault
   * creates a note from a [[link]] and wants it open; a note is addressed by
   * index (see below), and a freshly created one is always prepended, so the
   * caller passes 0.
   */
  selectIndex?: number | null
  onSelectIndexHandled?: () => void
}) {
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<Array<string>>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [panes, setPanes] = useState(loadPanes)
  const [rememberedLiveEdit, setRememberedLiveEdit] = useState(loadLiveEdit)
  const liveEditorRef = useRef<LiveEditorHandle>(null)
  const [liveHasSelection, setLiveHasSelection] = useState(false)

  useEffect(() => {
    localStorage.setItem(NOTES_PANES_KEY, JSON.stringify(panes))
  }, [panes])
  useEffect(() => {
    localStorage.setItem(
      LIVE_EDIT_KEY,
      JSON.stringify({ on: rememberedLiveEdit }),
    )
  }, [rememberedLiveEdit])

  const worldLiveEdit = useWorldSettings(worldId).data?.liveEdit ?? 'remember'
  const liveEdit =
    worldLiveEdit === 'remember'
      ? rememberedLiveEdit
      : worldLiveEdit === 'always'

  const openWikiLink = useWikiLinkOpener({
    worldId,
    articles,
    noteTitles,
    onNote: onOpenNote,
    onMissing: onCreateMissing,
  })

  const known = useMemo(() => allNoteTags(character.notes), [character.notes])
  // Carry each note's stored index through the sort/filter so a row maps back
  // to its slot in `character.notes`.
  const shown = useMemo(() => {
    const indexOf = new Map(character.notes.map((n, i) => [n, i]))
    return sortedNotes(filterNotes(character.notes, query, activeTags)).map(
      (note) => ({ note, index: indexOf.get(note) as number }),
    )
  }, [character.notes, query, activeTags])

  // An explicit request wins over the repair below, which would otherwise
  // land on shown[0] first — visible whenever a search query is active and
  // shown[0] is not notes[0].
  useEffect(() => {
    if (selectIndex == null) return
    if (selectIndex < character.notes.length) setSelected(selectIndex)
    onSelectIndexHandled?.()
  }, [selectIndex, character.notes.length, onSelectIndexHandled])

  // Keep a valid selection: land on the first visible note, and never point at
  // an index the notes array no longer has.
  useEffect(() => {
    if (selectIndex != null) return
    if (selected !== null && selected < character.notes.length) return
    setSelected(shown.length > 0 ? shown[0].index : null)
  }, [character.notes.length, shown, selected, selectIndex])

  const note = selected !== null ? character.notes[selected] : undefined

  const patch = (changes: Partial<CharacterNote>) => {
    if (selected === null) return
    onChange({
      ...character,
      notes: character.notes.map((n, i) =>
        i === selected ? { ...n, ...changes } : n,
      ),
    })
  }

  const addNote = () => {
    const fresh: CharacterNote = { at: todayLocal(), text: '' }
    // Prepending shifts every stored index by one, the selection included.
    onChange({ ...character, notes: [fresh, ...character.notes] })
    setSelected(0)
  }

  const removeSelected = () => {
    if (selected === null || !note) return
    const heading = note.title?.trim() || notePreview(note.text)
    if (!confirm(`Delete "${heading || 'this note'}"? This cannot be undone.`))
      return
    onChange({
      ...character,
      notes: character.notes.filter((_, i) => i !== selected),
    })
    // The effect above re-lands the selection once the array is shorter.
    setSelected(null)
  }

  const toggleTag = (tag: string) =>
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )

  const editor = useMarkdownEditor({
    onFallbackChange: (value) => patch({ text: value }),
    onWikiLinkOpen: openWikiLink,
  })

  /**
   * Insert routing. In live-edit mode the textarea is not mounted, so
   * `useMarkdownEditor` would silently no-op — the context menu has to ask
   * CodeMirror instead. Same two shims the article route and Story tab use.
   */
  const insertAtCursor = (text: string) => {
    if (liveEditorRef.current) liveEditorRef.current.insert(text)
    else editor.insertText(text)
  }
  const insertBlock = (snippet: string) => {
    if (liveEditorRef.current)
      liveEditorRef.current.transform((text, start, end) =>
        padBlock(text, { start, end }, snippet),
      )
    else editor.insertBlock(snippet)
  }

  const liveMenuEditor: ContextMenuEditor = {
    // Sampled as the menu opens: opening it moves focus off the editor, so a
    // live read reports "no selection" by the time Cut and Copy render.
    onContextMenu: () =>
      setLiveHasSelection(liveEditorRef.current?.hasSelection() ?? false),
    hasSelection: liveHasSelection,
    execEditorCommand: (command) => liveEditorRef.current?.execCommand(command),
    wrap: (wrapper) => liveEditorRef.current?.wrap(wrapper),
    transform: (fn) => liveEditorRef.current?.transform(fn),
    insertBlock,
    insertText: insertAtCursor,
  }

  return (
    <div className="flex h-full min-h-0">
      {panes.list && (
        <div className="flex w-64 shrink-0 flex-col border-r">
          <div className="shrink-0 space-y-2 border-b p-2">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                placeholder="Search notes…"
                className="h-8 pl-7 text-sm"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 flex-1 text-xs"
                onClick={addNote}
              >
                <Plus className="size-3.5" /> New note
              </Button>
              {(activeTags.length > 0 || query) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
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
          </div>
          {shown.length === 0 ? (
            <p className="text-muted-foreground p-3 text-xs">
              {character.notes.length === 0
                ? 'No notes yet. Session recaps, world lore this character learned, grudges sworn — give each one a title and a tag or two and they stay findable.'
                : 'No notes match that search.'}
            </p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {shown.map(({ note: row, index }) => (
                <NoteListRow
                  key={index}
                  note={row}
                  selected={selected === index}
                  onSelect={() => setSelected(index)}
                  onTagClick={toggleTag}
                  activeTags={activeTags}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1">
          <Button
            variant={panes.list ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            title="Show the note list"
            onClick={() => setPanes((p) => ({ ...p, list: !p.list }))}
          >
            <ListTree className="size-3.5" /> Notes
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {worldLiveEdit === 'remember' && (
              <Button
                variant={liveEdit ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                title="Experimental: hide markdown syntax while editing. Set a default for the whole world in Settings."
                onClick={() => setRememberedLiveEdit((v) => !v)}
              >
                <WandSparkles className="size-3.5" /> Live edit
              </Button>
            )}
            <Button
              variant={panes.preview ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              title="Show a live preview beside the editor"
              onClick={() => setPanes((p) => ({ ...p, preview: !p.preview }))}
            >
              <Columns2 className="size-3.5" /> Live preview
            </Button>
          </div>
        </div>

        {!note ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-sm">
            {character.notes.length === 0
              ? 'No notes yet — start one with New note.'
              : 'Select a note to edit it.'}
          </div>
        ) : (
          <>
            {/* Header strip: a note is a record, so its title, date and tags
                need a home above the body editor. */}
            <div className="shrink-0 space-y-2 border-b p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={note.title ?? ''}
                  placeholder="Title, e.g. Ambush at Daggerford"
                  className="h-8 min-w-56 flex-1 text-sm font-medium"
                  onChange={(e) =>
                    patch({ title: e.target.value || undefined })
                  }
                />
                <Input
                  type="date"
                  value={note.at}
                  className="h-8 w-36 text-xs"
                  onChange={(e) => patch({ at: e.target.value })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  title="Delete this note"
                  onClick={removeSelected}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <TagEditor
                tags={note.tags ?? []}
                known={known}
                onChange={(tags) =>
                  patch({ tags: tags.length > 0 ? tags : undefined })
                }
              />
            </div>

            <div className="flex min-h-0 flex-1">
              {liveEdit ? (
                <MarkdownContextMenu editor={liveMenuEditor}>
                  <LiveMarkdownEditor
                    // Remount per note: CodeMirror owns its document and its own
                    // undo history, so reusing one view across notes would carry
                    // note A's history into note B and let an undo write A's
                    // text over B.
                    key={selected ?? 'none'}
                    ref={liveEditorRef}
                    value={note.text}
                    className="min-h-0 min-w-0 flex-1 overflow-hidden"
                    onWikiLinkOpen={openWikiLink}
                    articles={articles}
                    onChange={(next) => patch({ text: next })}
                  />
                </MarkdownContextMenu>
              ) : (
                <MarkdownContextMenu editor={editor}>
                  <Textarea
                    ref={editor.ref}
                    value={note.text}
                    placeholder="What happened? Markdown works — ## headings, - bullets, **bold**, [[Wiki links]] and dice like 2d6."
                    className={cn(
                      'h-full min-h-0 flex-1 resize-none rounded-none border-none font-mono text-sm shadow-none focus-visible:ring-0',
                      editor.wikiLinkHovered && 'cursor-pointer',
                    )}
                    onChange={(e) => patch({ text: e.target.value })}
                    onClick={editor.onClick}
                    onMouseMove={editor.onMouseMove}
                    onMouseLeave={editor.onMouseLeave}
                    onKeyDown={editor.onKeyDown}
                    onBeforeInput={editor.onBeforeInput}
                  />
                </MarkdownContextMenu>
              )}
              {panes.preview && (
                <div className="w-1/2 shrink-0 overflow-y-auto border-l p-3">
                  {note.text.trim() ? (
                    <InlineMarkdown
                      className={PANEL_PROSE}
                      worldId={worldId}
                      articles={articles}
                      noteTitles={noteTitles}
                      onOpenNote={onOpenNote}
                      onCreateMissing={onCreateMissing}
                    >
                      {/* Same hard-break handling the sheet uses, or a note
                          written one line per beat collapses into a paragraph
                          here and reads correctly when printed. */}
                      {preserveLineBreaks(note.text)}
                    </InlineMarkdown>
                  ) : (
                    <p className="text-muted-foreground text-sm italic">
                      Start typing to see the preview.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
