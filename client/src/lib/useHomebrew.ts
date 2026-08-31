import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import {
  EMPTY_HOMEBREW,
  HOMEBREW_VERSION,
  parseHomebrew,
  serializeHomebrew,
} from './homebrew'
import type { Homebrew } from './homebrew'
import { SRD_TABLES, mergeTables } from './tables'
import type { Tables, WorldTables } from './tables'
import { useWorldSettings } from './useWorldSettings'

/**
 * React access to the global homebrew store, and to the merged tables the
 * character wizard is built against.
 *
 * The key is `['homebrew']` — app-level, deliberately *outside* the
 * `['worlds', worldId]` namespace that the world layout invalidates on every
 * file-watcher batch. Homebrew isn't a world's file, and mounting it under a
 * world would refetch it every time any article changed.
 */
export const homebrewKey = ['homebrew'] as const

export function useHomebrew() {
  return useQuery({
    queryKey: homebrewKey,
    queryFn: async () => parseHomebrew(await api.homebrew.get()),
    // The file only changes when this app writes it, so there is nothing to
    // poll for — same reasoning as the global library.
    staleTime: Infinity,
    // placeholderData rather than initialData: initialData is cached as fresh
    // and would suppress the fetch on remount.
    placeholderData: EMPTY_HOMEBREW,
  })
}

/**
 * Save the whole store. Seeds the cache directly rather than invalidating: we
 * already know the new value, and a refetch would flash the wizard's option
 * grids back to the pre-save list.
 */
export function useSaveHomebrew() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (next: Homebrew) => {
      const stamped = { ...next, version: HOMEBREW_VERSION }
      await api.homebrew.set(serializeHomebrew(stamped))
      return stamped
    },
    onSuccess: (next) => {
      queryClient.setQueryData(homebrewKey, next)
    },
  })
}

/**
 * The tables a character in this world is built against: SRD, plus global
 * homebrew, plus whatever the world adds of its own.
 *
 * Memoised on the two query results, because callers feed this straight into
 * their own `useMemo` deps and a fresh object each render would defeat them.
 * Falls back to the SRD tables alone while either query is loading, which is
 * the same behaviour as having no homebrew at all — never an empty list, since
 * an empty race grid mid-load reads as a broken wizard.
 */
export function useTables(worldId: string): Tables {
  const homebrew = useHomebrew()
  const settings = useWorldSettings(worldId)

  const global = homebrew.data
  const world = settings.data

  return useMemo(() => {
    if (!global && !world) return SRD_TABLES
    const worldTables: WorldTables = {
      classes: world?.classes,
      races: world?.races,
      backgrounds: world?.backgrounds,
      kits: world?.kits,
      feats: world?.feats,
    }
    return mergeTables(global ?? EMPTY_HOMEBREW, worldTables)
  }, [global, world])
}
