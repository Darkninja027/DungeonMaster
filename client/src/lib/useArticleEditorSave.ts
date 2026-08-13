import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '#/lib/api'
import type { Article } from '#/lib/api'

/** Autosave fires this long after the last content keystroke. */
const AUTOSAVE_MS = 2000

export interface ArticleEditorSaveOptions {
  worldId: string
  /** The route param — the fallback id before the article query resolves. */
  routeArticleId: string
  /** The loaded article: the source of truth for the on-disk title. */
  article: Article | undefined
  /** The title box's live value. */
  title: string
  /** Serialise the editor's current body at save time. */
  getContent: () => string
  dirty: boolean
  setDirty: (value: boolean) => void
  /**
   * Bumped by the editor on every edit. `dirty` alone can't drive the debounce
   * — it stays `true` across continued typing, so the timer would fire 2s after
   * the *first* keystroke instead of the last.
   */
  editSeq: number
  /** A rename changed the id — re-key the route. */
  onRenamed: (newId: string) => void
  /** Every successful content save, with the fresh article. */
  onSaved?: (article: Article) => void
}

/**
 * Autosave + rename for the article and character editors, which are otherwise
 * near-identical.
 *
 * The load-bearing rule: **autosave never renames.** An article's title IS its
 * filename, so sending the edited title would rename the file on a keystroke
 * debounce — and while that rename is rewriting [[links]] across the world, the
 * next tick still holds the old id and writes to a path that no longer exists
 * ("Article not found — it may have been moved or renamed"). So the debounced
 * save sends the article's *current on-disk* title, which the main process
 * early-returns on, and renames go through commitTitle() on blur/Enter instead.
 */
export function useArticleEditorSave({
  worldId,
  routeArticleId,
  article,
  title,
  getContent,
  dirty,
  setDirty,
  editSeq,
  onRenamed,
  onSaved,
}: ArticleEditorSaveOptions) {
  const queryClient = useQueryClient()

  // Read at save time, not at timer-arm time, so the debounce doesn't re-arm on
  // values the timer body merely reads.
  const latest = useRef({ article, getContent, title })
  latest.current = { article, getContent, title }

  // The id whose last save failed. While the target id still matches, autosave
  // refuses to re-arm — otherwise a doomed id retries every 2s forever.
  const failedIdRef = useRef<string | null>(null)

  const targetId = article?.id ?? routeArticleId

  const applyResult = useCallback(
    (updated: Article) => {
      queryClient.setQueryData(['articles', updated.id], updated)
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId, 'tree'] })
      if (updated.id !== routeArticleId) onRenamed(updated.id)
    },
    [queryClient, worldId, routeArticleId, onRenamed],
  )

  const save = useMutation({
    mutationFn: () => {
      const { article: current, getContent: read } = latest.current
      const currentId = current?.id ?? routeArticleId
      // Deliberately the on-disk title, never the edited one — see the note above.
      const diskTitle =
        current?.title ?? currentId.slice(currentId.lastIndexOf('/') + 1)
      return api.articles.update(worldId, currentId, {
        title: diskTitle,
        content: read(),
      })
    },
    onSuccess: (updated) => {
      failedIdRef.current = null
      onSaved?.(updated)
      setDirty(false)
      applyResult(updated)
    },
    onError: () => {
      // Stay dirty so the Save button remains live and the work isn't presumed
      // written, but stop the debounce re-arming against the same bad id.
      failedIdRef.current = latest.current.article?.id ?? routeArticleId
    },
  })

  const rename = useMutation({
    mutationFn: (newTitle: string) => {
      const { article: current } = latest.current
      return api.articles.rename(
        worldId,
        current?.id ?? routeArticleId,
        newTitle,
      )
    },
    onSuccess: (updated) => {
      // A rename doesn't touch content, and the editor may hold unsaved body
      // edits — so this result only ever goes into the query cache, never back
      // into the editor's local state.
      failedIdRef.current = null
      applyResult(updated)
    },
  })

  const renameMutate = rename.mutate
  const renamePending = rename.isPending

  /** Commit a title change — wired to the title input's blur and Enter. */
  const commitTitle = useCallback(() => {
    const { article: current, title: value } = latest.current
    const next = value.trim()
    if (!next || !current || next === current.title) return
    if (renamePending) return
    renameMutate(next)
  }, [renameMutate, renamePending])

  const saveMutate = save.mutate
  const savePending = save.isPending

  // Autosave. Driven by `editSeq`, not by the serialised content: getContent()
  // must only ever run at save time (it can legitimately throw while the editor
  // is still loading), and serialising the whole document on every render just
  // to diff it would be wasteful besides.
  //
  // `title` is deliberately not a trigger — the title box no longer drives
  // saves, so typing a name can't queue a rename per keystroke.
  useEffect(() => {
    if (!dirty || savePending) return
    if (failedIdRef.current === targetId) return
    const timer = setTimeout(() => saveMutate(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [dirty, editSeq, savePending, saveMutate, targetId])

  /** Save immediately (Ctrl+S, Save button) — bypasses the failed-id guard. */
  const saveNow = useCallback(() => {
    if (savePending) return
    failedIdRef.current = null
    saveMutate()
  }, [saveMutate, savePending])

  return {
    commitTitle,
    saveNow,
    isPending: savePending || renamePending,
    error: save.error ?? rename.error,
  }
}
