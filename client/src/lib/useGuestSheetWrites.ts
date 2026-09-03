import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { applySheetPatch } from './sheetPatch'

/**
 * Host side: apply sheet edits that arrived from guests.
 *
 * Mounted once by WorldLayout, so it runs only in the DM window and only while
 * a world is open. The renderer does the applying rather than main because
 * character parse/serialize lives here — main stays free of sheet knowledge the
 * same way it stays free of homebrew.
 *
 * Two things this has to get right:
 *
 *   - The write goes through the ordinary articles:update path, so it is atomic
 *     and behaves exactly like a local edit.
 *   - That path calls noteSelfWrite, which suppresses the file watcher for two
 *     seconds. So the DM's own open sheet would NOT reload on its own — the
 *     query cache is invalidated explicitly here instead. Without that, a
 *     guest's HP change lands on disk and the DM stares at a stale number.
 */
export function useGuestSheetWrites(worldId: string): void {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      api.table.onSheet((msg) => {
        void (async () => {
          try {
            const article = await api.articles.get(worldId, msg.characterId)
            const next = applySheetPatch(article.content, msg.patch)
            // null means the patch was a no-op, or the article is not a sheet.
            // Either way there is nothing to write.
            if (next === null) return
            // The article's OWN title, unchanged. A title is the filename in
            // this app, so passing anything else here would rename the file
            // world-wide on every guest HP tick.
            await api.articles.update(worldId, msg.characterId, {
              title: article.title,
              content: next,
            })
            // The watcher is deliberately blind to our own writes, so refresh
            // the cache by hand or the open sheet stays stale.
            await queryClient.invalidateQueries({
              queryKey: ['worlds', worldId, 'articles', msg.characterId],
            })
          } catch {
            // A guest's edit failing must never take down the DM's window; the
            // guest already got its 200, and the next edit will try again.
          }
        })()
      }),
    [worldId, queryClient],
  )
}
