import { EditorView } from '@codemirror/view'

/**
 * How decorated markdown looks inside the editor.
 *
 * Kept as a CodeMirror theme rather than in styles.css because none of the
 * renderer's rules reach here: the chip is styled `.dnd-page .dnd-dice`, and
 * even `--dnd-red` / `--dnd-gold` are defined ON `.dnd-page` rather than at the
 * root, so nothing inside `.cm-editor` inherits any of it. The colours below
 * restate that palette against the app's own theme tokens so the editor tracks
 * light/dark, which the fixed parchment page never has to.
 */
export const liveTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '0.875rem',
    backgroundColor: 'transparent',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    lineHeight: '1.7',
    overflow: 'auto',
  },
  '.cm-content': { padding: '0.75rem 1rem', caretColor: 'var(--foreground)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 25%, transparent)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },

  // --- Inline marks --------------------------------------------------------
  '.cm-dm-strong': { fontWeight: '700' },
  '.cm-dm-em': { fontStyle: 'italic' },
  '.cm-dm-strike': { textDecoration: 'line-through', opacity: '0.7' },
  '.cm-dm-code': {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    backgroundColor: 'color-mix(in oklab, var(--muted-foreground) 18%, transparent)',
    borderRadius: '3px',
    padding: '0.05em 0.3em',
  },

  // --- Headings ------------------------------------------------------------
  // Sized down from the renderer's scale: the editor is a working surface, and
  // a 2em h1 in a monospace column pushes everything else off the screen.
  '.cm-dm-h1': { fontSize: '1.5em', fontWeight: '700', lineHeight: '1.3' },
  '.cm-dm-h2': { fontSize: '1.3em', fontWeight: '700', lineHeight: '1.35' },
  '.cm-dm-h3': { fontSize: '1.15em', fontWeight: '700' },
  '.cm-dm-h4': { fontSize: '1.05em', fontWeight: '700' },
  '.cm-dm-h5': { fontWeight: '700' },
  '.cm-dm-h6': { fontWeight: '700', opacity: '0.8' },

  '.cm-dm-bullet': { color: 'var(--primary)', fontWeight: '700' },

  // Blockquote: a bar down the line, standing in for the hidden `>`.
  '.cm-dm-quote': {
    borderLeft: '3px solid color-mix(in oklab, var(--primary) 50%, transparent)',
    paddingLeft: '0.75ch',
    fontStyle: 'italic',
  },

  // Frontmatter is demoted, not hidden — see frontmatterEnd in decorations.ts.
  '.cm-dm-frontmatter': {
    color: 'var(--muted-foreground)',
    fontSize: '0.85em',
    backgroundColor:
      'color-mix(in oklab, var(--muted-foreground) 8%, transparent)',
  },

  // --- Wiki links ----------------------------------------------------------
  // Ctrl (or Cmd) opens a wiki link; a plain click just places the caret. So
  // the pointer only appears while that modifier is held — showing it always
  // would promise a click-through that doesn't happen. The `.cm-dm-mod` class
  // is toggled on the editor by modifierCursor in liveMarkdown.ts.
  //
  // Unlike the textarea, which needs caretPositionFromPoint and window-level
  // key listeners because `cursor` applies to the whole box, the link here is a
  // real span — so hover is just CSS.
  '.cm-dm-wikilink': {
    color: 'var(--primary)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  '&.cm-dm-mod .cm-dm-wikilink:hover': {
    cursor: 'pointer',
    textDecorationThickness: '2px',
    backgroundColor: 'color-mix(in oklab, var(--primary) 15%, transparent)',
    borderRadius: '2px',
  },

  // --- Dice chips ----------------------------------------------------------
  // Restates .dnd-page .dnd-dice; see the file docblock for why it can't be
  // inherited. Uses theme tokens rather than the fixed parchment palette.
  '.cm-dm-dice': {
    fontFamily: 'inherit',
    fontSize: '0.92em',
    fontWeight: '700',
    color: 'var(--primary)',
    backgroundColor: 'color-mix(in oklab, var(--primary) 12%, transparent)',
    border: '1px solid color-mix(in oklab, var(--primary) 45%, transparent)',
    borderRadius: '4px',
    padding: '0 0.35em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  '.cm-dm-dice:hover': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 22%, transparent)',
  },

  // --- Page-break rule -----------------------------------------------------
  '.cm-dm-pagerule': {
    display: 'inline-flex',
    alignItems: 'center',
    width: '100%',
    color: 'var(--muted-foreground)',
    fontSize: '0.75em',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    borderTop: '2px dashed var(--border)',
    paddingTop: '0.15em',
  },

  // --- Blocks --------------------------------------------------------------
  '.cm-dm-fence': {
    backgroundColor:
      'color-mix(in oklab, var(--muted-foreground) 10%, transparent)',
  },

  // --- Tables --------------------------------------------------------------
  // Each row is its own .cm-line, so there is no <table> to lay out and column
  // widths can't be shared. Tabular numerals plus a per-cell min-width gets
  // the columns close to aligned; a real grid would need the rows to be siblings
  // inside one element, which the editor's line model rules out.
  '.cm-dm-table-head': {
    fontWeight: '700',
    backgroundColor:
      'color-mix(in oklab, var(--muted-foreground) 14%, transparent)',
  },
  '.cm-dm-table-row': {
    backgroundColor:
      'color-mix(in oklab, var(--muted-foreground) 6%, transparent)',
  },
  // The `| --- | --- |` row carries no information once the pipes are gone.
  '.cm-dm-table-sep': {
    display: 'none',
  },
  '.cm-dm-cell': {
    display: 'inline-block',
    minWidth: '7ch',
    paddingRight: '1.5ch',
    fontVariantNumeric: 'tabular-nums',
  },
})
