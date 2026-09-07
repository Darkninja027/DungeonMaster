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
 * The edition of the shared spell list and bestiary this world shows.
 *
 * Never returns a null-ish value, for the same reason useWorldMode doesn't:
 * `placeholderData` makes settings readable on the first render and an unknown
 * value falls back to the default, so a panel never flickers through an empty
 * state while loading.
 *
 * No vault special-case, unlike the mode above — but note the vault's settings
 * file carries no `ruleset` key, so this lands on `all` there and offers both
 * editions at once. That is what `useCharacterRuleset` below exists to fix:
 * the vault holds characters from several different games, so the edition is
 * the character's to state, not the folder's.
 */
export function useWorldRuleset(worldId: string): Ruleset {
  const settings = useWorldSettings(worldId)
  return parseRuleset(settings.data?.ruleset)
}

/**
 * The edition to offer *this character*, which is the world's answer unless
 * the character overrides it.
 *
 * A campaign world speaks for every character in it, so a sheet there normally
 * carries no `ruleset` and this is exactly `useWorldRuleset`. The vault cannot
 * speak for its characters — they come from different games — so a vault sheet
 * states its own edition and it wins.
 *
 * Deliberately not "vault only": the override is a property of the sheet, so a
 * character carried from the vault into a campaign folder keeps working, and a
 * campaign character may pin an edition its world disagrees with. The world
 * stays the default either way, which is what keeps existing sheets unchanged.
 */
export function useCharacterRuleset(
  worldId: string,
  character: { ruleset: Ruleset | null } | null | undefined,
): Ruleset {
  const world = useWorldRuleset(worldId)
  return character?.ruleset ?? world
}

/**
 * The vault check, with its loading state exposed.
 *
 * `useIsVault` below flattens "still loading" to false, which is right for the
 * chrome — one frame of the wrong mode costs nothing. It is wrong for any
 * decision that WRITES: the missing-link dialog would create an article at the
 * vault root, which Player mode's sidebar cannot show, so it has to wait rather
 * than guess. The `['vault']` cache is warm on the home-screen path but cold on
 * a deep link, an F5 on a character URL, and a second window.
 */
export function useVaultCheck(worldId: string): {
  isVault: boolean
  isLoading: boolean
} {
  const vault = useQuery({
    queryKey: ['vault'],
    queryFn: api.vault.get,
    staleTime: Infinity,
  })
  return {
    isVault: vault.data?.worldId === worldId,
    isLoading: vault.isLoading,
  }
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
export function useIsVault(worldId: string): boolean {
  return useVaultCheck(worldId).isVault
}
