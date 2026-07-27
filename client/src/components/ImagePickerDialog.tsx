import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  ImagePlus,
  Images,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react'
import { api } from '#/lib/api'
import type { ImageFolder, ImageInfo, ImageTree } from '#/lib/api'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  mode: 'new-folder' | 'rename-folder' | 'rename-image'
  parentFolderId?: string | null
  folderId?: string
  imageId?: string
  initial?: string
}

interface Props {
  worldId: string
  onInsert: (markdown: string) => void
  /**
   * Called after an operation repointed _images/ references in article bodies.
   * The open editor may be holding a now-stale copy, so it needs to know.
   */
  onRefsRewritten?: () => void
}

/**
 * Image library for a world: browse nested folders under _images/, upload,
 * organise and insert images as markdown.
 */
export function ImagePickerDialog({
  worldId,
  onInsert,
  onRefsRewritten,
}: Props) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragItem, setDragItem] = useState<{
    type: 'image' | 'folder'
    id: string
  } | null>(null)
  // Folder id being hovered as a drop target; null = the _images root.
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(
    undefined,
  )
  const [dialog, setDialog] = useState<NameDialogState | null>(null)
  const [name, setName] = useState('')

  const tree = useQuery({
    queryKey: ['worlds', worldId, 'images'],
    queryFn: () => api.images.tree(worldId),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['worlds', worldId, 'images'] })

  // Rename/move rewrite article bodies on disk, so the article caches are stale
  // too — and an editor with unsaved edits would autosave the old path back.
  const invalidateAfterRewrite = () => {
    queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
    queryClient.invalidateQueries({ queryKey: ['articles'] })
    onRefsRewritten?.()
  }

  const upload = useMutation({
    // Sequential, not Promise.all: uploadImage's dedupe is check-then-write, so
    // two concurrent map.png uploads would both see the name free and one would
    // clobber the other. Per-file catch so one bad file doesn't sink the rest.
    mutationFn: async (files: Array<File>) => {
      const failed: Array<string> = []
      for (const file of files) {
        try {
          await api.images.upload(worldId, file, currentFolderId)
        } catch (error) {
          failed.push(`${file.name}: ${(error as Error).message}`)
        }
      }
      if (failed.length) throw new Error(failed.join('\n'))
    },
    onSettled: invalidate,
  })

  const renameImage = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      api.images.rename(worldId, input.id, input.name),
    onSuccess: invalidateAfterRewrite,
    onError: (error) => alert(error.message),
  })
  const moveImage = useMutation({
    mutationFn: (input: { id: string; folderId: string | null }) =>
      api.images.move(worldId, input.id, input.folderId),
    onSuccess: invalidateAfterRewrite,
    onError: (error) => alert(error.message),
  })
  const removeImage = useMutation({
    mutationFn: (imageId: string) => api.images.delete(worldId, imageId),
    onSuccess: invalidate,
    onError: (error) => alert(error.message),
  })

  const createFolder = useMutation({
    mutationFn: (input: { parentFolderId: string | null; name: string }) =>
      api.images.createFolder({ worldId, ...input }),
    onSuccess: (folder) => {
      invalidate()
      setCurrentFolderId(folder.id)
    },
    onError: (error) => alert(error.message),
  })
  const renameFolder = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      api.images.renameFolder(worldId, input.id, input.name),
    onSuccess: (result, input) => {
      invalidateAfterRewrite()
      // Follow the folder if we were looking inside it (or inside a child).
      setCurrentFolderId((current) =>
        current === input.id
          ? result.id
          : current?.startsWith(input.id + '/')
            ? result.id + current.slice(input.id.length)
            : current,
      )
    },
    onError: (error) => alert(error.message),
  })
  const moveFolder = useMutation({
    mutationFn: (input: { id: string; parentFolderId: string | null }) =>
      api.images.moveFolder(worldId, input.id, input.parentFolderId),
    onSuccess: invalidateAfterRewrite,
    onError: (error) => alert(error.message),
  })
  const removeFolder = useMutation({
    mutationFn: (folderId: string) =>
      api.images.deleteFolder(worldId, folderId),
    onSuccess: (_r, folderId) => {
      invalidate()
      setCurrentFolderId((current) =>
        current === folderId || current?.startsWith(folderId + '/')
          ? null
          : current,
      )
    },
    onError: (error) => alert(error.message),
  })

  const insert = (image: ImageInfo) => {
    // The alt text is the bare filename, not the path: a nested
    // Maps/City/tavern.png should read "tavern", not "Maps/City/tavern".
    const alt = image.fileName.replace(/\.[^.]+$/, '')
    // encodedRelPath is computed in the main process so the encoding rule lives
    // in exactly one place — the path stays portable enough for Obsidian.
    onInsert(`![${alt}](${image.encodedRelPath})`)
  }

  const openDialog = (state: NameDialogState) => {
    setName(state.initial ?? '')
    // Defer the overlay mount so a DropdownMenu that triggered this finishes
    // closing first — otherwise Radix can leave pointer-events:none stuck on
    // <body> and the whole app stops accepting clicks/typing.
    requestAnimationFrame(() => setDialog(state))
  }

  const submitDialog = () => {
    if (!dialog || !name.trim()) return
    if (dialog.mode === 'new-folder') {
      createFolder.mutate({
        parentFolderId: dialog.parentFolderId ?? null,
        name,
      })
    } else if (dialog.mode === 'rename-folder' && dialog.folderId) {
      renameFolder.mutate({ id: dialog.folderId, name })
    } else if (dialog.mode === 'rename-image' && dialog.imageId) {
      renameImage.mutate({ id: dialog.imageId, name })
    }
    setDialog(null)
  }

  const confirmDeleteFolder = async (folder: ImageFolder) => {
    const count = await api.images.countIn(worldId, folder.id)
    const message =
      count > 0
        ? `Delete "${folder.name}" and the ${count} image${count === 1 ? '' : 's'} inside it? Markdown that references them will show a broken image. It goes to the Recycle Bin.`
        : `Delete the empty folder "${folder.name}"? It goes to the Recycle Bin.`
    if (confirm(message)) removeFolder.mutate(folder.id)
  }

  /** Show an image or folder in the OS file manager; '' = the _images folder. */
  const reveal = async (imageId: string) => {
    try {
      await api.images.reveal(worldId, imageId)
    } catch (error) {
      alert((error as Error).message)
    }
  }

  const handleDrop = (targetFolderId: string | null) => {
    if (!dragItem) return
    if (dragItem.type === 'image') {
      moveImage.mutate({ id: dragItem.id, folderId: targetFolderId })
    } else if (dragItem.id !== targetFolderId) {
      moveFolder.mutate({ id: dragItem.id, parentFolderId: targetFolderId })
    }
    setDragItem(null)
    setDropTarget(undefined)
  }

  /** Drop zone for a folder. OS files dropped here upload; internal drags move. */
  const dropHandlers = (targetFolderId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragItem && e.dataTransfer.types.indexOf('Files') < 0) return
      e.preventDefault()
      e.stopPropagation()
      setDropTarget(targetFolderId)
    },
    onDragLeave: () => setDropTarget(undefined),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDropTarget(undefined)
      if (e.dataTransfer.files.length > 0) {
        setCurrentFolderId(targetFolderId)
        upload.mutate(Array.from(e.dataTransfer.files))
        return
      }
      handleDrop(targetFolderId)
    },
  })

  const toggleCollapsed = (folderId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })

  const renderFolder = (
    data: ImageTree,
    folder: ImageFolder,
    depth: number,
  ) => {
    const isCollapsed = collapsed.has(folder.id)
    const childFolders = data.folders.filter(
      (f) => f.parentFolderId === folder.id,
    )
    return (
      <div key={folder.id}>
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
            currentFolderId === folder.id && 'bg-accent/60 font-medium',
            dragItem?.id === folder.id && 'opacity-50',
          )}
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          <button
            type="button"
            className="text-muted-foreground shrink-0"
            onClick={() => toggleCollapsed(folder.id)}
            aria-label={isCollapsed ? 'Expand folder' : 'Collapse folder'}
          >
            {childFolders.length > 0 ? (
              isCollapsed ? (
                <ChevronRight className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )
            ) : (
              <span className="block size-3.5" />
            )}
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            onClick={() => setCurrentFolderId(folder.id)}
          >
            <FolderIcon className="text-muted-foreground size-3.5 shrink-0" />
            <span className="truncate">{folder.name}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 shrink-0 opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  openDialog({ mode: 'new-folder', parentFolderId: folder.id })
                }
              >
                <FolderPlus /> New subfolder
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  openDialog({
                    mode: 'rename-folder',
                    folderId: folder.id,
                    initial: folder.name,
                  })
                }
              >
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => reveal(folder.id)}>
                <FolderOpen /> Open file location
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => confirmDeleteFolder(folder)}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {!isCollapsed && childFolders.length > 0 && (
          <div>{childFolders.map((f) => renderFolder(data, f, depth + 1))}</div>
        )}
      </div>
    )
  }

  const renderCard = (image: ImageInfo) => (
    <div
      key={image.id}
      draggable
      onDragStart={() => setDragItem({ type: 'image', id: image.id })}
      onDragEnd={() => {
        setDragItem(null)
        setDropTarget(undefined)
      }}
      className={cn(
        'group relative rounded border p-1',
        dragItem?.id === image.id && 'opacity-50',
      )}
    >
      <button
        type="button"
        className="block w-full"
        title={`Insert ${image.fileName}`}
        onClick={() => insert(image)}
      >
        <img
          src={image.url}
          alt={image.fileName}
          className="h-28 w-full rounded object-cover"
        />
        <p className="text-muted-foreground mt-1 truncate text-xs">
          {image.fileName}
        </p>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-1.5 top-1.5 size-6 opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => insert(image)}>
            <ImagePlus /> Insert
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              openDialog({
                mode: 'rename-image',
                imageId: image.id,
                initial: image.fileName,
              })
            }
          >
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => reveal(image.id)}>
            <FolderOpen /> Open file location
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              if (
                confirm(
                  `Delete ${image.fileName}? Markdown that references it will show a broken image. It goes to the Recycle Bin.`,
                )
              )
                removeImage.mutate(image.id)
            }}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  const rootFolders =
    tree.data?.folders.filter((f) => f.parentFolderId === null) ?? []
  const visibleImages =
    tree.data?.images.filter((i) => i.folderId === currentFolderId) ?? []
  // Accumulated crumb paths: 'Maps', 'Maps/City', …
  const crumbs = currentFolderId
    ? currentFolderId.split('/').map((segment, i, all) => ({
        name: segment,
        id: all.slice(0, i + 1).join('/'),
      }))
    : []

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ImagePlus /> Images
        </Button>
      </DialogTrigger>
      {/* flex! overrides the base DialogContent's `grid`, which would otherwise
          win on source order and collapse the two-pane layout. */}
      <DialogContent className="h-[80vh] flex! flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>World images</DialogTitle>
        </DialogHeader>

        <div className="flex shrink-0 items-center gap-2">
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm">
            <button
              type="button"
              {...dropHandlers(null)}
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5',
                currentFolderId === null
                  ? 'font-medium'
                  : 'text-muted-foreground hover:bg-accent',
                dropTarget === null && 'bg-accent ring-primary/50 ring-2',
              )}
              onClick={() => setCurrentFolderId(null)}
            >
              _images
            </button>
            {crumbs.map((crumb) => (
              <span key={crumb.id} className="flex shrink-0 items-center">
                <ChevronRight className="text-muted-foreground size-3" />
                <button
                  type="button"
                  {...dropHandlers(crumb.id)}
                  className={cn(
                    'rounded px-1.5 py-0.5',
                    crumb.id === currentFolderId
                      ? 'font-medium'
                      : 'text-muted-foreground hover:bg-accent',
                    dropTarget === crumb.id &&
                      'bg-accent ring-primary/50 ring-2',
                  )}
                  onClick={() => setCurrentFolderId(crumb.id)}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
          {/* The tree's "All images" root has no row menu, so reveal the folder
              you're currently viewing from here. */}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="Open this folder in the file manager"
            onClick={() => reveal(currentFolderId ?? '')}
          >
            <FolderOpen />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openDialog({
                mode: 'new-folder',
                parentFolderId: currentFolderId,
              })
            }
          >
            <FolderPlus /> New folder
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) upload.mutate(files)
              e.target.value = ''
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <Upload /> {upload.isPending ? 'Uploading…' : 'Upload images'}
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 gap-3">
          <ScrollArea className="w-52 shrink-0 border-r pr-1">
            <button
              type="button"
              {...dropHandlers(null)}
              className={cn(
                'hover:bg-accent flex w-full items-center gap-1.5 rounded px-2 py-1 text-sm',
                currentFolderId === null && 'bg-accent/60 font-medium',
                dropTarget === null && 'bg-accent ring-primary/50 ring-2',
              )}
              onClick={() => setCurrentFolderId(null)}
            >
              <Images className="text-muted-foreground size-3.5 shrink-0" />
              <span className="truncate">All images</span>
            </button>
            {tree.data && rootFolders.map((f) => renderFolder(tree.data, f, 0))}
          </ScrollArea>

          <ScrollArea
            className={cn(
              'min-w-0 flex-1 rounded',
              dropTarget === currentFolderId &&
                dragItem === null &&
                'ring-primary/50 ring-2',
            )}
            {...dropHandlers(currentFolderId)}
          >
            {visibleImages.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                {tree.isLoading
                  ? 'Loading…'
                  : currentFolderId
                    ? 'This folder is empty. Upload images or drag them here.'
                    : 'No images in this world yet. Upload some or drag them here.'}
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-3 p-1">
                {visibleImages.map(renderCard)}
              </div>
            )}
          </ScrollArea>
        </div>

        {upload.isError && (
          <p className="text-destructive shrink-0 whitespace-pre-wrap text-sm">
            {upload.error.message}
          </p>
        )}

        <Dialog
          open={dialog !== null}
          onOpenChange={(o) => !o && setDialog(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialog?.mode === 'new-folder' && 'New image folder'}
                {dialog?.mode === 'rename-folder' && 'Rename folder'}
                {dialog?.mode === 'rename-image' && 'Rename image'}
              </DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              value={name}
              placeholder={
                dialog?.mode === 'rename-image' ? 'File name' : 'Folder name'
              }
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitDialog()}
            />
            {dialog?.mode === 'rename-image' && (
              <p className="text-muted-foreground text-xs">
                Existing references to this image are updated across the world.
              </p>
            )}
            {dialog?.mode === 'rename-folder' && (
              <p className="text-muted-foreground text-xs">
                References to images inside this folder are updated across the
                world.
              </p>
            )}
            <DialogFooter>
              <Button disabled={!name.trim()} onClick={submitDialog}>
                {dialog?.mode === 'new-folder' ? 'Create' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
