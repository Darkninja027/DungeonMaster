import { describe, expect, it } from 'vitest'
import {
  WRAPPERS,
  addTableRow,
  countTableColumns,
  indentLines,
  insertLink,
  lineBounds,
  padBlock,
  toggleWrap,
} from './markdownEditing'
import type { EditResult, Selection } from './markdownEditing'

/** Applies an EditResult the way the hook does, for readable assertions. */
function apply(text: string, result: EditResult): string {
  return (
    text.slice(0, result.replace.start) +
    result.text +
    text.slice(result.replace.end)
  )
}

/** Renders the resulting selection as "before[selected]after" for assertions. */
function withSelection(text: string, selection: Selection): string {
  return (
    text.slice(0, selection.start) +
    '[' +
    text.slice(selection.start, selection.end) +
    ']' +
    text.slice(selection.end)
  )
}

describe('toggleWrap', () => {
  it('wraps a selection in bold markers', () => {
    const result = toggleWrap(
      'Count Strahd here',
      { start: 6, end: 12 },
      WRAPPERS.bold,
    )
    expect(apply('Count Strahd here', result)).toBe('Count **Strahd** here')
  })

  it('keeps the original text selected so the shortcut can toggle off', () => {
    const text = 'Count Strahd here'
    const result = toggleWrap(text, { start: 6, end: 12 }, WRAPPERS.bold)
    const next = apply(text, result)
    expect(withSelection(next, result.selection)).toBe(
      'Count **[Strahd]** here',
    )
  })

  it('unwraps when the markers are inside the selection', () => {
    const text = 'Count **Strahd** here'
    const result = toggleWrap(text, { start: 6, end: 16 }, WRAPPERS.bold)
    expect(apply(text, result)).toBe('Count Strahd here')
  })

  it('unwraps when the markers sit just outside the selection', () => {
    // Double-clicking a word selects "Strahd" without its surrounding markers.
    const text = 'Count **Strahd** here'
    const result = toggleWrap(text, { start: 8, end: 14 }, WRAPPERS.bold)
    expect(apply(text, result)).toBe('Count Strahd here')
    expect(withSelection(apply(text, result), result.selection)).toBe(
      'Count [Strahd] here',
    )
  })

  it('round-trips: wrap then unwrap returns the original', () => {
    const text = 'Count Strahd here'
    const wrapped = toggleWrap(text, { start: 6, end: 12 }, WRAPPERS.bold)
    const next = apply(text, wrapped)
    const unwrapped = toggleWrap(next, wrapped.selection, WRAPPERS.bold)
    expect(apply(next, unwrapped)).toBe(text)
  })

  it('puts the caret between the markers on an empty selection', () => {
    const result = toggleWrap('ab', { start: 1, end: 1 }, WRAPPERS.bold)
    const next = apply('ab', result)
    expect(next).toBe('a****b')
    expect(result.selection).toEqual({ start: 3, end: 3 })
  })

  it('wraps a selection as a wiki link', () => {
    const text = 'Ruled by Strahd.'
    const result = toggleWrap(text, { start: 9, end: 15 }, WRAPPERS.wikiLink)
    expect(apply(text, result)).toBe('Ruled by [[Strahd]].')
  })

  it('unwraps a wiki link', () => {
    const text = 'Ruled by [[Strahd]].'
    const result = toggleWrap(text, { start: 11, end: 17 }, WRAPPERS.wikiLink)
    expect(apply(text, result)).toBe('Ruled by Strahd.')
  })

  it('does not mistake a single asterisk for bold markers', () => {
    // "*Strahd*" is italic; Ctrl+B must add bold, not strip the italics.
    const text = '*Strahd*'
    const result = toggleWrap(text, { start: 0, end: 8 }, WRAPPERS.bold)
    expect(apply(text, result)).toBe('***Strahd***')
  })

  it('handles italic wrapping independently of bold', () => {
    const text = 'Strahd'
    const result = toggleWrap(text, { start: 0, end: 6 }, WRAPPERS.italic)
    expect(apply(text, result)).toBe('*Strahd*')
  })

  it('does not treat an empty selection inside markers as wrapped', () => {
    // A caret between the markers of "****" means "start bold here" — it must
    // insert a fresh pair, not delete the surrounding ones.
    const result = toggleWrap('****', { start: 2, end: 2 }, WRAPPERS.bold)
    expect(apply('****', result)).toBe('********')
    expect(result.selection).toEqual({ start: 4, end: 4 })
  })
})

describe('insertLink', () => {
  it('wraps a selection and puts the caret in the url slot', () => {
    const text = 'See Barovia now'
    const result = insertLink(text, { start: 4, end: 11 })
    const next = apply(text, result)
    expect(next).toBe('See [Barovia]() now')
    expect(next.slice(result.selection.start, result.selection.start + 1)).toBe(
      ')',
    )
  })

  it('inserts an empty link with the caret in the text slot', () => {
    const result = insertLink('ab', { start: 1, end: 1 })
    expect(apply('ab', result)).toBe('a[]()b')
    expect(result.selection).toEqual({ start: 2, end: 2 })
  })
})

