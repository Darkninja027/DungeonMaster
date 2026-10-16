import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView, runScopeHandlers } from '@codemirror/view'
import { liveMarkdown } from './liveMarkdown'

/**
 * The table shortcuts in the live editor, driven by real keydown events.
 *
 * The transforms are tested in markdownEditing.test.ts; what can break here is
 * the binding. Remove-column in particular is an `any` handler rather than a
 * `key: 'Mod-Alt-Shift-r'` binding, because on Windows CodeMirror treats
 * Ctrl+Alt as AltGr and skips the keyCode fallback that would look up the
 * shifted name — the event arrives as key 'R' and only `Alt-Ctrl-R` is tried.
 * jsdom is not Windows, so these tests cannot reproduce that skip; they pin
 * the `any` handler's own reading of the event, which is platform-free.
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
  view.destroy()
  return { handled, doc }
}

describe('table shortcuts in the live editor', () => {
  it('Ctrl+Shift+R adds a column', () => {
    const { doc } = press(TABLE.indexOf('1'), {
      key: 'R',
      keyCode: 82,
      ctrlKey: true,
      shiftKey: true,
    })
    expect(doc.split('\n')[2]).toBe('| 1 |     | 2 |')
  })

  it('Ctrl+Alt+R removes the caret row', () => {
    const { doc } = press(TABLE.indexOf('1'), {
      key: 'r',
      keyCode: 82,
      ctrlKey: true,
      altKey: true,
    })
    expect(doc).toBe('| a | b |\n| - | - |\n| 3 | 4 |')
  })

  it('Ctrl+Alt+Shift+R removes the caret column, as Windows sends it', () => {
    const { doc } = press(TABLE.indexOf('1'), {
      key: 'R',
      keyCode: 82,
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    })
    expect(doc).toBe('| b |\n| - |\n| 2 |\n| 4 |')
  })

  it('swallows Ctrl+Alt+R on the header rather than letting it through', () => {
    const { handled, doc } = press(TABLE.indexOf('a'), {
      key: 'r',
      keyCode: 82,
      ctrlKey: true,
      altKey: true,
    })
    expect(handled).toBe(true)
    expect(doc).toBe(TABLE)
  })

  it('leaves an AltGr character alone', () => {
    // AltGr+R on US-International types ® and reports it as the key.
    const { handled } = press(TABLE.indexOf('1'), {
      key: '®',
      keyCode: 82,
      ctrlKey: true,
      altKey: true,
    })
    expect(handled).toBe(false)
  })
})
