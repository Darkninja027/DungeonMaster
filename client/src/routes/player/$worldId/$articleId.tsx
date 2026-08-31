import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { BookView } from '#/components/Markdown'
import {
  SheetFitPane,
  SheetPreview,
} from '#/components/character/SheetPreview'
import { ImageLightbox } from '#/components/player/ImageLightbox'
import { isCharacterContent, parseCharacter } from '#/lib/character'
import { onFocusImage } from '#/lib/playerFocus'
import type { FocusedImage } from '#/lib/playerFocus'
import { loadSpellCards } from '#/lib/sheetPrintPrefs'
import { api } from '#/lib/api'
import type { PlayerContent } from '#/lib/api'

/**
 * The player window: one article, rendered for a projector.
 *
 * A TOP-LEVEL sibling of `worlds/`, and that placement is the whole design.
 * Being outside `/worlds/$worldId` means WorldLayout never mounts here — no
 * sidebar, no SessionPanel, no CommandPalette, and crucially none of its
 * `worlds:watch` effect. The watcher is a singleton (watcher.ts), so a second
 * subscriber would silently steal live-reload from the DM window.
 *
 * NOTE: unrelated to WorldMode's `'player'` in lib/worldMode.ts, which is a
 * per-world chrome setting for someone playing a character in someone else's
 * game. This is a table-facing display window.
 *
 * Nothing here is interactive: `readOnly` makes every link and dice chip inert
 * (see the `a` override in Markdown.tsx for why that is a prop and not CSS),
 * and `audience="player"` strips :::dm blocks from the markdown before it is
 * ever parsed.
 */
export const Route = createFileRoute('/player/$worldId/$articleId')({
  component: PlayerWindowPage,
})

function PlayerWindowPage() {
  const { worldId, articleId } = Route.useParams()

  // The saved article, so the window paints immediately on open rather than
  // waiting for the DM's next keystroke.
  const article = useQuery({
    queryKey: ['articles', articleId],
    queryFn: () => api.articles.get(worldId, articleId),
  })
  // Needed for [[wiki link]] resolution — without it every link renders as
  // raw brackets on the projector. A plain read; no watcher involved.
  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })

  // The DM window relays its live editor buffer here. The file watcher cannot
  // do this job: every app write goes through noteSelfWrite, so the watcher
  // deliberately never fires for the DM's own edits.
  const [pushed, setPushed] = useState<PlayerContent | null>(null)
  useEffect(
    () =>
      api.player.onContent((p) => {
        if (p.worldId === worldId && p.articleId === articleId) setPushed(p)
      }),
    [worldId, articleId],
  )

  // Click-to-enlarge, for the map or handout case.
  const [focused, setFocused] = useState<FocusedImage | null>(null)
  useEffect(() => onFocusImage(setFocused), [])

  // Push wins when present; the saved copy covers cold start, and stays on
  // screen if the DM closes the article rather than blanking the projector.
  const content = pushed?.content ?? article.data?.content ?? ''
  const title = pushed?.title ?? article.data?.title ?? ''

  useEffect(() => {
    if (title) document.title = `${title} — Players`
  }, [title])

  const character = isCharacterContent(content) ? parseCharacter(content) : null

  return (
    <div className="h-full w-full overflow-y-auto bg-stone-950">
      {/* Scaled well past 1: a projector is much wider than a book page, and
          the default cap would leave the sheet small in a large dark field. */}
      <SheetFitPane max={2.5}>
        {!content.trim() ? (
          <p className="p-8 text-center text-stone-400">
            {article.isLoading ? 'Loading…' : 'Nothing to show yet.'}
          </p>
        ) : character ? (
          <SheetPreview
            character={character.character}
            body={character.body}
            title={title}
            // A sheet's own dice are still live for the DM to read out; rolls
            // land in this window's log, which is per-window and unread. The
            // BookView path is the one that must be inert.
            source={{ worldId, articleId, title }}
            worldId={worldId}
            articles={tree.data?.articles}
            spellCards={loadSpellCards()}
          />
        ) : (
          <BookView
            articles={tree.data?.articles}
            worldId={worldId}
            audience="player"
            readOnly
          >
            {content}
          </BookView>
        )}
      </SheetFitPane>
      {focused && (
        <ImageLightbox image={focused} onClose={() => setFocused(null)} />
      )}
    </div>
  )
}
