/**
 * The spellchecker itself, in a Web Worker.
 *
 * Its own thread because nspell is slow in exactly the places an editor can't
 * afford: building the en-GB dictionary takes the better part of a second, and
 * `suggest` on a long word can take as long again. On the main thread either
 * would stall typing; here it stalls nothing.
 *
 * Why not Chromium's built-in checker: on Windows Electron hands spelling to
 * the OS, and on a managed Windows 11 machine that path flagged nothing at all
 * — not "teh", not in a bare Electron window either. Its renderer-side lookup
 * (`webFrame.isWordMisspelled`) answered false for every word. A dictionary we
 * ship behaves the same on every machine.
 *
 * The dictionary arrives as `?raw` strings bundled into this worker, not as
 * fetched files: the packaged app loads from file://, where fetch is refused.
 * The paths reach into node_modules directly because the package's `exports`
 * map only offers its Node loader, which reads the files with `fs`.
 */
import nspell from 'nspell'
import aff from '../../../node_modules/dictionary-en-gb/index.aff?raw'
import dic from '../../../node_modules/dictionary-en-gb/index.dic?raw'
import { DND_WORDS } from './dndWords'
import type { SpellRequest, SpellResponse } from './protocol'

const spell = nspell(aff, dic)
for (const word of DND_WORDS) spell.add(word)

const POSSESSIVE = /['’]s$/u

/**
 * Hunspell knows "wizard's" through its affix rules, but a word added by hand
 * gets none — so "Strahd's" would still be wrong after adding "Strahd". Check
 * the stem of a possessive before calling it a mistake.
 */
function correct(word: string): boolean {
  if (spell.correct(word)) return true
  return POSSESSIVE.test(word) && spell.correct(word.replace(POSSESSIVE, ''))
}

self.onmessage = (event: MessageEvent<SpellRequest>) => {
  const request = event.data
  let response: SpellResponse
  switch (request.kind) {
    case 'add':
      for (const word of request.words) spell.add(word)
      return
    case 'check':
      response = {
        id: request.id,
        misspelled: request.words.filter((word) => !correct(word)),
      }
      break
    case 'suggest':
      response = { id: request.id, suggestions: spell.suggest(request.word) }
      break
  }
  self.postMessage(response)
}
