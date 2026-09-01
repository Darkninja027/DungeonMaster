import {
  EditorView,
  ViewPlugin,
  drawSelection,
  keymap,
  rectangularSelection,
} from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import {
  TABLE_SNIPPET,
  WRAPPERS,
  addTableRow,
  indentLines,
  insertLink,
  padBlock,
  toggleWrap,
  wikiLinkAt,
} from '#/lib/markdownEditing'
import { rollDice } from '#/lib/formatMarkdown'
import { logRoll } from '#/lib/rollLog'
import { liveDecorations } from './decorations'
import { liveTheme } from './theme'
import type { EditResult } from '#/lib/markdownEditing'
import type { Extension } from '@codemirror/state'
import type { RollSource } from '#/lib/rollLog'

/**
 * The whole live-preview editing surface as one extension.
 *
 * The formatting commands reuse lib/markdownEditing.ts unchanged. Those
 * transforms are pure functions over (text, {start, end}) returning offsets,
 * which is exactly CodeMirror's model too — so the same tested code drives both
 * this and the textarea, and Ctrl+B can't come to mean two different things.
 */

/**
 * Marks the editor while Ctrl/Cmd is held, so the theme can show a pointer
 * cursor over `[[wiki links]]` — the modifier that actually opens them.
 *
 * Listens on the window rather than the editor: the pointer may be hovering a
 * link while focus sits elsewhere entirely, and a keydown on the editor would
 * never fire. The blur handler is not optional — alt-tabbing away with Ctrl
 * held never delivers the keyup, so the class would latch on and every link
 * would keep claiming to be clickable.
 */
const modifierCursor = ViewPlugin.fromClass(
  class {
    private held = false

    constructor(private view: EditorView) {
      window.addEventListener('keydown', this.sync)
      window.addEventListener('keyup', this.sync)
      window.addEventListener('blur', this.clear)
    }

    private set(next: boolean) {
      if (next === this.held) return
      this.held = next
      this.view.dom.classList.toggle('cm-dm-mod', next)
    }

    private sync = (event: KeyboardEvent) => {
      this.set(event.ctrlKey || event.metaKey)
    }

    private clear = () => this.set(false)

    destroy() {
      window.removeEventListener('keydown', this.sync)
      window.removeEventListener('keyup', this.sync)
      window.removeEventListener('blur', this.clear)
      this.view.dom.classList.remove('cm-dm-mod')
    }
  },
)

/** Runs one of the pure transforms against the current state. */
function applyTransform(
  view: EditorView,
  fn: (text: string, start: number, end: number) => EditResult | null,
): boolean {
  const { from, to } = view.state.selection.main
  const result = fn(view.state.doc.toString(), from, to)
  if (!result) return false
  view.dispatch({
    changes: {
      from: result.replace.start,
      to: result.replace.end,
      insert: result.text,
    },
    selection: { anchor: result.selection.start, head: result.selection.end },
    scrollIntoView: true,
  })
  return true
}

const wrapWith =
  (wrapper: { before: string; after: string }) => (view: EditorView) =>
    applyTransform(view, (text, start, end) =>
      toggleWrap(text, { start, end }, wrapper),
    )

export interface LiveMarkdownOptions {
  /** Ctrl+Click / Ctrl+Enter on a [[wiki link]]. */
  onWikiLinkOpen?: (title: string) => void
  /** Attribution for rolls fired from a dice chip. */
  source?: RollSource
  /** Files pasted or dropped into the editor, for image upload. */
  onFiles?: (files: Array<File>) => void
}

