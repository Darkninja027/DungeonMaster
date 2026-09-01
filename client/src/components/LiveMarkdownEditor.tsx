import { useEffect, useImperativeHandle, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { Annotation, EditorState } from '@codemirror/state'
import { selectAll } from '@codemirror/commands'
import { liveMarkdown } from '#/lib/cm/liveMarkdown'
import { toggleWrap } from '#/lib/markdownEditing'
import type { EditResult, Wrapper } from '#/lib/markdownEditing'
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

/**
 * Points both refs at the same node. The editor needs the host element itself,
 * while a wrapper (the context menu trigger) may want it too.
 */
function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    }
  }
}

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
  /**
   * Wrap/unwrap the selection. The context menu's Format group needs this;
   * the keymap gets the same behaviour from `wrapWith` in lib/cm/liveMarkdown.
   */
  wrap: (wrapper: Wrapper) => void
  /**
   * Whether anything is selected right now. Sampled when the context menu
   * opens, never read during render — see the note on the route's own
   * `liveMenuSelection` for why.
   */
  hasSelection: () => boolean
  /**
   * Clipboard and select-all for the context menu.
   *
   * execCommand rather than a CodeMirror command, for the same reason
   * useMarkdownEditor uses it: CodeMirror has no clipboard commands to call
   * (cut/copy/paste are native DOM events to it), and going through the
   * document keeps the edit on CodeMirror's own input path, so undo history
   * and the update listener that drives autosave both survive.
   */
  execCommand: (command: 'cut' | 'copy' | 'paste' | 'selectAll') => void
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
  hostRef,
  ...rest
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
  /**
   * A second ref onto the host element. `ref` is spoken for by the imperative
   * handle, so a parent that needs the DOM node — Radix's ContextMenuTrigger
   * with `asChild` — goes through this one instead.
   */
  hostRef?: React.Ref<HTMLDivElement>
} & Omit<React.ComponentProps<'div'>, 'ref' | 'onChange' | 'children'>) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Callbacks in a ref so the extensions never close over a stale render, and
  // the editor never has to be torn down and rebuilt to pick up a new one.
  // Same approach as useMarkdownEditor's `latest`.
  const latest = useRef({
    onChange,
    onSelectionChange,
    onWikiLinkOpen,
    onFiles,
    source,
  })
  latest.current = {
    onChange,
    onSelectionChange,
    onWikiLinkOpen,
    onFiles,
    source,
  }

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
              latest.current.onSelectionChange?.(
                update.state.selection.main.head,
              )
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

  // Named rather than inline on the handle object so `wrap` can call it
  // directly — `this` inside an object literal passed through
  // useImperativeHandle is not something to rely on.
  const runTransform = (
    fn: (text: string, start: number, end: number) => EditResult | null,
  ) => {
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
  }

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
      transform: runTransform,
      wrap(wrapper) {
        runTransform((text, start, end) =>
          toggleWrap(text, { start, end }, wrapper),
        )
      },
      hasSelection() {
        const instance = view.current
        if (!instance) return false
        return !instance.state.selection.main.empty
      },
      execCommand(command) {
        const instance = view.current
        if (!instance) return
        // The menu took focus when it opened, and execCommand targets whatever
        // is focused — so put it back on the editor first.
        instance.focus()
        // Select-all goes through CodeMirror's own command. Chromium refuses
        // execCommand('selectAll') against this contentEditable: it reports
        // success and leaves the selection empty, so the next keystroke
        // inserts instead of replacing. Verified in the app, not assumed.
        if (command === 'selectAll') {
          selectAll(instance)
          return
        }
        try {
          document.execCommand(command)
        } catch {
          // Refused (e.g. a paste without clipboard permission) — leave the
          // document untouched rather than half-applying the command.
        }
      },
      focus() {
        view.current?.focus()
      },
    }),
    [],
  )

  // `rest` carries whatever a wrapper cloned onto us — the context menu
  // trigger's own handlers, above all. Dropping it is what would leave a
  // right-click on the live surface with no menu at all.
  return <div ref={mergeRefs(host, hostRef)} className={className} {...rest} />
}
