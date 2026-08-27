import { PHB_CLASSES } from './classes'
import type { ClassInfo } from './classes'
import {
  EMPTY_HOMEBREW,
  parseBackground,
  parseFeat,
  parseHomebrew,
  parseKit,
  parseRace,
  serializeHomebrew,
} from './homebrew'
import type { HomebrewSubclass } from './homebrew'
import type { BackgroundInfo, ClassKit, FeatInfo, RaceInfo } from './srd'

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
  'Settings for this world. "liveEdit" picks the article editing surface: ' +
  '"remember" (default) shows a Live edit button and keeps your last choice, ' +
  '"always" hides markdown syntax while you type, "never" uses the plain text ' +
  'editor. "classes" are homebrew classes: class and subclass on a character ' +
  'are free text, so this list only supplies dropdown suggestions and hit ' +
  'dice, and a class missing from here still works on a sheet.'

export const SETTINGS_VERSION = 4

/**
 * How the article editor picks its editing surface.
 *
 * `remember` is the default and the pre-existing behaviour: the Write tab shows
 * a Live edit button and the last choice is kept in localStorage. Setting
 * `always` or `never` makes the world decide instead, and the button disappears
 * — a per-article override would contradict a preference the author set
 * deliberately for the whole world.
 */
export type LiveEditMode = 'remember' | 'always' | 'never'

export const LIVE_EDIT_MODES: Array<LiveEditMode> = [
  'remember',
  'always',
  'never',
]

export interface WorldSettings {
  version: number
  /** Editing surface for this world's articles. See LiveEditMode. */
  liveEdit: LiveEditMode
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
  /**
   * Homebrew this world adds on top of the global store (see lib/homebrew.ts).
   * Optional because most worlds have none, and because a file written before
   * version 4 simply has no key — that absence is the whole migration.
   *
   * These travel with the world folder, which global homebrew does not. Define
   * a race here when you want it to reach someone you send the world to.
   */
  races?: Array<RaceInfo>
  backgrounds?: Array<BackgroundInfo>
  kits?: Array<ClassKit>
  feats?: Array<FeatInfo>
  /**
   * Subclasses attached to a class by name, rather than defined inside a copy
   * of it — the world-level twin of `Homebrew.subclasses`. A world that adds
   * one College to the Bard travels with just that College, not a fork of the
   * whole class.
   */
  subclasses?: Array<HomebrewSubclass>
}

/** What a world gets before it has a file of its own. */
export const DEFAULT_SETTINGS: WorldSettings = {
  version: SETTINGS_VERSION,
  liveEdit: 'remember',
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

/**
 * A hand-edited `liveEdit` that isn't one of the three known modes falls back
 * to `remember` rather than being dropped — an unrecognised value shouldn't
 * lock someone into an editor they can't switch out of, and `remember` is the
 * only mode that leaves the toggle on screen.
 *
 * A file written before this field existed (version 2) simply has no key, which
 * lands on the same default. That is the whole migration.
 */
function parseLiveEdit(raw: unknown): LiveEditMode {
  return LIVE_EDIT_MODES.includes(raw as LiveEditMode)
    ? (raw as LiveEditMode)
    : 'remember'
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

  // Parsed before the classes guard below, so a world whose class list is
  // missing or malformed still keeps a valid editor preference — field-by-field
  // tolerance is the contract for this file.
  const liveEdit = parseLiveEdit(r.liveEdit)

  if (!Array.isArray(r.classes)) return { ...DEFAULT_SETTINGS, liveEdit }

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

  // Absent in a version 3 file, which is exactly what "no world homebrew"
  // means — so the migration is doing nothing at all.
  const homebrewList = <T extends { id: string }>(
    value: unknown,
    parse: (entry: unknown) => T | null,
  ): Array<T> | undefined => {
    if (!Array.isArray(value)) return undefined
    const ids = new Set<string>()
    return value.flatMap((entry): Array<T> => {
      const parsed = parse(entry)
      if (!parsed || parsed.id === '' || ids.has(parsed.id)) return []
      ids.add(parsed.id)
      return [parsed]
    })
  }
  const races = homebrewList(r.races, parseRace)
  const backgrounds = homebrewList(r.backgrounds, parseBackground)
  const kits = homebrewList(r.kits, parseKit)
  const feats = homebrewList(r.feats, parseFeat)
  // Through the global parser, so one shape is read one way in both tiers.
  const parsedSubclasses = parseHomebrew({
    subclasses: r.subclasses,
  }).subclasses
  const subclasses = Array.isArray(r.subclasses) ? parsedSubclasses : undefined

  return {
    version:
      typeof r.version === 'number' && Number.isFinite(r.version)
        ? r.version
        : SETTINGS_VERSION,
    liveEdit,
    ...meta,
    classes,
    ...(races && { races }),
    ...(backgrounds && { backgrounds }),
    ...(kits && { kits }),
    ...(feats && { feats }),
    ...(subclasses && { subclasses }),
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
    liveEdit: settings.liveEdit,
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
    // Written back through the same serializer the global store uses, so the
    // two files hold identical shapes and a race can be moved between them by
    // copy-paste. Keys stay absent when the world has none, rather than
    // littering every world's file with three empty arrays.
    ...(settings.races && {
      races: (
        serializeHomebrew({
          ...EMPTY_HOMEBREW,
          races: settings.races,
        }) as { races: unknown }
      ).races,
    }),
    ...(settings.backgrounds && {
      backgrounds: (
        serializeHomebrew({
          ...EMPTY_HOMEBREW,
          backgrounds: settings.backgrounds,
        }) as { backgrounds: unknown }
      ).backgrounds,
    }),
    ...(settings.kits && {
      kits: (
        serializeHomebrew({ ...EMPTY_HOMEBREW, kits: settings.kits }) as {
          kits: unknown
        }
      ).kits,
    }),
    ...(settings.feats && {
      feats: (
        serializeHomebrew({ ...EMPTY_HOMEBREW, feats: settings.feats }) as {
          feats: unknown
        }
      ).feats,
    }),
    ...(settings.subclasses && {
      subclasses: (
        serializeHomebrew({
          ...EMPTY_HOMEBREW,
          subclasses: settings.subclasses,
        }) as { subclasses: unknown }
      ).subclasses,
    }),
  }
}
