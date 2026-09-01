import { createFileRoute } from '@tanstack/react-router'
import { ArticleViewer } from '#/components/player/ArticleViewer'

/**
 * The player window: one article, rendered for the table.
 *
 * A top-level sibling of `worlds/` so WorldLayout's chrome and watcher never
 * mount here — see ArticleViewer, which holds the body and the reasoning.
 *
 * NOTE: unrelated to WorldMode's `'player'` in lib/worldMode.ts, which is a
 * per-world chrome setting for someone playing a character in someone else's
 * game. This is a table-facing display window.
 */
export const Route = createFileRoute('/player/$worldId/$articleId')({
  component: PlayerWindowPage,
})

function PlayerWindowPage() {
  const { worldId, articleId } = Route.useParams()
  return <ArticleViewer worldId={worldId} articleId={articleId} mode="player" />
}
