import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { GUIDE_CONTENT, GUIDE_FILENAME } from './guideArticle'

const SOURCE = path.join(__dirname, '..', '..', '..', 'docs', 'Guide.md')

describe('guideArticle', () => {
  it('is byte-identical to docs/Guide.md', () => {
    const disk = fs.readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n')
    // Regenerate with `node scripts/gen-guide.cjs` if this fails.
    expect(GUIDE_CONTENT).toBe(disk)
  })

  it('keeps its page and column markers intact through escaping', () => {
    // The generator escapes backslashes for the template literal; a bug there
    // would silently turn every \page into a literal "page" and collapse the
    // whole guide onto one sheet. 18 markers => 19 book pages.
    const markers = GUIDE_CONTENT.match(/^\\page$/gm) ?? []
    expect(markers).toHaveLength(18)
    // Every page is single-column, plus two mentions in the chapter prose.
    const columns = GUIDE_CONTENT.match(/^\\columns 1$/gm) ?? []
    expect(columns).toHaveLength(19)
    // A lost backslash leaves the marker as ordinary text on the page.
    expect(GUIDE_CONTENT).not.toMatch(/^columns 1$/m)
    expect(GUIDE_CONTENT).not.toMatch(/^page$/m)
  })

  it('starts with frontmatter so the title and tags are read', () => {
    expect(GUIDE_CONTENT.startsWith('---\ntype: session')).toBe(true)
  })

  it('names a markdown file', () => {
    expect(GUIDE_FILENAME).toBe('Guide.md')
  })
})
