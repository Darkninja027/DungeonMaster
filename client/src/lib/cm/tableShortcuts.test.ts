import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView, runScopeHandlers } from '@codemirror/view'
import { liveMarkdown } from './liveMarkdown'

/**
 * The table shortcuts in the live editor, driven by real keydown events.
 *
 * The transforms are tested in markdownEditing.test.ts; what can break here is
 * the binding.
 *
 * R is rows and G is columns; Shift turns add into remove. Every one is
 * reachable under the left hand, with no Alt, on purpose: the removes started
 * as Ctrl+Alt and Ctrl+Alt+Shift chords, which are hard to hold for anyone
 * with limited hand mobility. Don't move them back to Alt chords.
 */
const TABLE = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |'

function press(pos: number, init: KeyboardEventInit) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const view = new EditorView({
    state: EditorState.create({
      doc: TABLE,
      selection: { anchor: pos },
      extensions: [liveMarkdown({})],
    }),
    parent,
  })
  const event = new KeyboardEvent('keydown', { ...init, cancelable: true })
  const handled = runScopeHandlers(view, event, 'editor')
  const doc = view.state.doc.toString()
  const { from, to } = view.state.selection.main
  view.destroy()
  return { handled, doc, selected: doc.slice(from, to) }
}

const ctrl = (key: string, keyCode: number, shiftKey = false) => ({
  key: shiftKey ? key.toUpperCase() : key,
  keyCode,
  ctrlKey: true,
  shiftKey,
})

describe('table shortcuts in the live editor', () => {
  it('Ctrl+R adds a row', () => {
    const { doc } = press(TABLE.indexOf('1'), ctrl('r', 82))
    expect(doc.split('\n')[3]).toBe('|   |   |')
  })

  it('Ctrl+Shift+R removes the caret row', () => {
    const { doc } = press(TABLE.indexOf('1'), ctrl('r', 82, true))
    expect(doc).toBe('| a | b |\n| - | - |\n| 3 | 4 |')
  })

  it('Ctrl+G adds a column', () => {
    const { doc } = press(TABLE.indexOf('1'), ctrl('g', 71))
    expect(doc.split('\n')[2]).toBe('| 1 |     | 2 |')
  })

  it('Ctrl+Shift+G removes the caret column', () => {
    const { doc } = press(TABLE.indexOf('1'), ctrl('g', 71, true))
    expect(doc).toBe('| b |\n| - |\n| 2 |\n| 4 |')
  })

  it('swallows Ctrl+Shift+R on the header, so it cannot force-reload', () => {
    const { handled, doc } = press(TABLE.indexOf('a'), ctrl('r', 82, true))
    expect(handled).toBe(true)
    expect(doc).toBe(TABLE)
  })

  it('Tab moves to the next cell, wrapping past the separator', () => {
    const tab = { key: 'Tab', keyCode: 9 }
    expect(press(TABLE.indexOf('2'), tab).selected).toBe('3')
    expect(press(TABLE.indexOf('b'), tab).selected).toBe('1')
  })

  it('Shift+Tab moves to the previous cell without indenting', () => {
    const { doc, selected } = press(TABLE.indexOf('3'), {
      key: 'Tab',
      keyCode: 9,
      shiftKey: true,
    })
    expect(doc).toBe(TABLE)
    expect(selected).toBe('2')
  })
})
