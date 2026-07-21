import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  Columns2,
  Eye,
  FileDown,
  Link2,
  Loader2,
  Pencil,
  Save,
  Trash2,
  Wand2,
} from 'lucide-react'
import { api } from '#/lib/api'
import { isCharacterContent } from '#/lib/character'
import { useShortcut } from '#/lib/useShortcut'
import type { RollSource } from '#/lib/rollLog'
import { exportPdf } from '#/lib/exportPdf'
import { formatMarkdown, snippets } from '#/lib/formatMarkdown'
import { articleTemplates } from '#/lib/templates'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { cn } from '#/lib/utils'
import { BookView } from '#/components/Markdown'
import { ImagePickerDialog } from '#/components/ImagePickerDialog'
import { HowToDialog } from '#/components/HowToDialog'

export const Route = createFileRoute('/worlds/$worldId/articles/$articleId')({
  component: ArticlePage,
})

function LinkToArticle({
  worldId,
  articleId,
  title,
}: {
  worldId: string
  articleId: string
  title: string
}) {
  return (
    <Link
      to="/worlds/$worldId/articles/$articleId"
      params={{ worldId, articleId }}
      className="hover:text-foreground underline"
    >
      {title}
    </Link>
  )
}

/**
 * Side-by-side live preview for the Write tab. The book pages are a fixed
 * 816px wide, so the pane scales them to fit its own width.
 */
function LivePreviewPane({
  content,
  articles,
  worldId,
  onCreateMissing,
  source,
}: {
  content: string
  articles?: Array<{ id: string; title: string }>
  worldId: string
  onCreateMissing: (title: string) => void
  source?: RollSource
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)
  // Defer keystrokes so typing stays snappy while the preview catches up.
  const deferred = useDeferredValue(content)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setScale(Math.min(1, (el.clientWidth - 24) / 840))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="w-1/2 shrink-0 overflow-y-auto border-l bg-stone-800/90 dark:bg-stone-950"
    >
      <div className="p-3" style={{ zoom: scale }}>
        {deferred.trim() ? (
          <BookView
            articles={articles}
            worldId={worldId}
            onCreateMissing={onCreateMissing}
            source={source}
          >
            {deferred}
          </BookView>
        ) : (
          <p className="text-stone-400">Start typing to see the preview.</p>
        )}
      </div>
    </div>
  )
}

