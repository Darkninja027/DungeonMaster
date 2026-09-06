import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Dices,
  LogOut,
  Maximize2,
  MonitorPlay,
  Sparkles,
  UserRound,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  discover,
  joinTable,
  normalizeBaseUrl,
  leaveTable,
  setPendingCharacter,
  useGuest,
} from '#/lib/guestStore'
import type { PendingCharacter } from '#/lib/guestStore'
import { api } from '#/lib/api'
import { useRollLog } from '#/lib/rollLog'
import { useSpellPanelRequest } from '#/lib/spellPanel'
import { BookView } from '#/components/Markdown'
import { PanelRail } from '#/components/PanelRail'
import type { PanelRailTab } from '#/components/PanelRail'
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

const TAB_TITLE: Record<GuestTab, string> = {
  dm: 'From the DM',
  rolls: 'Roll history',
  spells: 'Spells',
}

const TAB_HINT: Record<GuestTab, string> = {
  dm: 'What the DM is showing',
  rolls: 'Roll history',
  spells: 'Spell reference',
}

const TABS: Array<GuestTab> = ['dm', 'rolls', 'spells']

export function GuestTable() {
  const guest = useGuest()
  const rolls = useRollLog()
  const [tab, setTab] = useState<GuestTab>('dm')
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)

  // Clicking a spell on the sheet opens it in the reference, exactly as it
  // does outside a table. The request is a module store (lib/spellPanel.ts),
  // so the sheet already fires it and SpellReference already consumes it —
  // what was missing was opening the tab, which is the only part the panel
  // owns. SpellReference consumes the request when it mounts, so the switch
  // has to happen here or the request is dropped with nothing listening.
  const spellRequest = useSpellPanelRequest()
  useEffect(() => {
    if (spellRequest) {
      setTab('spells')
      setOpen(true)
    }
  }, [spellRequest])

  if (!guest.session) return <JoinScreen />

  // Same rail the DM's session panel uses, so the two surfaces cannot drift
  // into looking like different apps.
  const railTabs: Array<PanelRailTab<GuestTab>> = TABS.map((entry) => ({
    id: entry,
    icon: TAB_ICON[entry],
    title: TAB_TITLE[entry],
    hint: TAB_HINT[entry],
    count: entry === 'rolls' ? rolls.length : guest.shown ? 1 : 0,
  }))

  const toggle = (next: GuestTab) => {
    if (open && tab === next) setOpen(false)
    else {
      setTab(next)
      setOpen(true)
    }
  }

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-hidden">
        <GuestSheet />
      </div>

      <PanelRail
        tabs={railTabs}
        open={open}
        active={tab}
        onToggle={toggle}
        width="w-96"
        header={
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
        }
      >
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            {tab === 'dm' ? (
              <DmPane onExpand={() => setExpanded(true)} />
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
        </div>
      </PanelRail>
      {expanded && <DmOverlay onClose={() => setExpanded(false)} />}
    </div>
  )
}

/**
 * What the DM is currently showing.
 *
 * Expandable, because a statblock or a handout is unreadable in a docked
 * panel and reading it is the entire point of the DM showing it. The expanded
 * form is a full-window overlay rather than a second BrowserWindow: a guest
 * has no world folder, so player:show — which resolves an article id against
 * a world root — cannot serve them.
 */
function DmPane({ onExpand }: { onExpand: () => void }) {
  const guest = useGuest()
  if (!guest.shown) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        Nothing on the table yet. What the DM shows appears here.
      </p>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {guest.shown.title}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          title="Expand to fill the window"
          onClick={onExpand}
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          <BookView audience="player" readOnly layout="flow">
            {guest.shown.content}
          </BookView>
        </div>
      </ScrollArea>
    </div>
  )
}

