/**
 * Preferences for what the printed character sheet carries.
 *
 * These live in localStorage rather than on the character or in the world's
 * settings because they belong to the person at the printer, not to the
 * character and not to the world. Writing them to the `.md` would mark the
 * article dirty and trigger an autosave on a UI click, and would hand a personal
 * print preference to anyone the world folder is shared with.
 *
 * Same shape as the article route's loadTocOpen / loadLiveEdit, down to the
 * try/catch and the single-field envelope.
 */

const SPELL_CARDS_KEY = 'dm.sheetSpellCards'

/**
 * Whether the sheet carries the auto-generated spell-description pages.
 *
 * Defaults **on**, which is why this reads `!== false` rather than `=== true`
 * like its neighbours: the pages are the whole point of the feature, and
 * somebody who prints and finds three extra sheets of spell text immediately
 * knows there's something to turn off, whereas somebody who prints and finds the
 * text missing has no idea it was ever on offer.
 */
export function loadSpellCards(): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(SPELL_CARDS_KEY) ?? '') as {
      on?: boolean
    }
    return raw.on !== false
  } catch {
    return true
  }
}

export function saveSpellCards(on: boolean): void {
  localStorage.setItem(SPELL_CARDS_KEY, JSON.stringify({ on }))
}
