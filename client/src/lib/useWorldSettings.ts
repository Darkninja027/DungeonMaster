import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { ClassInfo } from './classes'
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
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

/**
 * Read the settings plus a `patch` that saves ONE section without disturbing
 * the others.
 *
 * The whole file is rewritten on every write, so a section that built its own
 * payload would have to remember every field it doesn't own — and the day
 * someone adds a setting, each existing section silently starts erasing it.
 * Patching against what is currently on disk makes that impossible by
 * construction, which is what lets each section own its own save button.
 *
 * `version` is stamped rather than echoed: we are writing today's shape, so
 * preserving an older number would leave the file claiming a version it no
 * longer matches.
 */
export function useWorldSettingsSection(worldId: string) {
  const settings = useWorldSettings(worldId)
  const save = useSaveWorldSettings(worldId)
  const loaded = settings.data

  const patch = (
    changes: Partial<WorldSettings>,
    options?: { onSuccess?: () => void },
  ) => {
    save.mutate(
      {
        // DEFAULT_SETTINGS first so every required field has a value even
        // before the file has loaded.
        ...DEFAULT_SETTINGS,
        ...loaded,
        ...changes,
        version: SETTINGS_VERSION,
      },
      { onSuccess: options?.onSuccess },
    )
  }

  return { settings: loaded, patch, isPending: save.isPending, error: save.error }
}
