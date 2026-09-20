import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import {
  EMPTY_TEMPLATE_STORE,
  TEMPLATE_STORE_VERSION,
  mergeTemplates,
  parseTemplateStore,
  seedTemplateCache,
  serializeTemplateStore,
  visibleTemplates,
} from './templateStore'
import type { TemplateStore } from './templateStore'
import type { ArticleTemplate } from './templates'

/**
 * React access to the global article templates.
 *
 * The key is `['templates']` — app-level, deliberately *outside* the
 * `['worlds', worldId]` namespace that the world layout invalidates on every
 * file-watcher batch. Templates are not a world's file, and mounting them under
 * a world would refetch them every time any article changed.
 *
 * This is the **render-path** half of the pair. Callback paths — the by-id
 * lookups inside mutation functions — use `findTemplate` from templateStore.ts
 * instead, and cannot use anything here.
 */
export const templatesKey = ['templates'] as const

export function useTemplateStore() {
  return useQuery({
    queryKey: templatesKey,
    queryFn: async () => {
      const store = parseTemplateStore(await api.templates.get())
      // Keep the synchronous cache in step with the query, so the by-id lookups
      // see a change even in a window that never mounted the settings page.
      // LoadingGate seeds it before any route renders; this covers refetches.
      seedTemplateCache(store)
      return store
    },
    // The file only changes when this app writes it, so there is nothing to
    // poll for — same reasoning as homebrew and the global library.
    staleTime: Infinity,
    // placeholderData rather than initialData: initialData is cached as fresh
    // and would suppress the fetch on remount.
    placeholderData: EMPTY_TEMPLATE_STORE,
  })
}

/**
 * The full merged list, built-ins included, hidden entries included — what the
 * settings section shows, since you must be able to see a hidden template in
 * order to unhide it.
 *
 * Memoised on the query result so callers can feed it into their own `useMemo`
 * deps. Falls back to the built-ins alone while loading, which is the same
 * behaviour as having edited nothing — never an empty list, since an empty
 * template grid mid-load reads as a broken dialog.
 */
export function useTemplates(): Array<ArticleTemplate> {
  const { data } = useTemplateStore()
  return useMemo(() => mergeTemplates(data ?? EMPTY_TEMPLATE_STORE), [data])
}

/** What every picker renders: the merged list minus the hidden ones. */
export function useVisibleTemplates(): Array<ArticleTemplate> {
  const templates = useTemplates()
  return useMemo(() => visibleTemplates(templates), [templates])
}

/**
 * Save the whole store. Seeds the cache directly rather than invalidating: we
 * already know the new value, and a refetch would flash the pickers back to the
 * pre-save list.
 */
export function useSaveTemplates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (next: TemplateStore) => {
      const stamped = { ...next, version: TEMPLATE_STORE_VERSION }
      await api.templates.set(serializeTemplateStore(stamped))
      return stamped
    },
    onSuccess: (next) => {
      seedTemplateCache(next)
      queryClient.setQueryData(templatesKey, next)
    },
  })
}
