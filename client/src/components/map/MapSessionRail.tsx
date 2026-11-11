import { Dices, Swords } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '#/lib/api'
import { useRollLog } from '#/lib/rollLog'
import { useCombat } from '#/lib/sessionStore'
import { PanelRail } from '#/components/PanelRail'
import type { PanelRailTab } from '#/components/PanelRail'
import { InitiativeTracker } from '#/components/InitiativeTracker'
import { RollHistory } from '#/components/RollHistory'

/**
 * The battlemap editor's session sidebar: initiative and the roll log.
 *
 * The map window is its own BrowserWindow, so the DM window's session rail is
 * on another monitor at best — and running a fight means turning to it every
 * turn. These are the same two components that rail renders, not copies, so
 * the tracker here and the tracker there are one tracker; combat goes through
 * main's state authority and rolls through the relay, so both windows agree.
 *
 * Article links open as popouts: a router Link in this window would navigate
 * the map away (see `OpenArticle`).
 */

export type MapSessionTab = 'initiative' | 'rolls'

export const MAP_SESSION_TABS: Array<MapSessionTab> = ['initiative', 'rolls']

const TAB_ICON: Record<MapSessionTab, LucideIcon> = {
  initiative: Swords,
  rolls: Dices,
}

const TAB_TITLE: Record<MapSessionTab, string> = {
  initiative: 'Initiative',
  rolls: 'Roll history',
}

const openPopout = (worldId: string, articleId: string) =>
  void api.player.show(worldId, articleId, 'popout')

export function MapSessionRail({
  worldId,
  open,
  tab,
  onToggle,
  showing,
  shareRolls,
  onShareRolls,
}: {
  worldId: string
  open: boolean
  tab: MapSessionTab
  onToggle: (tab: MapSessionTab) => void
  /** Whether this map is on the players' screen — the share toggle only means something then. */
  showing: boolean
  shareRolls: boolean
  onShareRolls: (on: boolean) => void
}) {
  const combat = useCombat()
  const rolls = useRollLog()

  const tabs: Array<PanelRailTab<MapSessionTab>> = MAP_SESSION_TABS.map(
    (id) => ({
      id,
      icon: TAB_ICON[id],
      title: TAB_TITLE[id],
      hint: `${TAB_TITLE[id]} (${id === 'initiative' ? 'I' : 'D'})`,
      count: id === 'initiative' ? combat.combatants.length : rolls.length,
    }),
  )

  return (
    <PanelRail tabs={tabs} open={open} active={tab} onToggle={onToggle}>
      {tab === 'initiative' ? (
        <InitiativeTracker worldId={worldId} openArticle={openPopout} />
      ) : (
        <div className="flex h-full flex-col">
          {showing ? (
            // Behind the screen by default: a DM's roll is theirs to reveal.
            <label className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={shareRolls}
                onChange={(e) => onShareRolls(e.target.checked)}
              />
              Show my rolls on the players' screen
            </label>
          ) : null}
          <div className="min-h-0 flex-1">
            <RollHistory openArticle={openPopout} />
          </div>
        </div>
      )}
    </PanelRail>
  )
}