function ArticlePage() {
  const { worldId, articleId } = Route.useParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const article = useQuery({
    queryKey: ['articles', articleId],
    queryFn: () => api.articles.get(worldId, articleId),
  })
  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })
  const mentions = useQuery({
    queryKey: ['articles', articleId, 'mentions'],
    queryFn: () => api.articles.mentions(worldId, articleId),
  })

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [externalChange, setExternalChange] = useState(false)
  const [tab, setTab] = useState('write')
  const [livePreview, setLivePreview] = useState(false)
  const [exporting, setExporting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // [[ autocomplete: the partial title being typed after an unclosed [[
  const [linkQuery, setLinkQuery] = useState<string | null>(null)
  const [linkIndex, setLinkIndex] = useState(0)
  // Create-from-broken-link dialog
  const [missingTitle, setMissingTitle] = useState<string | null>(null)
  const [missingTemplate, setMissingTemplate] = useState('blank')

  const linkMatches =
    linkQuery !== null
      ? (tree.data?.articles ?? [])
          .filter(
            (a) =>
              a.id !== articleId &&
              a.title.toLowerCase().includes(linkQuery.toLowerCase()),
          )
          .slice(0, 6)
      : []

  const updateLinkQuery = () => {
    const textarea = textareaRef.current
    if (!textarea) return setLinkQuery(null)
    const before = textarea.value.slice(0, textarea.selectionStart)
    const m = before.match(/\[\[([^\][\n]*)$/)
    setLinkQuery(m ? m[1] : null)
    setLinkIndex(0)
  }

  const completeLink = (linkTitle: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const pos = textarea.selectionStart
    const start = content.lastIndexOf('[[', pos)
    if (start < 0) return
    const inserted = `[[${linkTitle}]]`
    setContent(content.slice(0, start) + inserted + content.slice(pos))
    setDirty(true)
    setLinkQuery(null)
    const cursor = start + inserted.length
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(cursor, cursor)
    }, 0)
  }

  // Reset the editor whenever a different (or freshly loaded) article arrives.
  // Guarded so a background refetch can never clobber unsaved edits: only
  // reset when a different article loads, or when there is nothing unsaved.
  const loadedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!article.data) return
    if (loadedIdRef.current === article.data.id && dirty) return
    loadedIdRef.current = article.data.id
    setTitle(article.data.title)
    setContent(article.data.content)
    setDirty(false)
  }, [article.data, dirty])

  // External change to THIS article (file watcher): a clean editor reloads
  // silently via the invalidation from the world layout; a dirty editor gets
  // a banner instead of being clobbered.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    return api.worlds.onChanged((batch) => {
      const currentId = loadedIdRef.current ?? articleId
      if (batch.worldId !== worldId || !batch.articleIds.includes(currentId))
        return
      if (dirtyRef.current) setExternalChange(true)
    })
  }, [worldId, articleId])

  const save = useMutation({
    // Key the save off the query cache's id, not the route param: after a
    // rename the article's id (its file path) changes, and a stale route
    // param must never write to the old path.
    mutationFn: () => {
      const currentId = article.data?.id ?? articleId
      return api.articles.update(worldId, currentId, { title, content })
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['articles', updated.id], updated)
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId, 'tree'] })
      setDirty(false)
      if (updated.id !== articleId) {
        // Rename: the file moved, so re-key the URL without adding history.
        navigate({
          to: '/worlds/$worldId/articles/$articleId',
          params: { worldId, articleId: updated.id },
          replace: true,
        })
      }
    },
  })

  // Autosave: 2s after the last keystroke, while there are unsaved changes.
  const saveMutate = save.mutate
  const savePending = save.isPending
  useEffect(() => {
    if (!dirty || !title.trim() || savePending) return
    const timer = setTimeout(() => saveMutate(), 2000)
    return () => clearTimeout(timer)
  }, [dirty, title, content, savePending, saveMutate])

  useShortcut('s', () => {
    if (dirty && title.trim() && !save.isPending) save.mutate()
  })
  useShortcut('p', () => setTab((t) => (t === 'write' ? 'preview' : 'write')))

  const remove = useMutation({
    mutationFn: () =>
      api.articles.delete(worldId, article.data?.id ?? articleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId, 'tree'] })
      navigate({ to: '/worlds/$worldId', params: { worldId } })
    },
  })

  const createMissing = useMutation({
    mutationFn: (input: { title: string; content: string }) =>
      api.articles.create({
        worldId,
        title: input.title,
        content: input.content,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId, 'tree'] })
      setMissingTitle(null)
      navigate({
        to: '/worlds/$worldId/articles/$articleId',
        params: { worldId, articleId: created.id },
      })
    },
  })

  // Attribute rolls to the saved article (stable while typing).
  const rollSource: RollSource | undefined = article.data
    ? { worldId, articleId: article.data.id, title: article.data.title }
    : undefined

  const insertAtCursor = (snippet: string) => {
    const textarea = textareaRef.current
    setContent((prev) => {
      if (!textarea) return `${prev}\n\n${snippet}\n`
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      return `${prev.slice(0, start)}${snippet}${prev.slice(end)}`
    })
    setDirty(true)
  }

  // Block snippets (tables, boxes) need blank lines around them to parse as markdown.
  const insertBlock = (snippet: string) => insertAtCursor(`\n\n${snippet}\n\n`)

  const tidy = async () => {
    const formatted = await formatMarkdown(content)
    if (formatted !== content) {
      setContent(formatted)
      setDirty(true)
    }
  }

  if (article.isLoading) {
    return <p className="text-muted-foreground p-6">Loading article…</p>
  }
  if (article.isError) {
    return (
      <p className="text-destructive p-6">
        Failed to load article: {article.error.message}
      </p>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Input
          value={title}
          className="max-w-md border-none text-lg font-semibold shadow-none focus-visible:ring-1"
          onChange={(e) => {
            setTitle(e.target.value)
            setDirty(true)
          }}
        />
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Insert <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => insertBlock(snippets.table)}>
                Table
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertBlock(snippets.readAloud)}>
                Read-aloud box
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertBlock(snippets.divider)}>
                Divider
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => insertAtCursor(snippets.namedRoll)}
              >
                Named roll
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertBlock(snippets.statBlock)}>
                Stat block
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => insertBlock(snippets.portraitImage)}
              >
                Portrait image (text wraps)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertBlock(snippets.pageBreak)}>
                Page break
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => insertBlock(snippets.singleColumn)}
              >
                Single-column page
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Template</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {articleTemplates
                    .filter((t) => t.id !== 'blank')
                    .map((template) => (
                      <DropdownMenuItem
                        key={template.id}
                        onClick={() => insertBlock(template.body.trim())}
                      >
                        <div>
                          <span className="block">{template.name}</span>
                          <span className="text-muted-foreground block text-xs">
                            {template.description}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            title="Fix markdown formatting"
            onClick={tidy}
          >
            <Wand2 /> Tidy
          </Button>
          <ImagePickerDialog worldId={worldId} onInsert={insertAtCursor} />
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            title="Export as PDF"
            disabled={exporting}
            onClick={async () => {
              setTab('preview')
              setExporting(true)
              try {
                // let the preview tab mount and paint before capturing
                await new Promise((r) =>
                  requestAnimationFrame(() => requestAnimationFrame(r)),
                )
                const area = document.querySelector<HTMLElement>('.print-area')
                if (area)
                  await exportPdf(area, `${title.trim() || 'article'}.pdf`)
              } finally {
                setExporting(false)
              }
            }}
          >
            {exporting ? <Loader2 className="animate-spin" /> : <FileDown />}
          </Button>
          <HowToDialog />
          <Button
            size="sm"
            disabled={!dirty || !title.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save /> {save.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Delete article"
            onClick={() => {
              if (confirm(`Delete "${title}"?`)) remove.mutate()
            }}
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </div>
      {save.isError && (
        <p className="text-destructive border-b px-4 py-1 text-sm">
          {save.error.message}
        </p>
      )}
      {isCharacterContent(content) && (
        <div className="bg-accent/40 flex items-center gap-2 border-b px-4 py-1 text-sm">
          <span>This is a character — the frontmatter is its sheet data.</span>
          <Button variant="outline" size="sm" className="h-6 text-xs" asChild>
            <Link
              to="/worlds/$worldId/characters/$articleId"
              params={{ worldId, articleId: article.data?.id ?? articleId }}
            >
              Open character sheet
            </Link>
          </Button>
        </div>
      )}
      {externalChange && (
        <div className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-1 text-sm">
          <span>
            This article changed on disk while you have unsaved edits.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              setExternalChange(false)
              setDirty(false)
              queryClient.invalidateQueries({
                queryKey: ['articles', article.data?.id ?? articleId],
              })
            }}
          >
            Reload from disk
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setExternalChange(false)}
          >
            Keep my version
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <div className="flex items-center border-b px-4 py-1.5">
          <TabsList className="h-8">
            <TabsTrigger value="write" className="text-xs">
              <Pencil className="size-3.5" /> Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs">
              <Eye className="size-3.5" /> Preview
            </TabsTrigger>
          </TabsList>
          {tab === 'write' && (
            <Button
              variant={livePreview ? 'secondary' : 'ghost'}
              size="sm"
              className="ml-auto h-8 text-xs"
              title="Show a live preview beside the editor"
              onClick={() => setLivePreview((v) => !v)}
            >
              <Columns2 className="size-3.5" /> Live preview
            </Button>
          )}
        </div>
        <TabsContent value="write" className="flex min-h-0 flex-1 flex-col">
          {linkQuery !== null && linkMatches.length > 0 && (
            <div className="bg-muted/60 flex items-center gap-1.5 overflow-x-auto border-b px-3 py-1.5 text-sm">
              <span className="text-muted-foreground shrink-0 text-xs">
                Link to:
              </span>
              {linkMatches.map((match, i) => (
                <button
                  key={match.id}
                  type="button"
                  className={cn(
                    'shrink-0 rounded border px-2 py-0.5 text-xs',
                    i === linkIndex
                      ? 'bg-accent border-primary'
                      : 'hover:bg-accent',
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    completeLink(match.title)
                  }}
                >
                  {match.title}
                </button>
              ))}
              <span className="text-muted-foreground shrink-0 text-xs">
                ↹ Tab · ⏎ Enter
              </span>
            </div>
          )}
          <div className="flex min-h-0 flex-1">
            <Textarea
              ref={textareaRef}
              value={content}
              placeholder="Write your lore in markdown…"
              className="h-full min-h-0 flex-1 resize-none rounded-none border-none font-mono text-sm shadow-none focus-visible:ring-0"
              onChange={(e) => {
                setContent(e.target.value)
                setDirty(true)
                requestAnimationFrame(updateLinkQuery)
              }}
              onClick={updateLinkQuery}
              onKeyUp={(e) => {
                if (
                  !['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(
                    e.key,
                  )
                )
                  updateLinkQuery()
              }}
              onKeyDown={(e) => {
                if (linkQuery === null || linkMatches.length === 0) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setLinkIndex((i) => (i + 1) % linkMatches.length)
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setLinkIndex(
                    (i) => (i - 1 + linkMatches.length) % linkMatches.length,
                  )
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  completeLink(linkMatches[linkIndex].title)
                } else if (e.key === 'Escape') {
                  setLinkQuery(null)
                }
              }}
            />
            {livePreview && (
              <LivePreviewPane
                content={content}
                articles={tree.data?.articles}
                worldId={worldId}
                source={rollSource}
                onCreateMissing={(t) => {
                  setMissingTemplate('blank')
                  setMissingTitle(t)
                }}
              />
            )}
          </div>
        </TabsContent>
        <TabsContent
          value="preview"
          className="min-h-0 flex-1 overflow-y-auto bg-stone-800/90 dark:bg-stone-950"
        >
          <div className="print-area p-6 md:p-10">
            {content.trim() ? (
              <BookView
                articles={tree.data?.articles}
                worldId={worldId}
                source={rollSource}
                onCreateMissing={(t) => {
                  setMissingTemplate('blank')
                  setMissingTitle(t)
                }}
              >
                {content}
              </BookView>
            ) : (
              <p className="text-stone-400">Nothing to preview yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
      <Separator />
      <div className="text-muted-foreground flex items-center gap-3 px-4 py-1 text-xs">
        <span>
          Last updated{' '}
          {article.data
            ? new Date(article.data.updatedAt).toLocaleString()
            : ''}
        </span>
        {mentions.data && mentions.data.length > 0 && (
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <Link2 className="size-3 shrink-0" />
            Mentioned in:{' '}
            {mentions.data.map((m, i) => (
              <span key={m.id} className="truncate">
                {i > 0 && ', '}
                <LinkToArticle
                  worldId={worldId}
                  articleId={m.id}
                  title={m.title}
                />
              </span>
            ))}
          </span>
        )}
      </div>

      <Dialog
        open={missingTitle !== null}
        onOpenChange={(o) => !o && setMissingTitle(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create "{missingTitle}"</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {articleTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={cn(
                  'rounded-md border p-2 text-left transition-colors',
                  missingTemplate === template.id
                    ? 'border-primary bg-accent'
                    : 'hover:bg-accent/50',
                )}
                onClick={() => setMissingTemplate(template.id)}
              >
                <span className="block text-sm font-medium">
                  {template.name}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {template.description}
                </span>
              </button>
            ))}
          </div>
          {createMissing.isError && (
            <p className="text-destructive text-sm">
              {createMissing.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              disabled={createMissing.isPending}
              onClick={() =>
                missingTitle &&
                createMissing.mutate({
                  title: missingTitle,
                  content:
                    articleTemplates.find((t) => t.id === missingTemplate)
                      ?.body ?? '',
                })
              }
            >
              Create article
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
