import { EditorView } from '@codemirror/view'

/**
 * How decorated markdown looks inside the editor.
 *
 * Kept as a CodeMirror theme rather than in styles.css because none of the
 * renderer's rules reach here: the chip is styled `.dnd-page .dnd-dice`, and
 * `--dnd-red` / `--dnd-gold` are defined ON `.dnd-page` rather than at the root,
 * so nothing inside `.cm-editor` inherits any of it.
 *
 * The `--tome-*` tokens ARE reachable — they sit on `:root` precisely so app
 * chrome can speak the sourcebook's language — so the editor uses them, and
 * tracks light/dark for free because the tokens swap roles under `.dark`
 * (oxblood headings in light, gold in dark). What it deliberately does NOT do
 * is become the parchment page: this is a working surface, the ground stays the
 * app's, body text stays monospace, and only the marks are gilded.
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
    backgroundColor: 'color-mix(in oklab, var(--tome-gold) 35%, transparent)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },

  // --- Inline marks --------------------------------------------------------
  '.cm-dm-strong': { fontWeight: '700' },
  '.cm-dm-em': { fontStyle: 'italic' },
  '.cm-dm-strike': { textDecoration: 'line-through', opacity: '0.7' },
  '.cm-dm-code': {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    backgroundColor:
      'color-mix(in oklab, var(--muted-foreground) 18%, transparent)',
    borderRadius: '3px',
    padding: '0.05em 0.3em',
  },

  // --- Headings ------------------------------------------------------------
  // Sized down from the renderer's scale: the editor is a working surface, and
  // a 2em h1 in a monospace column pushes everything else off the screen.
  //
  // Cinzel here rather than the monospace body, because a heading is the one
  // thing in the document that is prose rather than markup — and it is what
  // makes the editor read as the same app as the page it renders to. `--tome-
  // head` is oxblood in light and gold in dark, so both themes hold.
  '.cm-dm-h1, .cm-dm-h2, .cm-dm-h3, .cm-dm-h4, .cm-dm-h5, .cm-dm-h6': {
    fontFamily: 'var(--font-display)',
    color: 'var(--tome-head)',
    letterSpacing: '0.01em',
  },
  '.cm-dm-h1': { fontSize: '1.5em', fontWeight: '700', lineHeight: '1.3' },
  '.cm-dm-h2': { fontSize: '1.3em', fontWeight: '700', lineHeight: '1.35' },
  '.cm-dm-h3': { fontSize: '1.15em', fontWeight: '700' },
  '.cm-dm-h4': { fontSize: '1.05em', fontWeight: '700' },
  '.cm-dm-h5': { fontWeight: '700' },
  '.cm-dm-h6': { fontWeight: '700', opacity: '0.8' },

  '.cm-dm-bullet': { color: 'var(--tome-gold)', fontWeight: '700' },

  // Blockquote: a gold bar down the line, standing in for the hidden `>`, and
  // Alegreya italic — the renderer sets read-aloud text in a serif too.
  '.cm-dm-quote': {
    borderLeft: '3px solid var(--tome-gold)',
    paddingLeft: '0.75ch',
    fontFamily: 'var(--font-serif)',
    fontStyle: 'italic',
    fontSize: '1.05em',
    color: 'var(--tome-soft)',
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
    color: 'var(--tome-head)',
    textDecorationColor: 'var(--tome-gold)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  '&.cm-dm-mod .cm-dm-wikilink:hover': {
    cursor: 'pointer',
    textDecorationThickness: '2px',
    backgroundColor: 'color-mix(in oklab, var(--tome-gold) 22%, transparent)',
    borderRadius: '2px',
  },

  // --- Dice chips ----------------------------------------------------------
  // Mirrors `.dnd-page .dnd-dice` shape-for-shape — same weight, radius,
  // padding and gold hairline — but through the tome tokens, so the chip a
  // player sees on the parchment page and the one the DM clicks here are
  // recognisably the same object in either theme.
  // NOT Cinzel: it is a small-caps face with no true lowercase, so `1d4` renders
  // as `ID4` — the `d` is notation, not a word, and the digit 1 collapses into
  // an I. The chip keeps the editor's own font and earns its identity from the
  // gold hairline instead.
  '.cm-dm-dice': {
    fontFamily: 'inherit',
    fontSize: '0.92em',
    fontWeight: '700',
    color: 'var(--tome-head)',
    backgroundColor: 'color-mix(in oklab, var(--tome-gold) 14%, transparent)',
    border: '1px solid var(--tome-gold)',
    borderRadius: '4px',
    padding: '0 0.35em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  '.cm-dm-dice:hover': {
    backgroundColor: 'color-mix(in oklab, var(--tome-gold) 30%, transparent)',
  },

  // --- Page-break rule -----------------------------------------------------
  // The one place the editor shows a structural mark rather than prose, so it
  // gets the gold rule's voice: Cinzel small caps over a gold dashed line.
  '.cm-dm-pagerule': {
    display: 'inline-flex',
    alignItems: 'center',
    width: '100%',
    fontFamily: 'var(--font-display)',
    color: 'var(--tome-soft)',
    fontSize: '0.72em',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.18em',
    borderTop: '2px dashed var(--tome-gold)',
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
  // Colour and weight, but not Cinzel — a header cell is user text that has to
  // stay column-aligned with the monospace rows beneath it, and the small-caps
  // face breaks both the alignment and any lowercase in it.
  '.cm-dm-table-head': {
    fontWeight: '700',
    color: 'var(--tome-head)',
    backgroundColor: 'color-mix(in oklab, var(--tome-gold) 22%, transparent)',
  },
  '.cm-dm-table-row': {
    backgroundColor: 'color-mix(in oklab, var(--tome-gold) 8%, transparent)',
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

  // --- [[ ]] autocomplete --------------------------------------------------
  // CodeMirror's default completion panel is hard-coded light, so it is
  // unreadable in dark mode. Restated against the app's tokens like everything
  // else here.
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius, 6px)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'inherit',
    maxHeight: '16rem',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '0.25rem 0.6rem',
    lineHeight: '1.5',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
  // The folder an article lives in, shown after the title.
  '.cm-completionDetail': {
    marginLeft: '0.75ch',
    fontStyle: 'normal',
    opacity: '0.6',
    fontSize: '0.85em',
  },
})
