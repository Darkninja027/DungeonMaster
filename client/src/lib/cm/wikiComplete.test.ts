import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  acceptCompletion,
  completionStatus,
  currentCompletions,
  startCompletion,
} from '@codemirror/autocomplete'
import { liveMarkdown } from './liveMarkdown'
import { wikiCompletions } from './wikiComplete'

const ARTICLES = [
  { id: 'NPCs/Jarl Balgruuf', title: 'Jarl Balgruuf' },
  { id: 'NPCs/Jareth', title: 'Jareth' },
  { id: 'Places/Jade Apparel', title: 'Jade Apparel' },
  { id: 'NPCs/Strahd', title: 'Strahd' },
  { id: 'Lore/The Jade Rule', title: 'The Jade Rule' },
]

/**
 * `[[` autocomplete in the live editor. The pure builder is tested directly —
 * matching, ordering and the shape of the inserted text are the parts that can
 * be wrong — and a small number of view-level tests pin the wiring that a pure
 * test cannot see: that the panel actually opens, and that Enter completes.
 */
describe('wikiCompletions', () => {
  const build = (before: string, currentId?: string) =>
    wikiCompletions(before, ARTICLES, currentId)

  it('returns nothing when no [[ is open', () => {
    expect(build('just prose')).toBeNull()
    expect(build('a [[closed]] link already')).toBeNull()
  })

  it('matches on a partial title after [[', () => {
    const result = build('See [[J')
    expect(result?.query).toBe('J')
    // "The Jade Rule" contains a "j" too, so it is a legitimate match — it just
    // sorts behind the three that START with one.
    expect(result?.options.map((o) => o.label)).toEqual([
      'Jade Apparel',
      'Jareth',
      'Jarl Balgruuf',
      'The Jade Rule',
    ])
  })

  it('ranks titles that start with the query above substring matches', () => {
    // "The Jade Rule" contains "jade" but does not start with it.
    const labels = build('[[Jade')?.options.map((o) => o.label)
    expect(labels?.[0]).toBe('Jade Apparel')
    expect(labels).toContain('The Jade Rule')
  })

  it('is case insensitive', () => {
    expect(build('[[strahd')?.options.map((o) => o.label)).toEqual(['Strahd'])
  })

  it('inserts a finished link, brackets included', () => {
    // Load-bearing: `apply` replaces from the `[[`, so it must carry the whole
    // link. A bare title would leave the opening brackets stranded.
    expect(build('[[Strah')?.options[0].apply).toBe('[[Strahd]]')
  })

  it('never suggests the article being edited', () => {
    const labels = build('[[J', 'NPCs/Jareth')?.options.map((o) => o.label)
    expect(labels).not.toContain('Jareth')
    expect(labels).toContain('Jarl Balgruuf')
  })

  it('offers everything on a bare [[', () => {
    expect(build('[[')?.options.length).toBe(ARTICLES.length)
  })

  it('stops at a newline, so an old [[ on a previous line does not match', () => {
    // The caller passes one line, but the guard belongs in the pattern too.
    expect(build('[[Strahd]]\nnew line')).toBeNull()
  })

  it('returns an empty list rather than null when nothing matches', () => {
    const result = build('[[zzzz')
    expect(result).not.toBeNull()
    expect(result?.options).toEqual([])
  })
})

/**
 * Wait until the completion panel is open AND past `interactionDelay`, the
 * window in which `acceptCompletion` deliberately refuses so a keystroke in
 * flight cannot commit an option the user never saw.
 *
 * Polled rather than a fixed sleep: a sleep long enough to be safe on a loaded
 * machine is slow on an idle one, and one tuned for an idle machine flakes
 * under a full parallel test run — which is exactly what it did.
 */
async function waitForAcceptable(view: EditorView, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (completionStatus(view.state) === 'active' && acceptCompletion(view))
      return true
    await new Promise((r) => setTimeout(r, 10))
  }
  return false
}

function makeView(doc: string, caret = doc.length) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: caret },
      extensions: [liveMarkdown({ articles: () => ARTICLES })],
    }),
    parent,
  })
  view.focus()
  return view
}

describe('wiki autocomplete in the editor', () => {
  async function waitForOpen(view: EditorView, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (completionStatus(view.state) === 'active') return
      await new Promise((r) => setTimeout(r, 10))
    }
  }

  it('opens a completion panel for an open [[', async () => {
    const view = makeView('See [[J')
    startCompletion(view)
    await waitForOpen(view)
    const status = completionStatus(view.state)
    const labels = currentCompletions(view.state).map((c) => c.label)
    view.destroy()
    expect(status).toBe('active')
    expect(labels).toContain('Jarl Balgruuf')
  })

  it('completes to a full [[link]] when accepted', async () => {
    const view = makeView('See [[Strah')
    startCompletion(view)
    const accepted = await waitForAcceptable(view)
    const after = view.state.doc.toString()
    view.destroy()
    expect(accepted).toBe(true)
    // The partial and its brackets are replaced by the finished link.
    expect(after).toBe('See [[Strahd]]')
  })

  it('does not double the brackets when they are already closed', async () => {
    // Ctrl+Shift+L wraps the selection and leaves the caret between a
    // ready-made `[[` and `]]`. Accepting used to write a second closing pair:
    // `See [[Strahd]]]]`.
    const view = makeView('See [[Strah]]', 'See [[Strah'.length)
    startCompletion(view)
    const accepted = await waitForAcceptable(view)
    const after = view.state.doc.toString()
    view.destroy()
    expect(accepted).toBe(true)
    expect(after).toBe('See [[Strahd]]')
  })

  it('keeps text that follows a pre-closed link', async () => {
    const view = makeView('See [[Strah]] tonight.', 'See [[Strah'.length)
    startCompletion(view)
    const accepted = await waitForAcceptable(view)
    const after = view.state.doc.toString()
    view.destroy()
    expect(accepted).toBe(true)
    expect(after).toBe('See [[Strahd]] tonight.')
  })

  it('does not eat a following ]] that belongs to something else', async () => {
    // A single `]` after the caret is not a closing pair and must survive.
    const view = makeView('See [[Strah] odd', 'See [[Strah'.length)
    startCompletion(view)
    const accepted = await waitForAcceptable(view)
    const after = view.state.doc.toString()
    view.destroy()
    expect(accepted).toBe(true)
    expect(after).toBe('See [[Strahd]]] odd')
  })

  it('does not open a panel in ordinary prose', async () => {
    const view = makeView('just some prose')
    startCompletion(view)
    await new Promise((r) => setTimeout(r, 50))
    const status = completionStatus(view.state)
    view.destroy()
    expect(status).toBeNull()
  })
})
