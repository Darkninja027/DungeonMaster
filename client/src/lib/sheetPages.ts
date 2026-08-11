import { sortedFeatures, sortedSpells } from './character'
import type {
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
 * What one row costs against a page budget, counted in half-rows because the
 * list runs two columns. A spell fills one cell; a level heading spans both
 * columns and so consumes a whole visual row. Getting this wrong clips spells
 * silently, which is the whole reason pagination lives here.
 */
function spellCost(row: SpellRow): number {
  return row.kind === 'cap' ? 2 : 1
}

/**
 * Paginate spell rows, moving a page-trailing level heading to the next page
 * so it always sits with at least one of its spells.
 *
 * A heading also has to start a fresh grid row, so an odd number of spells
 * before it leaves one empty cell — charged here so the page can't overflow.
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
    // A heading starts a new grid row, so pad out any half-filled one first.
    const pad = row.kind === 'cap' && used % 2 === 1 ? 1 : 0
    const cost = pad + spellCost(row)
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
