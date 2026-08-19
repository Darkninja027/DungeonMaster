import type { ArticleRef, ArticleSummary, WorldTree } from '#/lib/api'

/**
 * A row in the Bestiary or Spells panel, from either the open world or the
 * global library.
 *
 * `worldId` is carried per row rather than a bare `global` flag because every
 * consumer needs one anyway — fetching the article, rendering its markdown,
 * revealing it on disk, linking to its editor. A boolean would force each call
 * site to re-derive which world to use, and the first one that forgets would
 * read the wrong folder silently.
 */
export interface LibraryEntry {
  worldId: string
  articleId: string
  title: string
  /** True when this entry lives in the global library, not the open world. */
  global: boolean
  /**
   * True when the article carries `type: monster` frontmatter, so the encounter
   * builder can see it. Always true for spells, which match by folder alone.
   */
  queryable: boolean
  /**
   * Challenge rating and XP from frontmatter, when the query supplied them.
   *
   * Carried here so the bestiary list can label rows straight from the query it
   * already ran. Null for folder-only entries, which no query described — those
   * rows fall back to reading the article, one fetch instead of hundreds.
   */
  cr?: string | null
  xp?: number | null
  /**
   * Spell level, school and class list from frontmatter, when the query
   * supplied them. Same bargain as `cr`/`xp` above: carried so the spell
   * pickers can filter to "cantrips only" or "wizard spells" without reading
   * hundreds of articles. Undefined for folder-only entries, which is why the
   * filters treat "unknown" as "show it" rather than hiding the row.
   */
  level?: number | null
  school?: string | null
  classes?: Array<string> | null
}

/** Stable React key. A bare articleId collides — two worlds both have Monsters/Goblin. */
export function entryKey(entry: LibraryEntry): string {
  return `${entry.worldId}:${entry.articleId}`
}

function inFolder(
  article: Pick<ArticleSummary, 'folderId'>,
  folder: string,
): boolean {
  return (
    article.folderId === folder ||
    (article.folderId?.startsWith(`${folder}/`) ?? false)
  )
}

const byTitle = (a: LibraryEntry, b: LibraryEntry) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

/**
 * Monsters in one world: everything under `Monsters/` plus every article whose
 * frontmatter says `type: monster`, deduped by id.
 *
 * `queryable` tracks which ones carry the frontmatter, because the encounter
 * builder matches on `type: monster` alone — a folder-only entry is invisible
 * there, and the row flags it rather than letting the two lists disagree in
 * silence.
 */
export function collectMonsters(
  worldId: string,
  tree: WorldTree | undefined,
  typed: Array<ArticleRef> | undefined,
  options: { global?: boolean; folder?: string } = {},
): Array<LibraryEntry> {
  const folder = options.folder ?? 'Monsters'
  const global = options.global ?? false
  const queryable = new Set((typed ?? []).map((a) => a.id))
  const byId = new Map<string, LibraryEntry>()

  for (const a of tree?.articles ?? []) {
    if (!inFolder(a, folder)) continue
    byId.set(a.id, {
      worldId,
      articleId: a.id,
      title: a.title,
      global,
      queryable: queryable.has(a.id),
    })
  }
  // Typed articles win: they're queryable wherever they live in the world, and
  // they're the only source that carries cr/xp.
  for (const a of typed ?? []) {
    byId.set(a.id, {
      worldId,
      articleId: a.id,
      title: a.title,
      global,
      queryable: true,
      cr: a.cr,
      xp: a.xp,
    })
  }
  return [...byId.values()].sort(byTitle)
}

/**
 * Spells in one world: everything under `Spells/` plus every article whose
 * frontmatter says `type: spell`, deduped by id.
 *
 * The two sources are deliberately redundant. Folder membership alone used to be
 * the only source, which made the whole list hostage to one tree read — if that
 * read was empty or belonged to another world, the panel rendered nothing while
 * the files sat on disk. Monsters never showed that failure because they already
 * unioned a frontmatter query, so this mirrors them.
 *
 * Unlike monsters, `queryable` stays true throughout: it means "the encounter
 * builder can see this", which is a monster-only concept.
 */
export function collectSpells(
  worldId: string,
  tree: WorldTree | undefined,
  typed?: Array<ArticleRef> | undefined,
  options: { global?: boolean; folder?: string } = {},
): Array<LibraryEntry> {
  const folder = options.folder ?? 'Spells'
  const global = options.global ?? false
  const byId = new Map<string, LibraryEntry>()

  for (const a of tree?.articles ?? []) {
    if (!inFolder(a, folder)) continue
    byId.set(a.id, {
      worldId,
      articleId: a.id,
      title: a.title,
      global,
      queryable: true,
    })
  }
  for (const a of typed ?? []) {
    byId.set(a.id, {
      worldId,
      articleId: a.id,
      title: a.title,
      global,
      queryable: true,
      // The query knows the spell's level, school and list; the folder walk
      // above does not. Setting them last means a spell found both ways keeps
      // the richer record, which is what the pickers filter on.
      level: a.level,
      school: a.school,
      classes: a.classes,
    })
  }
  return [...byId.values()].sort(byTitle)
}

/**
 * World entries followed by global ones, each group already sorted, merged into
 * one title-sorted list.
 *
 * Deliberately no cross-world dedupe: a world Goblin and a library Goblin are
 * different articles and both show, distinguished by the badge. Collapsing them
 * would be override semantics, which this feature explicitly doesn't have.
 */
export function mergeEntries(
  world: Array<LibraryEntry>,
  global: Array<LibraryEntry>,
): Array<LibraryEntry> {
  return [...world, ...global].sort(byTitle)
}

/** Case-insensitive title filter for the panel search boxes. */
export function filterEntries(
  entries: Array<LibraryEntry>,
  filter: string,
): Array<LibraryEntry> {
  const needle = filter.trim().toLowerCase()
  if (!needle) return entries
  return entries.filter((e) => e.title.toLowerCase().includes(needle))
}

/**
 * Spells narrowed to a level and, optionally, a class list.
 *
 * **An entry that doesn't say is kept.** A spell article with no `level`
 * frontmatter — someone's homebrew, or a hand-written note — has to stay
 * offerable, because the alternative is a picker that silently hides the user's
 * own content. The shipped spells all declare level, school and classes, so in
 * practice this filters exactly what it should and lets everything unknown
 * through.
 *
 * `className` matches the frontmatter `classes` list case-insensitively. A
 * spell that names no classes is likewise kept.
 */
export function filterSpells(
  entries: Array<LibraryEntry>,
  options: { level?: number; className?: string } = {},
): Array<LibraryEntry> {
  const { level, className } = options
  const wantClass = className?.trim().toLowerCase()
  return entries.filter((e) => {
    if (level !== undefined && e.level != null && e.level !== level) {
      return false
    }
    if (wantClass && e.classes && e.classes.length > 0) {
      const has = e.classes.some((c) => c.trim().toLowerCase() === wantClass)
      if (!has) return false
    }
    return true
  })
}
