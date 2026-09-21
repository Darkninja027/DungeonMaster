import { describe, expect, it } from 'vitest'
import { sortTimeline, timelineEntry } from './timeline'
import { isPlaySession } from '#/components/SessionTimeline'
import type { ArticleRef } from '#/lib/api'

/**
 * The timeline's whole difficulty is that `date:` is hand-written. The rule
 * being pinned here is that an unparseable date costs a session its *position*
 * and never its *place in the list* — a DM who dates sessions in Faerûnian
 * reckoning still sees every one of them.
 */

function ref(title: string, date: string | null = null): ArticleRef {
  return {
    id: `Sessions/${title}`,
    folderId: 'Sessions',
    title,
    cr: null,
    xp: null,
    level: null,
    school: null,
    classes: null,
    edition: null,
    date,
  }
}

const titles = (refs: Array<ArticleRef>) =>
  sortTimeline(refs).map((e) => e.ref.title)

describe('timelineEntry', () => {
  it('parses a real date', () => {
    const entry = timelineEntry(ref('One', '2026-09-20'))
    expect(entry.at).toBe(Date.parse('2026-09-20'))
    expect(entry.label).toBe('2026-09-20')
  })

  it('keeps an in-world date as a label without a timestamp', () => {
    const entry = timelineEntry(ref('One', '1492 DR, Eleint 3'))
    expect(entry.at).toBeNull()
    expect(entry.label).toBe('1492 DR, Eleint 3')
  })

  it('does not mistake a bare number for a year', () => {
    // Date.parse('12') is 2001-12-01, which would sort a session titled "12"
    // twenty-five years into the past.
    expect(timelineEntry(ref('One', '12')).at).toBeNull()
    expect(timelineEntry(ref('One', '1492')).at).toBeNull()
  })

  it('treats a blank or missing date as no date', () => {
    expect(timelineEntry(ref('One', null)).label).toBe('')
    expect(timelineEntry(ref('One', '   ')).at).toBeNull()
    expect(timelineEntry(ref('One', '   ')).label).toBe('')
  })
})

describe('sortTimeline', () => {
  it('puts the most recent real date first', () => {
    expect(
      titles([
        ref('Middle', '2026-05-01'),
        ref('Newest', '2026-09-01'),
        ref('Oldest', '2026-01-01'),
      ]),
    ).toEqual(['Newest', 'Middle', 'Oldest'])
  })

  it('ranks dated above in-world above undated', () => {
    expect(
      titles([
        ref('NoDate'),
        ref('InWorld', '1492 DR, Eleint 3'),
        ref('Real', '2026-09-01'),
      ]),
    ).toEqual(['Real', 'InWorld', 'NoDate'])
  })

  it('never drops a session for having an unreadable date', () => {
    const all = [
      ref('A', 'last tuesday'),
      ref('B'),
      ref('C', '2026-09-01'),
      ref('D', '1492 DR'),
    ]
    expect(titles(all)).toHaveLength(4)
  })

  it('sorts undated sessions by title, numerically', () => {
    // "Session 10" must follow "Session 9", not "Session 1".
    expect(
      titles([ref('Session 10'), ref('Session 2'), ref('Session 9')]),
    ).toEqual(['Session 2', 'Session 9', 'Session 10'])
  })

  it('orders a consistently written in-world calendar newest first', () => {
    expect(
      titles([
        ref('Early', '1492 DR, Eleint 03'),
        ref('Late', '1492 DR, Eleint 21'),
      ]),
    ).toEqual(['Late', 'Early'])
  })

  it('falls back to title when two sessions share a date', () => {
    expect(
      titles([ref('Second', '2026-09-01'), ref('First', '2026-09-01')]),
    ).toEqual(['First', 'Second'])
  })

  it('returns an empty list unchanged', () => {
    expect(sortTimeline([])).toEqual([])
  })
})

describe('isPlaySession', () => {
  it('excludes the seeded Guide, which borrows type: session for its styling', () => {
    // Guide.md ships with `type: session` so it renders as a book, not because
    // anyone played it. Left in, every new world's session log opens with a row
    // that is not a session. It sits at the world root, so its id is bare.
    expect(isPlaySession({ ...ref('Guide'), id: 'Guide' })).toBe(false)
  })

  it('keeps a real session, including one a DM happened to title Guide', () => {
    expect(isPlaySession(ref('Session 1'))).toBe(true)
    // Matched on id, not title: an article the DM wrote at Sessions/Guide is
    // theirs and stays.
    const theirs = { ...ref('Guide'), id: 'Sessions/Guide' }
    expect(isPlaySession(theirs)).toBe(true)
  })
})
