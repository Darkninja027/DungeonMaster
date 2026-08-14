import { describe, expect, it } from 'vitest'
import { activeHeadingAt, parseHeadings, sheetIndexForOffset } from './toc'

/**
 * The outline's DOM half — scrolling the textarea to a caret offset, scrolling
 * the preview to a sheet, reading offsetLeft — needs a live layout and can't be
 * checked here. What is testable is everything that decides *where* to go: the
 * source parse, the active-heading lookup, and the sheet arithmetic.
 */
describe('parseHeadings', () => {
  it('reads every ATX level', () => {
    const headings = parseHeadings(
      [
        '# one',
        '## two',
        '### three',
        '#### four',
        '##### five',
        '###### six',
      ].join('\n'),
    )
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6])
    expect(headings.map((h) => h.text)).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
    ])
  })

  it('rejects seven hashes, and a hash with no space', () => {
    expect(parseHeadings('####### nope')).toEqual([])
    expect(parseHeadings('#nope')).toEqual([])
  })

  it('reads a bare # as an empty h1', () => {
    const [heading] = parseHeadings('#')
    expect(heading.level).toBe(1)
    expect(heading.text).toBe('')
  })

  it('strips a closing hash sequence', () => {
    expect(parseHeadings('## Title ##')[0].text).toBe('Title')
  })

  it('returns nothing for empty or heading-free input', () => {
    expect(parseHeadings('')).toEqual([])
    expect(parseHeadings('just prose\n\nand more prose')).toEqual([])
  })

  describe('frontmatter', () => {
    it('skips a leading block and keeps later line numbers honest', () => {
      const source = [
        '---',
        'name: Strahd',
        'cr: 15',
        '---',
        '',
        '# Strahd',
      ].join('\n')
      const [heading] = parseHeadings(source)
      expect(heading.line).toBe(5)
      expect(heading.text).toBe('Strahd')
    })

    it('ignores headings inside the frontmatter block', () => {
      const source = ['---', '# not a heading', '---', '# real'].join('\n')
      expect(parseHeadings(source).map((h) => h.text)).toEqual(['real'])
    })

    it('treats a mid-document --- as a divider, not frontmatter', () => {
      const source = ['# one', '', '---', '', '# two'].join('\n')
      expect(parseHeadings(source).map((h) => h.text)).toEqual(['one', 'two'])
    })

    it('does not swallow the document when the opener never closes', () => {
      const source = ['---', 'name: unterminated', '', '# still found'].join(
        '\n',
      )
      expect(parseHeadings(source).map((h) => h.text)).toEqual(['still found'])
    })
  })

  describe('code fences', () => {
    it('ignores headings inside a ``` fence', () => {
      const source = ['# real', '```', '# fake', '```', '# also real'].join(
        '\n',
      )
      expect(parseHeadings(source).map((h) => h.text)).toEqual([
        'real',
        'also real',
      ])
    })

    it('ignores headings inside a ~~~ fence', () => {
      const source = ['~~~', '# fake', '~~~', '# real'].join('\n')
      expect(parseHeadings(source).map((h) => h.text)).toEqual(['real'])
    })

    it('does not let ~~~ close a ``` fence', () => {
      const source = ['```', '~~~', '# still fenced', '```', '# real'].join(
        '\n',
      )
      expect(parseHeadings(source).map((h) => h.text)).toEqual(['real'])
    })

    it('needs a closing run at least as long as the opener', () => {
      const source = ['````', '```', '# still fenced', '````', '# real'].join(
        '\n',
      )
      expect(parseHeadings(source).map((h) => h.text)).toEqual(['real'])
    })

    it('ignores everything after an unclosed fence', () => {
      expect(
        parseHeadings(['# real', '```', '# fenced to EOF'].join('\n')).map(
          (h) => h.text,
        ),
      ).toEqual(['real'])
    })

    it('ignores markdown headings nested in a statblock fence', () => {
      // snippets.statBlock writes exactly this shape.
      const source = [
        '# Goblin',
        '```statblock',
        'name: Goblin',
        '# not a heading',
        '```',
      ].join('\n')
      expect(parseHeadings(source).map((h) => h.text)).toEqual(['Goblin'])
    })
  })

  describe('indentation', () => {
    it('allows up to three leading spaces', () => {
      expect(parseHeadings('   ### indented')[0].text).toBe('indented')
    })

    it('treats four leading spaces as an indented code block', () => {
      expect(parseHeadings('    #### too far')).toEqual([])
    })
  })

  describe('line and offset fidelity', () => {
    // One invariant that catches nearly every off-by-one there is.
    const expectOffsetsLandOnHashes = (source: string) => {
      for (const heading of parseHeadings(source))
        expect(source.slice(heading.offset).trimStart().startsWith('#')).toBe(
          true,
        )
    }

    it('points every offset at its own heading line (LF)', () => {
      const source = [
        '---',
        'name: x',
        '---',
        '',
        '# One',
        'prose',
        '',
        '## Two',
        '```',
        '# fenced',
        '```',
        '### Three',
      ].join('\n')
      expectOffsetsLandOnHashes(source)
      expect(parseHeadings(source).map((h) => h.line)).toEqual([4, 7, 11])
    })

    it('points every offset at its own heading line (CRLF)', () => {
      const source = [
        '---',
        'name: x',
        '---',
        '',
        '# One',
        'prose',
        '## Two',
      ].join('\r\n')
      expectOffsetsLandOnHashes(source)
      expect(parseHeadings(source).map((h) => h.line)).toEqual([4, 6])
    })

    it('slices the exact heading line back out of the source', () => {
      const source = '# One\nprose\n\n## Two\n'
      for (const heading of parseHeadings(source)) {
        const line = source.slice(heading.offset).split('\n')[0]
        expect(line).toContain(heading.text)
      }
    })
  })

  describe('page markers', () => {
    it('increments pageIndex on \\page and restarts the ordinal', () => {
      const source = ['# a', '## b', '\\page', '# c'].join('\n')
      const headings = parseHeadings(source)
      expect(headings.map((h) => h.pageIndex)).toEqual([0, 0, 1])
      expect(headings.map((h) => h.ordinalInPage)).toEqual([0, 1, 0])
      expect(headings.map((h) => h.id)).toEqual(['0-0', '0-1', '1-0'])
    })

    it('does not increment pageIndex on \\columns', () => {
      const source = ['\\columns 1', '# a', '\\columns 2', '# b'].join('\n')
      expect(parseHeadings(source).map((h) => h.pageIndex)).toEqual([0, 0])
    })

    it('still counts marker lines as source lines', () => {
      const source = ['\\page', '\\columns 1', '# after markers'].join('\n')
      expect(parseHeadings(source)[0].line).toBe(2)
    })
  })

  describe('duplicateIndex', () => {
    it('tallies repeated heading text within a chunk', () => {
      // A bestiary page: every monster has its own "Tactics".
      const source = [
        '## Goblin',
        '### Tactics',
        '## Orc',
        '### Tactics',
        '## Ogre',
        '### Tactics',
      ].join('\n')
      const tactics = parseHeadings(source).filter((h) => h.text === 'Tactics')
      expect(tactics.map((h) => h.duplicateIndex)).toEqual([0, 1, 2])
    })

    it('restarts the tally in each \\page chunk', () => {
      const source = ['# Tactics', '\\page', '# Tactics'].join('\n')
      expect(parseHeadings(source).map((h) => h.duplicateIndex)).toEqual([0, 0])
    })

    it('is zero when every heading is distinct', () => {
      const source = ['# a', '# b', '# c'].join('\n')
      expect(parseHeadings(source).map((h) => h.duplicateIndex)).toEqual([
        0, 0, 0,
      ])
    })
  })

  describe('text stripping', () => {
    it.each([
      ['## **Bold** heading', 'Bold heading'],
      ['## *italic* heading', 'italic heading'],
      ['## __strong__ heading', 'strong heading'],
      ['## `code` heading', 'code heading'],
      ['## [[Strahd]]', 'Strahd'],
      ['## [[Strahd von Zarovich|The Count]]', 'The Count'],
      ['## [a link](https://example.com)', 'a link'],
    ])('%s -> %s', (source, expected) => {
      expect(parseHeadings(source)[0].text).toBe(expected)
    })
  })
})

