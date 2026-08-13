import { useCallback, useRef } from 'react'
import {
  TABLE_SNIPPET,
  WRAPPERS,
  addTableRow,
  indentLines,
  insertLink,
  padBlock,
  toggleWrap,
} from '#/lib/markdownEditing'
import type { EditResult } from '#/lib/markdownEditing'

/**
 * Formatting shortcuts for a markdown textarea.
 *
 * Edits go through `document.execCommand('insertText')` rather than a React
 * state update. execCommand is deprecated on paper but is the only way to
 * mutate a textarea while KEEPING the browser's native undo stack — a state
 * write blows the stack away, so Ctrl+Z after a Ctrl+B would otherwise undo
 * far more than the bold, or nothing at all. It also fires a real `input`
 * event, so the textarea's existing onChange still runs and autosave needs no
 * special handling.
 *
 * Chromium (which is all this Electron app ever runs on) supports it. The
 * fallback path below covers the case where it's refused.
 */

/**
 * Characters that wrap a selection instead of replacing it. `[` twice is the
 * wiki-link gesture; the rest are the usual editor courtesy.
 */
const PAIRS: Record<string, string> = {
  '[': ']',
  '(': ')',
  '{': '}',
  '"': '"',
  "'": "'",
  '*': '*',
  _: '_',
  '`': '`',
}

export interface MarkdownEditorOptions {
  /**
   * Adopt an existing textarea ref instead of creating one. Lets a component
   * that already holds a ref (for autocomplete, focus management…) share it
   * rather than juggle two refs onto one element.
   */
  ref?: React.RefObject<HTMLTextAreaElement | null>
  /** Applied when execCommand is unavailable; also the autosave trigger. */
  onFallbackChange?: (
    value: string,
    selection: { start: number; end: number },
  ) => void
  /**
   * Return true to decline a shortcut for this event. The article editor uses
   * this to let its `[[` autocomplete own Tab and Enter while the strip is up.
   */
  isSuppressed?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
}

export function useMarkdownEditor(options: MarkdownEditorOptions = {}) {
  const ownRef = useRef<HTMLTextAreaElement>(null)
  const ref = options.ref ?? ownRef
  // Kept in a ref so the returned callbacks stay stable across renders.
  const latest = useRef(options)
  latest.current = options

  /**
   * Replaces a span of the textarea and restores the selection. Uses
   * execCommand when it can so undo keeps working.
   */
  const applyEdit = useCallback((result: EditResult) => {
    const textarea = ref.current
    if (!textarea) return

    textarea.focus()
    // execCommand('insertText') replaces whatever is currently selected, so
    // select the span we mean to replace first.
    textarea.setSelectionRange(result.replace.start, result.replace.end)

    const inserted =
      typeof document.execCommand === 'function' &&
      document.execCommand('insertText', false, result.text)

    if (!inserted) {
      // Fallback: mutate value directly and tell the caller to sync state.
      // Loses native undo, but only on browsers that refuse execCommand.
      const next =
        textarea.value.slice(0, result.replace.start) +
        result.text +
        textarea.value.slice(result.replace.end)
      textarea.value = next
      latest.current.onFallbackChange?.(next, result.selection)
    }

    textarea.setSelectionRange(result.selection.start, result.selection.end)
  }, [])

  /** Runs a transform against the textarea's live value and selection. */
  const transform = useCallback(
    (fn: (text: string, start: number, end: number) => EditResult | null) => {
      const textarea = ref.current
      if (!textarea) return false
      const result = fn(
        textarea.value,
        textarea.selectionStart,
        textarea.selectionEnd,
      )
      if (!result) return false
      applyEdit(result)
      return true
    },
    [applyEdit],
  )

  /** Wrap/unwrap the selection — the Ctrl+B / Ctrl+I / `[[` path. */
  const wrap = useCallback(
    (wrapper: { before: string; after: string }) =>
      transform((text, start, end) =>
        toggleWrap(text, { start, end }, wrapper),
      ),
    [transform],
  )

  /** Insert a block snippet with markdown-safe blank lines around it. */
  const insertBlock = useCallback(
    (snippet: string) =>
      transform((text, start, end) => padBlock(text, { start, end }, snippet)),
    [transform],
  )

  /** Insert text at the cursor, replacing any selection. */
  const insertText = useCallback(
    (snippet: string) =>
      transform((_text, start, end) => ({
        text: snippet,
        replace: { start, end },
        selection: {
          start: start + snippet.length,
          end: start + snippet.length,
        },
      })),
    [transform],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (latest.current.isSuppressed?.(e)) return
      const mod = e.ctrlKey || e.metaKey

      // Tab indents list items — but only for a real selection or inside a
      // list, so Tab still moves focus out of an empty textarea.
      if (e.key === 'Tab' && !mod) {
        const textarea = ref.current
        if (!textarea) return
        const hasSelection = textarea.selectionStart !== textarea.selectionEnd
        const line = textarea.value.slice(
          textarea.value.lastIndexOf('\n', textarea.selectionStart - 1) + 1,
          textarea.selectionStart,
        )
        const inList = /^\s*([-*+]|\d+\.)\s/.test(line)
        if (!hasSelection && !inList) return
        e.preventDefault()
        transform((text, start, end) =>
          indentLines(text, { start, end }, e.shiftKey),
        )
        return
      }

      if (!mod || e.altKey) return

      // Ctrl+Shift+K is the markdown link: plain Ctrl+K belongs to the
      // command palette, which is global and has the stronger claim.
      if (e.shiftKey) {
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault()
          transform((text, start, end) => insertLink(text, { start, end }))
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault()
          wrap(WRAPPERS.bold)
          break
        case 'i':
          e.preventDefault()
          wrap(WRAPPERS.italic)
          break
        case 'e':
          e.preventDefault()
          wrap(WRAPPERS.code)
          break
        case 'd':
          e.preventDefault()
          insertText('1d20+5')
          break
        case 't':
          e.preventDefault()
          insertBlock(TABLE_SNIPPET)
          break
        case 'r':
          e.preventDefault()
          // Add a row to the table we're in; otherwise start a new table.
          if (!transform((text, start) => addTableRow(text, start))) {
            insertBlock(TABLE_SNIPPET)
          }
          break
      }
    },
    [transform, wrap, insertBlock, insertText],
  )

  /**
   * Typing a bracket or quote with text selected WRAPS the selection instead
   * of replacing it — the behaviour every code editor has. Pressing `[` twice
   * therefore grows `[text]` into `[[text]]`, which is how you make a wiki
   * link out of a name you just selected.
   *
   * Handled on beforeInput rather than keydown so it is keyboard-layout
   * independent: we react to the character actually being inserted, not to a
   * physical key that may need AltGr to produce `[`.
   */
  const onBeforeInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const native = e.nativeEvent as InputEvent
      const char = native.data
      if (!char || !(char in PAIRS)) return
      const textarea = ref.current
      if (!textarea) return
      // Only wrap a real selection; a bare keystroke types normally.
      if (textarea.selectionStart === textarea.selectionEnd) return
      e.preventDefault()
      wrap({ before: char, after: PAIRS[char] })
    },
    [wrap],
  )

  return {
    ref,
    onKeyDown,
    onBeforeInput,
    insertBlock,
    insertText,
    wrap,
    applyEdit,
  }
}
