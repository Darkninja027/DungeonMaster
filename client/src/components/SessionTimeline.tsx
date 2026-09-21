import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarClock } from 'lucide-react'
import { api } from '#/lib/api'
import type { ArticleRef } from '#/lib/api'
import { sortTimeline } from '#/lib/timeline'
import { ScrollArea } from '#/components/ui/scroll-area'

/**
 * Every `type: session` article in the world, most recent first.
 *
 * The app had templates for sessions, quests, factions and the rest, so those
 * types already existed as structured frontmatter on disk — but only monsters
 * and spells had a surface that did anything with them. This is the smallest
 * useful correction: a campaign log assembled from articles the DM already
 * writes, rather than a new place to keep the same information.
 *
 * Read-only on purpose. A session is an ordinary markdown article and every
 * affordance for editing one already exists in the editor; duplicating any of
 * it here would mean two places to keep in step.
 */
/**
 * The seeded Guide article declares `type: session` — it borrows the template's
 * frontmatter for the page styling, not because it is a game anyone played. It
 * is excluded by id rather than by changing the Guide's type, which would
 * change how it renders, and every world has exactly one at this path.
 */
export function isPlaySession(ref: ArticleRef): boolean {
  return ref.id !== 'Guide'
}

export function SessionTimeline({ worldId }: { worldId: string }) {
  const sessions = useQuery({
    queryKey: ['worlds', worldId, 'query', { type: 'session' }],
    queryFn: () => api.worlds.query(worldId, { type: 'session' }),
    select: (refs) => sortTimeline(refs.filter(isPlaySession)),
  })

  const entries = sessions.data ?? []

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0.5 p-2">
        {sessions.isPending && (
          <p className="text-muted-foreground px-1 py-6 text-center text-sm">
            Loading…
          </p>
        )}

        {sessions.isSuccess && entries.length === 0 && (
          <p className="text-muted-foreground px-1 py-6 text-center text-sm">
            No session notes yet. Make one from the Session Notes template and
            it appears here.
          </p>
        )}

        {entries.map(({ ref, label, at }) => (
          <Link
            key={ref.id}
            to="/worlds/$worldId/articles/$articleId"
            params={{ worldId, articleId: ref.id }}
            className="hover:bg-accent flex items-baseline gap-2 rounded px-1.5 py-1 text-sm"
          >
            <CalendarClock className="text-muted-foreground size-3.5 shrink-0 self-center" />
            <span className="min-w-0 flex-1 truncate">{ref.title}</span>
            {label && (
              <span
                className="text-muted-foreground shrink-0 text-xs"
                // An unparsed date is shown exactly as written: it is usually
                // an in-world calendar, which is the DM's own vocabulary and
                // not something to normalise away.
                title={
                  at === null ? 'Not a calendar date — sorted by name' : label
                }
              >
                {label}
              </span>
            )}
          </Link>
        ))}
      </div>
    </ScrollArea>
  )
}
