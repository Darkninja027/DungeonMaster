import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Eye, Pencil, Save, Trash2, Wand2 } from 'lucide-react'
import { api } from '#/lib/api'
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
import { BookView } from '#/components/Markdown'
import { ImagePickerDialog } from '#/components/ImagePickerDialog'
import { HowToDialog } from '#/components/HowToDialog'

export const Route = createFileRoute('/worlds/$worldId/articles/$articleId')({
  component: ArticlePage,
})

function ArticlePage() {
  const { worldId, articleId } = Route.useParams()
  const id = Number(articleId)
  const wId = Number(worldId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const article = useQuery({
    queryKey: ['articles', id],
    queryFn: () => api.articles.get(id),
  })

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset the editor whenever a different (or freshly loaded) article arrives.
  useEffect(() => {
    if (article.data) {
      setTitle(article.data.title)
      setContent(article.data.content)
      setDirty(false)
    }
  }, [article.data])

  const save = useMutation({
    mutationFn: () =>
      api.articles.update(id, { title, content, folderId: article.data?.folderId ?? null }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['articles', id], updated)
      queryClient.invalidateQueries({ queryKey: ['worlds', wId, 'tree'] })
      setDirty(false)
    },
  })

  const remove = useMutation({
    mutationFn: () => api.articles.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds', wId, 'tree'] })
      navigate({ to: '/worlds/$worldId', params: { worldId } })
    },
  })

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
    return <p className="text-destructive p-6">Failed to load article: {article.error.message}</p>
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
              <DropdownMenuItem onClick={() => insertBlock(snippets.statBlock)}>
                Stat block
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertBlock(snippets.pageBreak)}>
                Page break
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => insertBlock(snippets.singleColumn)}>
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
          <Button variant="outline" size="sm" title="Fix markdown formatting" onClick={tidy}>
            <Wand2 /> Tidy
          </Button>
          <ImagePickerDialog worldId={wId} onInsert={insertAtCursor} />
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
        <p className="text-destructive border-b px-4 py-1 text-sm">{save.error.message}</p>
      )}

      <Tabs defaultValue="write" className="min-h-0 flex-1 gap-0">
        <div className="border-b px-4 py-1.5">
          <TabsList className="h-8">
            <TabsTrigger value="write" className="text-xs">
              <Pencil className="size-3.5" /> Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs">
              <Eye className="size-3.5" /> Preview
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="write" className="min-h-0 flex-1">
          <Textarea
            ref={textareaRef}
            value={content}
            placeholder="Write your lore in markdown…"
            className="h-full resize-none rounded-none border-none font-mono text-sm shadow-none focus-visible:ring-0"
            onChange={(e) => {
              setContent(e.target.value)
              setDirty(true)
            }}
          />
        </TabsContent>
        <TabsContent
          value="preview"
          className="min-h-0 flex-1 overflow-y-auto bg-stone-800/90 dark:bg-stone-950"
        >
          <div className="p-6 md:p-10">
            {content.trim() ? (
              <BookView>{content}</BookView>
            ) : (
              <p className="text-stone-400">Nothing to preview yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
      <Separator />
      <p className="text-muted-foreground px-4 py-1 text-xs">
        Last updated {article.data ? new Date(article.data.updatedAt + 'Z').toLocaleString() : ''}
      </p>
    </div>
  )
}
