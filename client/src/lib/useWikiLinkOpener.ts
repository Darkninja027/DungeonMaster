import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'

/**
 * Resolves a `[[wiki link]]` title the way the rendered preview does, for the
 * raw-text editors: navigate to the article when one has that title, otherwise
 * hand the title to the caller so it can offer to create it.
 *
 * Titles match case-insensitively and ignore surrounding space, the same rule
 * `resolveWikiLinks` uses in formatMarkdown.ts — a link typed `[[bryertown]]`
 * must find the article called "Bryertown", or the editor would offer to create
 * a duplicate that only differs in case.
 */
export function useWikiLinkOpener({
  worldId,
  articles,
  onMissing,
}: {
  /** Optional so panels that don't know their world can still call this. */
  worldId?: string
  articles?: Array<{ id: string; title: string }>
  onMissing?: (title: string) => void
}) {
  const navigate = useNavigate()

  return useCallback(
    (title: string) => {
      const wanted = title.trim().toLowerCase()
      const match = articles?.find(
        (a) => a.title.trim().toLowerCase() === wanted,
      )
      if (match && worldId) {
        void navigate({
          to: '/worlds/$worldId/articles/$articleId',
          params: { worldId, articleId: match.id },
        })
        return
      }
      onMissing?.(title.trim())
    },
    [navigate, worldId, articles, onMissing],
  )
}
