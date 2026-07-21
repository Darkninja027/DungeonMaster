import { useEffect, useState } from 'react'
import { Dices, Skull, Sparkles, Swords } from 'lucide-react'
import { useRollLog } from '#/lib/rollLog'
import { useSpellPanelRequest } from '#/lib/spellPanel'
import { hydrateSession, useCombat } from '#/lib/sessionStore'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { EncounterBuilder } from '#/components/EncounterBuilder'
import { InitiativeTracker } from '#/components/InitiativeTracker'
import { RollHistory } from '#/components/RollHistory'
import { SpellReference } from '#/components/character/SpellReference'

type PanelTab = 'initiative' | 'encounter' | 'rolls' | 'spells'

const STORAGE_KEY = 'dm.sessionPanel'

function loadPanelState(): { open: boolean; tab: PanelTab } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as {
      open?: boolean
      tab?: string
    }
    const tab =
      raw.tab === 'rolls' ||
      raw.tab === 'spells' ||
      raw.tab === 'encounter' ||
      raw.tab === 'initiative'
        ? raw.tab
        : 'initiative'
    return { open: raw.open === true, tab }
  } catch {
    return { open: false, tab: 'initiative' }
  }
}

/**
 * DM session tools: a slim icon rail on the right edge of the world layout
 * that expands into a docked panel (initiative tracker / roll history). Docked
 * rather than an overlay so the DM can read a statblock while running combat.
 */
export function SessionPanel({ worldId }: { worldId: string }) {
  const [{ open, tab }, setPanel] = useState(loadPanelState)
  const combat = useCombat()
  const rolls = useRollLog()

  useEffect(() => {
    void hydrateSession(worldId)
  }, [worldId])

  // A spell name clicked on a character sheet opens it here.
  const spellRequest = useSpellPanelRequest()
  useEffect(() => {
    if (spellRequest) setPanel({ open: true, tab: 'spells' })
  }, [spellRequest])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ open, tab }))
  }, [open, tab])

  const toggle = (next: PanelTab) =>
    setPanel((prev) =>
      prev.open && prev.tab === next
        ? { ...prev, open: false }
        : { open: true, tab: next },
    )

  return (
    <div className="flex h-full shrink-0 border-l">
      {open && (
        <div className="flex h-full w-85 flex-col border-r">
          <div className="border-b px-3 py-2">
            <h3 className="text-sm font-semibold">
              {tab === 'initiative'
                ? 'Initiative'
                : tab === 'encounter'
                  ? 'Encounter builder'
                  : tab === 'rolls'
                    ? 'Roll history'
                    : 'Spells'}
            </h3>
          </div>
          <div className="min-h-0 flex-1">
            {tab === 'initiative' ? (
              <InitiativeTracker worldId={worldId} />
            ) : tab === 'encounter' ? (
              <EncounterBuilder
                worldId={worldId}
                onRun={() => setPanel({ open: true, tab: 'initiative' })}
              />
            ) : tab === 'rolls' ? (
              <RollHistory />
            ) : (
              <SpellReference worldId={worldId} />
            )}
          </div>
        </div>
      )}
      <div className="flex flex-col items-center gap-1 px-1.5 py-2">
        <Button
          variant={open && tab === 'initiative' ? 'secondary' : 'ghost'}
          size="icon"
          className="relative size-8"
          title="Initiative tracker"
          onClick={() => toggle('initiative')}
        >
          <Swords className="size-4" />
          {combat.combatants.length > 0 && (
            <span
              className={cn(
                'bg-primary absolute right-1 top-1 size-1.5 rounded-full',
                open && tab === 'initiative' && 'hidden',
              )}
            />
          )}
        </Button>
        <Button
          variant={open && tab === 'encounter' ? 'secondary' : 'ghost'}
          size="icon"
          className="size-8"
          title="Encounter builder"
          onClick={() => toggle('encounter')}
        >
          <Skull className="size-4" />
        </Button>
        <Button
          variant={open && tab === 'rolls' ? 'secondary' : 'ghost'}
          size="icon"
          className="relative size-8"
          title="Roll history"
          onClick={() => toggle('rolls')}
        >
          <Dices className="size-4" />
          {rolls.length > 0 && (
            <span
              className={cn(
                'bg-primary absolute right-1 top-1 size-1.5 rounded-full',
                open && tab === 'rolls' && 'hidden',
              )}
            />
          )}
        </Button>
        <Button
          variant={open && tab === 'spells' ? 'secondary' : 'ghost'}
          size="icon"
          className="size-8"
          title="Spell reference"
          onClick={() => toggle('spells')}
        >
          <Sparkles className="size-4" />
        </Button>
      </div>
    </div>
  )
}
