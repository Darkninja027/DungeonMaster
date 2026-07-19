import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe2, Plus, Trash2 } from 'lucide-react'
import { api } from '#/lib/api'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'

export const Route = createFileRoute('/')({
  component: WorldsPage,
})

function WorldsPage() {
  const queryClient = useQueryClient()
  const worlds = useQuery({ queryKey: ['worlds'], queryFn: api.worlds.list })

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const createWorld = useMutation({
    mutationFn: api.worlds.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds'] })
      setOpen(false)
      setName('')
      setDescription('')
    },
  })

  const deleteWorld = useMutation({
    mutationFn: api.worlds.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['worlds'] }),
  })

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Worlds</h1>
          <p className="text-muted-foreground text-sm">
            Every campaign setting you're building, in one place.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> New World
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a world</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="world-name">Name</Label>
                <Input
                  id="world-name"
                  value={name}
                  placeholder="e.g. The Shattered Realms"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="world-desc">Description</Label>
                <Textarea
                  id="world-desc"
                  value={description}
                  placeholder="A short pitch for this setting"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              {createWorld.isError && (
                <p className="text-destructive text-sm">{createWorld.error.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                disabled={!name.trim() || createWorld.isPending}
                onClick={() => createWorld.mutate({ name, description })}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {worlds.isLoading && <p className="text-muted-foreground">Loading worlds…</p>}
      {worlds.isError && (
        <p className="text-destructive">Failed to load worlds: {worlds.error.message}</p>
      )}

      {worlds.data && worlds.data.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12">
            <Globe2 className="size-10" />
            <p>No worlds yet. Create your first one to get started.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {worlds.data?.map((world) => (
          <Card key={world.id} className="group relative">
            <Link
              to="/worlds/$worldId"
              params={{ worldId: String(world.id) }}
              className="absolute inset-0"
              aria-label={`Open ${world.name}`}
            />
            <CardHeader>
              <CardTitle>{world.name}</CardTitle>
              <CardDescription className="line-clamp-2">
                {world.description || 'No description'}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground flex items-center justify-between text-sm">
              <span>
                {world.articleCount} article{world.articleCount === 1 ? '' : 's'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="relative opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => {
                  if (confirm(`Delete "${world.name}" and everything in it?`)) {
                    deleteWorld.mutate(world.id)
                  }
                }}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
