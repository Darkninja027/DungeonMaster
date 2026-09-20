import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_TEMPLATES,
  fillPlaceholders,
  newArticleContent,
} from './templates'
import { splitFrontmatter } from './formatMarkdown'
import { parse as parseYaml } from 'yaml'
import { parseCharacter, serializeCharacter } from './character'

const byId = (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id)!

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
    for (const t of BUILT_IN_TEMPLATES) {
      if (t.id === 'blank') continue
      const { frontmatter } = splitFrontmatter(newArticleContent(t))
      expect(frontmatter, `${t.id} should have frontmatter`).not.toBeNull()
      expect(() => parseYaml(frontmatter!)).not.toThrow()
    }
  })
})

describe('the spell template placeholders', () => {
  // The character sheet's add-spell used to string-patch the literal text
  // `level: 1` and `Level 1` out of this body. That worked only while the
  // template was a compiled-in constant; now that it is editable, these
  // placeholders are what carries the level across. If they are renamed or
  // dropped from the body, spells silently file themselves wrong.
  const stamp = (level: number) =>
    fillPlaceholders(byId('spell').body, {
      level: String(level),
      levelLabel: level === 0 ? 'Cantrip' : `Level ${level}`,
    })

  it('stamps a level into both the frontmatter and the subtitle', () => {
    const content = stamp(3)
    const { frontmatter, body } = splitFrontmatter(content)
    const fm = parseYaml(frontmatter!) as Record<string, unknown>

    // Quoted in the body, so this is the string "3" — `scalarNumber` in the
    // main-process scan coerces it, which is what the spell library reads.
    expect(Number(fm.level)).toBe(3)
    expect(body).toContain('*Level 3 evocation*')
    expect(content).not.toContain('{{')
  })

  it('stamps a cantrip as level 0 and says so in the subtitle', () => {
    const content = stamp(0)
    const { frontmatter, body } = splitFrontmatter(content)
    const fm = parseYaml(frontmatter!) as Record<string, unknown>

    expect(Number(fm.level)).toBe(0)
    expect(body).toContain('*Cantrip evocation*')
  })

  it('stays valid YAML before anything is substituted', () => {
    // A bare {{level}} parses as a YAML flow mapping, so `level` would become
    // an object rather than a number and nothing would complain. The quotes in
    // the template body are what stop that, and this is what holds them there.
    const { frontmatter } = splitFrontmatter(byId('spell').body)
    const fm = parseYaml(frontmatter!) as Record<string, unknown>

    expect(fm.level).toBe('{{level}}')
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