/** The same content filling the window, for actually reading it. */
function DmOverlay({ onClose }: { onClose: () => void }) {
  const guest = useGuest()
  // Escape closes it, the same gesture every other dismissible surface uses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!guest.shown) return null
  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {guest.shown.title}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-xs"
          onClick={onClose}
        >
          <X className="size-3.5" /> Close
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {/* Wider than the panel and centred, which is the whole reason to
            expand: a statblock reads as a column, not as a ribbon. */}
        <div className="mx-auto max-w-4xl p-8">
          <BookView audience="player" readOnly layout="flow">
            {guest.shown.content}
          </BookView>
        </div>
      </ScrollArea>
    </div>
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
  const [waiting, setWaiting] = useState(false)
  const [secret, setSecret] = useState('')
  /**
   * Which way in. Beacon discovery cannot cross the internet, so in 'remote'
   * mode it is skipped entirely rather than burning a four-second timeout that
   * can never succeed.
   */
  const [how, setHow] = useState<'lan' | 'remote'>('lan')
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

  const remote = how === 'remote'

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      let target = address.trim()
      // Validate before the fetch, so a typo is a specific message rather than
      // a TypeError surfacing from deep inside fetch.
      if (target && !normalizeBaseUrl(target)) {
        setError('That does not look like an address.')
        return
      }
      if (!target) {
        if (remote) {
          setError('Enter the address your DM sent you.')
          return
        }
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
      await joinTable(target, code, name, {
        secret: remote ? secret.trim() : undefined,
        onWaiting: () => setWaiting(true),
      })
    } catch (cause) {
      // A network failure surfaces as TypeError("Failed to fetch"), which is
      // both an Error and useless to a person at a table — so it is translated.
      // Anything else is a message the host wrote ("Wrong room code").
      const raw = cause instanceof Error ? cause.message : ''
      const unreachable =
        !raw || /failed to fetch|networkerror|load failed/i.test(raw)
      setError(
        !unreachable
          ? raw
          : remote
            ? // "the same network" is actively misleading here.
              'Could not reach the table. Check the address is exactly what ' +
              'your DM sent, and that they are still hosting.'
            : 'Could not reach the table. Check the DM is hosting and that ' +
              'you are on the same network.',
      )
      setManual(true)
      setPendingCharacter(null)
    } finally {
      setSearching(false)
      setWaiting(false)
      setBusy(false)
    }
  }

  const characters = mine.data ?? []

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-4 overflow-y-auto p-6">
      <div>
        <h1 className="text-lg font-semibold">Join a table</h1>
        <p className="text-muted-foreground text-sm">
          {remote
            ? 'Your DM will send you an address and a guest key. If they use ' +
              'Tailscale, install it and accept their invite first.'
            : 'Ask your DM for the room code on their screen. If you are on ' +
              'the same wifi, that is all you need.'}
        </p>
      </div>

      <div className="bg-muted flex gap-1 rounded-md p-1">
        {(['lan', 'remote'] as const).map((mode) => (
          <Button
            key={mode}
            variant={how === mode ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1"
            onClick={() => {
              setHow(mode)
              setError(null)
            }}
          >
            {mode === 'lan' ? 'Same wifi' : 'Over the internet'}
          </Button>
        ))}
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
        {(manual || remote) && (
          <div className="space-y-1">
            <Label htmlFor="guest-address">
              {remote ? 'Address or link from your DM' : 'Address'}
            </Label>
            <Input
              id="guest-address"
              placeholder={
                remote
                  ? 'https://…  or  100.101.102.103:7777'
                  : '192.168.1.42:7777'
              }
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        )}
        {remote && (
          <div className="space-y-1">
            <Label htmlFor="guest-secret">Guest key</Label>
            <Input
              id="guest-secret"
              placeholder="From your DM, alongside the code"
              className="font-mono"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
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
        {waiting
          ? 'Waiting for the DM to let you in…'
          : searching
            ? 'Looking for the table…'
            : 'Join'}
      </Button>
      {!manual && !remote && (
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
