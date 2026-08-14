import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  Columns2,
  Eye,
  FileDown,
  FolderOpen,
  Link2,
  List,
  Loader2,
  Pencil,
  Save,
  Trash2,
  Wand2,
} from 'lucide-react'
import { api } from '#/lib/api'
import { REVEAL_LABEL, revealer } from '#/lib/reveal'
import { isCharacterContent, parseCharacter } from '#/lib/character'
import { useShortcut } from '#/lib/useShortcut'
import { useArticleEditorSave } from '#/lib/useArticleEditorSave'
import type { ImageInfo } from '#/lib/api'
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
import { cn } from '#/lib/utils'
import { BookView } from '#/components/Markdown'
import { TableOfContents } from '#/components/TableOfContents'
import {
  activeHeadingAt,
  editorScrollTopFor,
  parseHeadings,
  scrollPreviewToHeading,
} from '#/lib/toc'
import type { TocHeading } from '#/lib/toc'
import { SheetPreview } from '#/components/character/SheetPreview'
import { ImagePickerDialog } from '#/components/ImagePickerDialog'
import { HowToDialog } from '#/components/HowToDialog'
import { useMarkdownEditor } from '#/lib/useMarkdownEditor'
import { CreateMissingArticleDialog } from '#/components/CreateMissingArticleDialog'

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

const TOC_KEY = 'dm.articleToc'

