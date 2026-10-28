import { useRef, useState } from 'react'
import {
  WRAPPERS,
  addTableColumn,
  addTableRow,
  insertLink,
  removeTableColumn,
  removeTableRow,
} from '#/lib/markdownEditing'
import type { EditResult, Wrapper } from '#/lib/markdownEditing'
import { snippets } from '#/lib/formatMarkdown'
import {
  addToDictionary,
  isMisspelled,
  knownMisspelled,
  suggestionsFor,
} from '#/lib/spellcheck/checker'
import { wordAtEvent } from '#/lib/spellcheck/pointer'
import type { WordSpan } from '#/lib/spellcheck/text'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '#/components/ui/context-menu'

/**
 * Menu group headings, shared with the editor's Insert dropdown. The default
 * label is the same size as the items under it and reads as just another
 * (unclickable) row, so headings take the app's section-header style — the one
 * CONTENT and CHARACTERS use in the sidebar.
 */
export const MENU_GROUP_LABEL = 'tome-label px-2 pt-2 pb-1'

/**
 * What this menu needs of an editor, and nothing more.
 *
 * Structural on purpose: `useMarkdownEditor`'s return satisfies it as-is (so
 * every textarea caller is unchanged), and the live CodeMirror surface can
 * satisfy it too through a small adapter. Typing this as
 * `ReturnType<typeof useMarkdownEditor>` is what used to weld the menu to a
 * textarea and left live edit with no right-click menu at all.
 */
export interface ContextMenuEditor {
  /** Sample selection state as the menu opens. Must not preventDefault. */
  onContextMenu: () => void
  hasSelection: boolean
  /** Whether the caret was on a table row as the menu opened. */
  inTable: boolean
  execEditorCommand: (command: 'cut' | 'copy' | 'paste' | 'selectAll') => void
  wrap: (wrapper: Wrapper) => void
  transform: (
    fn: (text: string, start: number, end: number) => EditResult | null,
  ) => void
  insertBlock: (snippet: string) => void
  insertText: (snippet: string) => void
}

/**
 * Right-click menu for a markdown editing surface: the formatting the app cares
 * about, plus the clipboard items the native menu would have provided.
 *
 * Wraps the editor rather than living in a toolbar, so the editors with no
 * toolbar of their own (character notes, backstory, features) get the same
 * affordances as the article editor. Works over both surfaces — the textarea's
 * `useMarkdownEditor` and the live CodeMirror one — via `ContextMenuEditor`;
 * both apply edits in a way that keeps their own undo stack intact.
 *
 * The Spelling group comes first when the right-clicked word is misspelled,
 * checked by the app's own spellchecker (lib/spellcheck) on both surfaces. A
 * suggestion goes in through `transform`, like every other edit here, so it is
 * one undo step on either surface.
 */

/** Native menus offer about this many; a longer list is mostly noise. */
const MAX_SUGGESTIONS = 5

interface Misspelling extends WordSpan {
  /** Null while the worker is still thinking — suggesting is the slow part. */
  suggestions: Array<string> | null
}

