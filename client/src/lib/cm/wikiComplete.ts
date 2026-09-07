import {
  autocompletion,
  closeCompletion,
  startCompletion,
} from '@codemirror/autocomplete'
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'

/**
 * `[[wiki link]]` autocomplete for the live editor.
 *
 * The textarea surface has had this for a long time as a hand-rolled strip
 * above the editor, driven by the route's own `linkQuery` state; CodeMirror
 * brings a real completion system, so this is that feature done through the
 * framework rather than a second copy of the route's version. The visible
 * behaviour is deliberately the same: type `[[`, then part of a title, and
 * pick with Enter.
 *
 * The article list is read through a getter rather than captured, because the
 * editor is constructed once on mount while the article list arrives from a
 * query later and changes as articles are created — a captured array would
 * offer whatever existed the moment the editor mounted, or nothing at all.
 */

/** An unclosed `[[` and the partial title typed after it, ending at the caret. */
const OPEN_LINK = /\[\[([^\][\n]*)$/

export interface WikiCompleteOptions {
  /** Every article in the world, newest list each call — see the note above. */
  articles?: () => Array<{ id: string; title: string }> | undefined
  /** The article being edited, so a page cannot suggest a link to itself. */
  currentId?: () => string | undefined
}

/**
 * Builds the completion list for one keystroke. Exported for tests: the
 * matching and the `[[…]]` insertion are the parts worth pinning, and driving
 * them through a live EditorView would test CodeMirror rather than this.
 */
export function wikiCompletions(
  textBefore: string,
  articles: Array<{ id: string; title: string }>,
  currentId?: string,
): { query: string; options: Array<Completion> } | null {
  const open = OPEN_LINK.exec(textBefore)
  if (!open) return null
  const query = open[1]
  const needle = query.toLowerCase()
  const options = articles
    .filter((a) => a.id !== currentId && a.title.toLowerCase().includes(needle))
    // A title that STARTS with what you typed is the one you meant; the
    // substring matches are the long tail behind it.
    .sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(needle)
      const bStarts = b.title.toLowerCase().startsWith(needle)
      if (aStarts !== bStarts) return aStarts ? -1 : 1
      return a.title.localeCompare(b.title)
    })
    .slice(0, 20)
    .map((a) => ({
      label: a.title,
      type: 'text',
      // The folder an article lives in, as a hint — two NPCs in different
      // folders can share a name, and the title alone cannot tell them apart.
      detail: a.id.includes('/')
        ? a.id.slice(0, a.id.lastIndexOf('/'))
        : undefined,
      // Replace the whole `[[partial` with a finished link. `apply` as a string
      // would only replace the matched range, leaving the brackets behind.
      apply: `[[${a.title}]]`,
    }))
  return { query, options }
}

export function wikiComplete(options: WikiCompleteOptions = {}): Extension {
  function source(context: CompletionContext): CompletionResult | null {
    const line = context.state.doc.lineAt(context.pos)
    const textBefore = context.state.sliceDoc(line.from, context.pos)
    const built = wikiCompletions(
      textBefore,
      options.articles?.() ?? [],
      options.currentId?.(),
    )
    if (!built) return null
    // An explicit invocation (Ctrl+Space) should open even with nothing typed
    // yet; an implicit one on a bare `[[` would pop the whole world open.
    if (!context.explicit && built.query === '' && built.options.length === 0)
      return null
    if (built.options.length === 0) return null
    /*
      Swallow a `]]` sitting immediately after the caret. Ctrl+Shift+L wraps the
      selection and leaves the caret between a ready-made `[[` and `]]`, so
      typing a title there and accepting wrote `[[Strahd]]` over the `[[Strah`
      while the original `]]` survived — `[[Strahd]]]]`. The same applies to
      anything else that pre-closes the brackets, a paste included.
    */
    const after = context.state.sliceDoc(
      context.pos,
      Math.min(context.pos + 2, line.to),
    )
    return {
      // Replace from the `[[` itself so `apply` can write the closing pair.
      from: context.pos - built.query.length - 2,
      to: after === ']]' ? context.pos + 2 : context.pos,
      options: built.options,
      // Our own filtering already ran, and it is case-insensitive substring
      // rather than CodeMirror's fuzzy default. Letting the default filter run
      // again would re-rank and drop legitimate matches.
      filter: false,
    }
  }

  return [
    autocompletion({
      override: [source],
      // The list is titles, not code: an unambiguous single match should still
      // be shown rather than silently inserted.
      activateOnTyping: true,
      selectOnOpen: true,
      icons: false,
      closeOnBlur: true,
    }),
  ]
}

export { closeCompletion, startCompletion }
