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

/** The frontmatter `type:` that backs each panel's folder. */
const LIBRARY_TYPE = { Monsters: 'monster', Spells: 'spell' } as const

/**
 * Library entries for one panel.
 *
 * Keyed under ['library', libraryWorldId, …] rather than ['worlds', …]. The
 * library is a world folder and every handler treats it as one, so the obvious
 * key was the world namespace — but seven other call sites mount the *open*
 * world's tree under the identical ['worlds', worldId, 'tree'] shape, and
 * whichever mounted first won the cache slot for the whole staleTime. The
 * library panel would then render the open world's tree, which has no Spells/
 * folder in it. A separate prefix makes that collision impossible, and it is
 * still outside the watcher's ['worlds', worldId] prefix, so the original
 * property — that world invalidation never touches the library, or vice versa —
 * is preserved. Anything invalidating library content must use this prefix.
 *
 * The library isn't indexed or watched: search.ts falls back to a disk scan
 * when no index is live, so these queries are correct as-is.
 *
 * Both are staleTime: Infinity because that scan is expensive — the library is
 * the biggest folder the app touches, and the scan blocks the main process, so
 * a refetch stalls the whole window rather than just this panel. Nothing can
 * change the library from inside the app except import and restore, and both
 * invalidate ['library'], so an expiry would only buy re-scans nobody asked
 * for. Content edited outside the app is picked up on the next launch, the same
 * bargain the library already makes by not being watched.
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
    queryKey: ['library', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
    enabled,
    staleTime: Infinity,
  })

  // Both panels union in their frontmatter type, so neither depends on the tree
  // read alone. The seeded content carries `type: monster` / `type: spell`, and
  // queryArticles reads the folder straight off disk, so this is a genuinely
  // independent source rather than a second view of the same fetch.
  const type = LIBRARY_TYPE[folder]
  const typed = useQuery({
    queryKey: ['library', worldId, 'query', { type }],
    queryFn: () => api.worlds.query(worldId, { type }),
    enabled,
    staleTime: Infinity,
  })

  // Memoized because callers feed `entries` into their own useMemo deps — a
  // fresh array every render would defeat theirs as well as this one.
  const entries = useMemo(() => {
    if (!enabled) return EMPTY_ENTRIES
    return folder === 'Monsters'
      ? collectMonsters(worldId, tree.data, typed.data, { global: true })
      : collectSpells(worldId, tree.data, typed.data, { global: true })
  }, [enabled, folder, worldId, tree.data, typed.data])

  return {
    entries,
    articles: enabled
      ? (tree.data?.articles ?? EMPTY_ARTICLES)
      : EMPTY_ARTICLES,
    info,
    isPending: enabled ? tree.isPending || typed.isPending : false,
  }
}
