import { api, bridged } from '#/lib/api'
import type { SpellRequest, SpellResponse } from './protocol'

/**
 * The renderer's handle on the spell worker: a word cache, request ids, and
 * the user's own dictionary.
 *
 * Everything is async because the worker is, and every call degrades to
 * "spelled fine" where there is no Worker at all (vitest's jsdom) — an editor
 * test must never wait on a dictionary.
 *
 * The worker starts on first use, not at import, so a window that never opens
 * an editor (a player window, the map) never pays for the dictionary.
 */

/** word → misspelled? Words never change spelling, so this never expires. */
const cache = new Map<string, boolean>()
const pending = new Map<number, (response: SpellResponse) => void>()
const listeners = new Set<() => void>()
let worker: Worker | null = null
/** Settles once the user's own words are in the worker; every request waits on it. */
let ready: Promise<void> = Promise.resolve()
let nextId = 1

function start(): Worker | null {
  if (worker) return worker
  if (typeof Worker === 'undefined') return null
  worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  })
  worker.onmessage = (event: MessageEvent<SpellResponse>) => {
    const resolve = pending.get(event.data.id)
    pending.delete(event.data.id)
    resolve?.(event.data)
  }
  // The user's words must reach the worker before any check does, or a
  // word they added last week squiggles on load. The worker answers messages
  // in order, so holding every request behind this one add is enough.
  const started = worker
  ready = bridged()
    ? api.spelling
        .words()
        .then((words) => {
          if (words.length > 0) started.postMessage({ kind: 'add', words })
        })
        // A missing or unreadable file is just an empty dictionary.
        .catch(() => {})
    : Promise.resolve()
  return worker
}

async function post(request: SpellRequest) {
  const w = start()
  if (!w) return
  await ready
  w.postMessage(request)
}

async function ask(
  build: (id: number) => SpellRequest,
): Promise<SpellResponse | null> {
  const w = start()
  if (!w) return null
  await ready
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, resolve)
    w.postMessage(build(id))
  })
}

/** What the cache already knows about `word`, without asking the worker. */
export function knownMisspelled(word: string): boolean | undefined {
  return cache.get(word)
}

/** The subset of `words` that is misspelled. Only uncached words are sent. */
export async function findMisspelled(
  words: ReadonlyArray<string>,
): Promise<Set<string>> {
  const unknown = [...new Set(words)].filter((word) => !cache.has(word))
  if (unknown.length > 0) {
    const response = await ask((id) => ({ kind: 'check', id, words: unknown }))
    const wrong = new Set(
      response && 'misspelled' in response ? response.misspelled : [],
    )
    for (const word of unknown) cache.set(word, wrong.has(word))
  }
  return new Set(words.filter((word) => cache.get(word)))
}

export async function isMisspelled(word: string): Promise<boolean> {
  return (await findMisspelled([word])).has(word)
}

export async function suggestionsFor(word: string): Promise<Array<string>> {
  const response = await ask((id) => ({ kind: 'suggest', id, word }))
  return response && 'suggestions' in response ? response.suggestions : []
}

/**
 * Accept `word` from now on, in every editor and every world. The cache flips
 * first so the squiggle can go at once; the file write follows.
 */
export async function addToDictionary(word: string): Promise<void> {
  // Forget every cached "wrong", not just this word: adding "Strahd" also
  // makes "Strahd's" right (see the worker's possessive rule), and the cache
  // has no way to know which other words a new entry rescues.
  for (const [cached, wrong] of cache) if (wrong) cache.delete(cached)
  cache.set(word, false)
  void post({ kind: 'add', words: [word] })
  for (const listener of listeners) listener()
  if (bridged()) await api.spelling.addWord(word)
}

/** Run `listener` whenever the user's dictionary changes; returns an unsubscribe. */
export function onDictionaryChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
