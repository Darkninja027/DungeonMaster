import { describe, expect, it } from 'vitest'
import {
  formatMarkdown,
  joinFrontmatter,
  linkifyDice,
  splitFrontmatter,
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

  it('leaves code spans and fences alone', () => {
    expect(linkifyDice('`2d6` and ```\n1d20\n```')).toBe(
      '`2d6` and ```\n1d20\n```',
    )
  })
})
