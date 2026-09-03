import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Dices, LogOut, Users, WifiOff } from 'lucide-react'
import { discover, joinTable, leaveTable, useGuest } from '#/lib/guestStore'
import { BookView } from '#/components/Markdown'
import { RollHistory } from '#/components/RollHistory'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { ScrollArea } from '#/components/ui/scroll-area'

/**
 * The guest end of a LAN session: join with an address and a room code, then
 * watch whatever the DM shows.
 *
 * Content is rendered with audience="player" and readOnly, so `:::dm` blocks
 * are stripped by the same tested path the local player window uses — the
 * stripping happens HOST-side too, but doing it here as well means a bug in
 * one is not a leak on its own.
 *
 * Images are deliberately absent for now: their markdown references are
 * `_images/…` paths that resolve through the Electron-only world:// protocol,
 * which a guest cannot use. The host exposes them over /img/, and wiring that
 * through is the next step rather than a silent broken image.
 */
export function GuestTable() {
  const guest = useGuest()
  const [address, setAddress] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Shown only once discovery has actually failed, so the common case is two
  // fields rather than three.
  const [manual, setManual] = useState(false)
  const [searching, setSearching] = useState(false)

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      let target = address.trim()
      if (!target) {
        // Nothing typed: ask the LAN who is hosting this code.
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
      await joinTable(target, code, name)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not reach that address — check the DM is hosting.',
      )
    } finally {
      setSearching(false)
      setBusy(false)
    }
  }

  if (!guest.session) {
    return (
      <div className="mx-auto flex h-full max-w-sm flex-col justify-center gap-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">Join a table</h1>
          <p className="text-muted-foreground text-sm">
            Ask your DM for the room code on their screen. If you are on the
            same wifi, that is all you need.
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

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto bg-stone-950">
        {guest.shown ? (
          <div className="mx-auto max-w-3xl p-6">
            <BookView audience="player" readOnly layout="flow">
              {guest.shown.content}
            </BookView>
          </div>
        ) : (
          <p className="p-8 text-center text-stone-400">
            Waiting for the DM to show something.
          </p>
        )}
      </div>

      <aside className="flex w-80 shrink-0 flex-col border-l">
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
            size="icon"
            className="size-7"
            title="Leave the table"
            onClick={leaveTable}
          >
            <LogOut className="size-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <Users className="text-muted-foreground size-3.5" />
          <span className="text-muted-foreground text-xs">
            {guest.seats.length} at the table
          </span>
        </div>
        <ScrollArea className="max-h-32 shrink-0 border-b">
          <ul className="divide-y">
            {guest.seats.map((seat) => (
              <li key={seat.id} className="px-3 py-1.5 text-xs">
                {seat.name}
              </li>
            ))}
          </ul>
        </ScrollArea>

        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <Dices className="text-muted-foreground size-3.5" />
          <span className="text-muted-foreground text-xs">Shared rolls</span>
        </div>
        <div className="min-h-0 flex-1">
          <RollHistory />
        </div>
      </aside>
    </div>
  )
}
