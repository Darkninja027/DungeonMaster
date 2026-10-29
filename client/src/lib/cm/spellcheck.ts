import { Prec, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { findMisspelled, onDictionaryChange } from '#/lib/spellcheck/checker'
import { excludedRanges, wordsIn } from '#/lib/spellcheck/text'

/**
 * Red squiggles under misspelled words in the live editor, drawn by us rather
 * than Chromium (see lib/spellcheck/worker.ts for why).
 *
 * Checks only what is on screen, a beat after you stop typing: the worker is
 * fast for a known word but a whole 30-page article is still thousands of
 * them, and the checker's cache means scrolling back is free anyway.
 *
 * The decorations live in a StateField and are mapped through every edit, so
 * a squiggle moves with its word while the next check is still pending,
 * instead of sliding onto whatever text arrives at its old offset.
 */

const MISSPELLED = Decoration.mark({ class: 'cm-dm-misspelled' })

const setMisspelled = StateEffect.define<DecorationSet>()

const misspelledField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    let next = decorations.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(setMisspelled)) next = effect.value
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** Quiet time after the last keystroke before re-checking. */
const DELAY_MS = 300

const checker = ViewPlugin.fromClass(
  class {
    private timer: ReturnType<typeof setTimeout> | null = null
    private generation = 0
    private unsubscribe: () => void

    constructor(private view: EditorView) {
      this.schedule(0)
      this.unsubscribe = onDictionaryChange(() => this.schedule(0))
    }

    update(update: ViewUpdate) {
      // Selection matters because the word under the caret is skipped while
      // you type it; moving off it is what lets its squiggle appear.
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.schedule(DELAY_MS)
      }
    }

    private schedule(delay: number) {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => void this.run(), delay)
    }

    private async run() {
      this.timer = null
      const generation = ++this.generation
      const { state } = this.view
      const text = state.doc.toString()
      const excluded = excludedRanges(text)
      const caret = state.selection.main
      const focused = this.view.hasFocus

      const spans = this.view.visibleRanges
        .flatMap(({ from, to }) => wordsIn(text, excluded, from, to))
        // Never flag the word being typed: "wiz" is not a mistake yet. Only
        // while focused — an unfocused editor has nobody typing in it.
        .filter(
          (span) =>
            !(
              focused &&
              caret.empty &&
              span.start <= caret.head &&
              caret.head <= span.end
            ),
        )
      const misspelled = await findMisspelled(spans.map((span) => span.word))

      // A newer run, or an edit since this one read the document, would make
      // these offsets wrong. The newer run will draw instead.
      if (generation !== this.generation || this.view.state.doc !== state.doc) {
        return
      }
      const marks = spans
        .filter((span) => misspelled.has(span.word))
        .map((span) => MISSPELLED.range(span.start, span.end))
      this.view.dispatch({
        effects: setMisspelled.of(Decoration.set(marks, true)),
      })
    }

    destroy() {
      if (this.timer) clearTimeout(this.timer)
      this.generation++
      this.unsubscribe()
    }
  },
)

/**
 * `Prec.high` is load-bearing. When marks overlap, CodeMirror nests the
 * higher-precedence one INSIDE the other. At default precedence the squiggle
 * sat outside a table cell's `inline-block` span and split it in two around
 * the misspelled word, and each half took the cell's full `ch` width: "Orm" in
 * one column, "Wolfsbane" shoved into the next. Innermost, the squiggle can't
 * cut any mark the live decorations draw.
 */
export const spellcheck = [Prec.high(misspelledField), checker]
