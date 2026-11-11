import { Dices, Swords } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '#/lib/utils'
import { turnOrder } from '#/lib/sessionStore'
import type { TableSession } from '#/lib/mapSession'
import { PanelRail } from '#/components/PanelRail'
import type { PanelRailTab } from '#/components/PanelRail'
import { RollRow } from '#/components/RollHistory'
import { ScrollArea } from '#/components/ui/scroll-area'
import type { MapSessionTab } from './MapSessionRail'

/**
 * The players' session sidebar: turn order and the rolls made in the open.
 *
 * Read-only, and fed ONLY by the pushed `TableSession` — never by this
 * window's own stores, which it deliberately leaves empty. What arrives is
 * already redacted by `forPlayersSession` in the editor: no HP, no AC, no DM
 * notes, nobody whose token is hidden, and the DM's rolls only if they chose to
 * share them. So this component has nothing to hide, and must stay that way.
 */

const TAB_ICON: Record<MapSessionTab, LucideIcon> = {
  initiative: Swords,
  rolls: Dices,
}

const TAB_TITLE: Record<MapSessionTab, string> = {
  initiative: 'Initiative',
  rolls: 'Rolls',
}

export function MapTableRail({
  session,
  open,
  tab,
  onToggle,
}: {
  session: TableSession
  open: boolean
  tab: MapSessionTab
  onToggle: (tab: MapSessionTab) => void
}) {
  const tabs: Array<PanelRailTab<MapSessionTab>> = (
    ['initiative', 'rolls'] as const
  ).map((id) => ({
    id,
    icon: TAB_ICON[id],
    title: TAB_TITLE[id],
    count:
      id === 'initiative' ? session.combatants.length : session.rolls.length,
  }))

  return (
    <div className="bg-background text-foreground h-full">
      <PanelRail
        tabs={tabs}
        open={open}
        active={tab}
        onToggle={onToggle}
        width="w-72"
      >
        {tab === 'initiative' ? (
          <TableInitiative session={session} />
        ) : session.rolls.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">No rolls yet.</p>
        ) : (
          <ScrollArea className="h-full">
            <ul className="divide-y">
              {session.rolls.map((roll) => (
                <RollRow key={roll.id} roll={roll} />
              ))}
            </ul>
          </ScrollArea>
        )}
      </PanelRail>
    </div>
  )
}

/** Turn order for a players' screen. Shared with the LAN guest's sidebar. */
export function TableInitiative({ session }: { session: TableSession }) {
  const order = turnOrder({
    version: 1,
    combatants: session.combatants,
    activeId: session.activeId,
    round: session.round,
  })
  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="min-h-0 flex-1">
        {order.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            No one has rolled initiative.
          </p>
        ) : (
          <ol className="divide-y">
            {order.map((c) => {
              const active = c.id === session.activeId
              const down = c.hp <= 0
              return (
                <li
                  key={c.id}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm',
                    active && 'bg-accent border-l-(--tome-gold) border-l-4',
                  )}
                >
                  <span className="bg-muted w-7 shrink-0 rounded text-center font-mono text-xs">
                    {c.initiative}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate font-medium',
                      down && 'text-muted-foreground line-through',
                    )}
                  >
                    {c.name}
                  </span>
                  {down ? (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      down
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}
      </ScrollArea>
      <div className="border-t px-3 py-2 text-sm font-medium">
        Round {session.round}
      </div>
    </div>
  )
}
