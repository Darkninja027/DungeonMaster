import { useEffect, useState } from 'react'
import { Copy, Users, Wifi, WifiOff } from 'lucide-react'
import { refreshTable, startHosting, stopHosting, useTable } from '#/lib/tableStore'
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

  // A window opened after hosting began still needs to show the code, so ask
  // main what is running rather than assuming this window started it.
  useEffect(() => void refreshTable(), [])

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
            shared history.
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

  // Any of these works; the first is usually the one on the same wifi.
  const address = info.addresses[0] ?? 'localhost'

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
          <p className="text-muted-foreground text-xs">Address</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-sm">
              {address}:{info.port}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              title="Copy the address"
              onClick={() => copy(`${address}:${info.port}`, 'address')}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          {info.addresses.length > 1 && (
            <p className="text-muted-foreground mt-1 text-xs">
              Also reachable on {info.addresses.slice(1).join(', ')}
            </p>
          )}
        </div>
        {copied && (
          <p className="text-muted-foreground text-xs">Copied the {copied}.</p>
        )}
        {error && <p className="text-destructive text-xs">{error}</p>}
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
