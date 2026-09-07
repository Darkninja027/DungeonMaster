import { useCallback, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useShortcut } from '#/lib/useShortcut'
import type { FocusedImage } from '#/lib/playerFocus'

const MIN_SCALE = 0.25
const MAX_SCALE = 8
const STEP = 1.15

/**
 * A map or handout, full-screen with pan and zoom, for the player window.
 *
 * Deliberately not the shadcn Dialog: its focus trap, animated overlay and
 * close-on-outside-click all fight a pointer drag across the whole surface.
 * A plain fixed overlay is the right primitive here.
 *
 * Pans and zooms with `transform`, NOT the `zoom` the book sheets use —
 * `zoom` reflows and repaints, which is fine for a static page and terrible
 * at 60fps under a drag.
 */
export function ImageLightbox({
  image,
  onClose,
}: {
  image: FocusedImage
  onClose: () => void
}) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  )

  // Lowercased and ctrl:false — useShortcut requires Ctrl by default and
  // compares against e.key.toLowerCase().
  useShortcut('escape', onClose, { ctrl: false })

  const reset = useCallback(() => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden overscroll-contain bg-black/95"
      onWheel={(e) => {
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        const factor = e.deltaY < 0 ? STEP : 1 / STEP
        setScale((prev) => {
          const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor))
          // Keep the point under the cursor still. Without this the image
          // slides away from wherever you are looking, which on a large map
          // reads as broken rather than as zooming.
          const ratio = next / prev - 1
          const cx = e.clientX - rect.left - rect.width / 2
          const cy = e.clientY - rect.top - rect.height / 2
          setPan((p) => ({
            x: p.x - (cx - p.x) * ratio,
            y: p.y - (cy - p.y) * ratio,
          }))
          return next
        })
      }}
      onPointerDown={(e) => {
        // Pointer (not mouse) events, so a pen or touchscreen works; capture
        // so a fast drag off the element does not strand the gesture.
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) })
      }}
      onPointerUp={(e) => {
        drag.current = null
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onDoubleClick={reset}
    >
      <div className="flex h-full w-full items-center justify-center">
        <img
          src={image.src}
          alt={image.alt ?? ''}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            cursor: drag.current ? 'grabbing' : 'grab',
          }}
        />
      </div>

      {/* Large and always visible: a DM reaches for this from across a table,
          not with a careful mouse hover. */}
      <button
        type="button"
        onClick={onClose}
        title="Back to the page (Esc)"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/25"
      >
        <X className="size-6" />
      </button>
      <button
        type="button"
        onClick={reset}
        className="absolute bottom-4 right-4 rounded bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/25"
      >
        Fit
      </button>
    </div>
  )
}
