import { describe, expect, it } from 'vitest'
import { scanLine } from './customSyntax'
import { linkifyDice } from '#/lib/formatMarkdown'

/** Nothing is code — the common case. */
const noCode = () => false

describe('scanLine — wiki links', () => {
  it('finds a plain wiki link', () => {
    const [m] = scanLine('see [[Strahd]] tonight', 0, noCode)
    expect(m).toMatchObject({ kind: 'wiki', value: 'Strahd', label: 'Strahd' })
    expect(m.from).toBe(4)
    expect(m.to).toBe(14)
  })

  it('finds the label span of a piped link', () => {
    // "[[Strahd|the count]]" — the brackets and "Strahd|" hide, "the count"
    // stays visible, so the label offsets must point at just that run.
    const [m] = scanLine('[[Strahd|the count]]', 0, noCode)
    expect(m.value).toBe('Strahd')
    expect(m.label).toBe('the count')
    expect('[[Strahd|the count]]'.slice(m.labelFrom, m.labelTo)).toBe(
      'the count',
    )
  })

  it('offsets are absolute, not line-relative', () => {
    const [m] = scanLine('[[Strahd]]', 100, noCode)
    expect(m.from).toBe(100)
    expect(m.to).toBe(110)
  })

  it('finds several links on one line, in order', () => {
    const found = scanLine('[[A]] and [[B]]', 0, noCode)
    expect(found.map((m) => m.value)).toEqual(['A', 'B'])
  })
})

describe('scanLine — dice', () => {
  it('finds bare notation', () => {
    const found = scanLine('deals 2d6+3 damage', 0, noCode)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'dice', value: '2d6+3' })
  })

  it('finds a named roll as one match, keeping its label', () => {
    // The inner 1d20+5 must NOT also come back as a bare match, or the chip
    // would be rendered twice over the same text.
    const found = scanLine('[Short Sword](1d20+5)', 0, noCode)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      kind: 'dice',
      value: '1d20+5',
      label: 'Short Sword',
    })
  })

  it('strips #hidename from a label', () => {
    const [m] = scanLine('[Sneak Attack #hidename](3d6)', 0, noCode)
    expect(m.label).toBe('Sneak Attack')
    expect(m.value).toBe('3d6')
  })

  it('skips dice inside a code span', () => {
    // `isCode` stands in for the parse-tree query the plugin uses.
    const text = 'roll `2d6` but 1d20 counts'
    const inBackticks = (p: number) => p >= 5 && p <= 9
    const found = scanLine(text, 0, inBackticks)
    expect(found.map((m) => m.value)).toEqual(['1d20'])
  })

  it('does not treat a word ending in dice-like text as a roll', () => {
    expect(scanLine('the wizard3d6 thing', 0, noCode)).toHaveLength(0)
  })
})

describe('scanLine — ordering', () => {
  it('returns matches in ascending order regardless of kind', () => {
    // RangeSetBuilder requires sorted input, and the three passes run in
    // kind order, not document order — so the sort matters.
    const found = scanLine('2d6 then [[Link]] then 1d4', 0, noCode)
    expect(found.map((m) => m.from)).toEqual([0, 9, 23])
  })
})

describe('agreement with the renderer', () => {
  /** Every notation linkifyDice would turn into a dice: link. */
  function rendererDice(text: string): Array<string> {
    return [...linkifyDice(text).matchAll(/\(dice:([^)]+)\)/g)].map((m) =>
      decodeURIComponent(m[1]),
    )
  }

  // formatMarkdown decides what the RENDERER treats as dice; customSyntax
  // decides what the EDITOR shows as a chip. If they disagree, live preview
  // lies about what the article will look like.
  it.each([
    'deals 2d6+3 damage',
    '[Short Sword](1d20+5) swings',
    'd20 alone',
    'roll 3d6 and 1d4-1',
    'no dice here at all',
    '2d6 then more 1d8 text',
  ])('agrees with linkifyDice on %j', (text) => {
    const mine = scanLine(text, 0, noCode)
      .filter((m) => m.kind === 'dice')
      .map((m) => m.value)
    expect(mine).toEqual(rendererDice(text))
  })
})
