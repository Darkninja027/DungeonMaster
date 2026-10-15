import { DESCRIBE_SUBJECTS } from './subjects'
import type { DescribeSubject, DetailTable } from './subjects'

/**
 * The editable, markdown form of the Describe panel's subjects — what a DM
 * sees and edits under Settings → Describe lists.
 *
 * Markdown rather than a form because these are long, flat lists: a textarea
 * of bullets is the fastest editor there is for them, it is the same shape as
 * `names.md`, and the saved file opens fine in any text editor.
 *
 *     # Group                     -> DescribeSubject.group (picker optgroup)
 *     ## Subject                  -> a subject
 *     Types: npc, character       -> optional; article types it opens on
 *     - A prompt?                 -> bullets directly under ## are prompts
 *     ### Table                   -> a rollable table
 *     - an entry                  -> bullets under ### are entries
 *
 * Anything else (prose, blank lines, `---`) is ignored, never an error — the
 * same tolerance `parseNameLists` has. A subject with no tables, or a table
 * with no entries, is dropped: an empty roll button is worse than none.
 */

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  )
}

/** `base`, or `base-2`, `base-3`… — whichever `taken` doesn't have yet. */
function unique(base: string, taken: Set<string>): string {
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  taken.add(id)
  return id
}

/**
 * Built-ins by lower-cased label. A parsed subject whose label matches one
 * keeps that built-in's id and types, so customising the lists doesn't reset
 * the panel's remembered subject or break "an NPC article opens on NPC" —
 * unless the file says otherwise with its own `Types:` line.
 */
const BUILT_IN_BY_LABEL = new Map(
  DESCRIBE_SUBJECTS.map((s) => [s.label.toLowerCase(), s]),
)

interface Draft {
  group: string
  label: string
  types?: Array<string>
  prompts: Array<string>
  tables: Array<{ label: string; entries: Array<string> }>
}

export function parseDetails(markdown: string): Array<DescribeSubject> {
  const drafts: Array<Draft> = []
  let group = 'Other'
  let subject: Draft | null = null
  let table: Draft['tables'][number] | null = null

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      const text = heading[2].trim()
      if (heading[1].length === 1) {
        group = text || 'Other'
        subject = null
        table = null
      } else if (heading[1].length === 2) {
        subject = { group, label: text, prompts: [], tables: [] }
        drafts.push(subject)
        table = null
      } else if (subject) {
        table = { label: text, entries: [] }
        subject.tables.push(table)
      }
      continue
    }
    if (!subject) continue
    const types = /^types:\s*(.*)$/i.exec(line)
    if (types && !table) {
      subject.types = types[1]
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
      continue
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (!bullet) continue
    const text = bullet[1].trim()
    if (!text) continue
    if (table) table.entries.push(text)
    else subject.prompts.push(text)
  }

  const subjectIds = new Set<string>()
  const out: Array<DescribeSubject> = []
  for (const d of drafts) {
    const builtIn = BUILT_IN_BY_LABEL.get(d.label.toLowerCase())
    const tableIds = new Set<string>()
    const tables: Array<DetailTable> = d.tables
      .filter((t) => t.entries.length > 0)
      .map((t) => {
        // Same label-matching as subjects, so a saved copy of the defaults
        // is indistinguishable from the built-ins.
        const builtInTable = builtIn?.tables.find(
          (bt) => bt.label.toLowerCase() === t.label.toLowerCase(),
        )
        return {
          id: unique(builtInTable?.id ?? slug(t.label), tableIds),
          label: t.label || 'Untitled',
          // A duplicate silently doubles its odds; drop the repeat.
          entries: [...new Set(t.entries)],
        }
      })
    if (tables.length === 0) continue
    const types = d.types ?? builtIn?.types
    out.push({
      id: unique(builtIn?.id ?? slug(d.label), subjectIds),
      label: d.label || 'Untitled',
      group: d.group,
      prompts: d.prompts,
      tables,
      ...(types && types.length > 0 && { types }),
    })
  }
  return out
}

/** The inverse of `parseDetails`; how the built-ins become an editable copy. */
export function serializeDetails(
  subjects: ReadonlyArray<DescribeSubject>,
): string {
  // One line, and no line of it starts with '#': the parser would read a
  // wrapped '### …' continuation as a real table heading.
  const lines: Array<string> = [
    '<!-- Describe lists: a "#" line is a group, "##" a subject (bullets under it are prompts), "###" a rollable table (one bullet per entry). -->',
  ]
  let group: string | null = null
  for (const s of subjects) {
    if (s.group !== group) {
      group = s.group
      lines.push('', `# ${group}`)
    }
    lines.push('', `## ${s.label}`)
    if (s.types && s.types.length > 0)
      lines.push(`Types: ${s.types.join(', ')}`)
    for (const p of s.prompts) lines.push(`- ${p}`)
    for (const t of s.tables) {
      lines.push('', `### ${t.label}`)
      for (const e of t.entries) lines.push(`- ${e}`)
    }
  }
  return lines.join('\n') + '\n'
}

/** Optgroups in first-appearance order, so a DM's own file sets the order. */
export function groupsOf(
  subjects: ReadonlyArray<DescribeSubject>,
): Array<string> {
  return [...new Set(subjects.map((s) => s.group))]
}
