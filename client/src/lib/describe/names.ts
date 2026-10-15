import NAMES_MARKDOWN from './names.md?raw'

/**
 * Rollable name lists for the Describe panel, parsed from `names.md`.
 *
 * The markdown file is the source rather than a TypeScript constant because it
 * is the thing people actually edit: a long, flat list of names reads and
 * diffs far better as prose than as 400 lines of quoted strings. It is bundled
 * at build time via Vite's `?raw`, so nothing is read from disk at runtime.
 *
 * Shape the parser understands (anything else is ignored, not an error):
 *
 *     # Category            -> NameGroup.category ("NPC Names")
 *     ## Heading            -> NameGroup.path[0]
 *     ### Sub-heading       -> NameGroup.path[1]
 *     - **Label:** a, b, c  -> a labelled list
 *     a, b, c, d            -> an unlabelled list (labelled "Names")
 *     A sentence.           -> NameGroup.note
 */

export interface NameList {
  label: string
  names: ReadonlyArray<string>
}

export interface NameGroup {
  /** The `#` heading it sits under, e.g. "NPC Names". */
  category: string
  /** `##` then optional `###` heading, e.g. ["Human", "Northern / Nordic-style"]. */
  path: ReadonlyArray<string>
  lists: ReadonlyArray<NameList>
  /** Any prose under the heading, joined. */
  note?: string
}

/** Fewer items than this on a bare line is a sentence, not a name list. */
const MIN_BARE_ITEMS = 4

/** Headings whose content is never names, wherever they appear. */
const SKIP_HEADING = /^(table of contents|quick combo tricks)$/i

/**
 * A list label that names a family/second name rather than a given one. Drives
 * the "Full name" roll, which pairs one given name with one of these.
 */
const SURNAME_LABEL = /surname|family|clan|house|epithet|nickname|tribe/i

/** Split on commas that are not inside parentheses: "Amakiir (Gemflower), …". */
function splitNames(text: string): Array<string> {
  const out: Array<string> = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(current)
      current = ''
    } else current += ch
  }
  out.push(current)
  return out.map((n) => n.trim()).filter((n) => n.length > 0)
}

export function parseNameLists(markdown: string): Array<NameGroup> {
  const groups: Array<NameGroup> = []
  let category: string | null = null
  let path: Array<string> = []
  let skipping = false
  let current: { lists: Array<NameList>; notes: Array<string> } | null = null
  let sawTitle = false

  const flush = () => {
    if (current && category && current.lists.length > 0) {
      groups.push({
        category,
        path: [...path],
        lists: current.lists,
        ...(current.notes.length > 0 && { note: current.notes.join(' ') }),
      })
    }
    current = null
  }

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      const level = heading[1].length
      const text = heading[2].trim()
      skipping = SKIP_HEADING.test(text)
      if (level === 1) {
        // The document's own title is the first `#`, not a category.
        if (!sawTitle) {
          sawTitle = true
          category = null
        } else category = skipping ? null : text
        path = []
      } else if (level === 2) path = [text]
      else path = [path[0] ?? '', text]
      continue
    }
    if (skipping || !category || path.length === 0) continue
    if (!line || line === '---') continue
    // Combo-trick style lines are formulas, not names.
    if (line.includes('`')) continue

    current ??= { lists: [], notes: [] }
    const labelled = /^[-*]\s+\*\*(.+?):?\*\*:?\s*(.*)$/.exec(line)
    if (labelled) {
      const names = splitNames(labelled[2])
      if (names.length > 0)
        current.lists.push({ label: labelled[1].replace(/:$/, ''), names })
      continue
    }
    const names = splitNames(line.replace(/^[-*]\s+/, ''))
    if (names.length >= MIN_BARE_ITEMS)
      current.lists.push({ label: 'Names', names })
    else current.notes.push(line)
  }
  flush()
  return groups
}

export const NAME_GROUPS: ReadonlyArray<NameGroup> =
  parseNameLists(NAMES_MARKDOWN)

export function nameCategories(
  groups: ReadonlyArray<NameGroup> = NAME_GROUPS,
): Array<string> {
  return [...new Set(groups.map((g) => g.category))]
}

/** "Human › Northern / Nordic-style" — the label a group shows in a picker. */
export function groupLabel(group: NameGroup): string {
  return group.path.join(' › ')
}

export function isSurnameList(list: NameList): boolean {
  return SURNAME_LABEL.test(list.label)
}

/**
 * Whether a group can roll a "given + family" full name: it needs at least one
 * list of each kind. Location, shop and faction groups never can.
 */
export function canRollFullName(group: NameGroup): boolean {
  return (
    group.lists.some(isSurnameList) &&
    group.lists.some((l) => !isSurnameList(l))
  )
}

/**
 * One given name from any given-name list plus one from any surname list.
 * Parenthetical glosses ("Amakiir (Gemflower)") are dropped from the result:
 * they are a note for the DM, not part of the name.
 */
export function rollFullName(
  group: NameGroup,
  rand: () => number = Math.random,
): string | undefined {
  const pick = (lists: ReadonlyArray<NameList>) => {
    const pool = lists.flatMap((l) => l.names)
    if (pool.length === 0) return undefined
    return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]
  }
  const given = pick(group.lists.filter((l) => !isSurnameList(l)))
  const family = pick(group.lists.filter(isSurnameList))
  if (!given || !family) return undefined
  return `${given} ${family}`.replace(/\s*\([^)]*\)/g, '').trim()
}
