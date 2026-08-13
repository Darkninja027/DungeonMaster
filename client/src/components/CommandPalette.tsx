import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FileText, Hash, Search, Terminal, User } from 'lucide-react'
import { api } from '#/lib/api'
import type { RankedResult } from '#/lib/api'
import { matchCommands } from '#/lib/commands'
import type { Command } from '#/lib/commands'
import { useShortcut, useSuspendShortcuts } from '#/lib/useShortcut'
import { Dialog, DialogContent, DialogTitle } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'

/**
 * Prefix-driven modes. A bare query searches articles; `>` runs commands and
 * `#` browses tags — the only way in the app to discover which tags exist.
 */
type Mode = 'articles' | 'commands' | 'tags' | 'help'

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

  const { mode, term: rawTerm } = modeOf(input)

  useShortcut('k', () => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setInput('')
    setTerm('')
    setSelected(0)
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

  const commandHits = useMemo(
    () => (mode === 'commands' ? matchCommands(term) : []),
    [mode, term],
  )

  const tagHits = useMemo(() => {
    if (mode !== 'tags') return []
    const all = tags.data ?? []
    const q = term.toLowerCase()
    return q ? all.filter((t) => t.tag.includes(q)) : all
  }, [mode, tags.data, term])

  const articleHits = results.data ?? []

  const count =
    mode === 'articles'
      ? articleHits.length
      : mode === 'commands'
        ? commandHits.length
        : mode === 'tags'
          ? tagHits.length
          : 0

  // Any change of mode or query invalidates the old selection.
  useEffect(() => setSelected(0), [mode, term])

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
    // Hand the tag to the sidebar's existing search box vocabulary by
    // switching to article mode with the tag as the query.
    setInput(tag)
    setTerm(tag)
    setSelected(0)
  }

  const choose = () => {
    if (mode === 'articles' && articleHits[selected])
      openArticle(articleHits[selected])
    else if (mode === 'commands' && commandHits[selected])
      runCommand(commandHits[selected])
    else if (mode === 'tags' && tagHits[selected])
      pickTag(tagHits[selected].tag)
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
          ) : mode === 'tags' ? (
            <Hash className="text-muted-foreground size-4 shrink-0" />
          ) : (
            <Search className="text-muted-foreground size-4 shrink-0" />
          )}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search articles, > for commands, # for tags, ? for help"
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