describe('activeHeadingAt', () => {
  const headings = parseHeadings(
    ['# one', 'prose', '## two', 'prose', '### three'].join('\n'),
  )

  it('returns null before the first heading', () => {
    expect(activeHeadingAt(headings, 0)).toBe(headings[0])
    expect(activeHeadingAt(parseHeadings('prose\n# later'), 0)).toBeNull()
  })

  it('returns the heading the caret sits on', () => {
    expect(activeHeadingAt(headings, 2)?.text).toBe('two')
  })

  it('returns the preceding heading for a line between two', () => {
    expect(activeHeadingAt(headings, 3)?.text).toBe('two')
  })

  it('returns the last heading for a line past the end', () => {
    expect(activeHeadingAt(headings, 999)?.text).toBe('three')
  })

  it('returns null for an empty outline', () => {
    expect(activeHeadingAt([], 5)).toBeNull()
  })
})

describe('sheetIndexForOffset', () => {
  const CONTENT_W = 712
  const COL_GAP = 40
  const colW = (CONTENT_W - COL_GAP) / 2

  it('puts the start of the flow on the first sheet', () => {
    expect(sheetIndexForOffset(0, 1)).toBe(0)
    expect(sheetIndexForOffset(0, 2)).toBe(0)
  })

  it('packs two columns onto each two-column sheet', () => {
    const at = (col: number) => col * (colW + COL_GAP)
    expect(sheetIndexForOffset(at(0), 2)).toBe(0)
    expect(sheetIndexForOffset(at(1), 2)).toBe(0)
    expect(sheetIndexForOffset(at(2), 2)).toBe(1)
    expect(sheetIndexForOffset(at(3), 2)).toBe(1)
    expect(sheetIndexForOffset(at(4), 2)).toBe(2)
  })

  it('gives each single column its own sheet', () => {
    for (const n of [0, 1, 2, 5])
      expect(sheetIndexForOffset(n * (CONTENT_W + COL_GAP), 1)).toBe(n)
  })

  it('never returns a negative sheet', () => {
    expect(sheetIndexForOffset(-50, 2)).toBe(0)
  })
})
