import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { api } from '#/lib/api'
import { normalizeBaseUrl } from '#/lib/guestStore'
import { remoteWarning } from '#/lib/remoteAddress'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { cn } from '#/lib/utils'

/**
 * Whether the table may be joined from outside the local network.
 *
 * App-wide rather than per-world — it is a property of this machine's network,
 * not of a campaign — so it sits with Homebrew and Library rather than among
 * the settings a world folder carries.
 *
 * The host has ALWAYS bound every adapter, so this switch does not open a
 * socket that was closed. What it changes is whether the remote join path
 * exists at all: with it on, a join from a non-local address must present the
 * guest key and then wait for the DM to let them in.
 */
export function TableSection() {
  const [remoteAccess, setRemoteAccess] = useState(false)
  const [origin, setOrigin] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let live = true
    void api.table.remote.get().then(
      (r) => {
        if (!live) return
        setRemoteAccess(r.remoteAccess)
        setOrigin(r.remoteOrigin ?? '')
        setLoaded(true)
      },
      () => setLoaded(true),
    )
    return () => {
      live = false
    }
  }, [])

  const flash = (msg: string) => {
    setSaved(msg)
    setTimeout(() => setSaved(null), 1500)
  }

  const toggle = async (next: boolean) => {
    setRemoteAccess(next)
    await api.table.remote.set({ remoteAccess: next })
    flash(next ? 'Remote joining is on.' : 'Remote joining is off.')
  }

  const saveOrigin = async () => {
    const trimmed = origin.trim()
    // Normalise on save so the panel and the guest agree on one shape, and a
    // typo is caught here rather than at 8pm on game night.
    const normalized = trimmed ? normalizeBaseUrl(trimmed) : null
    if (trimmed && !normalized) {
      flash('That does not look like an address.')
      return
    }
    setOrigin(normalized ?? '')
    await api.table.remote.set({ remoteOrigin: normalized })
    flash('Saved.')
  }

  // Only meaningful once there is something to warn about.
  const warning = origin.trim() ? remoteWarning(origin.trim()) : null

  return (
    <div className="grid max-w-2xl gap-4">
      <div className="grid gap-1.5">
        <h2 className="text-sm font-medium">Playing over the internet</h2>
        <p className="text-muted-foreground text-xs">
          A session is normally joined by people on the same wifi. Turn this on
          to let people elsewhere join too.
        </p>
      </div>

      <div className="grid gap-1.5">
        {(
          [
            {
              on: false,
              label: 'Same network only',
              description:
                'Guests must be on your wifi. The room code is all they need.',
            },
            {
              on: true,
              label: 'Allow joining from anywhere',
              description:
                'A guest from outside also needs a guest key, and you have to let them in. Your machine still has to be reachable — see below.',
            },
          ] as const
        ).map((option) => (
          <button
            key={String(option.on)}
            type="button"
            disabled={!loaded}
            onClick={() => void toggle(option.on)}
            className={cn(
              'rounded-md border px-3 py-2 text-left',
              remoteAccess === option.on
                ? 'border-primary bg-accent'
                : 'hover:bg-accent/50',
            )}
          >
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-muted-foreground block text-xs">
              {option.description}
            </span>
          </button>
        ))}
      </div>

      {remoteAccess && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="remote-origin">The address you hand out</Label>
            <div className="flex gap-2">
              <Input
                id="remote-origin"
                placeholder="100.101.102.103:7777"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              />
              <Button variant="outline" onClick={() => void saveOrigin()}>
                Save
              </Button>
            </div>
            {/* Deliberately typed rather than detected. Asking a third-party
                service for your public IP leaks it to them, and returns the
                wrong answer behind carrier NAT — which is exactly when
                forwarding a port does not work either. */}
            <p className="text-muted-foreground text-xs">
              Only you know how your players reach you, so this is not guessed.
            </p>
          </div>

          {warning && (
            <p className="text-destructive flex gap-1.5 text-xs">
              <ShieldAlert className="mt-px size-3.5 shrink-0" />
              <span>{warning}</span>
            </p>
          )}

          <div className="text-muted-foreground grid gap-1.5 text-xs">
            <p className="font-medium">How do I make my machine reachable?</p>
            <p>
              <span className="font-medium">Tailscale</span> is the one to use.
              Everyone installs it once and accepts your invite; you then get an
              address starting 100. that works from anywhere, encrypted, with
              nothing to configure on your router. Paste that address above.
            </p>
            <p>
              Forwarding a port on your router also works, but the connection is
              not encrypted and anyone in between can read what you show your
              players.
            </p>
          </div>
        </>
      )}

      {saved && <p className="text-muted-foreground text-xs">{saved}</p>}
    </div>
  )
}
