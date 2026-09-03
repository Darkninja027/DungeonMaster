import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Dices,
  LogOut,
  MonitorPlay,
  Sparkles,
  UserRound,
  Users,
  WifiOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  discover,
  joinTable,
  leaveTable,
  setPendingCharacter,
  useGuest,
} from '#/lib/guestStore'
import type { PendingCharacter } from '#/lib/guestStore'
import { api } from '#/lib/api'
import { BookView } from '#/components/Markdown'
import { GuestSheet } from '#/components/guest/GuestSheet'
import { RollHistory } from '#/components/RollHistory'
import { SpellReference } from '#/components/character/SpellReference'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { ScrollArea } from '#/components/ui/scroll-area'

/**
 * The guest end of a LAN session.
 *
 * The sheet is the main pane, because rolling your own character is what a
 * player does all evening. Everything else is a tab on the right: what the DM
 * is showing, the shared roll history, and the spell reference.
 *
 * Content the DM shows is rendered with audience="player" and readOnly, so
 * `:::dm` blocks are stripped by the same tested path the local player window
 * uses. The host strips them too — doing it in both places means a bug in one
 * is not a leak on its own.
 *
 * Images on shown content do not render yet: their `_images/…` references
 * resolve through the Electron-only world:// protocol, which points at a world
 * folder a guest does not have. The host serves them over /img/ and wiring
 * that through is still outstanding.
 */

type GuestTab = 'dm' | 'rolls' | 'spells'

const TAB_ICON: Record<GuestTab, LucideIcon> = {
  dm: MonitorPlay,
  rolls: Dices,
  spells: Sparkles,
}

const TAB_LABEL: Record<GuestTab, string> = {
  dm: 'From the DM',
  rolls: 'Rolls',
  spells: 'Spells',
}

const TABS: Array<GuestTab> = ['dm', 'rolls', 'spells']

