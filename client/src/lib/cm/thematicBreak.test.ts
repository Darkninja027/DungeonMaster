import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { liveMarkdown } from './liveMarkdown'

/**
 * A `---` divider in the live editor.
 *
 * It used to sit there as three literal hyphens while every other construct
 * around it rendered, so the one marker whose entire job is to be *seen* was
 * the one the editor refused to draw. Now it is a rule — and, like everything
 * else here, it reveals back to raw text under the caret so it stays editable.
 */
function makeView(doc: string, pos: number) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [liveMarkdown({})],
    }),
    parent,
  })
  // build() ignores the selection while unfocused, so an unfocused editor
  // would never reveal anything. The caret is placed AFTER focusing, as a
  // transaction, because that is what rebuilds the decorations — constructing
  // the state with a selection paints it while the editor is still unfocused.
  view.focus()
  view.dispatch({ selection: { anchor: pos } })
  return view
}

describe('thematic break', () => {
  it('draws a rule in place of `---`', () => {
    const doc = 'Before\n\n---\n\nAfter'
    const view = makeView(doc, 0)
    const drawn = view.dom.querySelectorAll('.cm-dm-rule').length
    const text = view.dom.textContent
    view.destroy()
    expect(drawn).toBe(1)
    expect(text).not.toContain('---')
  })

  it('reveals the raw `---` when the caret is on it', () => {
    const doc = 'Before\n\n---\n\nAfter'
    const view = makeView(doc, doc.indexOf('---') + 1)
    const drawn = view.dom.querySelectorAll('.cm-dm-rule').length
    const text = view.dom.textContent
    view.destroy()
    expect(drawn).toBe(0)
    expect(text).toContain('---')
  })

  it('leaves frontmatter fences alone', () => {
    // `---` around YAML frontmatter parses as two horizontal rules, but it is
    // a character sheet's data, not a divider — frontmatterEnd dims it instead.
    const doc = '---\nname: Strahd\n---\n\nBody'
    const view = makeView(doc, doc.length)
    const drawn = view.dom.querySelectorAll('.cm-dm-rule').length
    view.destroy()
    expect(drawn).toBe(0)
  })
})