/** Outline pane visibility, remembered across sessions like the session panel. */
function loadTocOpen(): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(TOC_KEY) ?? '') as {
      open?: boolean
    }
    return raw.open === true
  } catch {
    return false
  }
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
  const reveal = revealer(worldId)

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
  // `editSeq` bumps on every edit so the autosave debounce restarts on each
  // keystroke; `dirty` alone stays true and would fire 2s after the first one.
  const [{ dirty, editSeq }, setDirtyState] = useState({
    dirty: false,
    editSeq: 0,
  })
  const setDirty = useCallback((next: boolean) => {
    setDirtyState((prev) => ({
      dirty: next,
      editSeq: next ? prev.editSeq + 1 : prev.editSeq,
    }))
  }, [])
  const [externalChange, setExternalChange] = useState(false)
  const [tab, setTab] = useState('write')
  const [livePreview, setLivePreview] = useState(false)
  const [exporting, setExporting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [tocOpen, setTocOpen] = useState(loadTocOpen)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  // [[ autocomplete: the partial title being typed after an unclosed [[
  const [linkQuery, setLinkQuery] = useState<string | null>(null)
  const [linkIndex, setLinkIndex] = useState(0)
  // _images/ autocomplete: the partial path being typed after an _images/ prefix
  const [imageQuery, setImageQuery] = useState<string | null>(null)
  const [imageIndex, setImageIndex] = useState(0)
  // Create-from-broken-link dialog
  const [missingTitle, setMissingTitle] = useState<string | null>(null)

  const images = useQuery({
    queryKey: ['worlds', worldId, 'images'],
    queryFn: () => api.images.tree(worldId),
  })

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

  const imageMatches =
    imageQuery !== null
      ? (images.data?.images ?? [])
          .filter((i) => i.id.toLowerCase().includes(imageQuery.toLowerCase()))
          .slice(0, 6)
      : []

  // A path is being typed once an _images/ prefix is open: inside a markdown
  // link — ](_images/… — or on a statblock `image:` line, in either the bare or
  // the picker's markdown form.
  const IMAGE_PATH_TYPING =
    /(?:\]\(|^[ \t]*image:[ \t]*(?:!\[[^\]]*\]\()?)_images\/([^)\n]*)$/m

  // The outline, parsed from the source rather than the rendered DOM — the book
  // preview repeats the whole document on every sheet, so its headings are
  // duplicated `sheetCount` times over. See lib/toc.ts.
  const headings = useMemo(() => parseHeadings(content), [content])

  useEffect(() => {
    localStorage.setItem(TOC_KEY, JSON.stringify({ open: tocOpen }))
  }, [tocOpen])

  /**
   * Jump to a heading. Where that lands depends on the tab: the Write tab puts
   * the caret on the heading's line and scrolls it near the top; the Preview
   * tab scrolls to the book sheet the heading is actually visible on.
   */
  const goToHeading = (heading: TocHeading) => {
    setActiveHeadingId(heading.id)
    if (tab === 'preview') {
      const scroller = previewRef.current
      if (scroller) scrollPreviewToHeading(scroller, heading)
      return
    }
    // setTimeout(0) for the same reason completeLink uses one: the textarea may
    // not be focusable until React has committed the current render.
    setTimeout(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(heading.offset, heading.offset)
      textarea.scrollTop = editorScrollTopFor(textarea, heading.offset)
    }, 0)
  }

  const updateQueries = () => {
    const textarea = textareaRef.current
    if (!textarea) {
      setLinkQuery(null)
      setImageQuery(null)
      return
    }
    const before = textarea.value.slice(0, textarea.selectionStart)
    const link = before.match(/\[\[([^\][\n]*)$/)
    setLinkQuery(link ? link[1] : null)
    setLinkIndex(0)
    // Only one strip shows at a time; an open [[ wins.
    const image = link ? null : before.match(IMAGE_PATH_TYPING)
    setImageQuery(image ? image[1] : null)
    setImageIndex(0)
    // The outline follows the caret: count the newlines behind it to get the
    // current line, then take the last heading at or above it.
    const line = before.split('\n').length - 1
    setActiveHeadingId(activeHeadingAt(headings, line)?.id ?? null)
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

  /** Replace the partial _images/… path being typed with a real image path. */
  const completeImagePath = (image: ImageInfo) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const pos = textarea.selectionStart
    const start = content.lastIndexOf('_images/', pos)
    if (start < 0) return
    setContent(
      content.slice(0, start) + image.encodedRelPath + content.slice(pos),
    )
    setDirty(true)
    setImageQuery(null)
    const cursor = start + image.encodedRelPath.length
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(cursor, cursor)
    }, 0)
  }

  // Reset the editor whenever a different (or freshly loaded) article arrives.
  // Guarded so a background refetch can never clobber unsaved edits: only
  // reset when a different article loads, or when there is nothing unsaved.
  const loadedIdRef = useRef<string | null>(null)
  // A half-typed title isn't tracked by `dirty` (it isn't content), so it needs
  // its own guard or a background refetch would clobber it mid-word.
  const titleDirtyRef = useRef(false)
  useEffect(() => {
    if (!article.data) return
    if (
      loadedIdRef.current === article.data.id &&
      (dirty || titleDirtyRef.current)
    )
      return
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

  const { commitTitle, saveNow, isPending, error } = useArticleEditorSave({
    worldId,
    routeArticleId: articleId,
    article: article.data,
    title,
    getContent: () => content,
    dirty,
    setDirty,
    editSeq,
    onRenamed: (newId) => {
      // Rename: the file moved, so re-key the URL without adding history.
      navigate({
        to: '/worlds/$worldId/articles/$articleId',
        params: { worldId, articleId: newId },
        replace: true,
      })
    },
  })

  useShortcut('s', () => {
    commitTitle()
    if (dirty) saveNow()
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

  // Attribute rolls to the saved article. Memoised on the values rather than
  // rebuilt each render: this object is a dependency of the renderer's
  // component map, so a fresh reference per keystroke would rebuild every
  // markdown subtree while typing.
  const savedId = article.data?.id
  const savedTitle = article.data?.title
  const rollSource: RollSource | undefined = useMemo(
    () =>
      savedId != null && savedTitle != null
        ? { worldId, articleId: savedId, title: savedTitle }
        : undefined,
    [worldId, savedId, savedTitle],
  )
  // The sheet preview always needs a source; fall back to the route's ids
  // before the article query resolves. Memoised for the same reason.
  const sheetSource: RollSource = useMemo(
    () => rollSource ?? { worldId, articleId, title },
    [rollSource, worldId, articleId, title],
  )

  // Characters preview as a parchment sheet rather than as prose, since all
  // their data lives in the frontmatter that BookView deliberately strips.
  const isCharacter = isCharacterContent(content)
  const parsedCharacter = useMemo(
    () => (isCharacter ? parseCharacter(content) : null),
    [isCharacter, content],
  )

  // Formatting shortcuts (Ctrl+B/I/E, Ctrl+T tables, bracket-wrapping…). Edits
  // go through execCommand so the native undo stack survives, which also means
  // the textarea's own onChange fires and drives autosave as usual.
  const editor = useMarkdownEditor({
    ref: textareaRef,
    onFallbackChange: (value) => {
      setContent(value)
      setDirty(true)
    },
    // While the [[ ]] suggestion strip is up it owns Tab and Enter.
    isSuppressed: (e) =>
      linkQuery !== null &&
      linkMatches.length > 0 &&
      ['Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key),
  })
  const insertAtCursor = editor.insertText
  const insertBlock = editor.insertBlock

  /**
   * Upload dropped/pasted image files into the world and insert them at the
   * cursor. Clipboard screenshots all arrive named "image.png", which the
   * upload dedupe turns into "image (2).png" and so on.
   */
  const uploadAndInsert = async (files: Array<File>) => {
    const pictures = files.filter((f) => f.type.startsWith('image/'))
    if (pictures.length === 0) return
    try {
      for (const file of pictures) {
        const image = await api.images.upload(worldId, file)
        const alt = image.fileName.replace(/\.[^.]+$/, '')
        insertAtCursor(`![${alt}](${image.encodedRelPath})`)
      }
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId, 'images'] })
    } catch (error) {
      alert((error as Error).message)
    }
  }

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
        {/* The title is the filename, so committing it renames the file and
            rewrites [[links]] world-wide. Far too expensive (and racy) to do on
            a keystroke — hence blur/Enter, not `dirty`. */}
        <Input
          value={title}
          className="max-w-md border-none text-lg font-semibold shadow-none focus-visible:ring-1"
          onChange={(e) => {
            setTitle(e.target.value)
            titleDirtyRef.current = true
          }}
          onBlur={() => {
            titleDirtyRef.current = false
            commitTitle()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              setTitle(article.data?.title ?? title)
              titleDirtyRef.current = false
            }
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
          <ImagePickerDialog
            worldId={worldId}
            onInsert={insertAtCursor}
            // A rename/move rewrote _images/ paths in article bodies. A clean
            // editor reloads from the invalidated cache; a dirty one would
            // autosave the stale path back, so surface the same banner the file
            // watcher uses and let the author choose.
            onRefsRewritten={() => {
              if (dirty) setExternalChange(true)
            }}
          />
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
          <Button size="sm" disabled={!dirty || isPending} onClick={saveNow}>
            <Save /> {isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={REVEAL_LABEL}
            onClick={() => reveal(`${article.data?.id ?? articleId}.md`)}
          >
            <FolderOpen />
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
      {error && (
        <p className="text-destructive border-b px-4 py-1 text-sm">
          {error.message}
        </p>
      )}
      {isCharacter && (
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

      <div className="flex min-h-0 flex-1">
        <Tabs
          value={tab}
          onValueChange={setTab}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="flex items-center border-b px-4 py-1.5">
            <TabsList className="h-8">
              <TabsTrigger value="write" className="text-xs">
                <Pencil className="size-3.5" /> Write
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">
                <Eye className="size-3.5" /> Preview
              </TabsTrigger>
            </TabsList>
            <div className="ml-auto flex items-center gap-2">
              {tab === 'write' && (
                <Button
                  variant={livePreview ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 text-xs"
                  title="Show a live preview beside the editor"
                  onClick={() => setLivePreview((v) => !v)}
                >
                  <Columns2 className="size-3.5" /> Live preview
                </Button>
              )}
              {!parsedCharacter && (
                <Button
                  variant={tocOpen ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 text-xs"
                  title="Show the article outline"
                  onClick={() => setTocOpen((v) => !v)}
                >
                  <List className="size-3.5" /> Outline
                </Button>
              )}
            </div>
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
            {imageQuery !== null && imageMatches.length > 0 && (
              <div className="bg-muted/60 flex items-center gap-1.5 overflow-x-auto border-b px-3 py-1.5 text-sm">
                <span className="text-muted-foreground shrink-0 text-xs">
                  Image:
                </span>
                {imageMatches.map((match, i) => (
                  <button
                    key={match.id}
                    type="button"
                    className={cn(
                      'shrink-0 rounded border px-2 py-0.5 text-xs',
                      i === imageIndex
                        ? 'bg-accent border-primary'
                        : 'hover:bg-accent',
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      completeImagePath(match)
                    }}
                  >
                    {match.id}
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
                  requestAnimationFrame(updateQueries)
                }}
                onClick={updateQueries}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.files)
                  if (files.some((f) => f.type.startsWith('image/'))) {
                    e.preventDefault()
                    uploadAndInsert(files)
                  }
                }}
                onDragOver={(e) => {
                  // Only claim the drop for files — the textarea's own text-drag
                  // behaviour must keep working.
                  if (e.dataTransfer.types.indexOf('Files') >= 0)
                    e.preventDefault()
                }}
                onDrop={(e) => {
                  const files = Array.from(e.dataTransfer.files)
                  if (files.some((f) => f.type.startsWith('image/'))) {
                    e.preventDefault()
                    uploadAndInsert(files)
                  }
                }}
                onKeyUp={(e) => {
                  if (
                    ![
                      'ArrowDown',
                      'ArrowUp',
                      'Enter',
                      'Tab',
                      'Escape',
                    ].includes(e.key)
                  )
                    updateQueries()
                }}
                onBeforeInput={editor.onBeforeInput}
                onKeyDown={(e) => {
                  if (imageQuery !== null && imageMatches.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setImageIndex((i) => (i + 1) % imageMatches.length)
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setImageIndex(
                        (i) =>
                          (i - 1 + imageMatches.length) % imageMatches.length,
                      )
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault()
                      completeImagePath(imageMatches[imageIndex])
                    } else if (e.key === 'Escape') {
                      setImageQuery(null)
                    }
                    return
                  }
                  if (linkQuery === null || linkMatches.length === 0)
                    return editor.onKeyDown(e)
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
                  } else {
                    // Anything the suggestion strip doesn't claim (Ctrl+B and
                    // friends) still belongs to the formatting shortcuts.
                    editor.onKeyDown(e)
                  }
                }}
              />
              {livePreview && (
                <LivePreviewPane
                  content={content}
                  articles={tree.data?.articles}
                  worldId={worldId}
                  source={rollSource}
                  onCreateMissing={setMissingTitle}
                />
              )}
            </div>
          </TabsContent>
          {/* This TabsContent is itself the preview's scroll container — the
            outline scrolls it, not .print-area. */}
          <TabsContent
            ref={previewRef}
            value="preview"
            className="min-h-0 flex-1 overflow-y-auto bg-stone-800/90 dark:bg-stone-950"
          >
            <div className="print-area p-6 md:p-10">
              {!content.trim() ? (
                <p className="text-stone-400">Nothing to preview yet.</p>
              ) : parsedCharacter ? (
                <SheetPreview
                  character={parsedCharacter.character}
                  body={parsedCharacter.body}
                  title={title}
                  source={sheetSource}
                  worldId={worldId}
                  articles={tree.data?.articles}
                />
              ) : (
                <BookView
                  articles={tree.data?.articles}
                  worldId={worldId}
                  source={rollSource}
                  onCreateMissing={setMissingTitle}
                >
                  {content}
                </BookView>
              )}
            </div>
          </TabsContent>
        </Tabs>
        {tocOpen && !parsedCharacter && (
          <TableOfContents
            headings={headings}
            activeId={activeHeadingId}
            onSelect={goToHeading}
            onClose={() => setTocOpen(false)}
          />
        )}
      </div>
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

      <CreateMissingArticleDialog
        worldId={worldId}
        title={missingTitle}
        onClose={() => setMissingTitle(null)}
      />
    </div>
  )
}