describe('countTableColumns', () => {
  it('counts cells in a closed row', () => {
    expect(countTableColumns('| a | b | c |')).toBe(3)
  })

  it('counts cells in a row with no trailing pipe', () => {
    expect(countTableColumns('| a | b')).toBe(2)
  })

  it('counts a separator row', () => {
    expect(countTableColumns('| --- | --- |')).toBe(2)
  })

  it('returns 0 for a non-table line', () => {
    expect(countTableColumns('just prose')).toBe(0)
    expect(countTableColumns('')).toBe(0)
  })

  it('ignores leading whitespace', () => {
    expect(countTableColumns('   | a | b |')).toBe(2)
  })
})

describe('lineBounds', () => {
  it('finds the bounds of a middle line', () => {
    const text = 'one\ntwo\nthree'
    expect(lineBounds(text, 5)).toEqual({ start: 4, end: 7 })
  })

  it('handles the first line', () => {
    expect(lineBounds('one\ntwo', 1)).toEqual({ start: 0, end: 3 })
  })

  it('handles the last line with no trailing newline', () => {
    const text = 'one\ntwo'
    expect(lineBounds(text, 7)).toEqual({ start: 4, end: 7 })
  })
})

describe('addTableRow', () => {
  it('adds a row matching the column count', () => {
    const text = '| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |'
    const result = addTableRow(text, 30)
    expect(result).not.toBeNull()
    expect(apply(text, result!)).toBe(
      '| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |\n|   |   |   |',
    )
  })

  it('matches a four-column table', () => {
    const text = '| a | b | c | d |'
    const result = addTableRow(text, 2)
    expect(apply(text, result!)).toBe('| a | b | c | d |\n|   |   |   |   |')
  })

  it('puts the caret inside the first new cell', () => {
    const text = '| a | b |'
    const result = addTableRow(text, 2)!
    const next = apply(text, result)
    // Caret sits inside the first cell of the new row: past the newline and
    // the opening pipe, in the cell's leading whitespace.
    expect(next.slice(result.selection.start - 1, result.selection.start)).toBe(
      '|',
    )
    expect(next.slice(result.selection.start, result.selection.start + 3)).toBe(
      '   ',
    )
  })

  it('returns null when the caret is not in a table', () => {
    expect(addTableRow('just prose here', 4)).toBeNull()
  })

  it('inserts after the caret line, not at the end of the table', () => {
    const text = '| a |\n| - |\nafter'
    const result = addTableRow(text, 2)!
    expect(apply(text, result)).toBe('| a |\n|   |\n| - |\nafter')
  })
})

describe('indentLines', () => {
  it('indents a single line', () => {
    const text = '- item'
    const result = indentLines(text, { start: 3, end: 3 }, false)
    expect(apply(text, result)).toBe('  - item')
  })

  it('outdents a single line', () => {
    const text = '  - item'
    const result = indentLines(text, { start: 5, end: 5 }, true)
    expect(apply(text, result)).toBe('- item')
  })

  it('indents every line the selection touches', () => {
    const text = '- one\n- two\n- three'
    const result = indentLines(text, { start: 2, end: 14 }, false)
    expect(apply(text, result)).toBe('  - one\n  - two\n  - three')
  })

  it('does not drag in the next line when the selection ends at a line start', () => {
    const text = '- one\n- two'
    // Selection covers "- one\n" exactly.
    const result = indentLines(text, { start: 0, end: 6 }, false)
    expect(apply(text, result)).toBe('  - one\n- two')
  })

  it('outdenting a line with no indentation is a no-op', () => {
    const text = '- item'
    const result = indentLines(text, { start: 0, end: 0 }, true)
    expect(apply(text, result)).toBe('- item')
  })

  it('outdents partial indentation without going negative', () => {
    const text = ' - item'
    const result = indentLines(text, { start: 3, end: 3 }, true)
    expect(apply(text, result)).toBe('- item')
  })

  it('round-trips indent then outdent', () => {
    const text = '- one\n- two'
    const inward = indentLines(text, { start: 0, end: 11 }, false)
    const next = apply(text, inward)
    const back = indentLines(next, inward.selection, true)
    expect(apply(next, back)).toBe(text)
  })

  it('handles tabs when outdenting', () => {
    const text = '\t- item'
    const result = indentLines(text, { start: 2, end: 2 }, true)
    expect(apply(text, result)).toBe('- item')
  })
})

describe('padBlock', () => {
  it('adds blank lines around a block in the middle of prose', () => {
    const text = 'before\nafter'
    const result = padBlock(text, { start: 6, end: 6 }, 'TABLE')
    expect(apply(text, result)).toBe('before\n\nTABLE\n\nafter')
  })

  it('does not add padding that is already there', () => {
    const text = 'before\n\n\n\nafter'
    const result = padBlock(text, { start: 8, end: 8 }, 'TABLE')
    expect(apply(text, result)).toBe('before\n\nTABLE\n\nafter')
  })

  it('adds no leading padding at the start of the document', () => {
    const result = padBlock('', { start: 0, end: 0 }, 'TABLE')
    expect(apply('', result)).toBe('TABLE')
  })

  it('selects the snippet body, excluding the padding', () => {
    const text = 'before\nafter'
    const result = padBlock(text, { start: 6, end: 6 }, 'TABLE')
    const next = apply(text, result)
    expect(next.slice(result.selection.start, result.selection.end)).toBe(
      'TABLE',
    )
  })

  it('replaces the selection', () => {
    const text = 'keep REPLACE keep'
    const result = padBlock(text, { start: 5, end: 12 }, 'TABLE')
    expect(apply(text, result)).toBe('keep \n\nTABLE\n\n keep')
  })
})
