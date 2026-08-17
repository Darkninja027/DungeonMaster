/**
 * Scanning for the syntax markdown itself doesn't know about: `[[wiki links]]`
 * and dice notation. Lezer has no nodes for either, so the decorator finds them
 * with the same regexes lib/formatMarkdown.ts uses to render them — importing
 * the grammar rather than restating it, so the editor can't chip something the
 * renderer wouldn't linkify.
 *
 * Pure and DOM-free: `isCode` is injected, so this is testable in plain node.
 * In the plugin that predicate is answered by the syntax tree.
 */

import {
  DICE_NOTATION,
  NAMED_ROLL_SOURCE,
  WIKI_LINK_SOURCE,
} from '#/lib/formatMarkdown'

export interface CustomMatch {
  /** Absolute document offsets of the whole construct. */
  from: number
  to: number
  kind: 'wiki' | 'dice'
  /** Wiki: the article title. Dice: the notation to roll. */
  value: string
  /** Wiki: the shown label, which differs from `value` for [[Title|label]]. */
  label?: string
  /** Wiki: offsets of the label text, i.e. what survives when brackets hide. */
  labelFrom?: number
  labelTo?: number
}

/*
 * Fresh RegExp objects per scan rather than module-level singletons: these are
 * `g`-flagged, so a shared instance carries `lastIndex` between calls and drops
 * every other match. Constructing them is cheap next to the tree walk.
 */
const wikiLinkRe = () => new RegExp(WIKI_LINK_SOURCE, 'g')
const namedRollRe = () => new RegExp(NAMED_ROLL_SOURCE, 'g')
// Bare notation, with the same guards linkifyDice uses: not preceded by a word
// character, `/` or `[` (so it skips the inside of a named roll link and things
// like dates), and not followed by a word character.
const bareDiceRe = () =>
  new RegExp(String.raw`(?<![\w/[])(${DICE_NOTATION})(?!\w)`, 'g')

/**
 * Finds every custom construct on one line, in ascending order.
 *
 * `lineStart` is the line's absolute document offset; all returned offsets are
 * absolute, ready to hand to a decoration builder.
 *
 * `isCode(pos)` takes an ABSOLUTE offset and reports whether it sits inside a
 * code span or fence. formatMarkdown.linkifyDice solves the same problem by
 * splitting the string on code spans and only transforming the even-index
 * segments; here the caller has a parse tree that already knows where code is,
 * which is both cheaper and exact about nesting the regex can't see.
 */
export function scanLine(
  text: string,
  lineStart: number,
  isCode: (pos: number) => boolean,
): Array<CustomMatch> {
  const found: Array<CustomMatch> = []
  // Offsets already claimed, so a named roll's label can't also be chipped as
  // bare notation — [Short Sword](2d6+3) is one chip, not two.
  const taken: Array<{ from: number; to: number }> = []
  const overlaps = (from: number, to: number) =>
    taken.some((t) => t.from < to && t.to > from)

  const wiki = wikiLinkRe()
  for (let m = wiki.exec(text); m; m = wiki.exec(text)) {
    const from = lineStart + m.index
    if (isCode(from)) continue
    const title = m[1].trim()
    // Group 2 is the optional `|label`; the regex type says string but it is
    // genuinely absent for an unpiped [[Title]].
    const label = (m[2] || m[1]).trim()
    // The label is the second capture when piped, else the first. Locate it in
    // the match so the brackets (and the `Title|` part) can be hidden while the
    // shown text survives.
    const labelOffset = m[0].lastIndexOf(label)
    found.push({
      from,
      to: from + m[0].length,
      kind: 'wiki',
      value: title,
      label,
      labelFrom: from + labelOffset,
      labelTo: from + labelOffset + label.length,
    })
    taken.push({ from, to: from + m[0].length })
  }

  // Named rolls first: they contain bare notation that must not be chipped
  // separately. Only the notation itself becomes the chip, keeping the label.
  const named = namedRollRe()
  for (let m = named.exec(text); m; m = named.exec(text)) {
    const from = lineStart + m.index
    if (isCode(from) || overlaps(from, from + m[0].length)) continue
    found.push({
      from,
      to: from + m[0].length,
      kind: 'dice',
      value: m[2],
      label: m[1].replace(/#hidename\s*$/i, '').trim() || undefined,
    })
    taken.push({ from, to: from + m[0].length })
  }

  const bare = bareDiceRe()
  for (let m = bare.exec(text); m; m = bare.exec(text)) {
    const from = lineStart + m.index
    const to = from + m[0].length
    if (isCode(from) || overlaps(from, to)) continue
    found.push({ from, to, kind: 'dice', value: m[1] })
    taken.push({ from, to })
  }

  return found.sort((a, b) => a.from - b.from)
}
