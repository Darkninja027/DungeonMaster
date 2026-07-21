import { Link } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { clearRollLog, useRollLog } from '#/lib/rollLog'
import { Button } from '#/components/ui/button'
import { ScrollArea } from '#/components/ui/scroll-area'

function timeAgo(at: number): string {
  const s = Math.floor((Date.now() - at) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export function RollHistory() {
  const rolls = useRollLog()

  if (rolls.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        Click any dice chip or "Roll" button in an article and the result shows
        up here.
      </p>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-muted-foreground text-xs">
          {rolls.length} rolls this session
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={clearRollLog}
        >
          <Trash2 className="size-3" /> Clear
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="divide-y">
          {rolls.map((roll) => (
            <li key={roll.id} className="px-3 py-2 text-sm">
              <div className="flex items-baseline gap-2">
                {roll.label && (
                  <span
                    className="min-w-0 truncate font-medium"
                    title={roll.label}
                  >
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
              {roll.source && (
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
              )}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}
