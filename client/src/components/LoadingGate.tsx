import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api } from '#/lib/api'
import type { LibraryStatus } from '#/lib/api'
import {
  LIBRARY_TYPES,
  libraryKey,
  libraryQueryKey,
  libraryTreeKey,
} from '#/lib/useGlobalLibrary'

/**
 * How long to wait for the library before showing the app anyway.
 *
 * A backstop, not a schedule: the warm-up normally finishes well inside this.
 * It exists so a library on a disconnected network drive — where the scan can
 * hang rather than fail — can never strand someone on a splash screen. The
 * prefetch keeps running after this fires; the app just stops waiting on it.
 */
const TIMEOUT_MS = 10_000

/**
 * Warms the global library before handing over to the app.
 *
 * The library is the biggest folder the app touches — around 1,600 markdown
 * files — and it is never the indexed world, so every read of it falls back to
 * a synchronous disk scan in the main process. That scan blocks the whole
 * window, not just the panel asking for it, and it is cached for the life of
 * the process. So the cost is paid exactly once per launch, and the only
 * question is whether the user is looking at an explanation when it happens or
 * at a frozen window several clicks into their session.
 *
 * This does not make the app faster. It makes the wait legible and moves it
 * somewhere it can be honest about itself.
 *
 * Three rules hold:
 *  - **Failure never blocks.** Any error, and the timeout above, render the app
 *    regardless. A missing or unreachable library is a thinner Spells panel, not
 *    a reason to be stuck — the same bargain seedBundledContent already makes by
 *    never failing a launch over its own content.
 *  - **The keys must match the hook's exactly**, which is why they come from
 *    shared helpers. A near-miss key is silent: the scan runs twice and this
 *    component appears to do nothing.
 *  - **Secondary windows skip it entirely** (see the caller). The player and
 *    popout windows load this same bundle to show one article, and have no use
 *    for a bestiary.
 */
export function LoadingGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [ready, setReady] = useState(false)
  const [seeding, setSeeding] = useState(false)

  useEffect(
    () =>
      api.library.onStatus((s: LibraryStatus) =>
        setSeeding(s.state === 'seeding'),
      ),
    [],
  )

  useEffect(() => {
    let cancelled = false
    const done = () => {
      if (!cancelled) setReady(true)
    }
    const timer = setTimeout(done, TIMEOUT_MS)

    const warm = async () => {
      // staleTime mirrors the hook's `Infinity`, so these land in the cache as
      // fresh and the nine call sites read them instead of re-fetching.
      const info = await queryClient.fetchQuery({
        queryKey: libraryKey,
        queryFn: () => api.library.get(),
        staleTime: Infinity,
      })
      if (!info?.available) return
      const worldId = info.worldId
      await Promise.all([
        queryClient.prefetchQuery({
          queryKey: libraryTreeKey(worldId),
          queryFn: () => api.worlds.tree(worldId),
          staleTime: Infinity,
        }),
        ...LIBRARY_TYPES.map((type) =>
          queryClient.prefetchQuery({
            queryKey: libraryQueryKey(worldId, type),
            queryFn: () => api.worlds.query(worldId, { type }),
            staleTime: Infinity,
          }),
        ),
      ])
    }

    void warm()
      .catch(() => {
        // Deliberately silent: the panels each report their own trouble, and a
        // failed warm-up is indistinguishable to the user from never having
        // tried.
      })
      .finally(done)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [queryClient])

  if (ready) return children

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
        <p className="text-sm font-medium">
          {seeding ? 'Setting up your library…' : 'Loading global assets'}
        </p>
        <p className="text-muted-foreground max-w-xs text-xs">
          {seeding
            ? 'Copying the bundled bestiary and spell list. This only happens once.'
            : 'Reading the shared bestiary and spell list.'}
        </p>
      </div>
    </div>
  )
}
