import { EditorView } from '@codemirror/view'
import { excludedRanges, isExcluded, wordAt } from './text'
import type { WordSpan } from './text'

/**
 * Resolve a screen point to an offset in whichever editing surface `host` is
 * — a markdown textarea, or the element wrapping a live CodeMirror editor.
 */
function textAtPoint(
  host: Element,
  x: number,
  y: number,
): { text: string; offset: number } | null {
  if (host instanceof HTMLTextAreaElement) {
    // Same trick as useMarkdownEditor's wiki-link hit test: Chromium resolves
    // a point straight to an offset inside a textarea.
    const pos = document.caretPositionFromPoint(x, y)
    if (!pos || pos.offsetNode !== host) return null
    return { text: host.value, offset: pos.offset }
  }
  const dom = host.closest('.cm-editor') ?? host.querySelector('.cm-editor')
  const view = dom instanceof HTMLElement ? EditorView.findFromDOM(dom) : null
  if (!view) return null
  const offset = view.posAtCoords({ x, y })
  if (offset === null) return null
  return { text: view.state.doc.toString(), offset }
}

/**
 * The word under a right-click, or null when the click was not on one or
 * landed somewhere that is not prose (code, frontmatter, a `[[link]]`). Uses
 * the same exclusions as the live editor's squiggles, so the menu never offers
 * to "correct" a word that carries no squiggle.
 */
export function wordAtEvent(event: React.MouseEvent): WordSpan | null {
  const at = textAtPoint(event.currentTarget, event.clientX, event.clientY)
  if (!at) return null
  const span = wordAt(at.text, at.offset)
  if (!span || isExcluded(excludedRanges(at.text), span.start)) return null
  return span
}
