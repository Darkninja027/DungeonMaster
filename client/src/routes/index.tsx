import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FolderOpen,
  FolderSearch,
  Globe2,
  Plus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { api } from '#/lib/api'
import type { WorldSummary } from '#/lib/api'
import { REVEAL_LABEL, revealer } from '#/lib/reveal'
import { CreateCharacterDialog } from '#/components/character/create/CreateCharacterDialog'
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

/**
 * Characters that aren't tied to a campaign, kept in the personal vault.
 *
 * Stays hidden until the vault exists, so someone who has never used it sees no
 * new clutter — `api.vault.get` deliberately never creates one. The button
 * below ensures it on first use.
 */
function VaultSection() {
  const queryClient = useQueryClient()
  const [wizardOpen, setWizardOpen] = useState(false)

  const vault = useQuery({ queryKey: ['vault'], queryFn: api.vault.get })
  const vaultId = vault.data?.worldId ?? null

  const characters = useQuery({
    queryKey: ['worlds', vaultId, 'characters'],
    queryFn: () => api.characters.list(vaultId!),
    enabled: vaultId !== null && vault.data?.available === true,
  })

  // Creating the vault is what the button does, so the wizard can't open until
  // there is a world for the character to land in.
  const startCharacter = useMutation({
    mutationFn: api.vault.ensure,
    onSuccess: (info) => {
      queryClient.setQueryData(['vault'], info)
      setWizardOpen(true)
    },
    onError: (error: Error) => alert(error.message),
  })

  const list = characters.data ?? []
  // Nothing to say yet: no vault and nothing in flight.
  if (!vault.data && !startCharacter.isPending) {
    return (
      <div className="mb-8 flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold">Your Characters</h2>
          <p className="text-muted-foreground text-sm">
            Make a character without a world — for a game someone else is
            running.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={startCharacter.isPending}
          onClick={() => startCharacter.mutate()}
        >
          <UserPlus /> New Character
        </Button>
      </div>
    )
  }

  return (
    <div className="mb-8 border-b pb-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Your Characters</h2>
          <p className="text-muted-foreground text-sm">
            {vault.data?.available === false
              ? 'The vault folder isn’t there right now — if it’s on a drive that’s disconnected, reconnect it.'
              : 'Characters that aren’t tied to a campaign world.'}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={startCharacter.isPending}
          onClick={() => startCharacter.mutate()}
        >
          <UserPlus /> New Character
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No characters yet. Create one and it’s saved in your vault folder.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((ch) => (
            <Link
              key={ch.id}
              to="/worlds/$worldId/characters/$articleId"
              params={{ worldId: vaultId!, articleId: ch.id }}
              className="hover:bg-accent flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <Users className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate">{ch.title}</span>
            </Link>
          ))}
        </div>
      )}

      {vaultId && (
        <CreateCharacterDialog
          worldId={vaultId}
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  )
}

function WorldsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const worlds = useQuery({ queryKey: ['worlds'], queryFn: api.worlds.list })

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const goTo = (world: WorldSummary | null) => {
    void queryClient.invalidateQueries({ queryKey: ['worlds'] })
    if (world) {
      setOpen(false)
      setName('')
      setDescription('')
      void navigate({ to: '/worlds/$worldId', params: { worldId: world.id } })
    }
  }

  const createWorld = useMutation({
    mutationFn: api.worlds.create,
    onSuccess: goTo,
  })
  const openWorld = useMutation({
    mutationFn: api.worlds.open,
    onSuccess: goTo,
  })

  const removeWorld = useMutation({
    mutationFn: api.worlds.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['worlds'] }),
  })

  return (
    <div className="mx-auto max-w-5xl p-6">
      <VaultSection />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Worlds</h1>
          <p className="text-muted-foreground text-sm">
            A world is a folder of markdown files on your disk — open one or
            create one.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={openWorld.isPending}
            onClick={() => openWorld.mutate()}
          >
            <FolderOpen /> Open Folder
          </Button>
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
                <p className="text-muted-foreground text-xs">
                  You'll pick where to create the world folder next.
                </p>
                {createWorld.isError && (
                  <p className="text-destructive text-sm">
                    {createWorld.error.message}
                  </p>
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
      </div>

      {openWorld.isError && (
        <p className="text-destructive mb-4 text-sm">
          {openWorld.error.message}
        </p>
      )}
      {worlds.isLoading && (
        <p className="text-muted-foreground">Loading worlds…</p>
      )}
      {worlds.isError && (
        <p className="text-destructive">
          Failed to load worlds: {worlds.error.message}
        </p>
      )}

      {worlds.data && worlds.data.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12">
            <Globe2 className="size-10" />
            <p>
              No recent worlds. Create one, or open an existing world folder.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {worlds.data?.map((world) => (
          <Card key={world.id} className="group relative">
            <Link
              to="/worlds/$worldId"
              params={{ worldId: world.id }}
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
                {world.articleCount} article
                {world.articleCount === 1 ? '' : 's'}
              </span>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  title={REVEAL_LABEL}
                  className="relative opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => revealer(world.id)()}
                >
                  <FolderSearch />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remove from this list (the folder stays on disk)"
                  className="relative opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => removeWorld.mutate(world.id)}
                >
                  <X />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
