import nspell from 'nspell'
import aff from '../../../node_modules/dictionary-en-gb/index.aff?raw'
import dic from '../../../node_modules/dictionary-en-gb/index.dic?raw'
import fantasy from './fantasy.dic?raw'

/**
 * Append a supplementary .dic's entries to a base .dic, dropping the
 * supplement's count line. Hunspell treats the base's count as a hint.
 */
export function mergeDic(base: string, extra: string): string {
  const entries = extra.split('\n').slice(1).join('\n')
  return base.replace(/\n*$/, '\n') + entries
}

/**
 * The checker: en-GB plus the game's own vocabulary (fantasy.dic — see
 * fantasy.test.ts for what belongs there and why).
 *
 * ONE dictionary parse, never `nspell(aff, dic).dictionary(fantasy)`. nspell
 * rebuilds en-GB's COMPOUNDRULE expressions on every `dictionary()` call from
 * what it assumes is still rule text, but after the first call they are
 * already RegExps — so the second call turns each into an empty RegExp that
 * matches every word, and every typo is suddenly correct. `add()` doesn't
 * touch compound rules, so the user's own words are safe to add afterwards.
 */
export function createSpell() {
  return nspell(aff, mergeDic(dic, fantasy))
}

export { aff, fantasy }
