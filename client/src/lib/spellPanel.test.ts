import { beforeEach, describe, expect, it } from 'vitest'
import {
  consumeSpellPanelRequest,
  openSpellInPanel,
  spellPanelRequest,
  subscribeSpellPanel,
} from './spellPanel'

/**
 * "Open this spell in the reference" as a module store, so a spell name deep
 * in a character sheet can ask for it without threading a callback.
 *
 * The subtlety worth pinning: the request is CONSUMED by whoever handles it,
 * and SpellReference consumes it as it mounts. So a panel that is not already
 * showing the Spells tab has to switch tabs in the same render pass, or the
 * request is cleared with nothing listening and the click does nothing. That
 * is exactly what a guest at a LAN table was missing.
 */

describe('spell panel requests', () => {
  beforeEach(() => consumeSpellPanelRequest())

  it('carries the article id of the spell asked for', () => {
    openSpellInPanel('Spells/Fireball')
    expect(spellPanelRequest()?.articleId).toBe('Spells/Fireball')
  })

  it('is cleared once consumed, so a re-render does not reopen it', () => {
    openSpellInPanel('Spells/Fireball')
    consumeSpellPanelRequest()
    expect(spellPanelRequest()).toBeNull()
  })

  it('a second request replaces the first', () => {
    openSpellInPanel('Spells/Fireball')
    openSpellInPanel('Spells/Shield')
    expect(spellPanelRequest()?.articleId).toBe('Spells/Shield')
  })

  it('notifies subscribers so a panel can switch tabs', () => {
    const seen: Array<string | null> = []
    // The panel subscribes exactly like useSyncExternalStore does.
    const unsubscribe = subscribeSpellPanel(() => {
      seen.push(spellPanelRequest()?.articleId ?? null)
    })
    openSpellInPanel('Spells/Fireball')
    consumeSpellPanelRequest()
    unsubscribe()
    expect(seen).toEqual(['Spells/Fireball', null])
  })
})
