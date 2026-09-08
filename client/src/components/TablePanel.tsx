import { useEffect, useState } from 'react'
import {
  Copy,
  EyeOff,
  MonitorPlay,
  ShieldAlert,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { api } from '#/lib/api'
import type { FirewallState, LanCandidate } from '#/lib/api'
import {
  clearShown,
  refreshTable,
  startHosting,
  stopHosting,
  useTable,
} from '#/lib/tableStore'
import { Button } from '#/components/ui/button'
import { ScrollArea } from '#/components/ui/scroll-area'

/**
 * Host a LAN session: the room code, the address guests type, and who is here.
 *
 * A "seat" is a person on another machine. The word "player" is deliberately
 * not used — it already means a WorldMode, a ViewerMode and a BookView
 * audience, and a fourth meaning would make every one of them harder to read.
 */
export function TablePanel({ worldId }: { worldId: string }) {
  const { hosting, info } = useTable()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [firewall, setFirewall] = useState<FirewallState | null>(null)
  const [firewallNote, setFirewallNote] = useState<string | null>(null)
  const [fixing, setFixing] = useState(false)

  // A window opened after hosting began still needs to show the code, so ask
  // main what is running rather than assuming this window started it.
  useEffect(() => void refreshTable(), [])

  // Whether Windows is letting guests in. A plain read, no elevation — and the
  // answer is the difference between "nobody can connect" and "all fine", so
  // it is worth knowing before the DM starts debugging their wifi.
  useEffect(() => {
    if (!hosting) return
    let live = true
    void api.table
      .firewallState()
      .then((state) => live && setFirewall(state))
      .catch(() => live && setFirewall(null))
    return () => {
      live = false
    }
  }, [hosting])

  const fixFirewall = async () => {
    setFixing(true)
    setFirewallNote(null)
    try {
      const result = await api.table.firewall()
      setFirewallNote(result.message)
      setFirewall(await api.table.firewallState())
    } catch (cause) {
      setFirewallNote(
        cause instanceof Error ? cause.message : 'Could not change the firewall',
      )
    } finally {
      setFixing(false)
    }
  }

  const go = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(what)
        setTimeout(() => setCopied(null), 1500)
      },
      () => setError('Could not copy to the clipboard'),
    )
  }

  if (!hosting || !info) {
    return (
      <div className="flex h-full flex-col justify-between p-4">
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Host this world so people at your table can join from their own
            machines. They see what you show them, and every roll lands in one
            shared history. On the same wifi, they usually need only the room
            code — and this panel will show an address if they do not.
          </p>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => void go(() => startHosting(worldId))}
        >
          <Wifi className="size-4" /> Start hosting
        </Button>
      </div>
    )
  }

  // Ranked in main by lan.ts, so [0] is the best guess rather than whatever
  // the OS happened to enumerate first. This used to be an unranked list, and
  // on a machine with a Hyper-V switch and six link-local adapters the panel
  // confidently showed an address no guest could ever reach.
  const candidates: Array<LanCandidate> = info.candidates
  // Real NICs only, unless there are none — two machines on a direct cable are
  // both link-local, and telling them they have no address helps nobody.
  const usable = candidates.filter((c) => c.rank <= 1)
  const shown = usable.length > 0 ? usable : candidates
  const hidden = candidates.filter((c) => !shown.includes(c))
  // Indexing an array types as non-undefined here, so length is what actually
  // says whether there is an address at all — a machine with no adapters is
  // rare but must not render "undefined:7777".
  const hasAddress = shown.length > 0
  const best = shown[0]
  const address = hasAddress ? best.address : 'localhost'
  const discovering =
    info.beacon.state === 'running' && info.beacon.interfaces.length > 0
  // Only when we actually know. A failed check must not accuse the firewall.
  const blocked = firewall?.applicable === true && firewall.present === false

  /** One address row, with what it is and a copy button. */
  const addressRow = (c: LanCandidate, primary: boolean) => (
    <div key={c.address} className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <code
          className={
            primary
              ? 'block truncate font-mono text-sm'
              : 'text-muted-foreground block truncate font-mono text-xs'
          }
        >
          {c.address}:{info.port}
        </code>
        <p className="text-muted-foreground truncate text-[11px]">
          {c.iface}
          {c.kind === 'apipa'
            ? ' — no network address; works only on a direct cable'
            : c.virtual
              ? ' — virtual adapter, usually not reachable'
              : ''}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        title={`Copy ${c.address}`}
        onClick={() => copy(`${c.address}:${info.port}`, c.address)}
      >
        <Copy className="size-3.5" />
      </Button>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b p-3">
        <div>
          <p className="text-muted-foreground text-xs">Room code</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-2xl tracking-widest">
              {info.code}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              title="Copy the room code"
              onClick={() => copy(info.code, 'code')}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            {discovering
              ? 'Address — only needed if the code alone does not find you'
              : 'Address — give this to your players'}
          </p>
          {hasAddress ? (
            <div className="space-y-1.5">
              {addressRow(best, true)}
              {shown.slice(1).map((c) => addressRow(c, false))}
            </div>
          ) : (
            <code className="block font-mono text-sm">
              {address}:{info.port}
            </code>
          )}
          {hidden.length > 0 && (
            <>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground mt-1 text-xs underline"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Hide' : `Other addresses (${hidden.length})`}
              </button>
              {/* Kept reachable rather than removed: the ranking is a
                  heuristic, and a DM on an unusual network needs the escape
                  hatch more than a tidy panel. */}
              {showAll && (
                <div className="mt-1.5 space-y-1.5">
                  {hidden.map((c) => addressRow(c, false))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Discovery's real state. The old panel promised the room code was
            enough even when the beacon had died on startup. */}
        {!discovering && (
          <p className="text-muted-foreground text-xs">
            Automatic discovery is not working on this network — your players
            will need to type the address above.
          </p>
        )}

        {!info.listening && (
          <p className="text-destructive text-xs">
            The table is not accepting connections — something else may already
            be using port {info.port}.
          </p>
        )}

        {/* Windows drops inbound connections unless a rule exists, and nothing
            ever created one. Invisible from this machine, because loopback is
            exempt: hosting and joining yourself works perfectly while every
            other machine times out. */}
        {blocked && (
          <div className="border-destructive/40 bg-destructive/5 space-y-2 rounded border p-2">
            <p className="text-xs">
              <ShieldAlert className="mr-1 inline size-3.5 align-[-2px]" />
              Windows is blocking incoming connections, so your players cannot
              reach this table.
            </p>
            <Button
              size="sm"
              className="w-full"
              disabled={fixing}
              onClick={() => void fixFirewall()}
            >
              {fixing ? 'Asking Windows…' : 'Allow players to connect'}
            </Button>
            <p className="text-muted-foreground text-[11px]">
              Windows will ask for permission.
            </p>
          </div>
        )}
        {firewallNote && (
          <p className="text-muted-foreground text-xs">{firewallNote}</p>
        )}
        {copied && (
          <p className="text-muted-foreground text-xs">Copied the {copied}.</p>
        )}
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>

      {/* What the players are looking at right now. Without this the DM has no
          way to tell what is on the table, or to take it down again — the only
          feedback was on the guests' own screens. */}
      <div className="border-b p-3">
        <p className="text-muted-foreground text-xs">On the table</p>
        {info.shown ? (
          <div className="flex items-center gap-2">
            <MonitorPlay className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-500" />
            <span
              className="min-w-0 flex-1 truncate text-sm font-medium"
              title={info.shown.articleId}
            >
              {info.shown.title}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 text-xs"
              title="Stop showing this to the players"
              onClick={() => void go(clearShown)}
            >
              <EyeOff className="size-3.5" /> Stop
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nothing — use Show to players on an article.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <Users className="text-muted-foreground size-3.5" />
        <span className="text-muted-foreground flex-1 text-xs">
          {info.seats.length === 0
            ? 'Nobody has joined yet'
            : `${info.seats.length} at the table`}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ul className="divide-y">
          {info.seats.map((seat) => (
            <li key={seat.id} className="px-3 py-2 text-sm">
              <span className="font-medium">{seat.name}</span>
              <p className="text-muted-foreground text-xs">
                {seat.characterId
                  ? `playing ${seat.characterId.split('/').pop()}`
                  : 'no character claimed'}
              </p>
            </li>
          ))}
        </ul>
      </ScrollArea>

      <div className="border-t p-3">
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => void go(stopHosting)}
        >
          <WifiOff className="size-4" /> Stop hosting
        </Button>
      </div>
    </div>
  )
}
