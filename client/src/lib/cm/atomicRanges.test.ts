import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { cursorCharLeft, deleteCharBackward } from '@codemirror/commands'
import { liveMarkdown } from './liveMarkdown'

/**
 * Atomic ranges in the live editor, and the line between the two things they
 * are asked to do.
 *
 * A *replace* decoration collapses text to zero width — hidden `**`, a dice
 * chip — and must be atomic, or the caret steps inside a region with no pixels
 * and appears stuck. A *mark* decoration only styles text that is still fully
 * visible, and must NOT be atomic: `cm-dm-wikilink` spans a whole link label,
 * so making it indivisible meant one backspace inside `[[Strahdd]]` deleted
 * the entire label instead of the typo.
 *
 * Both halves are pinned here because fixing either one by making the set
 * uniformly atomic or uniformly not breaks the other.
 */
function makeView(doc: string, pos: number) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: pos },
      extensions: [liveMarkdown({})],
    }),
    parent,
  })
  // build() ignores the selection entirely while unfocused, so an unfocused
  // editor reveals nothing and none of this is exercised.
  view.focus()
  return view
}

describe('backspace inside a styled-but-visible range', () => {
  it('deletes one character inside a wiki link label', () => {
    const view = makeView('See [[Strahdd]]', 'See [[Strahdd'.length)
    deleteCharBackward(view)
    const after = view.state.doc.toString()
    view.destroy()
    expect(after).toBe('See [[Strahd]]')
  })

  it('deletes one character mid-label, not the whole label', () => {
    const doc = 'See [[Strahd]] now.'
    const view = makeView(doc, doc.indexOf(']]'))
    deleteCharBackward(view)
    const after = view.state.doc.toString()
    view.destroy()
    expect(after).toBe('See [[Strah]] now.')
  })

  it('deletes one character in a piped link label', () => {
    // The label is what stays visible; the `Title|` part is hidden.
    const doc = 'See [[Strahd|the countt]]'
    const view = makeView(doc, doc.indexOf(']]'))
    deleteCharBackward(view)
    const after = view.state.doc.toString()
    view.destroy()
    expect(after).toBe('See [[Strahd|the count]]')
  })

  it('still deletes one character in ordinary prose', () => {
    const view = makeView('plain textt', 'plain textt'.length)
    deleteCharBackward(view)
    const after = view.state.doc.toString()
    view.destroy()
    expect(after).toBe('plain text')
  })
})

describe('hidden markers stay atomic', () => {
  it('does not strand the caret inside a hidden ** marker', () => {
    // Caret sits just after the closing `**`. Moving left must clear the whole
    // two-character hidden marker in one step rather than landing between the
    // asterisks, where there are no pixels to show a cursor.
    const doc = 'a **bold** b'
    const view = makeView(doc, doc.indexOf('** b') + 2)
    const before = view.state.selection.main.head
    cursorCharLeft(view)
    const after = view.state.selection.main.head
    view.destroy()
    // It must actually move, and must not stop half way into the `**`.
    expect(after).toBeLessThan(before)
    expect(after).not.toBe(before - 1)
  })
})
