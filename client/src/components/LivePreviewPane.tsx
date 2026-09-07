import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { BookView } from '#/components/Markdown'
import type { RollSource } from '#/lib/rollLog'

/**
 * Side-by-side live preview for an editing surface. The book pages are a fixed
 * 816px wide, so the pane scales them to fit its own width.
 *
 * Shared by the article route's Write tab and the character route's Story tab —
 * a character's backstory *is* the markdown body, so the two are previewing the
 * same kind of string through the same renderer.
 */
export function LivePreviewPane({
  content,
  articles,
  worldId,
  onCreateMissing,
  noteTitles,
  onOpenNote,
  source,
}: {
  content: string
  articles?: Array<{ id: string; title: string }>
  worldId: string
  onCreateMissing: (title: string) => void
  noteTitles?: Array<string>
  onOpenNote?: (title: string) => void
  source?: RollSource
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)
  // Defer keystrokes so typing stays snappy while the preview catches up.
  const deferred = useDeferredValue(content)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setScale(Math.min(1, (el.clientWidth - 24) / 840))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="w-1/2 shrink-0 overflow-y-auto border-l bg-stone-800/90 dark:bg-stone-950"
    >
      <div className="p-3" style={{ zoom: scale }}>
        {deferred.trim() ? (
          <BookView
            articles={articles}
            worldId={worldId}
            onCreateMissing={onCreateMissing}
            noteTitles={noteTitles}
            onOpenNote={onOpenNote}
            source={source}
          >
            {deferred}
          </BookView>
        ) : (
          <p className="text-stone-400">Start typing to see the preview.</p>
        )}
      </div>
    </div>
  )
}