export function MarkdownContextMenu({
  editor,
  children,
}: {
  editor: ContextMenuEditor
  children: React.ReactNode
}) {
  const { hasSelection, inTable, execEditorCommand } = editor
  // Sampled on right-click, like hasSelection: by the time an item renders the
  // menu has focus and the pointer has moved.
  const [misspelling, setMisspelling] = useState<Misspelling | null>(null)
  // Which right-click the async answers belong to. A slow suggest for the
  // last word must not land in the menu opened for this one.
  const lookup = useRef(0)
  /**
   * A correction waiting for the menu to close. It can't run from the item's
   * click: the menu traps focus while open, so the textarea's `focus()` is
   * bounced straight back to the menu and the selection `applyEdit` sets over
   * the word never takes — the suggestion lands at the caret beside the typo
   * instead of over it. Measured in the app, not assumed. Once the menu has
   * closed, focus is ours to give.
   */
  const pendingEdit = useRef<(() => void) | null>(null)

  const lookUp = (span: WordSpan | null) => {
    const token = ++lookup.current
    const current = () => token === lookup.current
    // A squiggled word is already in the checker's cache, so its group can be
    // there the moment the menu opens instead of appearing under the pointer.
    setMisspelling(
      span && knownMisspelled(span.word)
        ? { ...span, suggestions: null }
        : null,
    )
    if (!span) return
    void (async () => {
      if (!(await isMisspelled(span.word)) || !current()) return
      setMisspelling({ ...span, suggestions: null })
      const suggestions = await suggestionsFor(span.word)
      if (current()) {
        setMisspelling({
          ...span,
          suggestions: suggestions.slice(0, MAX_SUGGESTIONS),
        })
      }
    })()
  }

  const replaceWord = (span: Misspelling, replacement: string) =>
    editor.transform((text) => {
      // The document may have changed under an open menu (autosave reload,
      // a guest's edit). Only replace what is still the word we checked.
      if (text.slice(span.start, span.end) !== span.word) return null
      const caret = span.start + replacement.length
      return {
        text: replacement,
        replace: { start: span.start, end: span.end },
        selection: { start: caret, end: caret },
      }
    })

  return (
    <ContextMenu>
      {/* asChild so the textarea itself is the trigger — an extra wrapper
          element would break the editors that size their textarea with
          flex/min-h classes. */}
      <ContextMenuTrigger
        asChild
        onContextMenu={(event) => {
          editor.onContextMenu()
          lookUp(wordAtEvent(event))
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        className="max-h-[70vh] w-56 overflow-y-auto"
        onCloseAutoFocus={(event) => {
          const edit = pendingEdit.current
          pendingEdit.current = null
          if (!edit) return
          // The edit focuses the editor itself; Radix's own focus-return would
          // only put the caret back where the right-click left it.
          event.preventDefault()
          edit()
        }}
      >
        {misspelling && (
          <>
            <ContextMenuGroup>
              <ContextMenuLabel className={MENU_GROUP_LABEL}>
                Spelling
              </ContextMenuLabel>
              {misspelling.suggestions === null ? (
                <ContextMenuItem disabled>Finding suggestions…</ContextMenuItem>
              ) : misspelling.suggestions.length === 0 ? (
                <ContextMenuItem disabled>No suggestions</ContextMenuItem>
              ) : (
                misspelling.suggestions.map((suggestion) => (
                  <ContextMenuItem
                    key={suggestion}
                    className="font-semibold"
                    onClick={() => {
                      pendingEdit.current = () =>
                        replaceWord(misspelling, suggestion)
                    }}
                  >
                    {suggestion}
                  </ContextMenuItem>
                ))
              )}
              <ContextMenuItem
                onClick={() => void addToDictionary(misspelling.word)}
              >
                Add “{misspelling.word}” to dictionary
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuGroup>
          <ContextMenuLabel className={MENU_GROUP_LABEL}>
            Format
          </ContextMenuLabel>
          <ContextMenuItem onClick={() => editor.wrap(WRAPPERS.bold)}>
            Bold
            <ContextMenuShortcut>Ctrl+B</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => editor.wrap(WRAPPERS.italic)}>
            Italic
            <ContextMenuShortcut>Ctrl+I</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => editor.wrap(WRAPPERS.code)}>
            Code
            <ContextMenuShortcut>Ctrl+E</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => editor.wrap(WRAPPERS.strikethrough)}>
            Strikethrough
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel className={MENU_GROUP_LABEL}>Link</ContextMenuLabel>
          <ContextMenuItem
            onClick={() =>
              editor.transform((text, start, end) =>
                insertLink(text, { start, end }),
              )
            }
          >
            Markdown link
            <ContextMenuShortcut>Ctrl+⇧+K</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => editor.wrap(WRAPPERS.wikiLink)}>
            Wiki link
            <ContextMenuShortcut>Ctrl+⇧+L</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel className={MENU_GROUP_LABEL}>
            Insert
          </ContextMenuLabel>
          {/* Same `snippets` objects the Insert dropdown uses, so the two menus
              cannot drift apart. */}
          <ContextMenuSub>
            <ContextMenuSubTrigger>Block</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem
                onClick={() => editor.insertBlock(snippets.table)}
              >
                Table
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => editor.insertBlock(snippets.rollableTable)}
              >
                Rollable d100 table
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => editor.insertBlock(snippets.readAloud)}
              >
                Read-aloud box
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => editor.insertBlock(snippets.statBlock)}
              >
                Stat block
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => editor.insertBlock(snippets.divider)}
              >
                Divider
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => editor.insertBlock(snippets.pageBreak)}
              >
                Page break
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            onClick={() => editor.insertText(snippets.namedRoll)}
          >
            Named roll
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel className={MENU_GROUP_LABEL}>
            Table
          </ContextMenuLabel>
          {/* Every table edit is reachable by click alone, so none of them
              depends on holding a chord. Outside a table they read as
              disabled rather than silently doing nothing, like Cut and Copy. */}
          <ContextMenuItem
            disabled={!inTable}
            onClick={() =>
              editor.transform((text, start) => addTableRow(text, start))
            }
          >
            Add row
            <ContextMenuShortcut>Ctrl+R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!inTable}
            onClick={() =>
              editor.transform((text, start) => addTableColumn(text, start))
            }
          >
            Add column
            <ContextMenuShortcut>Ctrl+G</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!inTable}
            onClick={() =>
              editor.transform((text, start) => removeTableRow(text, start))
            }
          >
            Remove row
            <ContextMenuShortcut>Ctrl+⇧+R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!inTable}
            onClick={() =>
              editor.transform((text, start) => removeTableColumn(text, start))
            }
          >
            Remove column
            <ContextMenuShortcut>Ctrl+⇧+G</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel className={MENU_GROUP_LABEL}>
            Clipboard
          </ContextMenuLabel>
          {/* Cut and Copy do nothing without a selection, so they read as
              disabled rather than silently no-op. */}
          <ContextMenuItem
            disabled={!hasSelection}
            onClick={() => execEditorCommand('cut')}
          >
            Cut
            <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!hasSelection}
            onClick={() => execEditorCommand('copy')}
          >
            Copy
            <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => execEditorCommand('paste')}>
            Paste
            <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => execEditorCommand('selectAll')}>
            Select all
            <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
