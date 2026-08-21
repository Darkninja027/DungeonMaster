import { sortedFeatures, sortedSpells } from './character'
import type {
  CharacterNote,
  ClassFeature,
  Feat,
  NamedEntry,
  RacialTrait,
  Spell,
} from './character'

/**
 * Pagination for the parchment character sheet. The sheets are fixed-height
 * `.dnd-page` boxes with `overflow: hidden`, so anything that doesn't fit is
 * clipped *silently* — a 25-spell wizard would just lose spells with no error.
 * Chunking the lists here instead of leaning on CSS keeps that impossible, and
 * because it is pure layout it comes out identical in the PDF export.
 */

/** One row of the spell list: either a level heading or a spell. */
export type SpellRow =
  { kind: 'cap'; level: number } | { kind: 'spell'; spell: Spell }

/**
 * Split a list into fixed-capacity pages. `first` may be smaller than `rest`
 * because the opening page shares its height with header strips.
 *
 * An empty list yields no pages at all (not one blank page), so callers can
 * map over the result to decide how many sheets to render.
 */
export function paginate<T>(
  items: Array<T>,
  first: number,
  rest: number,
): Array<Array<T>> {
  if (items.length === 0) return []
  // A non-positive capacity would loop forever; one page holding everything is
  // the least-bad answer, and it clips visibly rather than hanging the app.
  if (first <= 0 || rest <= 0) return [items]

  const pages: Array<Array<T>> = []
  let i = 0
  while (i < items.length) {
    const take = pages.length === 0 ? first : rest
    pages.push(items.slice(i, i + take))
    i += take
  }
  return pages
}

/**
 * Flatten spells into display rows with a heading before each level change, so
 * a heading costs a row in the page budget like anything else.
 *
 * A heading is never left as the last row of a page: that orphan ("3rd Level"
 * alone at the bottom, its spells overleaf) is the classic pagination bug, so
 * `paginateSpellRows` pushes it to the next page instead.
 */
export function spellRows(spells: Array<Spell>): Array<SpellRow> {
  const rows: Array<SpellRow> = []
  let level: number | null = null
  for (const spell of sortedSpells(spells)) {
    if (spell.level !== level) {
      level = spell.level
      rows.push({ kind: 'cap', level })
    }
    rows.push({ kind: 'spell', spell })
  }
  return rows
}

/**
 * One row of the features page: a heading, or an entry. Traits, feats and
 * class features share the page, so they share the row type — a `cap` with no
 * level is a plain section heading ("Racial Traits", "Feats").
 */
export type FeatureRow =
  | { kind: 'cap'; level: number | null; label?: string }
  | { kind: 'feature'; feature: ClassFeature }
  | { kind: 'entry'; entry: NamedEntry }

/**
 * Flatten racial traits, then feats, then class features into display rows.
 * The first two are flat lists under one heading each (nothing about them is
 * levelled); features follow with a heading per level.
 */
export function featureRows(
  features: Array<ClassFeature>,
  traits: Array<RacialTrait> = [],
  feats: Array<Feat> = [],
): Array<FeatureRow> {
  const rows: Array<FeatureRow> = []
  const flatSection = (label: string, entries: Array<NamedEntry>) => {
    if (entries.length === 0) return
    rows.push({ kind: 'cap', level: null, label })
    for (const entry of entries) rows.push({ kind: 'entry', entry })
  }
  flatSection('Racial Traits', traits)
  flatSection('Feats', feats)

  let level: number | null = null
  for (const feature of sortedFeatures(features)) {
    if (feature.level !== level) {
      level = feature.level
      rows.push({ kind: 'cap', level })
    }
    rows.push({ kind: 'feature', feature })
  }
  return rows
}

/**
 * Features are variable-height — a bare name is one line, a paragraph of rules
 * text is several — so they can't be paginated by a flat row count like spells
 * can. Each row is costed in text lines instead and packed to a budget.
 *
 * The constants are measured from the rendered sheet (11px Alegreya justified
 * in a ~337px column), not guessed: a sample of eleven real descriptions
 * averaged 64 characters per line. Under-counting clips silently; over-
 * counting strands half a page of white space, which is what a previous
 * value of 46 did.
 */
const CHARS_PER_LINE = 64
/** A level/section heading: its own line plus the rule above it. */
const CAP_COST = 1.6
/** The Cinzel title line above a description. */
const NAME_COST = 1.1
/** The gap below each entry block. */
const GAP_COST = 0.5

export function featureCost(row: FeatureRow): number {
  if (row.kind === 'cap') return CAP_COST
  const text = (row.kind === 'entry' ? row.entry.text : row.feature.text) ?? ''
  // Authored newlines render as hard breaks, so each one takes at least a
  // line of its own however short — cost the lines separately rather than
  // dividing the whole length, which would under-count a list. A blank line
  // (paragraph break) costs less than a full line of text.
  const textLines = text
    ? text
        .split('\n')
        .reduce(
          (sum, line) =>
            sum +
            (line.trim() === ''
              ? 0.3
              : Math.max(1, Math.ceil(line.length / CHARS_PER_LINE))),
          0,
        )
    : 0
  return NAME_COST + textLines + GAP_COST
}

/**
 * Pack costed rows into pages of at most `budget` line-units, never leaving a
 * level heading stranded at the foot of a page. A single row costing more than
 * the budget still gets its own page rather than looping forever.
 */
