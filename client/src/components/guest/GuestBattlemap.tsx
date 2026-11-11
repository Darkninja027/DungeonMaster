import { useEffect, useState } from 'react'
import { guestImageUrl, sendMove, useGuest } from '#/lib/guestStore'
import { mayControl } from '#/lib/mapSession'
import { moveToken } from '#/lib/mapStore'
import { MapCanvas } from '#/components/map/MapCanvas'

/**
 * The battlemap the DM is sharing, on a LAN guest's own screen.
 *
 * Player audience throughout: the map arrives already stripped of hidden
 * tokens, fog draws opaque, and initiative is the redacted cut. The one thing
 * a guest may do beyond pan and zoom is drag a token THEY control — their
 * claimed character's, or one the DM handed them — and the host checks that
 * again, so the draggable set here is a convenience, not the permission.
 *
 * A drop is shown at once and sent to the host; the host's next frame is the
 * truth. If it never comes (the DM hid the token that instant) the preview
 * lapses rather than leaving the token somewhere it isn't.
 */

/** How long a dropped token waits for the host before it snaps back. */
const PREVIEW_MS = 2000

interface Preview {
  tokenId: string
  x: number
  y: number
  /** Still being dragged — a frame arriving now must not yank it away. */
  dropped: boolean
}

export function GuestBattlemap() {
  const guest = useGuest()
  const shared = guest.map
  const [preview, setPreview] = useState<Preview | null>(null)

  // A new frame from the host replaces a DROPPED preview: either it contains
  // the move, or the move was refused. A token still in the hand is left alone.
  useEffect(() => {
    setPreview((p) => (p?.dropped ? null : p))
  }, [shared])

  useEffect(() => {
    if (!preview?.dropped) return
    const timer = setTimeout(() => setPreview(null), PREVIEW_MS)
    return () => clearTimeout(timer)
  }, [preview])

  if (!shared || !guest.session) return null

  const me = {
    name: guest.session.name,
    // Only a claim from the DM's own world counts: a vault character is a
    // label the host cannot verify, so the DM hands those tokens over by name.
    characterId: guest.origin === 'table' ? guest.characterId : null,
  }
  const mine = (tokenId: string) => mayControl(shared.control[tokenId], me)
  const controlsAny = shared.map.tokens.some((t) => mine(t.id))

  const map = preview
    ? moveToken(shared.map, preview.tokenId, preview.x, preview.y)
    : shared.map

  return (
    <div className="relative size-full bg-stone-950">
      <MapCanvas
        worldId=""
        map={map}
        audience="player"
        combatants={shared.session.combatants}
        activeCombatantId={shared.session.activeId}
        imageUrl={guestImageUrl}
        canDragToken={(t) => mine(t.id)}
        onMoveToken={(tokenId, x, y) =>
          setPreview({ tokenId, x, y, dropped: false })
        }
        onDropToken={(tokenId, x, y) => {
          setPreview({ tokenId, x, y, dropped: true })
          void sendMove(shared.mapId, tokenId, x, y).then((ok) => {
            if (!ok) setPreview(null)
          })
        }}
        className="size-full"
      />
      <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-stone-200">
        {controlsAny
          ? 'Drag your token to move it. Scroll to zoom, drag the floor to pan.'
          : 'Scroll to zoom, drag to pan.'}
      </p>
    </div>
  )
}
