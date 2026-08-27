import { Castle, Swords, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * The app is three jobs sharing one folder format: writing a setting, running a
 * game at the table, and playing a character in someone else's. A mode says
 * which of the three a world is currently for, so opening it shows that job's
 * chrome and not the other two.
 *
 * Hiding is a **view concern only** — the same rule libraryFolders.ts follows.
 * Nothing moves on disk, no route is blocked, and every URL keeps working, so a
 * [[wiki link]] or a deep link can never dead-end in a mode that happens to hide
 * the section it points at. Switching back shows everything again.
 *
 * The registry is a plain data array, matching SETTINGS_SECTIONS: adding a mode
 * is one entry, and no consumer has to learn what any mode contains.
 */
export type WorldMode = 'worldbuilder' | 'dm' | 'player'

export const WORLD_MODES_IDS: Array<WorldMode> = [
  'worldbuilder',
  'dm',
  'player',
]

/**
 * What the session panel can show. Kept as a string union here rather than
 * imported from SessionPanel so this file stays free of component imports —
 * worldMode.test.ts asserts the two lists agree.
 */
export type ModePanelTab =
  'initiative' | 'encounter' | 'rolls' | 'spells' | 'monsters'

export interface WorldModeInfo {
  id: WorldMode
  /** One word, for the switcher button — the full name is in `label`. */
  short: string
  label: string
  icon: LucideIcon
  /** One line under the label in the menu, so a mode explains itself. */
  blurb: string
  shows: {
    contentTree: boolean
    smartViews: boolean
    characters: boolean
    /** Session panel tabs, in rail order. Empty hides the rail entirely. */
    sessionTabs: Array<ModePanelTab>
  }
}

/**
 * `dm` is the default because it is exactly today's behaviour — everything on.
 * A world written before this field existed has no key, parses to `dm`, and is
 * therefore completely unchanged until someone opts in. That is the whole
 * migration.
 */
export const DEFAULT_MODE: WorldMode = 'dm'

export const WORLD_MODES: Array<WorldModeInfo> = [
  {
    id: 'worldbuilder',
    short: 'Build',
    label: 'Worldbuilder',
    icon: Castle,
    blurb: 'Just the writing: articles, folders and images.',
    shows: {
      contentTree: true,
      smartViews: true,
      characters: false,
      sessionTabs: [],
    },
  },
  {
    id: 'dm',
    short: 'Run',
    label: 'Dungeon Master',
    icon: Swords,
    blurb: 'Everything — the world plus the tools for running a session.',
    shows: {
      contentTree: true,
      smartViews: true,
      characters: true,
      sessionTabs: ['initiative', 'encounter', 'rolls', 'spells', 'monsters'],
    },
  },
  {
    id: 'player',
    short: 'Play',
    label: 'Player',
    icon: UserRound,
    blurb: 'Your characters, their spells and the dice. No worldbuilding.',
    shows: {
      contentTree: false,
      smartViews: false,
      characters: true,
      sessionTabs: ['spells', 'rolls'],
    },
  },
]

/** Falls back to the default for an unknown or absent mode. */
export function findMode(id: string | undefined): WorldModeInfo {
  return (
    WORLD_MODES.find((m) => m.id === id) ??
    WORLD_MODES.find((m) => m.id === DEFAULT_MODE)!
  )
}

/**
 * A hand-edited `mode` that isn't one of the three falls back to the default
 * rather than being dropped, the same contract parseLiveEdit holds: a typo in a
 * file people are invited to edit must not strand them somewhere they can't
 * switch out of.
 */
export function parseMode(raw: unknown): WorldMode {
  return WORLD_MODES_IDS.includes(raw as WorldMode)
    ? (raw as WorldMode)
    : DEFAULT_MODE
}
