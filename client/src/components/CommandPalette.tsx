import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FileText, Hash, Search, Terminal, User } from 'lucide-react'
import { api } from '#/lib/api'
import type { RankedResult } from '#/lib/api'
import { matchCommands } from '#/lib/commands'
import { useWorldMode } from '#/lib/useWorldSettings'
import type { Command } from '#/lib/commands'
import { useShortcut, useSuspendShortcuts } from '#/lib/useShortcut'
import { Dialog, DialogContent, DialogTitle } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'

/**
 * Prefix-driven modes. A bare query searches articles; `>` runs commands and
 * `#` browses tags — the only way in the app to discover which tags exist.
 *
 * `tagged` has no prefix of its own because it is not something you can type:
 * it is where picking a tag lands. Choosing a tag used to drop its text into
 * article search, which matched the *word* in bodies rather than the frontmatter
 * tag — `#npc` found every article mentioning "npc" and missed the tagged ones
 * that never say it. This mode runs the real query instead, the same
 * `api.worlds.query` a smart view uses.
 */
type Mode = 'articles' | 'commands' | 'tags' | 'tagged' | 'help'

function modeOf(input: string): { mode: Mode; term: string } {
  if (input.startsWith('>')) return { mode: 'commands', term: input.slice(1) }
  if (input.startsWith('#')) return { mode: 'tags', term: input.slice(1) }
  if (input.startsWith('?')) return { mode: 'help', term: '' }
  return { mode: 'articles', term: input }
}

const HELP_ROWS = [
  { prefix: '', label: 'Search articles by title or content' },
  { prefix: '>', label: 'Run a command' },
  { prefix: '#', label: 'Browse tags used in this world' },
  { prefix: '?', label: 'Show this help' },
]

/** Bolds the characters of the title that the query matched. */
function HighlightedTitle({
  title,
  ranges,
}: {
  title: string
  ranges: Array<[number, number]>
}) {
  if (ranges.length === 0) return <>{title}</>
  const parts: Array<React.ReactNode> = []
  let cursor = 0
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(title.slice(cursor, start))
    parts.push(
      <span key={i} className="text-foreground font-semibold">
        {title.slice(start, end)}
      </span>,
    )
    cursor = end
  })
  if (cursor < title.length) parts.push(title.slice(cursor))
  return <>{parts}</>
}

