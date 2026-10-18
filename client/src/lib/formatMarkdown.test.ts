import { describe, expect, it } from 'vitest'
import {
  DM_CALLOUT_MARKER,
  formatMarkdown,
  joinFrontmatter,
  linkifyDice,
  parsePages,
  resolveNoteLinks,
  resolveWikiLinks,
  rollDice,
  splitFrontmatter,
  transformDmBlocks,
  transformWrapBlocks,
  WRAP_END_MARKER,
  WRAP_START_MARKER,
} from './formatMarkdown'

describe('linkifyDice', () => {
  it('turns bare notation into dice links', () => {
    expect(linkifyDice('deals 2d6+3 damage')).toBe(
      'deals [2d6+3](dice:2d6%2B3) damage',
    )
  })

  it('turns [Name](notation) into a named dice link', () => {
    expect(linkifyDice('[Short Sword](2d6+3)')).toBe(
      '[Short Sword](dice:2d6%2B3)',
    )
    expect(linkifyDice('[Bite](d4)')).toBe('[Bite](dice:d4)')
  })

  it('leaves explicit dice: named rolls untouched', () => {
    const named = '[Short Sword](dice:1d20+5)'
    expect(linkifyDice(named)).toBe('[Short Sword](dice:1d20%2B5)')
    expect(linkifyDice('[Plain](dice:1d20%2B5)')).toBe('[Plain](dice:1d20%2B5)')
  })

  it('does not linkify notation inside a named roll label', () => {
    expect(linkifyDice('[Attack 1d20](1d20+5)')).toBe(
      '[Attack 1d20](dice:1d20%2B5)',
    )
  })

  it('still linkifies notation around a named roll', () => {
    expect(linkifyDice('[Bite](dice:1d4) plus 2d6 poison')).toBe(
      '[Bite](dice:1d4) plus [2d6](dice:2d6) poison',
    )
  })

  it('splits and rejoins frontmatter', () => {
    const content = '---\ntype: character\nac: 16\n---\n\n# Kaelen'
    const { frontmatter, body } = splitFrontmatter(content)
    expect(frontmatter).toBe('type: character\nac: 16')
    expect(body).toBe('# Kaelen')
    expect(joinFrontmatter(frontmatter, body)).toBe(content)
    expect(splitFrontmatter('no frontmatter').frontmatter).toBeNull()
  })

  it('Tidy preserves frontmatter untouched', async () => {
    const content =
      '---\ntype: character\nabilities: { str: 10 }\n---\n\n#   Kaelen\n\nsome  text'
    const formatted = await formatMarkdown(content)
    expect(
      formatted.startsWith(
        '---\ntype: character\nabilities: { str: 10 }\n---\n',
      ),
    ).toBe(true)
    expect(formatted).toContain('# Kaelen')
  })

  // A DM writing by hand types `1d6 + 3` as often as `1d6+3`, and rollDice
  // has always stripped whitespace — only the linkifier's grammar was strict,
  // so the roll was computable but never became a chip.
  it('linkifies notation with spaces around the modifier', () => {
    expect(linkifyDice('deals 1d6 + 3 damage')).toBe(
      'deals [1d6 + 3](dice:1d6%20%2B%203) damage',
    )
    expect(linkifyDice('takes 2d10 - 1 cold')).toBe(
      'takes [2d10 - 1](dice:2d10%20-%201) cold',
    )
    // The tight form still works exactly as before.
    expect(linkifyDice('deals 2d6+3 damage')).toBe(
      'deals [2d6+3](dice:2d6%2B3) damage',
    )
  })

  it('rolls a spaced notation to the same thing as a tight one', () => {
    // rollDice already stripped whitespace; this pins that it stays true.
    expect(rollDice('1d6 + 3')).not.toBeNull()
    expect(rollDice('18d10 + 36')).not.toBeNull()
    // d20+5 is between 6 and 25 however it lands — enough to prove the
    // modifier survived the spaces.
    const r = rollDice('1d20 + 5')
    expect(r).not.toBeNull()
    expect(r && r.total).toBeGreaterThanOrEqual(6)
    expect(r && r.total).toBeLessThanOrEqual(25)
  })

  it('keeps the NdN core tight — a space before the d does not join it', () => {
    // A bare `d6` has always been a valid roll (the count is optional), so it
    // still chips here. The point is that the leading `1` is NOT absorbed:
    // `1 d6` is prose plus a d6, not a 1d6.
    expect(linkifyDice('you have 1 d6 left')).toBe(
      'you have 1 [d6](dice:d6) left',
    )
  })

  it('leaves code spans and fences alone', () => {
    expect(linkifyDice('`2d6` and ```\n1d20\n```')).toBe(
      '`2d6` and ```\n1d20\n```',
    )
  })
})

