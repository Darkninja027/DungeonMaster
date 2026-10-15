import { describe, expect, it } from 'vitest'
import {
  DESCRIBE_SUBJECTS,
  SUBJECT_GROUPS,
  articleType,
  detailsBlock,
  rollEntry,
  subjectForType,
} from './subjects'
import {
  NAME_GROUPS,
  canRollFullName,
  groupLabel,
  nameCategories,
  parseNameLists,
  rollFullName,
} from './names'

describe('describe subjects', () => {
  it('has unique subject ids and unique table ids per subject', () => {
    const ids = DESCRIBE_SUBJECTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of DESCRIBE_SUBJECTS) {
      const tableIds = s.tables.map((t) => t.id)
      expect(new Set(tableIds).size, s.id).toBe(tableIds.length)
    }
  })

  it('gives every subject prompts and non-trivial tables', () => {
    for (const s of DESCRIBE_SUBJECTS) {
      expect(SUBJECT_GROUPS, s.id).toContain(s.group)
      expect(s.prompts.length, s.id).toBeGreaterThanOrEqual(3)
      expect(s.tables.length, s.id).toBeGreaterThanOrEqual(2)
      for (const t of s.tables) {
        expect(t.entries.length, `${s.id}/${t.id}`).toBeGreaterThanOrEqual(6)
        // A duplicate entry silently doubles its odds.
        expect(new Set(t.entries).size, `${s.id}/${t.id}`).toBe(
          t.entries.length,
        )
      }
    }
  })

  it('populates every subject group', () => {
    for (const g of SUBJECT_GROUPS)
      expect(
        DESCRIBE_SUBJECTS.some((s) => s.group === g),
        g,
      ).toBe(true)
  })

  it('maps a type to at most one subject', () => {
    const owners = new Map<string, string>()
    for (const s of DESCRIBE_SUBJECTS)
      for (const t of s.types ?? []) {
        expect(owners.has(t), `${t} claimed twice`).toBe(false)
        owners.set(t, s.id)
      }
    expect(subjectForType('npc')?.id).toBe('npc')
    expect(subjectForType(' NPC ')?.id).toBe('npc')
    expect(subjectForType('spell')).toBeUndefined()
    expect(subjectForType(undefined)).toBeUndefined()
  })

  it('reads the frontmatter type', () => {
    expect(articleType('---\ntype: npc\ntags: []\n---\n\nbody')).toBe('npc')
    expect(articleType("---\r\ntype: 'location'\r\n---\r\n")).toBe('location')
    expect(articleType('no frontmatter\ntype: npc')).toBeUndefined()
    expect(articleType('')).toBeUndefined()
  })

  it('rolls uniformly and stays in range at the edges', () => {
    const t = ['a', 'b', 'c']
    expect(rollEntry(t, () => 0)).toBe('a')
    expect(rollEntry(t, () => 0.5)).toBe('b')
    expect(rollEntry(t, () => 0.9999)).toBe('c')
    // Math.random never returns 1, but a stub might; never index past the end.
    expect(rollEntry(t, () => 1)).toBe('c')
    expect(rollEntry([], () => 0)).toBeUndefined()
  })

  it('wraps rolled details in a DM-only block', () => {
    const subject = DESCRIBE_SUBJECTS[0]
    const block = detailsBlock(subject, [{ label: 'Smell', value: 'smoke' }])
    expect(block.split('\n')[0]).toBe(':::dm')
    expect(block.split('\n').at(-1)).toBe(':::')
    expect(block).toContain('- **Smell:** smoke')
  })
})

describe('name lists', () => {
  it('parses all four categories from names.md', () => {
    expect(nameCategories()).toEqual([
      'NPC Names',
      'Location Names',
      'Shop Names',
      'Faction Names',
    ])
  })

  it('parses labelled race lists under nested headings', () => {
    const nordic = NAME_GROUPS.find(
      (g) => groupLabel(g) === 'Human › Northern / Nordic-style',
    )
    expect(nordic?.lists.map((l) => l.label)).toEqual([
      'Masculine',
      'Feminine',
      'Neutral',
      'Surnames',
    ])
    expect(nordic?.lists[0].names).toContain('Bjorn')
  })

  it('keeps parenthetical glosses whole and strips them from full names', () => {
    const elf = NAME_GROUPS.find((g) => groupLabel(g) === 'Elf')
    const family = elf?.lists.find((l) => l.label === 'Family names')
    expect(family?.names).toContain('Amakiir (Gemflower)')
    expect(elf && canRollFullName(elf)).toBe(true)
    // rand 0 -> first given name; second call -> first family name.
    expect(elf && rollFullName(elf, () => 0)).toBe('Aelar Amakiir')
  })

  it('parses bare comma lines as unlabelled lists, and prose as a note', () => {
    const towns = NAME_GROUPS.find(
      (g) => g.category === 'Location Names' && groupLabel(g) === 'Towns',
    )
    expect(towns?.lists).toHaveLength(1)
    expect(towns?.lists[0].label).toBe('Names')
    expect(towns && canRollFullName(towns)).toBe(false)
    const half = NAME_GROUPS.find((g) => groupLabel(g) === 'Half-Elf')
    expect(half?.note).toMatch(/human or elven/)
  })

  it('skips the table of contents and the combo formulas', () => {
    const all = NAME_GROUPS.flatMap((g) => g.lists.flatMap((l) => l.names))
    expect(all.some((n) => n.includes('`') || n.includes('['))).toBe(false)
    expect(NAME_GROUPS.some((g) => /combo|contents/i.test(groupLabel(g)))).toBe(
      false,
    )
  })

  it('ignores content before the first category and tolerates CRLF', () => {
    const md =
      '# Title\r\n## Stray\r\na, b, c, d\r\n# People\r\n## Folk\r\n- **Given:** Ann, Bo\r\n- **Surnames:** Cole\r\n'
    const groups = parseNameLists(md)
    expect(groups).toHaveLength(1)
    expect(groups[0].category).toBe('People')
    expect(rollFullName(groups[0], () => 0)).toBe('Ann Cole')
  })
})
