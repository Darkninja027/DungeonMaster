import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  parseWorldSettings,
  serializeWorldSettings,
} from './worldSettings'
import { findMode } from './worldMode'
import { parseRuleset } from './ruleset'
import type { Ruleset } from './ruleset'
import type { WorldModeInfo } from './worldMode'
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

  return {
    settings: loaded,
    patch,
    isPending: save.isPending,
    error: save.error,
  }
}

/**
 * The open world's mode, as the full registry entry rather than the bare id —
 * every caller wants `shows`, and resolving here keeps `findMode` out of the
 * components.
 *
 * The vault is **forced** to Player mode rather than merely defaulting to it.
 * It is defined as "characters, not a campaign", so the other two modes have
 * nothing to show there: Worldbuilder would offer an empty content tree and DM
 * an initiative tracker for a game that doesn't exist. Forcing here rather than
 * in the switcher means a hand-edited `mode` in the vault's settings file is
 * ignored too — one rule, applied wherever the mode is read.
 *
 * Never returns null: `placeholderData` means settings are readable on the
 * first render, and an unknown value falls back to the default. So the chrome
 * never flickers through a "no mode" state on load.
 */
export function useWorldMode(worldId: string): WorldModeInfo {
  const settings = useWorldSettings(worldId)
  const isVault = useIsVault(worldId)
  return findMode(isVault ? 'player' : settings.data?.mode)
}

/**
 * True when the open world is the personal character vault.
 *
 * Kept as its own hook because two callers want it for different reasons: the
 * mode is forced above, and the switcher hides itself entirely — a control
 * offering one option is worse than no control.
 *
 * `staleTime: Infinity` matches `useLibrary`: the vault path changes only when
 * the vault is created, which the home screen seeds into this cache directly.
 */
/**
 * The edition of the shared spell list and bestiary this world shows.
 *
 * Never returns a null-ish value, for the same reason useWorldMode doesn't:
 * `placeholderData` makes settings readable on the first render and an unknown
 * value falls back to the default, so a panel never flickers through an empty
 * state while loading.
 *
 * No vault special-case, unlike the mode above: the vault is "characters, not a
 * campaign", and a character can be built under either edition, so its ruleset
 * is the user's to set like any other world's.
 */
export function useWorldRuleset(worldId: string): Ruleset {
  const settings = useWorldSettings(worldId)
  return parseRuleset(settings.data?.ruleset)
}

export function useIsVault(worldId: string): boolean {
  const vault = useQuery({
    queryKey: ['vault'],
    queryFn: api.vault.get,
    staleTime: Infinity,
  })
  return vault.data?.worldId === worldId
}
