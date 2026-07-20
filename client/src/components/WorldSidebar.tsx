import { useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { api } from '#/lib/api'
import type { ArticleSummary, FolderNode, WorldTree } from '#/lib/api'
import { articleTemplates } from '#/lib/templates'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'

interface NameDialogState {
  mode: 'new-folder' | 'rename-folder' | 'new-article'
  parentFolderId: number | null
  folderId?: number
  initial?: string
}

export function WorldSidebar({ worldId }: { worldId: number }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const activeArticleId = params.articleId ? Number(params.articleId) : null

  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })

  const [dialog, setDialog] = useState<NameDialogState | null>(null)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('blank')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const invalidateTree = () =>
    queryClient.invalidateQueries({ queryKey: ['worlds', worldId, 'tree'] })

  const createFolder = useMutation({
    mutationFn: api.folders.create,
    onSuccess: () => {
      invalidateTree()
      setDialog(null)
    },
  })
  const renameFolder = useMutation({
    mutationFn: ({ id, ...input }: { id: number; name: string; parentFolderId: number | null }) =>
      api.folders.update(id, input),
    onSuccess: () => {
      invalidateTree()
      setDialog(null)
    },
  })
  const deleteFolder = useMutation({
    mutationFn: api.folders.delete,
    onSuccess: invalidateTree,
  })
  const createArticle = useMutation({
    mutationFn: api.articles.create,
    onSuccess: (article) => {
      invalidateTree()
      setDialog(null)
      navigate({
        to: '/worlds/$worldId/articles/$articleId',
        params: { worldId: String(worldId), articleId: String(article.id) },
      })
    },
  })

  const submitDialog = () => {
    if (!dialog || !name.trim()) return
    if (dialog.mode === 'new-folder') {
      createFolder.mutate({ worldId, parentFolderId: dialog.parentFolderId, name })
    } else if (dialog.mode === 'rename-folder' && dialog.folderId != null) {
      renameFolder.mutate({ id: dialog.folderId, name, parentFolderId: dialog.parentFolderId })
    } else if (dialog.mode === 'new-article') {
      const template = articleTemplates.find((t) => t.id === templateId)
      createArticle.mutate({
        worldId,
        folderId: dialog.parentFolderId,
        title: name,
        content: template?.body ?? '',
      })
    }
  }

  const openDialog = (state: NameDialogState) => {
    setName(state.initial ?? '')
    setTemplateId('blank')
    setDialog(state)
  }

  const toggleCollapse = (folderId: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })

  const renderArticle = (article: ArticleSummary, depth: number) => (
    <Link
      key={`a${article.id}`}
      to="/worlds/$worldId/articles/$articleId"
      params={{ worldId: String(worldId), articleId: String(article.id) }}
      className={cn(
        'hover:bg-accent flex items-center gap-1.5 rounded px-2 py-1 text-sm',
        activeArticleId === article.id && 'bg-accent font-medium',
      )}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
    >
      <FileText className="text-muted-foreground size-3.5 shrink-0" />
      <span className="truncate">{article.title}</span>
    </Link>
  )

  const renderFolder = (data: WorldTree, folder: FolderNode, depth: number) => {
    const isCollapsed = collapsed.has(folder.id)
    const childFolders = data.folders.filter((f) => f.parentFolderId === folder.id)
    const childArticles = data.articles.filter((a) => a.folderId === folder.id)
    return (
      <div key={`f${folder.id}`}>
        <div
          className="hover:bg-accent group flex items-center gap-1 rounded px-2 py-1 text-sm"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            onClick={() => toggleCollapse(folder.id)}
          >
            {isCollapsed ? (
              <ChevronRight className="size-3.5 shrink-0" />
            ) : (
              <ChevronDown className="size-3.5 shrink-0" />
            )}
            <FolderIcon className="size-3.5 shrink-0 text-amber-600" />
            <span className="truncate font-medium">{folder.name}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => openDialog({ mode: 'new-article', parentFolderId: folder.id })}
              >
                <FilePlus2 /> New article
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openDialog({ mode: 'new-folder', parentFolderId: folder.id })}
              >
                <FolderPlus /> New subfolder
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  openDialog({
                    mode: 'rename-folder',
                    folderId: folder.id,
                    parentFolderId: folder.parentFolderId,
                    initial: folder.name,
                  })
                }
              >
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  if (confirm(`Delete folder "${folder.name}"? Articles inside move to the world root.`)) {
                    deleteFolder.mutate(folder.id)
                  }
                }}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {!isCollapsed && (
          <div>
            {childFolders.map((f) => renderFolder(data, f, depth + 1))}
            {childArticles.map((a) => renderArticle(a, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-muted/30 flex h-full w-72 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Content
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="New article"
            onClick={() => openDialog({ mode: 'new-article', parentFolderId: null })}
          >
            <FilePlus2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="New folder"
            onClick={() => openDialog({ mode: 'new-folder', parentFolderId: null })}
          >
            <FolderPlus className="size-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {tree.isLoading && <p className="text-muted-foreground px-2 text-sm">Loading…</p>}
          {tree.data && (
            <>
              {tree.data.folders
                .filter((f) => f.parentFolderId === null)
                .map((f) => renderFolder(tree.data, f, 0))}
              {tree.data.articles
                .filter((a) => a.folderId === null)
                .map((a) => renderArticle(a, 0))}
              {tree.data.folders.length === 0 && tree.data.articles.length === 0 && (
                <p className="text-muted-foreground px-2 py-4 text-sm">
                  Nothing here yet. Create an article or folder above.
                </p>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === 'new-folder' && 'New folder'}
              {dialog?.mode === 'rename-folder' && 'Rename folder'}
              {dialog?.mode === 'new-article' && 'New article'}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            placeholder={dialog?.mode === 'new-article' ? 'Article title' : 'Folder name'}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitDialog()}
          />
          {dialog?.mode === 'new-article' && (
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
                Template
              </p>
              <div className="grid grid-cols-2 gap-2">
                {articleTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={cn(
                      'rounded-md border p-2 text-left transition-colors',
                      templateId === template.id
                        ? 'border-primary bg-accent'
                        : 'hover:bg-accent/50',
                    )}
                    onClick={() => setTemplateId(template.id)}
                  >
                    <span className="block text-sm font-medium">{template.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {template.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button disabled={!name.trim()} onClick={submitDialog}>
              {dialog?.mode === 'rename-folder' ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
