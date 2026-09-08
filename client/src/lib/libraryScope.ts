/**
 * Whether the Spells and Bestiary panels show the global library alongside the
 * open world's own articles.
 *
 * Stored in localStorage rather than worldSettings for the same reason
 * sheetPrintPrefs is: it belongs to the person reading the list, not to the
 * world. Writing it to the world folder would hand a personal view preference
 * to anyone the folder is shared with, and dirty a file on a UI click.
 *
 * Same shape as sheetPrintPrefs, down to the try/catch and the single-field
 * envelope.
 */

/**
 * A union rather than a boolean: a third scope ("global only", say) is plausible
 * later, and a `worldOnly` boolean would have to be replaced at every call site
 * rather than extended.
 */
export type LibraryScope = 'all' | 'world'

/**
 * Spells and monsters remember separately — someone filtering their homebrew
 * spells is not thereby asking to hide the shipped bestiary. Both monster
 * surfaces (the Bestiary panel and the encounter builder) share the `monsters`
 * key on purpose: they are the same list in two places, and disagreeing about
 * what it holds would read as a bug.
 */
type ScopeKind = 'spells' | 'monsters'

const KEYS: Record<ScopeKind, string> = {
  spells: 'dm.libraryScope.spells',
  monsters: 'dm.libraryScope.monsters',
}

/**
 * Defaults to `all` — today's behaviour, and the safe direction. A view filter
 * that defaults to hiding content is how someone concludes their library failed
 * to load.
 */
export function loadLibraryScope(kind: ScopeKind): LibraryScope {
  try {
    const raw = JSON.parse(localStorage.getItem(KEYS[kind]) ?? '') as {
      scope?: string
    }
    return raw.scope === 'world' ? 'world' : 'all'
  } catch {
    return 'all'
  }
}

export function saveLibraryScope(kind: ScopeKind, scope: LibraryScope): void {
  localStorage.setItem(KEYS[kind], JSON.stringify({ scope }))
}
