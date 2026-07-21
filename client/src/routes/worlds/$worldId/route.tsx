import { useEffect, useState } from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { api } from '#/lib/api'
import { WorldSidebar } from '#/components/WorldSidebar'
import { SessionPanel } from '#/components/SessionPanel'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'

export const Route = createFileRoute('/worlds/$worldId')({
  component: WorldLayout,
})

function WorldLayout() {
  const { worldId } = Route.useParams()
  const queryClient = useQueryClient()
  const world = useQuery({
    queryKey: ['worlds', worldId],
    queryFn: () => api.worlds.get(worldId),
  })

  // Watch the world folder so external edits (Obsidian, git, Dropbox…) show
  // up live. The main process suppresses events for the app's own writes.
  useEffect(() => {
    void api.worlds.watch(worldId)
    const unsubscribe = api.worlds.onChanged((batch) => {
      if (batch.worldId !== worldId) return
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
      for (const id of batch.articleIds) {
        queryClient.invalidateQueries({ queryKey: ['articles', id] })
      }
    })
    return () => {
      unsubscribe()
      void api.worlds.unwatch(worldId)
    }
  }, [worldId, queryClient])

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const updateWorld = useMutation({
    mutationFn: () =>
      api.worlds.update(worldId, {
        name: editName.trim(),
        description: editDescription.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      setEditOpen(false)
    },
    onError: (error) => alert(error.message),
  })

  const openEdit = () => {
    setEditName(world.data?.name ?? '')
    setEditDescription(world.data?.description ?? '')
    setEditOpen(true)
  }

  return (
    <div className="flex h-full">
      <div className="flex h-full w-72 shrink-0 flex-col">
        <div className="group flex items-start gap-1 border-b border-r px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">
              {world.data?.name ?? '…'}
            </h2>
            {world.data?.description && (
              <p className="text-muted-foreground truncate text-xs">
                {world.data.description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
            title="Edit world name and description"
            onClick={openEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <WorldSidebar worldId={worldId} />
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
      <SessionPanel worldId={worldId} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit world</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={editName}
            placeholder="World name"
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && editName.trim() && updateWorld.mutate()
            }
          />
          <Input
            value={editDescription}
            placeholder="Description (optional)"
            onChange={(e) => setEditDescription(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && editName.trim() && updateWorld.mutate()
            }
          />
          <p className="text-muted-foreground text-xs">
            This renames the world, not its folder on disk.
          </p>
          <DialogFooter>
            <Button
              disabled={!editName.trim() || updateWorld.isPending}
              onClick={() => updateWorld.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
