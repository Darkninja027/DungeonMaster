import { describe, expect, it } from 'vitest'
import { articleTemplates, newArticleContent } from './templates'
import { splitFrontmatter } from './formatMarkdown'
import { parse as parseYaml } from 'yaml'
import { parseCharacter, serializeCharacter } from './character'

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

describe('the character template', () => {
  it('is a blank sheet, not a pre-statted example', () => {
    // Regression guard. It used to ship a level 1 Human Fighter/Champion with
    // a full stat spread and a longsword, so every character in every world
    // started as somebody else's fighter that had to be deleted first. This is
    // now what the creation wizard's "Skip setup" produces, and skipping must
    // mean an empty sheet.
    const { character } = parseCharacter(byId('character').body)
    expect(character.class).toBe('')
    expect(character.subclass).toBe('')
    expect(character.race).toBe('')
    expect(character.background).toBe('')
    expect(character.abilities).toEqual({
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    })
    expect(character.skills).toEqual([])
    expect(character.inventory).toEqual([])
    expect(character.attacks).toEqual([])
    expect(character.features).toEqual([])
  })

  it('round-trips through the sheet parser unchanged', () => {
    const { character, body } = parseCharacter(byId('character').body)
    expect(parseCharacter(serializeCharacter(character, body)).character).toEqual(
      character,
    )
  })
})
