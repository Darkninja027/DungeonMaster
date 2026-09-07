import { createFileRoute } from '@tanstack/react-router'
import { ArticleViewer } from '#/components/player/ArticleViewer'

/**
 * A pop-out reference window: one article on the DM's own second monitor, so a
 * statblock stays visible while they work in the main window.
 *
 * The inverse of the player route despite sharing its body — the audience is
 * the person who wrote the article, so nothing is stripped and the dice stay
 * rollable. See ArticleViewer.
 */
export const Route = createFileRoute('/popout/$worldId/$articleId')({
  component: PopoutWindowPage,
})

function PopoutWindowPage() {
  const { worldId, articleId } = Route.useParams()
  return <ArticleViewer worldId={worldId} articleId={articleId} mode="popout" />
}