describe('transformDmBlocks', () => {
  const body = [
    'The tavern is quiet.',
    '',
    ':::dm',
    'The barkeep is a doppelganger. That is the secret.',
    ':::',
    '',
    'A fire burns low.',
  ].join('\n')

  it('strips a block, leaving the surrounding prose intact', () => {
    const stripped = transformDmBlocks(body, 'strip')
    expect(stripped).toContain('The tavern is quiet.')
    expect(stripped).toContain('A fire burns low.')
    expect(stripped).not.toContain(':::')
  })

  // The assertion the whole player window rests on: the secret must be ABSENT,
  // not merely unstyled or hidden.
  it('leaves no trace of the secret text', () => {
    const stripped = transformDmBlocks(body, 'strip')
    expect(stripped).not.toContain('doppelganger')
    expect(stripped).not.toContain('secret')
  })

  it('marks a block as a callout blockquote, keeping the text', () => {
    const marked = transformDmBlocks(body, 'mark')
    expect(marked).toContain(`> ${DM_CALLOUT_MARKER}`)
    expect(marked).toContain(
      '> The barkeep is a doppelganger. That is the secret.',
    )
    expect(marked).not.toContain(':::')
    expect(marked).toContain('The tavern is quiet.')
  })

  // Fail closed: a forgotten closing ::: must truncate the players' view
  // rather than leak what follows it.
  it('strips an unclosed block to the end of the document', () => {
    const unclosed = [
      'Visible intro.',
      '',
      ':::dm',
      'Secret one.',
      '',
      'Secret two, after a blank line.',
    ].join('\n')
    const stripped = transformDmBlocks(unclosed, 'strip')
    expect(stripped).toContain('Visible intro.')
    expect(stripped).not.toContain('Secret one.')
    expect(stripped).not.toContain('Secret two')
  })

  it('leaves :::dm inside a code fence alone in both modes', () => {
    const fenced = [
      'How to hide DM notes:',
      '',
      '```markdown',
      ':::dm',
      'documented example',
      ':::',
      '```',
      '',
      'Tail text.',
    ].join('\n')
    expect(transformDmBlocks(fenced, 'strip')).toContain('documented example')
    expect(transformDmBlocks(fenced, 'strip')).toContain('Tail text.')
    expect(transformDmBlocks(fenced, 'mark')).toContain('documented example')
  })

  // The inverse, and the nastier one: a fence INSIDE a block must not leave the
  // state machine mid-fence, or everything after the block gets eaten.
  it('strips a code fence inside a block without eating the rest', () => {
    const withFence = [
      'Intro.',
      '',
      ':::dm',
      '```',
      'secret code',
      '```',
      ':::',
      '',
      'Tail text.',
    ].join('\n')
    const stripped = transformDmBlocks(withFence, 'strip')
    expect(stripped).not.toContain('secret code')
    expect(stripped).toContain('Intro.')
    expect(stripped).toContain('Tail text.')
  })

  it('takes a \\page inside a block with the block, and drops it when marking', () => {
    const paged = [
      'Page one.',
      '',
      ':::dm',
      'Secret before the break.',
      '\\page',
      'Secret after the break.',
      ':::',
      '',
      'Still page one.',
      '\\page',
      'Page two.',
    ].join('\n')
    // Stripping removes the DM block's \page, so the player sees 2 pages.
    expect(parsePages(transformDmBlocks(paged, 'strip')).length).toBe(2)
    // Marking drops it too, so the callout is never split across sheets.
    expect(parsePages(transformDmBlocks(paged, 'mark')).length).toBe(2)
  })

  it('handles several blocks in one document', () => {
    const many = [
      'A.',
      ':::dm',
      'first secret',
      ':::',
      'B.',
      ':::dm',
      'second secret',
      ':::',
      'C.',
    ].join('\n')
    const stripped = transformDmBlocks(many, 'strip')
    expect(stripped).not.toContain('first secret')
    expect(stripped).not.toContain('second secret')
    expect(stripped).toContain('A.')
    expect(stripped).toContain('B.')
    expect(stripped).toContain('C.')
  })

  it('tolerates longer colon runs and any casing', () => {
    const loose = ['Intro.', '::::DM', 'hidden', '::::', 'Tail.'].join('\n')
    const stripped = transformDmBlocks(loose, 'strip')
    expect(stripped).not.toContain('hidden')
    expect(stripped).toContain('Tail.')
  })

  it('treats a nested opener as content rather than nesting', () => {
    const nested = [
      ':::dm',
      'outer secret',
      ':::dm',
      'inner secret',
      ':::',
      'Tail after first close.',
    ].join('\n')
    const stripped = transformDmBlocks(nested, 'strip')
    expect(stripped).not.toContain('outer secret')
    expect(stripped).not.toContain('inner secret')
    expect(stripped).toContain('Tail after first close.')
  })

  // Rule 4. Without counting, the wrap's closer closed the DM block and the
  // text between the two closers went straight to the projector.
  it('pairs a nested container closer with its opener, not the DM block', () => {
    const nested = [
      ':::dm',
      ':::wrap',
      'inner secret',
      ':::',
      'secret after the inner close',
      ':::',
      'Tail.',
    ].join('\n')
    const stripped = transformDmBlocks(nested, 'strip')
    expect(stripped).not.toContain('secret')
    expect(stripped).not.toContain(':::')
    expect(stripped).toContain('Tail.')
    const marked = transformDmBlocks(nested, 'mark')
    expect(marked).toContain('> secret after the inner close')
    expect(marked).toContain('> :::wrap')
    expect(marked.endsWith('\nTail.')).toBe(true)
  })

  // CRLF is the classic silent failure: the block goes unrecognised and the
  // secret reaches the projector.
  it('strips correctly from CRLF content', () => {
    const crlf = 'Intro.\r\n\r\n:::dm\r\nCRLF secret.\r\n:::\r\n\r\nTail.'
    const stripped = transformDmBlocks(crlf, 'strip')
    expect(stripped).not.toContain('CRLF secret.')
    expect(stripped).toContain('Intro.')
    expect(stripped).toContain('Tail.')
  })

  it('returns a document with no DM block unchanged', () => {
    const plain = 'Just prose.\n\nAnd a second paragraph.'
    expect(transformDmBlocks(plain, 'strip')).toBe(plain)
    expect(transformDmBlocks(plain, 'mark')).toBe(plain)
  })

  it('Tidy round-trips a DM block unchanged', async () => {
    const content = 'Intro.\n\n:::dm\nSecret note.\n:::\n\nTail.'
    const formatted = await formatMarkdown(content)
    expect(formatted).toContain(':::dm')
    expect(formatted).toContain('Secret note.')
    // And it must still strip after a Tidy pass.
    expect(transformDmBlocks(formatted, 'strip')).not.toContain('Secret note.')
  })
})

