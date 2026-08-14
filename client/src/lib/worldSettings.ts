import { PHB_CLASSES } from './classes'
import type { ClassInfo } from './classes'

/**
 * Per-world settings, stored as `worldSettings.json` at the world root — the
 * same file that holds the world's own name/description/createdAt.
 *
 * At the root rather than under `.dm/` on purpose: the point is that you can
 * hand-edit it (the file watcher ignores dot-prefixed paths, so `.dm/` edits are
 * invisible until a restart). It stays out of the sidebar and the search index
 * anyway, because readTree only collects `*.md`.
 *
 * Parsing is tolerant field-by-field, the same contract as character
 * frontmatter: a hand edit that gets one field wrong must not cost you the rest
 * of the file.
 */

/** Written into every file we save, since a whole-file rewrite would drop it. */
export const SETTINGS_COMMENT =
  'Homebrew classes for this world. Class and subclass on a character are free ' +
  'text — this list only supplies dropdown suggestions and hit dice, so a ' +
  'class missing from here still works on a sheet.'

export const SETTINGS_VERSION = 2

export interface WorldSettings {
  version: number
  /**
   * The world's own metadata, which shares this file. The renderer reads it
   * from WorldSummary (worlds:get) rather than here — these are carried through
   * parse/serialize purely so a settings save can't drop them. The main process
   * merges them back in regardless; this is the second line of defence.
   */
  name?: string
  description?: string
  createdAt?: string
  classes: Array<ClassInfo>
}

/** What a world gets before it has a file of its own. */
export const DEFAULT_SETTINGS: WorldSettings = {
  version: SETTINGS_VERSION,
  classes: PHB_CLASSES,
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const strList = (v: unknown): Array<string> =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/**
 * A class definition's die, not a character's. Deliberately *not* clampHitDie:
 * that snaps to the nearest real die, which is right for a sheet field (a `d7`
 * is a typo) but wrong here, where the user has explicitly defined the class and
 * a d7 class is their business. Only nonsense falls back.
 */
function classHitDie(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 2 && v <= 100
    ? Math.round(v)
    : 8
}

/** Trim, drop blanks, drop case-insensitive duplicates, keep authored order. */
function cleanList(values: Array<string>): Array<string> {
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const text = value.trim()
    if (text === '') return []
    const key = text.toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)
    return [text]
  })
}

/** The on-disk identity is the name; `id` is derived, never stored. */
export function classId(name: string): string {
  return name.trim().toLowerCase()
}

function parseClass(raw: unknown): ClassInfo | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = str(r.name).trim()
  // A nameless class can't be picked, keyed or looked up — it's a hand-edit
  // artifact, so drop the row rather than inventing a name for it.
  if (name === '') return null
  const label = str(r.subclassLabel).trim()
  return {
    id: classId(name),
    name,
    hitDie: classHitDie(r.hitDie),
    subclassLabel: label === '' ? 'Subclass' : label,
    subclasses: cleanList(strList(r.subclasses)),
  }
}

/**
 * Parse the raw JSON from disk.
 *
 * `null` in means the file is absent or corrupt — the caller gets the built-in
 * defaults so a new or broken world still has working dropdowns. That is
 * deliberately *not* the same as a file that says `{"classes": []}`, which means
 * the user emptied the list on purpose and must be left empty; conflating the two
 * would make "delete every class" impossible in the editor.
 */
export function parseWorldSettings(raw: unknown): WorldSettings {
  if (raw === null || typeof raw !== 'object') return DEFAULT_SETTINGS
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.classes)) return DEFAULT_SETTINGS

  const seen = new Set<string>()
  const classes = r.classes.flatMap((entry): Array<ClassInfo> => {
    const parsed = parseClass(entry)
    if (!parsed) return []
    // Two entries sharing a name would collide as React keys and make findClass
    // ambiguous. First wins, matching how the lookup already behaves.
    if (seen.has(parsed.id)) return []
    seen.add(parsed.id)
    return [parsed]
  })

  const meta: Pick<WorldSettings, 'name' | 'description' | 'createdAt'> = {}
  for (const key of ['name', 'description', 'createdAt'] as const) {
    if (typeof r[key] === 'string') meta[key] = r[key]
  }

  return {
    version:
      typeof r.version === 'number' && Number.isFinite(r.version)
        ? r.version
        : SETTINGS_VERSION,
    ...meta,
    classes,
  }
}

/**
 * Back to the on-disk shape: `id` is dropped (derived from the name on the way
 * in) and the explanatory comment is re-emitted, since we rewrite the whole file
 * on every save.
 *
 * World metadata is passed straight back through when it was loaded, so saving
 * a class list can't erase the world's name. Keys stay absent when unset rather
 * than being written as undefined — the main process treats an absent key as
 * "keep what's on disk".
 */
export function serializeWorldSettings(settings: WorldSettings): unknown {
  return {
    version: settings.version,
    _comment: SETTINGS_COMMENT,
    ...(settings.name !== undefined && { name: settings.name }),
    ...(settings.description !== undefined && {
      description: settings.description,
    }),
    ...(settings.createdAt !== undefined && { createdAt: settings.createdAt }),
    classes: settings.classes.map((cl) => ({
      name: cl.name,
      hitDie: cl.hitDie,
      subclassLabel: cl.subclassLabel,
      subclasses: cl.subclasses,
    })),
  }
}
