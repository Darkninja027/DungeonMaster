import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { clearRollLog, useRollLog } from '#/lib/rollLog'
import type { RollEntry } from '#/lib/rollLog'
import { DiceRoller } from '#/components/DiceRoller'
import { Button } from '#/components/ui/button'
import { ScrollArea } from '#/components/ui/scroll-area'

function timeAgo(at: number): string {
  const s = Math.floor((Date.now() - at) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

/**
 * Opens a roll's source article. Absent, the source is a router Link into the
 * notebook — right in the DM window, and wrong in the battlemap window, where
 * navigating would replace the map with a world route (and subscribe a second
 * `worlds:watch`; see routes/map). The map passes a popout opener instead.
 */
export type OpenArticle = (worldId: string, articleId: string) => void

export function RollHistory({
  openArticle,
}: { openArticle?: OpenArticle } = {}) {
  const allRolls = useRollLog()
  // Filter by roll source (article/character), keyed by articleId.
  const [sourceFilter, setSourceFilter] = useState('')

  // The roller stays even with an empty log — an empty log is exactly when
  // someone wants to roll something, so an early return here would hide it at
  // the only moment it is the obvious thing on screen.
  if (allRolls.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b">
          <DiceRoller />
        </div>
        <p className="text-muted-foreground p-4 text-sm">
          Roll something above, or click any dice chip in an article, and the
          result shows up here.
        </p>
      </div>
    )
  }

  const sources = new Map<string, string>()
  for (const roll of allRolls) {
    if (roll.source) sources.set(roll.source.articleId, roll.source.title)
  }
  const rolls = sourceFilter
    ? allRolls.filter((r) => r.source?.articleId === sourceFilter)
    : allRolls

  return (
    <div className="flex h-full flex-col">
      <div className="border-b">
        <DiceRoller />
      </div>
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        {sources.size > 1 ? (
          <select
            className="bg-background h-6 min-w-0 flex-1 truncate rounded border px-1 text-xs"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All sources ({allRolls.length})</option>
            {[...sources].map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-muted-foreground flex-1 text-xs">
            {allRolls.length} rolls this session
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 text-xs"
          onClick={clearRollLog}
        >
          <Trash2 className="size-3" /> Clear
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="divide-y">
          {rolls.map((roll) => (
            <RollRow key={roll.id} roll={roll} openArticle={openArticle} />
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}

/**
 * One roll. Shared with the players' map sidebar, which renders a pushed,
 * redacted log rather than this window's own — so the row is the one thing the
 * two lists have in common, and the one thing that must not drift.
 */
export function RollRow({
  roll,
  openArticle,
}: {
  roll: RollEntry
  openArticle?: OpenArticle
}) {
  return (
    <li className="px-3 py-2 text-sm">
      {roll.seat && (
        <p className="text-muted-foreground text-xs">
          {roll.seat.character
            ? `${roll.seat.name} as ${roll.seat.character}`
            : roll.seat.name}
        </p>
      )}
      <div className="flex items-baseline gap-2">
        {roll.label && (
          <span className="min-w-0 truncate font-medium" title={roll.label}>
            {roll.label}
          </span>
        )}
        <span className="bg-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
          {roll.notation}
        </span>
        <strong className="shrink-0">{roll.total}</strong>
        <span className="text-muted-foreground ml-auto shrink-0 text-xs">
          {timeAgo(roll.at)}
        </span>
      </div>
      {roll.detail && (
        <p
          className="text-muted-foreground truncate text-xs"
          title={roll.detail}
        >
          {roll.detail}
        </p>
      )}
      {roll.source &&
        // A roll relayed from another machine is LABEL ONLY. Its source named
        // an article in the host's world, and the ids are stripped at the wire
        // (forGuests in tableHost.ts) because a world id is hex of the host's
        // absolute path. The players' map sidebar strips them the same way.
        //
        // Guarding on the ids rather than on `seat` is deliberate: the DM's own
        // rolls reach guests with no seat at all, so a seat check would leave
        // exactly those rendering a Link with undefined params — which builds a
        // broken route, and on one machine testing both ends actually navigates
        // the DM window.
        (!roll.source.worldId || !roll.source.articleId ? (
          <span className="text-muted-foreground text-xs">
            {roll.source.title}
          </span>
        ) : openArticle ? (
          <button
            type="button"
            onClick={() =>
              openArticle(roll.source!.worldId, roll.source!.articleId)
            }
            className="text-muted-foreground hover:text-foreground text-xs underline"
          >
            {roll.source.title}
          </button>
        ) : (
          <Link
            to="/worlds/$worldId/articles/$articleId"
            params={{
              worldId: roll.source.worldId,
              articleId: roll.source.articleId,
            }}
            className="text-muted-foreground hover:text-foreground text-xs underline"
          >
            {roll.source.title}
          </Link>
        ))}
    </li>
  )
}
