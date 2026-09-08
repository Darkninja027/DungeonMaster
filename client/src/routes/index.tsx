import { useMemo, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Anchor,
  BookMarked,
  ChevronRight,
  Crown,
  Flame,
  FolderOpen,
  FolderSearch,
  Gem,
  Ghost,
  Key,
  Moon,
  Mountain,
  Plus,
  Scroll,
  Skull,
  Snowflake,
  Swords,
  Tent,
  Trees,
  Waves,
  Wifi,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '#/lib/api'
import type { WorldSummary } from '#/lib/api'
import { REVEAL_LABEL, revealer } from '#/lib/reveal'
import { NEW_WORLD_RULESET, RULESETS } from '#/lib/ruleset'
import type { Ruleset } from '#/lib/ruleset'
import { cn } from '#/lib/utils'
import { CreateCharacterDialog } from '#/components/character/create/CreateCharacterDialog'
import { Button } from '#/components/ui/button'
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

/** The page's one filled control: oxblood in light, gold in dark. */
const TOME_PRIMARY =
  'font-display border border-(--tome-gold) bg-(--tome-red) tracking-wide text-(--tome-on-accent) hover:bg-(--tome-red)/90'

/** Everything else: a bordered ghost that reads as engraved rather than filled. */
const TOME_GHOST =
  'font-display border-(--tome-line) bg-transparent tracking-wide text-(--tome-ink) hover:bg-(--tome-tint)'

/**
 * A world's mark on the shelf.
 *
 * Decorative and deterministic — the same folder always draws the same sigil,
 * because an icon that reshuffled on every launch would read as a bug. Hashed
 * off the id (a hex-encoded path) rather than the name, so renaming a world in
 * its settings doesn't silently re-brand it.
 *
 * Sixteen rather than eight: at a full recents list (capped at 20) a smaller
 * pool put four identical marks on one shelf, which is worse than no mark at
 * all — the sigil is there to tell rows apart. Collisions are still possible;
 * this is decoration, not an identifier.
 */
const SIGILS: Array<LucideIcon> = [
  Swords,
  Mountain,
  Trees,
  Waves,
  Skull,
  Flame,
  Anchor,
  BookMarked,
  Crown,
  Gem,
  Ghost,
  Key,
  Moon,
  Scroll,
  Snowflake,
  Tent,
]

function sigilFor(id: string): LucideIcon {
  let hash = 0
  for (let i = 0; i < id.length; i += 1)
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  return SIGILS[Math.abs(hash) % SIGILS.length]
}

/**
 * "Wood Elf Monk" from whatever the file happens to declare.
 *
 * Every part is optional and free text — a character hand-written in Obsidian
 * has none of it, and one from the wizard may carry a homebrew race the tables
 * have never heard of. Returns null rather than a placeholder so the caller can
 * leave the cell genuinely empty.
 */
function calling(race: string | null, cls: string | null): string | null {
  const parts = [race, cls].filter((p): p is string => !!p?.trim())
  return parts.length > 0 ? parts.join(' ') : null
}

/**
 * One world on the shelf: a ruled row with its own gilded spine.
 *
 * A row rather than a card because ten cards read as wallpaper — identical
 * vellum rectangles, a ragged last row, and dead space under every world with
 * no description. Aligned columns make ten worlds one eye-sweep, and the shelf
 * ends up rhyming with the Muster Roll below it: the page is two ledgers, which
 * is honest for something calling itself a book.
 *
 * Columns collapse rather than wrap — the description is the first to go, then
 * the count — so a narrow window loses detail instead of the row's shape.
 */
function WorldRow({
  world,
  onReveal,
  onRemove,
}: {
  world: WorldSummary
  onReveal: () => void
  onRemove: () => void
}) {
  const Sigil = sigilFor(world.id)
  return (
    // The overlay Link is a SIBLING of the content, and the two icon buttons
    // below carry `relative` — that is the only thing lifting them above it, so
    // all three must stay in this stacking context.
    <div className="group border-(--tome-line) border-l-(--tome-gold) relative grid grid-cols-[1.4rem_1fr_auto] items-center gap-x-4 border-b border-l-[5px] px-4 py-2.5 last:border-b-0 even:bg-(--tome-tint) sm:grid-cols-[1.4rem_minmax(0,14rem)_minmax(0,1fr)_auto]">
      <Link
        to="/worlds/$worldId"
        params={{ worldId: world.id }}
        className="absolute inset-0"
        aria-label={`Open ${world.name}`}
      />
      <Sigil aria-hidden className="text-(--tome-gold) size-4 opacity-75" />
      <h2 className="font-display text-(--tome-head) truncate text-sm font-semibold">
        {world.name}
      </h2>
      {/* Empty rather than a "No description" placeholder — a column of those
          was most of what made ten worlds read as noise. */}
      <p className="font-serif text-(--tome-soft) hidden truncate text-sm italic sm:block">
        {world.description}
      </p>
      <div className="flex items-center gap-2">
        <span className="font-display text-(--tome-soft) text-[0.62rem] tracking-widest tabular-nums uppercase">
          {world.articleCount} Article{world.articleCount === 1 ? '' : 's'}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          title={REVEAL_LABEL}
          className="text-(--tome-soft) hover:bg-(--tome-tint) relative opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onReveal}
        >
          <FolderSearch />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Remove from this list (the folder stays on disk)"
          className="text-(--tome-soft) hover:bg-(--tome-tint) relative opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>
    </div>
  )
}

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
  const missing = vault.data?.available === false

  const newCharacter = (
    <Button
      className={TOME_GHOST}
      variant="outline"
      disabled={startCharacter.isPending}
      onClick={() => startCharacter.mutate()}
    >
      <Plus /> New Character
    </Button>
  )

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-display text-(--tome-soft) mb-2 text-[0.66rem] font-semibold tracking-[0.22em] uppercase">
          The Roster
        </p>
        <h2 className="font-display text-(--tome-head) text-2xl font-semibold">
          Your Adventurers
        </h2>
      </div>
      {newCharacter}
    </div>
  )

  // Nothing to say yet: no vault and nothing in flight.
  if (!vault.data && !startCharacter.isPending) {
    return (
      <section>
        {heading}
        <RosterVoid
          title="No names yet"
          body="Make a character without a world — for a game someone else is running. It’s saved in your vault folder as plain markdown."
        />
      </section>
    )
  }

  return (
    <section>
      {heading}

      {missing ? (
        <RosterVoid
          title="The vault is out of reach"
          body="The vault folder isn’t there right now — if it’s on a drive that’s disconnected, reconnect it."
        />
      ) : list.length === 0 ? (
        <RosterVoid
          title="No names yet"
          body="Create a character and it’s saved in your vault folder as plain markdown."
        />
      ) : (
        <div className="tome-surface mt-5 overflow-hidden rounded-md">
          {/* Column header. `Calling` and `Level` hide on narrow windows
              alongside the cells they label — see the row grid below. */}
          <div className="font-display text-(--tome-soft) border-(--tome-gold) grid grid-cols-[2.2rem_1fr_3.5rem] items-center gap-4 border-b-2 px-4 py-2 text-[0.6rem] tracking-[0.14em] uppercase sm:grid-cols-[2.2rem_1fr_10rem_3.5rem_1.25rem]">
            <span />
            <span>Name</span>
            <span className="hidden sm:block">Calling</span>
            <span className="text-center">Level</span>
            <span className="hidden sm:block" />
          </div>

          {list.map((ch, i) => {
            const line = calling(ch.race, ch.class)
            return (
              <div
                key={ch.id}
                className={cn(
                  'group border-(--tome-line) relative grid grid-cols-[2.2rem_1fr_3.5rem] items-center gap-4 border-b px-4 py-2.5 last:border-b-0 sm:grid-cols-[2.2rem_1fr_10rem_3.5rem_1.25rem]',
                  i % 2 === 1 && 'bg-(--tome-tint)',
                )}
              >
                {/* Overlay link, sibling of the content — same pattern as the
                    tomes above, and nothing here sits over it. */}
                <Link
                  to="/worlds/$worldId/characters/$articleId"
                  params={{ worldId: vaultId!, articleId: ch.id }}
                  className="absolute inset-0"
                  aria-label={`Open ${ch.title}`}
                />
                <span aria-hidden className="tome-crest">
                  <span className="font-display text-[0.78rem] font-bold">
                    {ch.title.trim().charAt(0).toUpperCase()}
                  </span>
                </span>
                <span className="font-display text-(--tome-head) truncate text-sm font-semibold">
                  {ch.title}
                </span>
                <span className="font-serif text-(--tome-soft) hidden truncate text-sm italic sm:block">
                  {line ?? ''}
                </span>
                <span className="font-display text-(--tome-head) text-center text-xs font-semibold tabular-nums">
                  {ch.level ?? ''}
                </span>
                <ChevronRight className="text-(--tome-gold) hidden size-4 opacity-60 sm:block" />
              </div>
            )
          })}
        </div>
      )}

      {vaultId && (
        <CreateCharacterDialog
          worldId={vaultId}
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </section>
  )
}

/**
 * The roster with nothing in it — which is what most people see first, so it
 * gets a page of the book rather than a greyed-out sentence.
 */
function RosterVoid({ title, body }: { title: string; body: string }) {
  return (
    <div className="tome-surface border-(--tome-line) mt-5 rounded-md border-dashed px-6 py-10 text-center">
      <BookMarked
        aria-hidden
        className="text-(--tome-gold) mx-auto size-8 opacity-60"
      />
      <h3 className="font-display text-(--tome-head) mt-3 text-base font-semibold">
        {title}
      </h3>
      <p className="font-serif text-(--tome-soft) mx-auto mt-2 max-w-[44ch] text-sm italic">
        {body}
      </p>
    </div>
  )
}

function WorldsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const worlds = useQuery({ queryKey: ['worlds'], queryFn: api.worlds.list })

  // `worlds:list` returns recents order (most recent first). Sorted here rather
  // than in the main process so the recents order stays available to anything
  // else that wants it — and `localeCompare` with `sensitivity: 'base'` matches
  // how `queryArticles` sorts the roster, so the two ledgers agree.
  const shelf = useMemo(
    () =>
      [...(worlds.data ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [worlds.data],
  )

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // Defaults to the current rules rather than "show everything": someone
  // starting a world today is most likely playing them, and the setting is one
  // click to change. An existing world is never narrowed this way — an absent
  // key still parses to "show everything".
  const [ruleset, setRuleset] = useState<Ruleset>(NEW_WORLD_RULESET)

  const goTo = (world: WorldSummary | null) => {
    void queryClient.invalidateQueries({ queryKey: ['worlds'] })
    if (world) {
      setOpen(false)
      setName('')
      setDescription('')
      setRuleset(NEW_WORLD_RULESET)
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
    <div className="tome-page h-full overflow-y-auto">
      <div className="mx-auto w-[min(1080px,calc(100%-2rem))] pb-16">
        {/* Deliberately compact: at ten worlds a taller masthead pushed the
            shelf entirely below the fold. */}
        <header className="pt-8 pb-6 text-center">
          <p className="font-display text-(--tome-soft) text-[0.62rem] font-semibold tracking-[0.22em] uppercase">
            A Dungeon Master’s Ledger
          </p>
          <h1 className="font-display text-(--tome-head) mt-2 text-[clamp(1.9rem,4vw,2.6rem)] leading-tight font-semibold">
            Your Worlds
          </h1>
          <hr className="gold-rule mt-3 w-45" />

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {/* Joining needs no world of your own — the host pushes everything. */}
            <Button className={TOME_GHOST} variant="outline" asChild>
              <Link to="/join">
                <Wifi /> Join a Table
              </Link>
            </Button>
            <Button
              className={TOME_GHOST}
              variant="outline"
              disabled={openWorld.isPending}
              onClick={() => openWorld.mutate()}
            >
              <FolderOpen /> Open Folder
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className={TOME_PRIMARY}>
                  <Plus /> New World
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-xl">Create a world</DialogTitle>
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
                  <div className="grid gap-2">
                    <Label>Rules edition</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {RULESETS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={ruleset === option.id}
                          title={option.blurb}
                          className={cn(
                            'rounded-md border px-3 py-2 text-sm',
                            ruleset === option.id
                              ? 'border-primary bg-accent font-medium'
                              : 'hover:bg-accent/50',
                          )}
                          onClick={() => setRuleset(option.id)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Which edition's spells and monsters this world offers. You
                      can change it later in Settings.
                    </p>
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
                    onClick={() =>
                      createWorld.mutate({ name, description, ruleset })
                    }
                  >
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        {openWorld.isError && (
          <p className="text-destructive mb-4 text-center text-sm">
            {openWorld.error.message}
          </p>
        )}
        {worlds.isLoading && (
          <p className="font-serif text-(--tome-soft) text-center italic">
            Reading the shelf…
          </p>
        )}
        {worlds.isError && (
          <p className="text-destructive text-center">
            Failed to load worlds: {worlds.error.message}
          </p>
        )}

        {worlds.data && worlds.data.length === 0 && (
          <div className="tome-surface border-(--tome-line) rounded-md border-dashed px-6 py-12 text-center">
            <BookMarked
              aria-hidden
              className="text-(--tome-gold) mx-auto size-9 opacity-60"
            />
            <h2 className="font-display text-(--tome-head) mt-3 text-base font-semibold">
              The shelf is bare
            </h2>
            <p className="font-serif text-(--tome-soft) mx-auto mt-2 max-w-[44ch] text-sm italic">
              Create a world, or open a folder you already keep one in.
            </p>
          </div>
        )}

        {worlds.data && worlds.data.length > 0 && (
          // Alphabetical, matching the roster below and `characters:list`, which
          // sorts the same way in the main process. This deliberately discards
          // the recents order `worlds:list` returns — a shelf you can find a
          // name in beat a shelf that remembers what you opened last.
          <div className="tome-surface overflow-hidden rounded-md">
            <p className="font-display text-(--tome-soft) border-(--tome-gold) border-b-2 px-4 py-2 text-[0.6rem] tracking-[0.14em] uppercase">
              {worlds.data.length} World{worlds.data.length === 1 ? '' : 's'}
            </p>
            {shelf.map((world) => (
              <WorldRow
                key={world.id}
                world={world}
                onReveal={() => revealer(world.id)()}
                onRemove={() => removeWorld.mutate(world.id)}
              />
            ))}
          </div>
        )}

        <hr className="gold-rule mt-12 w-full opacity-50" />

        <div className="pt-10">
          <VaultSection />
        </div>

        <p className="font-serif text-(--tome-soft) mt-12 text-center text-sm italic">
          Every world a folder, every folder a campaign — kept in plain markdown
          on your disk, yours to move, back up, or open in any other editor.
        </p>
      </div>
    </div>
  )
}