export function GuestTable() {
  const guest = useGuest()
  const [tab, setTab] = useState<GuestTab>('dm')

  if (!guest.session) return <JoinScreen />

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-hidden">
        <GuestSheet />
      </div>

      <aside className="flex w-96 shrink-0 flex-col border-l">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {guest.session.name}
          </span>
          {!guest.connected && (
            <span
              className="text-muted-foreground flex items-center gap-1 text-xs"
              title="Reconnecting"
            >
              <WifiOff className="size-3" /> offline
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-xs"
            title="Leave the table"
            onClick={leaveTable}
          >
            <LogOut className="size-3.5" /> Leave
          </Button>
        </div>

        <div className="flex gap-1 border-b px-2 py-1.5">
          {TABS.map((entry) => {
            const Icon = TAB_ICON[entry]
            return (
              <Button
                key={entry}
                variant={tab === entry ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 flex-1 text-xs"
                onClick={() => setTab(entry)}
                title={TAB_LABEL[entry]}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{TAB_LABEL[entry]}</span>
              </Button>
            )
          })}
        </div>

        <div className="min-h-0 flex-1">
          {tab === 'dm' ? (
            <DmPane />
          ) : tab === 'rolls' ? (
            <RollHistory />
          ) : (
            // The spell reference reads the app's global library, so it needs
            // no world of its own — just as well, since a guest has none.
            <SpellReference worldId={guest.ownWorldId ?? ''} />
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-3 py-1.5">
          <Users className="text-muted-foreground size-3.5 shrink-0" />
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {guest.seats.map((s) => s.name).join(', ') || 'just you'}
          </span>
        </div>
      </aside>
    </div>
  )
}

/** What the DM is currently showing, or nothing yet. */
function DmPane() {
  const guest = useGuest()
  if (!guest.shown) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        Nothing on the table yet. What the DM shows appears here.
      </p>
    )
  }
  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <BookView audience="player" readOnly layout="flow">
          {guest.shown.content}
        </BookView>
      </div>
    </ScrollArea>
  )
}

/**
 * Address, code, name — and who you are playing, chosen BEFORE joining.
 *
 * Picking your character is part of sitting down rather than something you do
 * once already at the table, so it happens here and is applied the moment a
 * seat is granted. Leaving it blank is fine: the DM's own characters can be
 * claimed after arriving.
 */
function JoinScreen() {
  const [address, setAddress] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState(false)
  const [searching, setSearching] = useState(false)
  const [chosen, setChosen] = useState<PendingCharacter | null>(null)

  // This machine's vault. Someone who only ever joins games may have none.
  const vault = useQuery({
    queryKey: ['vault'],
    queryFn: () => api.vault.get(),
  })
  const mine = useQuery({
    queryKey: ['vault', vault.data?.worldId, 'characters'],
    queryFn: () => api.characters.list(vault.data!.worldId),
    enabled: Boolean(vault.data?.worldId) && vault.data?.available === true,
  })

  const choose = async (articleId: string, title: string) => {
    const worldId = vault.data?.worldId
    if (!worldId) return
    // Clicking the chosen one again clears it — the choice is optional, so it
    // has to be undoable without a third control.
    if (chosen?.articleId === articleId) {
      setChosen(null)
      return
    }
    try {
      const article = await api.articles.get(worldId, articleId)
      setChosen({
        origin: 'own',
        worldId,
        articleId,
        title: article.title || title,
        content: article.content,
      })
    } catch {
      setError('Could not open that character.')
    }
  }

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      let target = address.trim()
      if (!target) {
        setSearching(true)
        const found = await discover(code)
        setSearching(false)
        if (!found) {
          setManual(true)
          setError(
            'No table answered on this network. Ask your DM for the address ' +
              'shown on their screen and enter it below.',
          )
          return
        }
        target = found
      }
      setPendingCharacter(chosen)
      await joinTable(target, code, name)
    } catch (cause) {
      // A network failure surfaces as TypeError("Failed to fetch"), which is
      // both an Error and useless to a person at a table — so it is translated.
      // Anything else is a message the host wrote ("Wrong room code").
      const raw = cause instanceof Error ? cause.message : ''
      setError(
        !raw || /failed to fetch|networkerror|load failed/i.test(raw)
          ? 'Could not reach the table. Check the DM is hosting and that you ' +
              'are on the same network.'
          : raw,
      )
      setManual(true)
      setPendingCharacter(null)
    } finally {
      setSearching(false)
      setBusy(false)
    }
  }

  const characters = mine.data ?? []

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-4 overflow-y-auto p-6">
      <div>
        <h1 className="text-lg font-semibold">Join a table</h1>
        <p className="text-muted-foreground text-sm">
          Ask your DM for the room code on their screen. If you are on the same
          wifi, that is all you need.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="guest-code">Room code</Label>
          <Input
            id="guest-code"
            placeholder="ABC-234"
            className="font-mono tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="guest-name">Your name</Label>
          <Input
            id="guest-name"
            placeholder="Sarah"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {manual && (
          <div className="space-y-1">
            <Label htmlFor="guest-address">Address</Label>
            <Input
              id="guest-address"
              placeholder="192.168.1.42:7777"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label>Playing as</Label>
        {characters.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No characters of your own — you can claim one of the DM&apos;s once
            you are in.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {characters.map((character) => (
                <li key={character.id}>
                  <Button
                    variant={
                      chosen?.articleId === character.id
                        ? 'secondary'
                        : 'outline'
                    }
                    className="w-full justify-start"
                    onClick={() => void choose(character.id, character.title)}
                  >
                    <UserRound className="size-4 shrink-0" />
                    <span className="min-w-0 truncate">{character.title}</span>
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Yours stays on this machine — the DM sees your rolls, not your
              sheet. Or leave this blank and claim one of theirs.
            </p>
          </>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        disabled={busy || !code.trim() || !name.trim()}
        onClick={() => void join()}
      >
        {searching ? 'Looking for the table…' : 'Join'}
      </Button>
      {!manual && (
        <button
          type="button"
          className="text-muted-foreground text-center text-xs underline"
          onClick={() => setManual(true)}
        >
          Enter an address manually
        </button>
      )}
      <Link
        to="/"
        className="text-muted-foreground text-center text-xs underline"
      >
        Back to worlds
      </Link>
    </div>
  )
}
