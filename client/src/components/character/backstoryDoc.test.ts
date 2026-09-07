import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { backstoryDoc } from './SheetPreview'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('backstoryDoc', () => {
  it('prepends the character name when the prose has no heading', () => {
    expect(backstoryDoc('Born in a ditch.', 'Grog')).toBe(
      '# Grog\n\nBorn in a ditch.',
    )
  })

  it('leaves prose that opens with its own heading alone', () => {
    const prose = '# The Ballad of Grog\n\nBorn in a ditch.'
    expect(backstoryDoc(prose, 'Grog')).toBe(prose)
  })

  it('treats any heading level as the prose owning its own title', () => {
    const prose = '### A Small Beginning\n\nBorn in a ditch.'
    expect(backstoryDoc(prose, 'Grog')).toBe(prose)
  })

  it('trims before deciding, so leading blank lines do not hide a heading', () => {
    expect(backstoryDoc('\n\n  # Real Heading\n\nprose', 'Grog')).toBe(
      '# Real Heading\n\nprose',
    )
  })

  it('is empty for absent or whitespace-only prose', () => {
    // The sheet renders nothing at all in this case, so an empty string is what
    // keeps `prose && ...` falsy rather than printing a bare title page.
    expect(backstoryDoc(undefined, 'Grog')).toBe('')
    expect(backstoryDoc('   \n\n ', 'Grog')).toBe('')
  })
})

/**
 * The printed backstory and the Story tab's live preview must render the same
 * string through the same renderer. This was a real bug: the sheet used a bare
 * `Markdown` at a hardcoded columns={2}, which silently dropped every \page and
 * \columns marker in the prose and never ran transformDmBlocks — so DM-only
 * blocks rendered raw and printed, on a page a player might be handed.
 *
 * Asserted on source text because the behavioural version passes for a wiring
 * that renders the right words through the wrong renderer, which is exactly the
 * failure that shipped.
 */
describe('the sheet renders backstory through BookView', () => {
  const source = readFileSync(join(HERE, 'SheetPreview.tsx'), 'utf8')

  it('uses BookView for the prose, never a bare Markdown', () => {
    expect(source).toContain('<BookView')
    // A bare `<Markdown` with a hardcoded column count is the old shape.
    expect(source).not.toMatch(/<Markdown\s+columns=\{2\}/)
  })

  it('hands BookView the shared backstoryDoc, not the raw body', () => {
    expect(source).toContain('backstoryDoc(body, title)')
  })
})
