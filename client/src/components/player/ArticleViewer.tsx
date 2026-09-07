import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookView } from '#/components/Markdown'
import { SheetFitPane, SheetPreview } from '#/components/character/SheetPreview'
import { ImageLightbox } from '#/components/player/ImageLightbox'
import { isCharacterContent, parseCharacter } from '#/lib/character'
import { onFocusImage } from '#/lib/playerFocus'
import type { FocusedImage } from '#/lib/playerFocus'
import { loadSpellCards } from '#/lib/sheetPrintPrefs'
import { api } from '#/lib/api'
import type { PlayerContent, ViewerMode } from '#/lib/api'

/**
 * One article in a secondary window. Shared by both viewer routes, which
 * differ ONLY in `mode` — and that one flag inverts every content rule:
 *
 *   'player' — for the table. :::dm blocks stripped from the markdown before
 *              it is parsed, and every link and dice chip rendered as inert
 *              text (see the `a` override in Markdown.tsx for why that is a
 *              prop and not a CSS rule).
 *   'popout' — the DM's own reference on a second monitor. Nothing stripped,
 *              dice still rollable: the audience is the person who wrote it.
 *
 * Neither route sits under /worlds/$worldId, so WorldLayout never mounts —
 * no sidebar, no SessionPanel, and crucially none of its `worlds:watch`
 * effect. The watcher is a singleton (electron/main/watcher.ts), so a second
 * subscriber would silently steal live-reload from the DM window.
 */
export function ArticleViewer({
  worldId,
  articleId,
  mode,
}: {
  worldId: string
  articleId: string
  mode: ViewerMode
}) {
  const forPlayers = mode === 'player'

  // The saved article, so the window paints immediately on open rather than
  // waiting for the DM's next keystroke. Keyed by world as well as article: a
  // global library entry and a world article can share an id (both worlds have
  // Monsters/Goblin), and a bare articleId key would serve one for the other.
  const article = useQuery({
    queryKey: ['worlds', worldId, 'articles', articleId],
    queryFn: () => api.articles.get(worldId, articleId),
  })
  // Needed for [[wiki link]] resolution — without it every link renders as
  // raw brackets. A plain read; no watcher involved.
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

  // Click-to-enlarge, for the map or handout case. Player windows only: in a
  // popout the images are already beside the editor that owns them.
  const [focused, setFocused] = useState<FocusedImage | null>(null)
  useEffect(
    () => (forPlayers ? onFocusImage(setFocused) : undefined),
    [forPlayers],
  )

  // Push wins when present; the saved copy covers cold start, and stays on
  // screen if the DM closes the article rather than blanking the window.
  const content = pushed?.content ?? article.data?.content ?? ''
  const title = pushed?.title ?? article.data?.title ?? ''

  useEffect(() => {
    if (title) document.title = forPlayers ? `${title} — Players` : title
  }, [title, forPlayers])

  const character = isCharacterContent(content) ? parseCharacter(content) : null

  return (
    <div
      className={
        forPlayers
          ? 'h-full w-full overflow-y-auto bg-stone-950'
          : 'h-full w-full overflow-y-auto bg-stone-800/90 dark:bg-stone-950'
      }
    >
      {/* Scaled past 1 for a projector, which is much wider than a book page;
          a popout sits on a normal monitor and keeps the usual cap. */}
      <SheetFitPane max={forPlayers ? 2.5 : 1}>
        {!content.trim() ? (
          <p className="p-8 text-center text-stone-400">
            {article.isLoading ? 'Loading…' : 'Nothing to show yet.'}
          </p>
        ) : character ? (
          <SheetPreview
            character={character.character}
            body={character.body}
            title={title}
            source={{ worldId, articleId, title }}
            worldId={worldId}
            articles={tree.data?.articles}
            spellCards={loadSpellCards()}
          />
        ) : (
          <BookView
            articles={tree.data?.articles}
            worldId={worldId}
            audience={forPlayers ? 'player' : 'dm'}
            readOnly={forPlayers}
            source={forPlayers ? undefined : { worldId, articleId, title }}
// A reading surface, not a page proof. Fixed sheets would spill a
            // long statblock onto a second sheet, and each sheet re-renders the
            // whole document — so the overflow copy's dice chips sit outside
            // the visible box, in the DOM and unclickable.
            layout="flow"
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