export function paginateFeatureRows(
  rows: Array<FeatureRow>,
  first: number,
  rest: number,
): Array<Array<FeatureRow>> {
  if (rows.length === 0) return []
  if (first <= 0 || rest <= 0) return [rows]

  const pages: Array<Array<FeatureRow>> = []
  let page: Array<FeatureRow> = []
  let used = 0

  for (const row of rows) {
    const budget = pages.length === 0 ? first : rest
    const cost = featureCost(row)
    if (page.length > 0 && used + cost > budget) {
      // A heading that would end a page belongs with its features overleaf.
      const last = page[page.length - 1]
      if (last.kind === 'cap') {
        page.pop()
        pages.push(page)
        page = [last, row]
        used = featureCost(last) + cost
        continue
      }
      pages.push(page)
      page = [row]
      used = cost
      continue
    }
    page.push(row)
    used += cost
  }
  if (page.length > 0) pages.push(page)
  return pages
}

/**
 * A session note costs its body's lines plus the card around it: the Cinzel
 * title, the date/tags line, the border and padding, and the gap to the next
 * card. Same units as featureCost — one line of 11px body text.
 *
 * Notes are the most variable-height thing on the sheet (a one-liner or a
 * twenty-point recap of a whole evening), so they need the costed packing that
 * features get rather than a fixed-height box, which clips mid-sentence.
 */
const NOTE_TITLE_COST = 1.1
const NOTE_META_COST = 1
/** Border, padding and the margin to the next card, in line-units. */
const NOTE_CARD_COST = 1.9
/**
 * Notes run one full-width column, not the features page's two, so a line holds
 * far more than CHARS_PER_LINE's 64. Measured from the rendered card: 688px of
 * text at 11px Alegreya runs ~134 characters; 126 leaves a margin for the
 * estimate's error without stranding half a page.
 */
const NOTE_CHARS_PER_LINE = 126

/**
 * What a line of note source actually occupies once rendered. Recaps are dense
 * with `[[wiki links]]`, and the brackets (plus any `|alias` half) don't print —
 * costing the raw source over-counts every line and strands white space. Bullet
 * markers don't print as characters either, but the marker column and hanging
 * indent do cost width, so they're left in.
 */
function renderedLength(line: string): number {
  return line.replace(/\[\[([^\][\n|]+)(?:\|([^\][\n]+))?\]\]/g, (_, t, a) =>
    String(a ?? t),
  ).length
}

export function noteCost(note: CharacterNote): number {
  const text = note.text ?? ''
  // Authored newlines render as hard breaks, so cost each line separately
  // rather than dividing the total length — the same reasoning as featureCost,
  // and it matters more here because recaps are usually one line per beat.
  const textLines = text
    ? text
        .split('\n')
        .reduce(
          (sum, line) =>
            sum +
            (line.trim() === ''
              ? 0.3
              : Math.max(
                  1,
                  Math.ceil(renderedLength(line) / NOTE_CHARS_PER_LINE),
                )),
          0,
        )
    : 0
  return NOTE_TITLE_COST + NOTE_META_COST + textLines + NOTE_CARD_COST
}

/**
 * Pack notes into pages of at most `budget` line-units. A single note longer
 * than a whole page still gets its own page — it will clip, but splitting a
 * recap mid-sentence across sheets would be worse, and it clips visibly at a
 * page edge rather than inside a box that looks complete.
 */
export function paginateNotes(
  notes: Array<CharacterNote>,
  budget: number,
): Array<Array<CharacterNote>> {
  if (notes.length === 0) return []
  if (budget <= 0) return [notes]

  const pages: Array<Array<CharacterNote>> = []
  let page: Array<CharacterNote> = []
  let used = 0

  for (const note of notes) {
    const cost = noteCost(note)
    if (page.length > 0 && used + cost > budget) {
      pages.push(page)
      page = [note]
      used = cost
      continue
    }
    page.push(note)
    used += cost
  }
  if (page.length > 0) pages.push(page)
  return pages
}

/**
 * What one row costs against a page budget, counted in rows-per-column-pair:
 * both a spell (24px) and a level heading (~22px with its rule and gap) take
 * one slot in a column now that the list fills sequentially rather than
 * spanning a grid. Getting this wrong clips spells silently, which is the
 * whole reason pagination lives here.
 */
function spellCost(_row: SpellRow): number {
  return 1
}

/**
 * Paginate spell rows, moving a page-trailing level heading to the next page
 * so it always sits with at least one of its spells.
 *
 * The page fills down the left column and then the right, so a heading is an
 * ordinary in-column row now. It used to span a two-column grid and force a
 * fresh row, which cost an empty cell after an odd number of spells; that
 * padding is gone with the grid.
 */
export function paginateSpellRows(
  rows: Array<SpellRow>,
  first: number,
  rest: number,
): Array<Array<SpellRow>> {
  if (rows.length === 0) return []
  if (first <= 0 || rest <= 0) return [rows]

  const pages: Array<Array<SpellRow>> = []
  let page: Array<SpellRow> = []
  let used = 0

  for (const row of rows) {
    const budget = pages.length === 0 ? first : rest
    const cost = spellCost(row)
    if (page.length > 0 && used + cost > budget) {
      // A heading that would end a page belongs with its spells overleaf.
      const last = page[page.length - 1]
      if (last.kind === 'cap') {
        page.pop()
        pages.push(page)
        page = [last, row]
        used = spellCost(last) + spellCost(row)
        continue
      }
      pages.push(page)
      page = [row]
      used = spellCost(row)
      continue
    }
    page.push(row)
    used += cost
  }
  if (page.length > 0) pages.push(page)
  return pages
}
