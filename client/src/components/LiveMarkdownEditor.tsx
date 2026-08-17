import { useEffect, useImperativeHandle, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { Annotation, EditorState } from '@codemirror/state'
import { liveMarkdown } from '#/lib/cm/liveMarkdown'
import type { EditResult } from '#/lib/markdownEditing'
import type { RollSource } from '#/lib/rollLog'

/**
 * The live-preview editing surface: markdown that hides its own syntax
 * characters until the cursor touches them (see lib/cm/reveal.ts).
 *
 * CodeMirror owns the document; React state mirrors it. That direction matters
 * — driving CodeMirror from React state would fight its own transaction model
 * and destroy the undo history on every keystroke.
 */

/**
 * Marks transactions this component dispatched to push React's value in, so
 * the update listener can tell them from real user edits and not echo them
 * straight back out.
 */
const External = Annotation.define<boolean>()

export interface LiveEditorHandle {
  /** Put the caret at a document offset and scroll it into view (outline jumps). */
  goTo: (offset: number) => void
  /** Insert text at the cursor — image uploads, Insert menu snippets. */
  insert: (text: string) => void
  /**
   * Run one of the pure transforms from lib/markdownEditing against the live
   * document and selection. Lets the Insert menu reuse padBlock without the
   * route having to track the caret itself.
   */
  transform: (
    fn: (text: string, start: number, end: number) => EditResult | null,
  ) => void
  focus: () => void
}

export function LiveMarkdownEditor({
  value,
  onChange,
  onSelectionChange,
  onWikiLinkOpen,
  onFiles,
  source,
  className,
  ref,
}: {
  value: string
  onChange: (next: string) => void
  /** Caret offset, for keeping the outline in sync. */
  onSelectionChange?: (offset: number) => void
  onWikiLinkOpen?: (title: string) => void
  onFiles?: (files: Array<File>) => void
  source?: RollSource
  className?: string
  ref?: React.Ref<LiveEditorHandle>
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Callbacks in a ref so the extensions never close over a stale render, and
  // the editor never has to be torn down and rebuilt to pick up a new one.
  // Same approach as useMarkdownEditor's `latest`.
  const latest = useRef({ onChange, onSelectionChange, onWikiLinkOpen, onFiles, source })
  latest.current = { onChange, onSelectionChange, onWikiLinkOpen, onFiles, source }

  useEffect(() => {
    if (!host.current) return

    const instance = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          liveMarkdown({
            onWikiLinkOpen: (title) => latest.current.onWikiLinkOpen?.(title),
            onFiles: (files) => latest.current.onFiles?.(files),
            get source() {
              return latest.current.source
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet && !update.docChanged) {
              latest.current.onSelectionChange?.(update.state.selection.main.head)
            }
            if (!update.docChanged) return
            // Never write to React state mid-composition: the re-render can
            // cancel an in-flight IME composition and eat characters outright.
            // compositionend produces a further update, which does get through.
            if (update.view.composing) return
            if (update.transactions.some((t) => t.annotation(External))) return
            latest.current.onChange(update.state.doc.toString())
            latest.current.onSelectionChange?.(update.state.selection.main.head)
          }),
        ],
      }),
      parent: host.current,
    })
    view.current = instance

    return () => {
      instance.destroy()
      view.current = null
    }
    // Mounted once. `value` is deliberately absent — the effect below syncs it,
    // and listing it here would rebuild the editor (losing undo history and the
    // cursor) on every keystroke.
  }, [])

  // Push EXTERNAL changes in: article load, reload-from-disk, Tidy, template
  // insert. Comparing against the live document first means our own edits,
  // which arrive back here as `value` a render later, are recognised as an
  // echo and dropped — that comparison is what breaks the feedback loop.
  useEffect(() => {
    const instance = view.current
    if (!instance) return
    const current = instance.state.doc.toString()
    if (current === value) return
    instance.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      annotations: External.of(true),
    })
  }, [value])

  useImperativeHandle(
    ref,
    () => ({
      goTo(offset) {
        const instance = view.current
        if (!instance) return
        const pos = Math.min(offset, instance.state.doc.length)
        instance.focus()
        instance.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: 'start' }),
        })
      },
      insert(text) {
        const instance = view.current
        if (!instance) return
        const { from, to } = instance.state.selection.main
        instance.focus()
        instance.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
          scrollIntoView: true,
        })
      },
      transform(fn) {
        const instance = view.current
        if (!instance) return
        const { from, to } = instance.state.selection.main
        const result = fn(instance.state.doc.toString(), from, to)
        if (!result) return
        instance.focus()
        instance.dispatch({
          changes: {
            from: result.replace.start,
            to: result.replace.end,
            insert: result.text,
          },
          selection: {
            anchor: result.selection.start,
            head: result.selection.end,
          },
          scrollIntoView: true,
        })
      },
      focus() {
        view.current?.focus()
      },
    }),
    [],
  )

  return <div ref={host} className={className} />
}