describe('transformWrapBlocks', () => {
  it('turns the fences into marker paragraphs around the content', () => {
    const out = transformWrapBlocks(
      [
        'Intro.',
        ':::wrap',
        '![a](_images/a.png#left)',
        '# Title',
        ':::',
        'Tail.',
      ].join('\n'),
    )
    expect(out).toBe(
      [
        'Intro.',
        '',
        WRAP_START_MARKER,
        '',
        '![a](_images/a.png#left)',
        '# Title',
        '',
        WRAP_END_MARKER,
        '',
        'Tail.',
      ].join('\n'),
    )
  })

  it('leaves a bare ::: with no wrap open alone', () => {
    const text = 'One.\n:::\nTwo.'
    expect(transformWrapBlocks(text)).toBe(text)
  })

  it('nests, closing the innermost box first', () => {
    const out = transformWrapBlocks(
      [':::wrap', 'a', ':::wrap', 'b', ':::', 'c', ':::', ':::'].join('\n'),
    )
    expect(out.split(WRAP_START_MARKER).length - 1).toBe(2)
    expect(out.split(WRAP_END_MARKER).length - 1).toBe(2)
    // The third ::: had no box left to close.
    expect(out.endsWith('\n:::')).toBe(true)
  })

  it('keeps a blockquote prefix, so a wrap inside a DM callout stays in it', () => {
    const marked = transformDmBlocks(
      [':::dm', ':::wrap', 'secret', ':::', ':::'].join('\n'),
      'mark',
    )
    const out = transformWrapBlocks(marked)
    expect(out).toContain(`> ${WRAP_START_MARKER}`)
    expect(out).toContain(`> ${WRAP_END_MARKER}`)
    expect(out).not.toContain(':::')
  })

  it('leaves :::wrap inside a code fence literal', () => {
    const fenced = ['```', ':::wrap', 'example', ':::', '```', 'Tail.'].join(
      '\n',
    )
    expect(transformWrapBlocks(fenced)).toBe(fenced)
  })

  it('tolerates longer colon runs, casing and CRLF', () => {
    const out = transformWrapBlocks('::::WRAP\r\nx\r\n::::\r\nTail.')
    expect(out).toContain(WRAP_START_MARKER)
    expect(out).toContain(WRAP_END_MARKER)
    expect(out).not.toContain('\r')
  })

  it('Tidy round-trips a wrap block unchanged', async () => {
    const content = [
      'Intro.',
      '',
      ':::wrap',
      '![Seal](_images/Seal%20One.png#left&w=20%)',
      '',
      '# Title',
      ':::',
      '',
      'Tail.',
    ].join('\n')
    const formatted = await formatMarkdown(content)
    expect(formatted).toContain(':::wrap')
    expect(formatted).toMatch(/\n:::\n/)
    expect(transformWrapBlocks(formatted)).toContain(WRAP_END_MARKER)
  })
})

