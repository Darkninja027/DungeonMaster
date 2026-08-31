import { useEffect, useState } from 'react'
import { Dices, PawPrint, Skull, Sparkles, Swords } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRollLog } from '#/lib/rollLog'
import { useWorldMode } from '#/lib/useWorldSettings'
import { useSpellPanelRequest } from '#/lib/spellPanel'
import { hydrateSession, useCombat } from '#/lib/sessionStore'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { EncounterBuilder } from '#/components/EncounterBuilder'
import { InitiativeTracker } from '#/components/InitiativeTracker'
import { MonsterReference } from '#/components/MonsterReference'
import { RollHistory } from '#/components/RollHistory'
import { SpellReference } from '#/components/character/SpellReference'

type PanelTab = 'initiative' | 'encounter' | 'rolls' | 'spells' | 'monsters'

const STORAGE_KEY = 'dm.sessionPanel'

/**
 * Every tab this panel can render, in rail order. Exported so worldMode.test.ts
 * can assert the mode registry names only tabs that actually exist — the one
 * seam where the two lists could drift, since lib/worldMode.ts must not import
 * a component.
 */
export const PANEL_TABS: Array<PanelTab> = [
  'initiative',
  'encounter',
  'rolls',
  'spells',
  'monsters',
]

const TAB_TITLE: Record<PanelTab, string> = {
  initiative: 'Initiative',
  encounter: 'Encounter builder',
  rolls: 'Roll history',
  spells: 'Spells',
  monsters: 'Bestiary',
}

const TAB_ICON: Record<PanelTab, LucideIcon> = {
  initiative: Swords,
  encounter: Skull,
  rolls: Dices,
  spells: Sparkles,
  monsters: PawPrint,
}

/** Rail button tooltips, which read as actions rather than section headings. */
const TAB_HINT: Record<PanelTab, string> = {
  initiative: 'Initiative tracker',
  encounter: 'Encounter builder',
  rolls: 'Roll history',
  spells: 'Spell reference',
  monsters: 'Bestiary',
}

/**
 * The remembered tab, narrowed to what this mode shows. The stored value
 * outlives a mode switch, so it can name a tab that is no longer on the rail —
 * falling back to the first allowed one keeps the panel from opening on a tab
 * that isn't there.
 */
function loadPanelState(allowed: Array<PanelTab>): {
  open: boolean
  tab: PanelTab
} {
  const fallback = allowed[0] ?? 'initiative'
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as {
      open?: boolean
      tab?: string
    }
    const tab = allowed.find((t) => t === raw.tab) ?? fallback
    return { open: raw.open === true, tab }
  } catch {
    return { open: false, tab: fallback }
  }
}

/**
 * DM session tools: a slim icon rail on the right edge of the world layout
 * that expands into a docked panel (initiative tracker / roll history). Docked
 * rather than an overlay so the DM can read a statblock while running combat.
 */
export function SessionPanel({ worldId }: { worldId: string }) {
  const mode = useWorldMode(worldId)
  const tabs = mode.shows.sessionTabs
  const [{ open, tab }, setPanel] = useState(() => loadPanelState(tabs))
  const combat = useCombat()
  const rolls = useRollLog()

  useEffect(() => {
    void hydrateSession(worldId)
  }, [worldId])

  // Switching mode can hide the tab that is currently open. Fall back rather
  // than rendering a panel whose rail button no longer exists.
  useEffect(() => {
    if (tabs.length === 0) return
    if (!tabs.includes(tab)) setPanel((prev) => ({ ...prev, tab: tabs[0] }))
  }, [tabs, tab])

  // A spell name clicked on a character sheet opens it here — but only if this
  // mode has somewhere to show it.
  const spellRequest = useSpellPanelRequest()
  useEffect(() => {
    if (spellRequest && tabs.includes('spells'))
      setPanel({ open: true, tab: 'spells' })
  }, [spellRequest, tabs])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ open, tab }))
  }, [open, tab])

  const toggle = (next: PanelTab) =>
    setPanel((prev) =>
      prev.open && prev.tab === next
        ? { ...prev, open: false }
        : { open: true, tab: next },
    )

  // Worldbuilder has no session tools at all, so the rail goes rather than
  // standing empty. An early return is safe here: every hook above it runs
  // unconditionally.
  if (tabs.length === 0) return null

  // A mode change can leave `tab` briefly stale before the effect above
  // corrects it; render the fallback rather than a blank panel for that frame.
  const shown = tabs.includes(tab) ? tab : tabs[0]

  return (
    <div className="flex h-full shrink-0 border-l">
      {open && (
        <div className="flex h-full w-85 flex-col border-r">
          <div className="border-b px-3 py-2">
            <h3 className="text-sm font-semibold">{TAB_TITLE[shown]}</h3>
          </div>
          <div className="min-h-0 flex-1">
            {shown === 'initiative' ? (
              <InitiativeTracker worldId={worldId} />
            ) : shown === 'encounter' ? (
              <EncounterBuilder
                worldId={worldId}
                onRun={() => setPanel({ open: true, tab: 'initiative' })}
              />
            ) : shown === 'rolls' ? (
              <RollHistory />
            ) : shown === 'spells' ? (
              <SpellReference worldId={worldId} />
            ) : (
              <MonsterReference worldId={worldId} />
            )}
          </div>
        </div>
      )}
      <div className="flex flex-col items-center gap-1 px-1.5 py-2">
        {tabs.map((entry) => {
          const Icon = TAB_ICON[entry]
          const active = open && shown === entry
          // Only two tabs carry a "there is something here" dot.
          const count =
            entry === 'initiative'
              ? combat.combatants.length
              : entry === 'rolls'
                ? rolls.length
                : 0
          return (
            <Button
              key={entry}
              variant={active ? 'secondary' : 'ghost'}
              size="icon"
              className="relative size-8"
              title={TAB_HINT[entry]}
              onClick={() => toggle(entry)}
            >
              <Icon className="size-4" />
              {count > 0 && (
                <span
                  className={cn(
                    'bg-primary absolute right-1 top-1 size-1.5 rounded-full',
                    active && 'hidden',
                  )}
                />
              )}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