export function CommandPalette({ worldId }: { worldId: string }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [term, setTerm] = useState('')
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  /** Focus to restore on close, so Escape returns you to the editor. */
  const returnFocus = useRef<HTMLElement | null>(null)

  /**
   * The tag being browsed, or null. Set by picking a tag and cleared by any
   * edit to the input, so typing always returns you to the prefix-driven modes.
   */
  const [taggedWith, setTaggedWith] = useState<string | null>(null)

  const { mode: typedMode, term: rawTerm } = modeOf(input)
  const mode: Mode = taggedWith ? 'tagged' : typedMode

  useShortcut('k', () => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setInput('')
    setTerm('')
    setSelected(0)
    setTaggedWith(null)
    setOpen(true)
  })

  // Own the keyboard while open: every other Ctrl shortcut stands down.
  useSuspendShortcuts(open)

  // Debounced at 120ms rather than the sidebar's 300ms — this is the primary
  // navigation surface and the in-memory index makes each query cheap.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(rawTerm.trim()), 120)
    return () => clearTimeout(timer)
  }, [rawTerm])

  const results = useQuery({
    queryKey: ['worlds', worldId, 'searchRanked', term],
    queryFn: () => api.worlds.searchRanked(worldId, term),
    enabled: open && mode === 'articles' && term.length > 0,
  })

  const tags = useQuery({
    queryKey: ['worlds', worldId, 'tags'],
    queryFn: () => api.worlds.tags(worldId),
    enabled: open && mode === 'tags',
  })

  // The real frontmatter query, keyed the same way a smart view keys its own so
  // the two share a cache entry when they ask the same question.
  const tagged = useQuery({
    queryKey: ['worlds', worldId, 'query', { tags: [taggedWith] }],
    queryFn: () => api.worlds.query(worldId, { tags: [taggedWith!] }),
    enabled: open && taggedWith !== null,
  })

  // `mode` here is the palette's own (commands / tags / search); the world's
  // mode is separate and decides which commands exist at all.
  const worldMode = useWorldMode(worldId).id
  const commandHits = useMemo(
    () => (mode === 'commands' ? matchCommands(term, { mode: worldMode }) : []),
    [mode, term, worldMode],
  )

  const tagHits = useMemo(() => {
    if (mode !== 'tags') return []
    const all = tags.data ?? []
    const q = term.toLowerCase()
    return q ? all.filter((t) => t.tag.includes(q)) : all
  }, [mode, tags.data, term])

  const articleHits = results.data ?? []
  const taggedHits = tagged.data ?? []

  const count =
    mode === 'articles'
      ? articleHits.length
      : mode === 'commands'
        ? commandHits.length
        : mode === 'tags'
          ? tagHits.length
          : mode === 'tagged'
            ? taggedHits.length
            : 0

  // Any change of mode or query invalidates the old selection.
  useEffect(() => setSelected(0), [mode, term, taggedWith])

  // Keep the highlighted row in view as the selection moves by keyboard.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected, count])

  const close = () => {
    setOpen(false)
    // Radix restores focus itself, but only to the trigger — there isn't one
    // here, so put the caret back where the user left it.
    requestAnimationFrame(() => returnFocus.current?.focus())
  }

  const openArticle = (hit: RankedResult) => {
    close()
    // Characters have their own sheet route; sending them to the markdown
    // editor would land them on the raw YAML instead of their sheet.
    navigate({
      to:
        hit.type === 'character'
          ? '/worlds/$worldId/characters/$articleId'
          : '/worlds/$worldId/articles/$articleId',
      params: { worldId, articleId: hit.id },
    })
  }

  const runCommand = (command: Command) => {
    close()
    command.run({ worldId, navigate: (to) => void navigate({ to }) })
  }

  const pickTag = (tag: string) => {
    // Switch to the tag's own results rather than pasting its text into article
    // search: the tag is frontmatter, and the word need never appear in a body.
    setTaggedWith(tag)
    setSelected(0)
  }

  const openTagged = (article: { id: string }) => {
    close()
    navigate({
      to: '/worlds/$worldId/articles/$articleId',
      params: { worldId, articleId: article.id },
    })
  }

  const choose = () => {
    if (mode === 'articles' && articleHits[selected])
      openArticle(articleHits[selected])
    else if (mode === 'commands' && commandHits[selected])
      runCommand(commandHits[selected])
    else if (mode === 'tags' && tagHits[selected])
      pickTag(tagHits[selected].tag)
    else if (mode === 'tagged' && taggedHits[selected])
      openTagged(taggedHits[selected])
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => (count === 0 ? 0 : (i + 1) % count))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => (count === 0 ? 0 : (i - 1 + count) % count))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  const rowClass = (i: number) =>
    `flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm ${
      i === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
    }`

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          // Focus the input, not the first focusable child.
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).querySelector('input')?.focus()
        }}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          {mode === 'commands' ? (
            <Terminal className="text-muted-foreground size-4 shrink-0" />
          ) : mode === 'tags' || mode === 'tagged' ? (
            <Hash className="text-muted-foreground size-4 shrink-0" />
          ) : (
            <Search className="text-muted-foreground size-4 shrink-0" />
          )}
          {taggedWith && (
            <span className="bg-muted shrink-0 rounded px-1.5 py-0.5 text-xs font-medium">
              #{taggedWith}
            </span>
          )}
          <Input
            value={input}
            onChange={(e) => {
              // Typing leaves the tag's results — otherwise the box would show
              // a query that isn't the one being run.
              setTaggedWith(null)
              setInput(e.target.value)
            }}
            onKeyDown={onKeyDown}
            placeholder={
              taggedWith
                ? 'Type to search articles instead'
                : 'Search articles, > for commands, # for tags, ? for help'
            }
            className="h-11 border-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {mode === 'help' && (
            <div className="space-y-1 px-2 py-1.5 text-sm">
              {HELP_ROWS.map((row) => (
                <div key={row.label} className="flex items-baseline gap-3">
                  <code className="bg-muted min-w-6 rounded px-1.5 py-0.5 text-center text-xs">
                    {row.prefix || 'abc'}
                  </code>
                  <span className="text-muted-foreground">{row.label}</span>
                </div>
              ))}
            </div>
          )}

          {mode === 'articles' &&
            (term.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                Type to search this world.
              </p>
            ) : articleHits.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                {results.isPending ? 'Searching…' : 'No matches.'}
              </p>
            ) : (
              articleHits.map((hit, i) => (
                <button
                  key={hit.id}
                  data-selected={i === selected}
                  className={rowClass(i)}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => openArticle(hit)}
                >
                  {hit.type === 'character' ? (
                    <User className="mt-0.5 size-4 shrink-0 opacity-70" />
                  ) : (
                    <FileText className="mt-0.5 size-4 shrink-0 opacity-70" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="text-muted-foreground block truncate">
                      <HighlightedTitle
                        title={hit.title}
                        ranges={hit.matchRanges}
                      />
                    </span>
                    {hit.snippet && (
                      <span className="text-muted-foreground/70 line-clamp-1 text-xs">
                        {hit.snippet}
                      </span>
                    )}
                  </span>
                  {hit.folderId && (
                    <span className="text-muted-foreground/60 shrink-0 text-xs">
                      {hit.folderId}
                    </span>
                  )}
                </button>
              ))
            ))}

          {mode === 'commands' &&
            (commandHits.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                No commands match.
              </p>
            ) : (
              commandHits.map((command, i) => {
                const Icon = command.icon
                return (
                  <button
                    key={command.id}
                    data-selected={i === selected}
                    className={rowClass(i)}
                    onMouseEnter={() => setSelected(i)}
                    onClick={() => runCommand(command)}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 opacity-70" />
                    <span className="flex-1">{command.label}</span>
                  </button>
                )
              })
            ))}

          {mode === 'tags' &&
            (tagHits.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                {tags.isPending
                  ? 'Loading tags…'
                  : 'No tags in this world yet.'}
              </p>
            ) : (
              tagHits.map((entry, i) => (
                <button
                  key={entry.tag}
                  data-selected={i === selected}
                  className={rowClass(i)}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => pickTag(entry.tag)}
                >
                  <Hash className="mt-0.5 size-4 shrink-0 opacity-70" />
                  <span className="flex-1">{entry.tag}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {entry.count}
                  </span>
                </button>
              ))
            ))}

          {mode === 'tagged' &&
            (taggedHits.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                {tagged.isPending
                  ? 'Loading…'
                  : `Nothing tagged ${taggedWith}.`}
              </p>
            ) : (
              taggedHits.map((article, i) => (
                <button
                  key={article.id}
                  data-selected={i === selected}
                  className={rowClass(i)}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => openTagged(article)}
                >
                  <FileText className="mt-0.5 size-4 shrink-0 opacity-70" />
                  <span className="flex-1 truncate">{article.title}</span>
                  {article.folderId && (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {article.folderId}
                    </span>
                  )}
                </button>
              ))
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