describe('resolveNoteLinks', () => {
  it('rewrites a link naming a note into a note: link', () => {
    expect(resolveNoteLinks('See [[Waterdeep]] tonight', ['Waterdeep'])).toBe(
      'See [Waterdeep](note:Waterdeep) tonight',
    )
  })

  it('matches case- and space-insensitively, like resolveWikiLinks', () => {
    expect(resolveNoteLinks('[[ waterdeep ]]', ['Waterdeep'])).toBe(
      '[waterdeep](note:waterdeep)',
    )
  })

  it('keeps the alias label and targets the title', () => {
    expect(resolveNoteLinks('[[Waterdeep|the city]]', ['Waterdeep'])).toBe(
      '[the city](note:Waterdeep)',
    )
  })

  it('encodes a title with spaces', () => {
    expect(resolveNoteLinks('[[Sea of Swords]]', ['Sea of Swords'])).toBe(
      '[Sea of Swords](note:Sea%20of%20Swords)',
    )
  })

  it('leaves an unmatched title alone for resolveWikiLinks', () => {
    expect(resolveNoteLinks('[[Baldur]]', ['Waterdeep'])).toBe('[[Baldur]]')
  })

  it('is an exact passthrough for an empty list — every non-vault caller', () => {
    const text = 'A [[link]] and **prose**'
    expect(resolveNoteLinks(text, [])).toBe(text)
  })

  it('normalizes the escaped form remark emits', () => {
    expect(resolveNoteLinks('\\[\\[Waterdeep]]', ['Waterdeep'])).toBe(
      '[Waterdeep](note:Waterdeep)',
    )
  })

  it('rewrites both links on one line (the shared-lastIndex trap)', () => {
    expect(
      resolveNoteLinks('[[Waterdeep]] then [[Neverwinter]]', [
        'Waterdeep',
        'Neverwinter',
      ]),
    ).toBe('[Waterdeep](note:Waterdeep) then [Neverwinter](note:Neverwinter)')
  })

  it('an article wins over a note of the same name', () => {
    // Composition is the real contract: notes resolve first, but a title that
    // is also an article must end up navigable rather than scroll-only.
    const articles = [{ id: 'Waterdeep', title: 'Waterdeep' }]
    const out = resolveWikiLinks(
      resolveNoteLinks('[[Waterdeep]]', ['Waterdeep'], articles),
      articles,
      'abc',
    )
    expect(out).toBe('[Waterdeep](/worlds/abc/articles/Waterdeep)')
  })
})