export function liveMarkdown(options: LiveMarkdownOptions = {}): Extension {
  return [
    // GFM passed explicitly: Strikethrough and Table nodes only exist with it,
    // and the decorator names both. Relying on the default would let a future
    // config change silently drop them.
    markdown({ extensions: [GFM] }),
    history(),
    drawSelection(),
    rectangularSelection(),
    EditorView.lineWrapping,
    liveDecorations,
    modifierCursor,
    liveTheme,

    EditorView.domEventHandlers({
      // Chips are rebuilt often, so the handler lives here rather than on the
      // widget — a listener added in toDOM leaks on every rebuild.
      mousedown(event, view) {
        // Left button only. A right-click belongs to the context menu: without
        // this, right-clicking a dice chip silently rolls it and swallows the
        // menu, and Ctrl+right-click on a [[link]] would navigate away.
        if (event.button !== 0) return false
        const target = event.target as HTMLElement | null
        const chip = target?.closest<HTMLElement>('.cm-dm-dice')
        if (!chip) {
          // Ctrl+Click a [[wiki link]]: the editor holds raw text, so there is
          // no anchor to click — resolve the position to a link instead.
          if (!(event.ctrlKey || event.metaKey) || !options.onWikiLinkOpen)
            return false
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
          if (pos == null) return false
          const link = wikiLinkAt(view.state.doc.toString(), pos)
          if (!link) return false
          event.preventDefault()
          options.onWikiLinkOpen(link.title)
          return true
        }
        event.preventDefault()
        const notation = chip.dataset.notation
        if (!notation) return true
        const rolled = rollDice(notation)
        if (rolled) {
          chip.title = `${notation}: ${rolled.detail} = ${rolled.total}`
          logRoll({
            notation,
            label: chip.dataset.label,
            total: rolled.total,
            detail: rolled.detail,
            source: options.source,
          })
        }
        return true
      },

      paste(event) {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (!options.onFiles || !files.some((f) => f.type.startsWith('image/')))
          return false
        event.preventDefault()
        options.onFiles(files)
        return true
      },

      drop(event) {
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (!options.onFiles || !files.some((f) => f.type.startsWith('image/')))
          return false
        event.preventDefault()
        options.onFiles(files)
        return true
      },
    }),

    keymap.of([
      { key: 'Mod-b', run: wrapWith(WRAPPERS.bold), preventDefault: true },
      { key: 'Mod-i', run: wrapWith(WRAPPERS.italic), preventDefault: true },
      { key: 'Mod-e', run: wrapWith(WRAPPERS.code), preventDefault: true },
      {
        key: 'Mod-Shift-l',
        run: wrapWith(WRAPPERS.wikiLink),
        preventDefault: true,
      },
      {
        // Ctrl+K belongs to the command palette, which is global and has the
        // stronger claim — same split as the textarea.
        key: 'Mod-Shift-k',
        run: (view) =>
          applyTransform(view, (text, start, end) =>
            insertLink(text, { start, end }),
          ),
        preventDefault: true,
      },
      {
        key: 'Mod-d',
        run: (view) =>
          applyTransform(view, (_t, start, end) => ({
            text: '1d20+5',
            replace: { start, end },
            selection: { start: start + 6, end: start + 6 },
          })),
        preventDefault: true,
      },
      {
        key: 'Mod-t',
        run: (view) =>
          applyTransform(view, (text, start, end) =>
            padBlock(text, { start, end }, TABLE_SNIPPET),
          ),
        preventDefault: true,
      },
      {
        key: 'Mod-r',
        run: (view) =>
          applyTransform(view, (text, start) => addTableRow(text, start)) ||
          applyTransform(view, (text, start, end) =>
            padBlock(text, { start, end }, TABLE_SNIPPET),
          ),
        preventDefault: true,
      },
      {
        key: 'Mod-Enter',
        run: (view) => {
          if (!options.onWikiLinkOpen) return false
          const link = wikiLinkAt(
            view.state.doc.toString(),
            view.state.selection.main.head,
          )
          if (!link) return false
          options.onWikiLinkOpen(link.title)
          return true
        },
      },
      {
        key: 'Tab',
        run: (view) =>
          applyTransform(view, (text, start, end) =>
            indentLines(text, { start, end }, false),
          ),
        shift: (view) =>
          applyTransform(view, (text, start, end) =>
            indentLines(text, { start, end }, true),
          ),
      },
      ...historyKeymap,
      ...defaultKeymap,
    ]),
  ]
}

/** Shared by the editor component; exported so tests can build a state cheaply. */
export function createLiveState(
  doc: string,
  options: LiveMarkdownOptions = {},
): EditorState {
  return EditorState.create({ doc, extensions: liveMarkdown(options) })
}
