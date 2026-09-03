import { useEffect, useState } from 'react'
import { Dices, PawPrint, Skull, Sparkles, Swords, Wifi } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRollLog } from '#/lib/rollLog'
import { useWorldMode } from '#/lib/useWorldSettings'
import { useSpellPanelRequest } from '#/lib/spellPanel'
import { hydrateSession, useCombat } from '#/lib/sessionStore'
import { PanelRail } from '#/components/PanelRail'
import type { PanelRailTab } from '#/components/PanelRail'
import { EncounterBuilder } from '#/components/EncounterBuilder'
import { InitiativeTracker } from '#/components/InitiativeTracker'
import { MonsterReference } from '#/components/MonsterReference'
import { RollHistory } from '#/components/RollHistory'
import { TablePanel } from '#/components/TablePanel'
import { SpellReference } from '#/components/character/SpellReference'

type PanelTab =
  'initiative' | 'encounter' | 'rolls' | 'spells' | 'monsters' | 'table'

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
  'table',
]

const TAB_TITLE: Record<PanelTab, string> = {
  initiative: 'Initiative',
  encounter: 'Encounter builder',
  rolls: 'Roll history',
  spells: 'Spells',
  monsters: 'Bestiary',
  table: 'Table',
}

const TAB_ICON: Record<PanelTab, LucideIcon> = {
  initiative: Swords,
  encounter: Skull,
  rolls: Dices,
  spells: Sparkles,
  monsters: PawPrint,
  table: Wifi,
}

/** Rail button tooltips, which read as actions rather than section headings. */
const TAB_HINT: Record<PanelTab, string> = {
  initiative: 'Initiative tracker',
  encounter: 'Encounter builder',
  rolls: 'Roll history',
  spells: 'Spell reference',
  monsters: 'Bestiary',
  table: 'Host a LAN session',
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

  const railTabs: Array<PanelRailTab<PanelTab>> = tabs.map((entry) => ({
    id: entry,
    icon: TAB_ICON[entry],
    title: TAB_TITLE[entry],
    hint: TAB_HINT[entry],
    // Only two tabs carry a "there is something here" dot.
    count:
      entry === 'initiative'
        ? combat.combatants.length
        : entry === 'rolls'
          ? rolls.length
          : 0,
  }))

  return (
    <PanelRail tabs={railTabs} open={open} active={shown} onToggle={toggle}>
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
      ) : shown === 'table' ? (
        <TablePanel worldId={worldId} />
      ) : (
        <MonsterReference worldId={worldId} />
      )}
    </PanelRail>
  )
}
