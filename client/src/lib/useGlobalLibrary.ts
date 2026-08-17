import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '#/lib/api'
import type { LibraryFolder, LibraryInfo } from '#/lib/api'
import { collectMonsters, collectSpells } from '#/lib/bestiary'
import type { LibraryEntry } from '#/lib/bestiary'

/** Shared empties, so "no library" doesn't hand callers a new array each render. */
const EMPTY_ENTRIES: Array<LibraryEntry> = []
const EMPTY_ARTICLES: Array<{ id: string; title: string }> = []

/**
 * The configured global library. `staleTime: Infinity` because it only changes
 * when the user picks or forgets one, and those paths invalidate this key.
 */
export function useLibrary() {
  return useQuery({
    queryKey: ['library'],
    queryFn: () => api.library.get(),
    staleTime: Infinity,
  })
}

/**
 * Library entries for one panel.
 *
 * Keyed under ['worlds', libraryWorldId, …] — the same namespace as any other
 * world — so the open world's watcher invalidation (['worlds', worldId]) never
 * touches these, and a library import never invalidates the open world.
 *
 * The library isn't indexed or watched: search.ts falls back to a disk scan
 * when no index is live, so these queries are correct as-is. staleTime keeps
 * that scan from re-running every time the panel is toggled.
 */
export function useLibraryEntries(folder: LibraryFolder): {
  entries: Array<LibraryEntry>
  /** The library's article list, for resolving [[links]] within the library. */
  articles: Array<{ id: string; title: string }>
  /** The configured library, or null if there isn't one. Check `.available`. */
  info: LibraryInfo | null
  isPending: boolean
} {
  const library = useLibrary()
  const info = library.data ?? null
  const enabled = info?.available === true
  const worldId = info?.worldId ?? ''

  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
    enabled,
    staleTime: 5 * 60_000,
  })

  // Monsters union in `type: monster` articles; spells match by folder alone.
  const typed = useQuery({
    queryKey: ['worlds', worldId, 'query', { type: 'monster' }],
    queryFn: () => api.worlds.query(worldId, { type: 'monster' }),
    enabled: enabled && folder === 'Monsters',
    staleTime: 5 * 60_000,
  })

  // Memoized because callers feed `entries` into their own useMemo deps — a
  // fresh array every render would defeat theirs as well as this one.
  const entries = useMemo(() => {
    if (!enabled) return EMPTY_ENTRIES
    return folder === 'Monsters'
      ? collectMonsters(worldId, tree.data, typed.data, { global: true })
      : collectSpells(worldId, tree.data, { global: true })
  }, [enabled, folder, worldId, tree.data, typed.data])

  return {
    entries,
    articles: enabled
      ? (tree.data?.articles ?? EMPTY_ARTICLES)
      : EMPTY_ARTICLES,
    info,
    isPending: enabled
      ? tree.isPending || (folder === 'Monsters' && typed.isPending)
      : false,
  }
}
