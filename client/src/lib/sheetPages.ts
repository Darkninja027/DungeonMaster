import { sortedFeatures, sortedSpells } from './character'
import type { SpellCard } from './spellCard'
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

/**
 * What a block of authored text costs, in lines of `charsPerLine`.
 *
 * Authored newlines render as hard breaks, so each one takes at least a line of
 * its own however short — cost the lines separately rather than dividing the
 * whole length, which would under-count a list. A blank line (a paragraph
 * break) costs less than a full line of text.
 *
 * `[[wiki link]]` syntax is measured at its rendered width: the brackets and
 * any `|alias` half don't print, and costing the raw source over-counts every
 * line that has one and strands white space.
 *
 * Shared by all three cost functions below. It was three copies of this
 * reducer, and they had already drifted — features costed the raw length while
 * notes costed the rendered one.
 */
function textCost(text: string, charsPerLine: number): number {
  if (!text) return 0
  return text
    .split('\n')
    .reduce(
      (sum, line) =>
        sum +
        (line.trim() === ''
          ? 0.3
          : Math.max(1, Math.ceil(renderedLength(line) / charsPerLine))),
      0,
    )
}

export function featureCost(row: FeatureRow): number {
  if (row.kind === 'cap') return CAP_COST
  const text = (row.kind === 'entry' ? row.entry.text : row.feature.text) ?? ''
  return NAME_COST + textCost(text, CHARS_PER_LINE) + GAP_COST
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
 * What a line of source actually occupies once rendered. Recaps and spell
 * descriptions are dense with `[[wiki links]]`, and the brackets (plus any
 * `|alias` half) don't print. Bullet markers don't print as characters either,
 * but the marker column and hanging indent do cost width, so they're left in.
 */
function renderedLength(line: string): number {
  return line.replace(/\[\[([^\][\n|]+)(?:\|([^\][\n]+))?\]\]/g, (_, t, a) =>
    String(a ?? t),
  ).length
}

export function noteCost(note: CharacterNote): number {
  return (
    NOTE_TITLE_COST +
    NOTE_META_COST +
    textCost(note.text, NOTE_CHARS_PER_LINE) +
    NOTE_CARD_COST
  )
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

/**
 * A spell card costs its description plus fixed chrome: the Cinzel name, the
 * "Level 3 evocation" line, one line per stat row, and the border, padding,
 * hairlines and the gap to the next card.
 *
 * Same line-units as featureCost — one line of 11px Alegreya. The cards run
 * TWO columns like the features page, so CHARS_PER_LINE's 64 is the right
 * width, not noteCost's one-column 126.
 */
const CARD_NAME_COST = 1.1
/** The "Level 3 evocation" subtitle under the name. */
const CARD_SUBTITLE_COST = 1
/**
 * Border, padding, the two hairlines around the stat block, and the margin to
 * the next card. Heavier than a note's 1.9 because a card has the extra pair of
 * rules inside it.
 */
const CARD_CHROME_COST = 2.2

/**
 * A stat row is normally one compact line, but it can wrap: Symbol's Components
 * value runs 138 characters, which is three lines, not one. Material components
 * are exactly the field that runs long and they cluster on the densest
 * high-level cards, so charging every row a flat 1 under-counts the worst pages
 * — which is how a sheet clips silently.
 *
 * Only the value wraps. The label sits in its own fixed 74px rail and is
 * `white-space: nowrap`, so it is always exactly one line however long it is;
 * what's left for the value is the column minus that rail, measured at ~48
 * characters of 10px Alegreya.
 */
const STAT_VALUE_CHARS_PER_LINE = 48

function statRowCost(stat: SpellStatLike): number {
  return Math.max(1, Math.ceil(stat.value.length / STAT_VALUE_CHARS_PER_LINE))
}

/** The shape statRowCost needs, so the helper doesn't drag in the whole type. */
type SpellStatLike = { label: string; value: string }

export function spellCardCost(card: SpellCard): number {
  const statLines = card.stats.reduce((sum, s) => sum + statRowCost(s), 0)
  return (
    CARD_NAME_COST +
    CARD_SUBTITLE_COST +
    statLines +
    textCost(card.description, CHARS_PER_LINE) +
    CARD_CHROME_COST
  )
}

/**
 * What one spell-card page holds, in line-units.
 *
 * Lives here rather than beside FEATURE_LINES and NOTE_LINES in SheetPreview,
 * which is a deliberate asymmetry: this is the only page budget a unit test
 * needs, and hardcoding it in sheetPages.test.ts is what let it drift from the
 * renderer once already. Importing SheetPreview from a lib test would drag in
 * the whole component tree. The other two stay put until something needs them.
 *
 * Measured in the running app, not derived. Two full pages of real cards were
 * costed against their rendered heights and came to 13.40 and 13.65 px per
 * line-unit — so a page's 2 x 868px of column holds about 129, and this is held
 * a little under that for the one error the cost model still has: a description
 * that is one long unbroken paragraph costs slightly less than it renders.
 *
 * It does NOT also carry a margin for the space an atomic card strands when it
 * won't fit the rest of a column. That was the obvious thing to do and it is
 * wrong: the waste is per-column, so shrinking a per-page number just moves
 * where a card lands. Simulated across the 987-article corpus, clipping was
 * flat from 126 down to 110. paginateSpellCards packs by column instead, which
 * removes the waste rather than paying for it — and therefore lets this stay at
 * the true capacity.
 *
 * Verified end to end at this value: every card page reports overflowX = 0,
 * overflowY = 0 and no card below its column bottom.
 *
 * Re-measure in the running app after touching this or spellCardCost.
 * .dnd-cs-2col clips silently: column-fill: auto overflows to the RIGHT, and an
 * over-tall atomic card overflows DOWNWARD — useColumnOverflowWarning checks
 * both in dev.
 */
export const SPELL_CARD_LINES = 126

/**
 * Whether a card is taller than a single column and so must be allowed to break
 * across one.
 *
 * A page is two columns, so one column is half the budget — derived rather than
 * a second constant, which keeps the two in lockstep and leaves only one number
 * to re-measure.
 *
 * This is the escape hatch for `.dnd-cs-spellcard-tall`, and it is deliberately
 * narrow. Across the 987 bundled spell articles only ~24 (2.4%) exceed a column,
 * and they are a recognisable cluster rather than one-offs — the Summon X family
 * (Summon Fiend costs 82) plus Prismatic Wall — because their stat blocks carry
 * whole tables. Every other card stays atomic, which is the point: a card split
 * at a column seam reads as two broken half-cards.
 */
export function isTallSpellCard(card: SpellCard, budget: number): boolean {
  return spellCardCost(card) > budget / 2
}

/** A spell-card page is two columns; the cards fill one before starting the next. */
const CARD_COLUMNS = 2

/**
 * Pack spell cards into pages of at most `budget` line-units.
 *
 * Modelled on paginateNotes rather than paginateSpellRows: cards are
 * variable-height, and there are no heading rows to orphan because each card
 * carries its own "Level 3 evocation" line — a level cap above them would say
 * the same thing twice.
 *
 * Unlike every other paginator here, this one tracks **columns rather than a
 * flat page total**, and that is load-bearing rather than fussy. Cards are
 * atomic (see .dnd-cs-spellcard in styles.css), so one that doesn't fit the
 * space left in a column is pushed whole into the next and strands the
 * remainder. A flat page budget cannot see that: it happily packs 121 units
 * into a 130-unit page, then the first column strands 22px and the last card
 * is clipped off the bottom of the second. Measured in the running app —
 * Prestidigitation lost its final bullet exactly this way.
 *
 * Lowering the page budget does not fix it, which is the part worth
 * remembering. Simulated over the 987-article corpus, clipping stayed flat
 * from 126 all the way down to 110 because the waste is per-column and a
 * smaller page just reshuffles where a card lands. Packing per column removes
 * it completely and uses *fewer* pages than a lowered flat budget (4.70 vs
 * 5.02 sheets per 20 spells), because the space it reclaims is real rather
 * than bought with margin.
 *
 * A card taller than one column (isTallSpellCard — ~2.4% of the corpus) is
 * allowed to break, so it is charged across as many columns as it spans rather
 * than forced to start a fresh one.
 *
 * A card longer than a whole page still gets its own page. Splitting one
 * spell's rules text across two sheets is worse than one clipped tail, and a
 * clip at a page edge is at least visible — whereas half of Symbol's glyph
 * effects vanishing mid-box would look complete.
 */
export function paginateSpellCards(
  cards: Array<SpellCard>,
  budget: number,
): Array<Array<SpellCard>> {
  if (cards.length === 0) return []
  if (budget <= 0) return [cards]

  const column = budget / CARD_COLUMNS
  const pages: Array<Array<SpellCard>> = []
  let page: Array<SpellCard> = []
  // How far down the page we are, counting a part-used column as full up to
  // its own start — so `used` is always measured from the top of the page.
  let used = 0
  let columns = 1

  const flush = () => {
    if (page.length > 0) pages.push(page)
    page = []
    used = 0
    columns = 1
  }

  for (const card of cards) {
    const cost = spellCardCost(card)

    if (cost > column) {
      // A breaking card: it flows across the seam, so it needs `cost` of
      // contiguous room from where it starts rather than a whole free column.
      const spans = Math.ceil((used + cost) / column)
      if (page.length > 0 && spans > CARD_COLUMNS) flush()
      page.push(card)
      used += cost
      columns = Math.min(CARD_COLUMNS, Math.ceil(used / column))
      if (used >= budget) flush()
      continue
    }

    if (used + cost > column * columns) {
      // Doesn't fit the rest of this column: it moves to the next one whole,
      // and the space behind it is gone. Charging for that is the whole point.
      if (columns >= CARD_COLUMNS) {
        flush()
      } else {
        columns++
        used = column * (columns - 1)
      }
    }
    page.push(card)
    used += cost
  }
  flush()
  return pages
}
