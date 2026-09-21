import type { ArticleRef } from '#/lib/api'

/**
 * Ordering for the session timeline.
 *
 * A session's `date` is **free text**, because a world is somebody's notebook:
 * "2026-09-20", "20/09/2026" and "1492 DR, Eleint 3" are all answers a DM
 * legitimately writes, and the in-world calendar one is arguably the most
 * useful of the three. So this sorts what it can parse and keeps the rest
 * rather than discarding a session for failing to be ISO 8601 — losing a
 * session from the list would be much worse than showing it in the wrong place.
 *
 * Three tiers, newest first:
 *   1. parseable dates, most recent first
 *   2. unparseable but non-empty dates, alphabetically — an in-world calendar
 *      sorts sensibly this way as long as it is written consistently
 *   3. no date at all, by title
 *
 * Deliberately not a date *parser*. `Date.parse` is the whole strategy, and
 * anything it rejects falls to tier 2 — teaching this to read Faerûnian
 * calendars is a rabbit hole, and the tiering means it does not need to.
 */

export interface TimelineEntry {
  ref: ArticleRef
  /** Milliseconds since epoch, or null when the date isn't machine-readable. */
  at: number | null
  /** The raw `date:` string, for display. Empty when the article has none. */
  label: string
}

/**
 * `Date.parse` accepts some things that are not dates at all — a bare `"12"`
 * becomes the year 2001 — so a value has to look date-ish before it is trusted.
 * The bar is deliberately low: at least one separator or month name, which
 * "1492 DR, Eleint 3" fails (correctly, tier 2) and "2026-09-20" passes.
 */
function looksDateish(raw: string): boolean {
  if (/^\d{1,4}$/.test(raw)) return false
  return /[-/]/.test(raw) || /[A-Za-z]{3,}/.test(raw)
}

export function timelineEntry(ref: ArticleRef): TimelineEntry {
  const label = (ref.date ?? '').trim()
  if (!label) return { ref, at: null, label: '' }
  if (!looksDateish(label)) return { ref, at: null, label }
  const parsed = Date.parse(label)
  return { ref, at: Number.isNaN(parsed) ? null : parsed, label }
}

export function sortTimeline(refs: Array<ArticleRef>): Array<TimelineEntry> {
  const entries = refs.map(timelineEntry)
  return entries.sort((a, b) => {
    // Tier 1 before tier 2 before tier 3.
    const tier = (e: TimelineEntry) => (e.at !== null ? 0 : e.label ? 1 : 2)
    const byTier = tier(a) - tier(b)
    if (byTier !== 0) return byTier

    // Only decides when the two differ: two sessions played on the same day
    // must still fall through to the title, or their order is whatever the
    // scan happened to yield.
    if (a.at !== null && b.at !== null && a.at !== b.at) return b.at - a.at
    if (a.label && b.label) {
      const byLabel = b.label.localeCompare(a.label, undefined, {
        sensitivity: 'base',
        numeric: true,
      })
      if (byLabel !== 0) return byLabel
    }
    // Numeric so "Session 10" follows "Session 9" rather than "Session 1".
    return a.ref.title.localeCompare(b.ref.title, undefined, {
      sensitivity: 'base',
      numeric: true,
    })
  })
}
