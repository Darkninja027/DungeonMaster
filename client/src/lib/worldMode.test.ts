import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODE,
  WORLD_MODES,
  WORLD_MODES_IDS,
  findMode,
  parseMode,
} from './worldMode'
import { PANEL_TABS } from '#/components/SessionPanel'
import type { ModePanelTab } from './worldMode'

/**
 * The tabs SessionPanel actually renders, imported from the panel itself rather
 * than restated — lib/worldMode.ts cannot import a component, so this test is
 * the only place the two lists meet. A tab added to one and not the other fails
 * here instead of silently vanishing from a mode's rail.
 */
const REAL_PANEL_TABS: Array<ModePanelTab> = PANEL_TABS

describe('the mode registry', () => {
  it('has an entry for every mode id, and no extras', () => {
    expect(WORLD_MODES.map((m) => m.id).sort()).toEqual(
      [...WORLD_MODES_IDS].sort(),
    )
  })

  it('includes the default', () => {
    expect(WORLD_MODES_IDS).toContain(DEFAULT_MODE)
  })

  it('only names session tabs the panel can render', () => {
    // A typo here would silently hide a tab rather than erroring, so it is
    // asserted rather than trusted.
    for (const mode of WORLD_MODES) {
      for (const tab of mode.shows.sessionTabs) {
        expect(REAL_PANEL_TABS).toContain(tab)
      }
    }
  })

  it('lists no tab twice', () => {
    for (const mode of WORLD_MODES) {
      const tabs = mode.shows.sessionTabs
      expect(new Set(tabs).size).toBe(tabs.length)
    }
  })

  it('gives every mode the labels the UI needs', () => {
    for (const mode of WORLD_MODES) {
      expect(mode.short.trim()).not.toBe('')
      expect(mode.label.trim()).not.toBe('')
      expect(mode.blurb.trim()).not.toBe('')
    }
  })

  it('keeps dm as everything-on, so an existing world is unchanged', () => {
    // This is the migration: no key on disk parses to dm, and dm must show
    // exactly what the app showed before modes existed.
    const dm = findMode('dm')
    expect(dm.shows.contentTree).toBe(true)
    expect(dm.shows.smartViews).toBe(true)
    expect(dm.shows.characters).toBe(true)
    expect(dm.shows.sessionTabs).toEqual(REAL_PANEL_TABS)
  })

  it('gives player a way to reach spells', () => {
    // Player mode hides the content tree, so the panel's spell tab is how a
    // player reads a spell. Losing it would strand them.
    expect(findMode('player').shows.sessionTabs).toContain('spells')
  })

  it('leaves every mode something to show', () => {
    for (const mode of WORLD_MODES) {
      const { contentTree, smartViews, characters, sessionTabs } = mode.shows
      expect(
        contentTree || smartViews || characters || sessionTabs.length > 0,
      ).toBe(true)
    }
  })
})

describe('findMode', () => {
  it('resolves each known id', () => {
    for (const id of WORLD_MODES_IDS) expect(findMode(id).id).toBe(id)
  })

  it('falls back to the default for unknown or absent', () => {
    expect(findMode('nonsense').id).toBe(DEFAULT_MODE)
    expect(findMode(undefined).id).toBe(DEFAULT_MODE)
  })
})

describe('parseMode', () => {
  it('accepts the three modes', () => {
    for (const id of WORLD_MODES_IDS) expect(parseMode(id)).toBe(id)
  })

  it('falls back for anything else', () => {
    for (const bad of [undefined, null, '', 'DM', 7, {}, []]) {
      expect(parseMode(bad)).toBe(DEFAULT_MODE)
    }
  })
})

describe('the vault is Player-only', () => {
  it('has a Player mode that needs no content tree', () => {
    // The vault holds characters and nothing else. If Player mode ever wanted
    // the content tree, forcing the vault into it would be wrong and the
    // switcher would have to come back.
    const player = findMode('player')
    expect(player.shows.characters).toBe(true)
    expect(player.shows.contentTree).toBe(false)
  })

  it('is the only mode that shows characters without worldbuilding', () => {
    // What makes Player the right forced mode for the vault: it is the one
    // entry whose sections are exactly what a character folder has.
    const fits = WORLD_MODES.filter(
      (m) => m.shows.characters && !m.shows.contentTree && !m.shows.smartViews,
    )
    expect(fits.map((m) => m.id)).toEqual(['player'])
  })
})
