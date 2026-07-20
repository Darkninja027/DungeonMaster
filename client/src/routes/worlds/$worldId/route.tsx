import { Outlet, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '#/lib/api'
import { WorldSidebar } from '#/components/WorldSidebar'

export const Route = createFileRoute('/worlds/$worldId')({
  component: WorldLayout,
})

function WorldLayout() {
  const { worldId } = Route.useParams()
  const id = Number(worldId)
  const world = useQuery({ queryKey: ['worlds', id], queryFn: () => api.worlds.get(id) })

  return (
    <div className="flex h-full">
      <div className="flex h-full w-72 shrink-0 flex-col">
        <div className="border-b border-r px-3 py-2">
          <h2 className="truncate font-semibold">{world.data?.name ?? '…'}</h2>
          {world.data?.description && (
            <p className="text-muted-foreground truncate text-xs">{world.data.description}</p>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <WorldSidebar worldId={id} />
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
