import { useEffect, useState } from 'react'
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
  Search,
  Trash2,
  X,
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
  parentFolderId: string | null
  folderId?: string
  initial?: string
}

export function WorldSidebar({ worldId }: { worldId: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const activeArticleId = params.articleId ?? null

  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })

  const [dialog, setDialog] = useState<NameDialogState | null>(null)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('blank')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragItem, setDragItem] = useState<{ type: 'article' | 'folder'; id: string } | null>(null)
  // Folder id being hovered as a drop target; null = the world root area.
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined)
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const search = useQuery({
    queryKey: ['worlds', worldId, 'search', searchTerm],
    queryFn: () => api.worlds.search(worldId, searchTerm),
    enabled: searchTerm.length > 0,
  })

  const invalidateTree = () =>
    queryClient.invalidateQueries({ queryKey: ['worlds', worldId, 'tree'] })

  const createFolder = useMutation({
    mutationFn: api.folders.create,
    onSuccess: () => {
      invalidateTree()
      setDialog(null)
    },
    onError: (error) => alert(error.message),
  })
  const renameFolder = useMutation({
    mutationFn: ({ id, name: newName }: { id: string; name: string }) =>
      api.folders.rename(worldId, id, newName),
    onSuccess: () => {
      invalidateTree()
      setDialog(null)
    },
    onError: (error) => alert(error.message),
  })
  const deleteFolder = useMutation({
    mutationFn: (id: string) => api.folders.delete(worldId, id),
    onSuccess: invalidateTree,
  })
  const moveArticle = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      api.articles.move(worldId, id, folderId),
    onSuccess: invalidateTree,
    onError: (error) => alert(error.message),
  })
  const moveFolder = useMutation({
    mutationFn: ({ id, parentFolderId }: { id: string; parentFolderId: string | null }) =>
      api.folders.move(worldId, id, parentFolderId),
    onSuccess: invalidateTree,
    onError: (error) => alert(error.message),
  })

  const createArticle = useMutation({
    mutationFn: api.articles.create,
    onSuccess: (article) => {
      invalidateTree()
      setDialog(null)
      navigate({
        to: '/worlds/$worldId/articles/$articleId',
        params: { worldId, articleId: article.id },
      })
    },
  })

  const submitDialog = () => {
    if (!dialog || !name.trim()) return
    if (dialog.mode === 'new-folder') {
      createFolder.mutate({ worldId, parentFolderId: dialog.parentFolderId, name })
    } else if (dialog.mode === 'rename-folder' && dialog.folderId != null) {
      renameFolder.mutate({ id: dialog.folderId, name })
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

  const handleDrop = (targetFolderId: string | null) => {
    if (!dragItem) return
    if (dragItem.type === 'article') {
      moveArticle.mutate({ id: dragItem.id, folderId: targetFolderId })
    } else if (dragItem.id !== targetFolderId) {
      moveFolder.mutate({ id: dragItem.id, parentFolderId: targetFolderId })
    }
    setDragItem(null)
    setDropTarget(undefined)
  }

  const dropHandlers = (targetFolderId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragItem) return
      e.preventDefault()
      e.stopPropagation()
      setDropTarget(targetFolderId)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      handleDrop(targetFolderId)
    },
  })

  const toggleCollapse = (folderId: string) =>
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
      params={{ worldId, articleId: article.id }}
      draggable
      onDragStart={() => setDragItem({ type: 'article', id: article.id })}
      onDragEnd={() => {
        setDragItem(null)
        setDropTarget(undefined)
      }}
      className={cn(
        'hover:bg-accent flex items-center gap-1.5 rounded px-2 py-1 text-sm',
        activeArticleId === article.id && 'bg-accent font-medium',
        dragItem?.type === 'article' && dragItem.id === article.id && 'opacity-50',
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
          draggable
          onDragStart={(e) => {
            e.stopPropagation()
            setDragItem({ type: 'folder', id: folder.id })
          }}
          onDragEnd={() => {
            setDragItem(null)
            setDropTarget(undefined)
          }}
          {...dropHandlers(folder.id)}
          className={cn(
            'hover:bg-accent group flex items-center gap-1 rounded px-2 py-1 text-sm',
            dropTarget === folder.id && 'bg-accent ring-primary/50 ring-2',
            dragItem?.type === 'folder' && dragItem.id === folder.id && 'opacity-50',
          )}
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
                  if (
                    confirm(
                      `Delete folder "${folder.name}" and everything inside it? It goes to the Recycle Bin.`,
                    )
                  ) {
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
      <div className="border-b px-2 py-1.5">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            value={searchInput}
            placeholder="Search this world…"
            className="h-7 px-7 text-sm"
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setSearchInput('')}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {searchTerm ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-2">
            {search.isLoading && <p className="text-muted-foreground px-2 text-sm">Searching…</p>}
            {search.data?.length === 0 && (
              <p className="text-muted-foreground px-2 py-4 text-sm">No matches.</p>
            )}
            {search.data?.map((result) => (
              <Link
                key={result.id}
                to="/worlds/$worldId/articles/$articleId"
                params={{ worldId, articleId: result.id }}
                className="hover:bg-accent block rounded px-2 py-1.5"
                onClick={() => setSearchInput('')}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <FileText className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="truncate">{result.title}</span>
                </span>
                {result.snippet && (
                  <span className="text-muted-foreground line-clamp-2 block text-xs">
                    {result.snippet}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </ScrollArea>
      ) : (
      <ScrollArea className="min-h-0 flex-1">
        <div
          className={cn(
            'min-h-full p-2',
            dragItem && dropTarget === null && 'bg-accent/40 rounded ring-primary/30 ring-1',
          )}
          {...dropHandlers(null)}
        >
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
      )}

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
          {createArticle.isError && (
            <p className="text-destructive text-sm">{createArticle.error.message}</p>
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
