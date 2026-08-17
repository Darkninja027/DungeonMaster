import { WidgetType } from '@codemirror/view'

/**
 * DOM the editor paints in place of raw text: dice chips and page-break rules.
 *
 * Widgets live outside React's tree, so they can't use hooks or context. That's
 * fine here — lib/rollLog.ts is a module-level store precisely so the markdown
 * renderer can log rolls without provider wiring, and the same door is open to
 * us.
 */

/**
 * A clickable dice chip, standing in for `2d6+3` or `[Short Sword](1d20+5)`.
 *
 * `eq` is what keeps this cheap. Decorations rebuild on every selection change
 * — every arrow key — and each rebuild constructs new widget objects. Without
 * `eq` CodeMirror sees a different widget each time, tears the <button> out of
 * the DOM and builds a fresh one, so chips flicker and any rolled result on
 * screen is lost mid-read. Comparing the notation lets an unchanged chip be
 * reused untouched.
 */
export class DiceWidget extends WidgetType {
  constructor(
    readonly notation: string,
    readonly label?: string,
  ) {
    super()
  }

  eq(other: DiceWidget): boolean {
    return other.notation === this.notation && other.label === this.label
  }

  toDOM(): HTMLElement {
    const button = document.createElement('button')
    button.type = 'button'
    // `dnd-dice` matches the renderer's chip; `cm-dm-dice` is the hook the
    // editor theme needs, because the renderer's rule is scoped `.dnd-page
    // .dnd-dice` and never reaches inside `.cm-editor`.
    button.className = 'dnd-dice cm-dm-dice'
    button.textContent = this.label
      ? `${this.label} ${this.notation}`
      : this.notation
    button.title = `Roll ${this.notation}`
    // Read by the view's mousedown handler — the roll is dispatched there
    // rather than from a listener added here, because listeners attached in
    // toDOM leak every time a widget is rebuilt.
    button.dataset.notation = this.notation
    if (this.label) button.dataset.label = this.label
    return button
  }

  /** Let clicks reach the editor's own handler. */
  ignoreEvent(): boolean {
    return false
  }
}

/**
 * The `\page` / `\columns N` markers, shown as a labelled rule instead of raw
 * text. Inline-in-a-line rather than a block widget: a block widget changes
 * line heights, and the marker still occupies a real line in the document.
 */
export class PageRuleWidget extends WidgetType {
  constructor(readonly label: string) {
    super()
  }

  eq(other: PageRuleWidget): boolean {
    return other.label === this.label
  }

  toDOM(): HTMLElement {
    const rule = document.createElement('span')
    rule.className = 'cm-dm-pagerule'
    rule.textContent = this.label
    return rule
  }
}
