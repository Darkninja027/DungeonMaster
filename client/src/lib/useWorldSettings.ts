import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { ClassInfo } from './classes'
import {
  DEFAULT_SETTINGS,
  parseWorldSettings,
  serializeWorldSettings,
} from './worldSettings'
import type { WorldSettings } from './worldSettings'

/**
 * React access to a world's worldSettings.json.
 *
 * The key extends ['worlds', worldId], which the world layout already
 * invalidates on every file-watcher batch — so hand edits to the JSON show up
 * live without any extra plumbing.
 */
export const worldSettingsKey = (worldId: string) => [
  'worlds',
  worldId,
  'settings',
]

export function useWorldSettings(worldId: string) {
  return useQuery({
    queryKey: worldSettingsKey(worldId),
    queryFn: async () =>
      parseWorldSettings(await api.worldSettings.get(worldId)),
    // placeholderData, not initialData: initialData is cached as fresh and
    // would suppress the fetch on remount.
    placeholderData: DEFAULT_SETTINGS,
  })
}

/**
 * The world's class list, falling back to the built-in PHB list while the file
 * loads or when it can't be read.
 *
 * The fallback isn't cosmetic. Picking a class sets the character's hit die from
 * this list, so an empty list mid-flight would silently leave the die wrong —
 * defaulting to the built-ins makes the pre-load behaviour identical to having
 * no world settings at all.
 */
export function useClasses(worldId: string): Array<ClassInfo> {
  return useWorldSettings(worldId).data?.classes ?? DEFAULT_SETTINGS.classes
}

/**
 * Save the whole file. Writes then seeds the cache directly rather than
 * invalidating: we already know the new value, and the main process suppresses
 * the watcher event for its own write.
 */
export function useSaveWorldSettings(worldId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (next: WorldSettings) => {
      await api.worldSettings.set(worldId, serializeWorldSettings(next))
      return next
    },
    onSuccess: (next) => {
      queryClient.setQueryData(worldSettingsKey(worldId), next)
    },
  })
}
