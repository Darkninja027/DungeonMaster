import { describe, expect, it } from 'vitest'
import { excludedRanges, isExcluded, wordAt, wordsIn } from './text'

describe('wordAt', () => {
  const text = 'The grate wizzard of Barovia.'

  it('finds the word around an offset inside it', () => {
    expect(wordAt(text, 12)).toEqual({ word: 'wizzard', start: 10, end: 17 })
  })

  it('counts the offset just past the last letter as on the word', () => {
    expect(wordAt(text, 17)?.word).toBe('wizzard')
  })

  it('returns offsets that slice back to the word', () => {
    const span = wordAt(text, 24)!
    expect(text.slice(span.start, span.end)).toBe(span.word)
    expect(span.word).toBe('Barovia')
  })

  it('returns null between words', () => {
    expect(wordAt('a  b', 2)).toBeNull()
  })

  it('keeps inner apostrophes and trims outer ones', () => {
    expect(wordAt("don't", 1)?.word).toBe("don't")
    const quoted = "say 'helo' now"
    const span = wordAt(quoted, 7)!
    expect(span.word).toBe('helo')
    expect(quoted.slice(span.start, span.end)).toBe('helo')
  })

  it('handles accented and curly-apostrophe names', () => {
    expect(wordAt('Ka’zhal Ñoño', 2)?.word).toBe('Ka’zhal')
    expect(wordAt('Ka’zhal Ñoño', 10)?.word).toBe('Ñoño')
  })

  it('refuses tokens with digits, so dice are never "corrected"', () => {
    expect(wordAt('roll d100 now', 6)).toBeNull()
    expect(wordAt('2d6', 1)).toBeNull()
  })

  it('returns null for out-of-range offsets', () => {
    expect(wordAt('abc', -1)).toBeNull()
    expect(wordAt('abc', 4)).toBeNull()
  })
})

/** The excluded text itself, which reads far better in a failure than offsets. */
const excludedText = (text: string) =>
  excludedRanges(text).map(([from, to]) => text.slice(from, to))

describe('excludedRanges', () => {
  it('excludes frontmatter through its closing fence', () => {
    const text = '---\nrace: Tiefling\n---\nBody text'
    expect(excludedText(text)).toEqual(['---\nrace: Tiefling\n---\n'])
  })

  it('leaves a lone leading --- alone (a divider, not frontmatter)', () => {
    expect(excludedRanges('---\nno closing fence')).toEqual([])
  })

  it('excludes fenced code, fences included', () => {
    const text = 'before\n```js\nconst zxq = 1\n```\nafter'
    expect(excludedText(text)).toEqual(['```js\nconst zxq = 1\n```'])
  })

  it('runs an unclosed fence to the end of the document', () => {
    const text = 'prose\n~~~\nzxq'
    expect(excludedText(text)).toEqual(['~~~\nzxq'])
  })

  it('excludes inline code, wiki links, link targets, URLs and tags', () => {
    const text =
      'Use `zxq` with [[Strahd von Zarovich]], [the map](_images/Barvia.png), https://exmple.com and <span class="zz">'
    expect(excludedText(text)).toEqual([
      '`zxq`',
      '[[Strahd von Zarovich]]',
      '](_images/Barvia.png)',
      'https://exmple.com',
      '<span class="zz">',
    ])
  })

  it('excludes layout marker lines whole', () => {
    const text = 'a\n\\page\n\\columns 2\n:::wrap\nb'
    expect(excludedText(text)).toEqual(['\\page', '\\columns 2', ':::wrap'])
  })

  it('returns sorted, merged ranges', () => {
    const ranges = excludedRanges('`a``b` [[c]]')
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i][0]).toBeGreaterThan(ranges[i - 1][1])
    }
  })
})

describe('isExcluded', () => {
  const ranges = [
    [2, 5],
    [10, 12],
  ] as const
  it('is half-open', () => {
    expect(isExcluded(ranges, 1)).toBe(false)
    expect(isExcluded(ranges, 2)).toBe(true)
    expect(isExcluded(ranges, 4)).toBe(true)
    expect(isExcluded(ranges, 5)).toBe(false)
    expect(isExcluded(ranges, 11)).toBe(true)
    expect(isExcluded(ranges, 12)).toBe(false)
  })
  it('handles no ranges', () => {
    expect(isExcluded([], 0)).toBe(false)
  })
})

describe('wordsIn', () => {
  it('lists prose words and skips excluded ones', () => {
    const text = 'The wizzard met [[Strahdd]] and `zzq` rolled 2d6.'
    const words = wordsIn(text, excludedRanges(text)).map((w) => w.word)
    expect(words).toEqual(['The', 'wizzard', 'met', 'and', 'rolled'])
  })

  it('reads a word cut by the window edge whole', () => {
    const text = 'alpha bravo charlie'
    // A window starting mid-"bravo" must not yield "avo".
    expect(wordsIn(text, [], 8, 11).map((w) => w.word)).toEqual(['bravo'])
  })

  it('returns offsets into the full text', () => {
    const text = 'xx yy zz'
    const [span] = wordsIn(text, [], 3, 5)
    expect(text.slice(span.start, span.end)).toBe('yy')
  })
})
