import { describe, expect, it } from 'vitest'
import { articleTemplates, newArticleContent } from './templates'
import { splitFrontmatter } from './formatMarkdown'
import { parse as parseYaml } from 'yaml'

const byId = (id: string) => articleTemplates.find((t) => t.id === id)!

describe('newArticleContent', () => {
  it('prepends valid type + empty tags frontmatter to a plain template', () => {
    const content = newArticleContent(byId('monster'))
    const { frontmatter, body } = splitFrontmatter(content)
    expect(frontmatter).not.toBeNull()
    const fm = parseYaml(frontmatter!) as Record<string, unknown>
    expect(fm.type).toBe('monster')
    expect(fm.tags).toEqual([]) // real empty array, not a string
    expect(body.startsWith('# Creature Name')).toBe(true)
  })

  it('leaves Blank empty', () => {
    expect(newArticleContent(byId('blank'))).toBe('')
  })

  it('does not double-wrap templates that already have frontmatter', () => {
    // Spell/character carry their own rich frontmatter — must be untouched.
    expect(newArticleContent(byId('spell'))).toBe(byId('spell').body)
    expect(newArticleContent(byId('character'))).toBe(byId('character').body)
  })

  it('every non-blank plain template yields parseable frontmatter', () => {
    for (const t of articleTemplates) {
      if (t.id === 'blank') continue
      const { frontmatter } = splitFrontmatter(newArticleContent(t))
      expect(frontmatter, `${t.id} should have frontmatter`).not.toBeNull()
      expect(() => parseYaml(frontmatter!)).not.toThrow()
    }
  })
})
