import { WRAPPERS, insertLink } from '#/lib/markdownEditing'
import type { EditResult, Wrapper } from '#/lib/markdownEditing'
import { snippets } from '#/lib/formatMarkdown'
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
export const MENU_GROUP_LABEL =
  'text-muted-foreground px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide'

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
 * Overriding contextmenu costs Chromium's spelling SUGGESTIONS — those are only
 * offered to the main process, never to renderer JS. The red squiggles are
 * unaffected.
 */
export function MarkdownContextMenu({
  editor,
  children,
}: {
  editor: ContextMenuEditor
  children: React.ReactNode
}) {
  const { hasSelection, execEditorCommand } = editor

  return (
    <ContextMenu>
      {/* asChild so the textarea itself is the trigger — an extra wrapper
          element would break the editors that size their textarea with
          flex/min-h classes. */}
      <ContextMenuTrigger asChild onContextMenu={editor.onContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="max-h-[70vh] w-56 overflow-y-auto">
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
