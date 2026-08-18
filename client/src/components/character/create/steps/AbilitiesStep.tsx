import { useState } from 'react'
import { Wand2 } from 'lucide-react'
import type { AbilityDraft, AbilityMethod } from '#/lib/abilityMethods'
import {
  STANDARD_ARRAY,
  autoAssign,
  emptyAssignment,
  pointBuyFloor,
  usesPool,
} from '#/lib/abilityMethods'
import type { CharacterDraft } from '#/lib/characterDraft'
import { draftKit, racialAsi } from '#/lib/characterDraft'
import { Button } from '#/components/ui/button'
import { OptionCard } from '../OptionCard'
import { AssignGrid } from '../abilities/AssignRow'
import { GridPanel } from '../abilities/GridPanel'
import { ManualPanel } from '../abilities/ManualPanel'
import { PointBuyPanel } from '../abilities/PointBuyPanel'
import { RolledPanel } from '../abilities/RolledPanel'

const METHODS: Array<{
  id: AbilityMethod
  name: string
  description: string
}> = [
  {
    id: 'standard',
    name: 'Standard array',
    description: '15, 14, 13, 12, 10, 8 — assign as you like.',
  },
  {
    id: 'pointbuy',
    name: 'Point buy',
    description: '27 points to spend, scores from 8 to 15.',
  },
  {
    id: 'rolled',
    name: 'Roll 4d6',
    description: 'Six rolls, drop the lowest die each time.',
  },
  {
    id: 'grid',
    name: 'Grid method',
    description: 'Nine rolls in a 3×3 — draw two lines through it.',
  },
  {
    id: 'manual',
    name: 'Enter manually',
    description: 'Type the numbers in yourself.',
  },
]

export function AbilitiesStep({
  draft,
  onChange,
}: {
  draft: CharacterDraft
  onChange: (next: CharacterDraft) => void
}) {
  const [allowSingleRerolls, setAllowSingleRerolls] = useState(false)
  const asi = racialAsi(draft)
  const abilities = draft.abilities
  const kit = draftKit(draft)

  const setAbilities = (next: AbilityDraft) =>
    onChange({ ...draft, abilities: next })

  /**
   * Switching method resets the assignment — the old indices point into a pool
   * that no longer exists. Point buy also drops to its floor rather than
   * inheriting whatever the last method produced, which would usually be an
   * illegal spread.
   */
  const setMethod = (method: AbilityMethod) => {
    if (method === abilities.method) return
    setAbilities({
      ...abilities,
      method,
      assignment: emptyAssignment(),
      direct:
        method === 'pointbuy'
          ? pointBuyFloor()
          : method === 'manual'
            ? abilities.direct
            : abilities.direct,
      grid:
        method === 'grid'
          ? (abilities.grid ?? { cells: null, lineA: null, lineB: null })
          : abilities.grid,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-medium">How do you want to roll?</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {METHODS.map((method) => (
            <OptionCard
              key={method.id}
              title={method.name}
              description={method.description}
              selected={abilities.method === method.id}
              onSelect={() => setMethod(method.id)}
            />
          ))}
        </div>
      </div>

      {abilities.method === 'standard' && (
        <p className="text-muted-foreground text-sm">
          The standard array: {STANDARD_ARRAY.join(', ')}. Assign one value to
          each ability.
        </p>
      )}

      {abilities.method === 'rolled' && (
        <RolledPanel
          state={abilities.rolled}
          allowSingleRerolls={allowSingleRerolls}
          onToggleRerolls={setAllowSingleRerolls}
          onChange={(rolled) =>
            setAbilities({
              ...abilities,
              rolled,
              assignment: emptyAssignment(),
            })
          }
        />
      )}

      {abilities.method === 'grid' && (
        <GridPanel
          state={abilities.grid ?? { cells: null, lineA: null, lineB: null }}
          onChange={(grid) =>
            setAbilities({ ...abilities, grid, assignment: emptyAssignment() })
          }
        />
      )}

      {abilities.method === 'pointbuy' && (
        <PointBuyPanel
          scores={abilities.direct}
          asi={asi}
          onChange={(direct) => setAbilities({ ...abilities, direct })}
        />
      )}

      {abilities.method === 'manual' && (
        <ManualPanel
          scores={abilities.direct}
          asi={asi}
          onChange={(direct) => setAbilities({ ...abilities, direct })}
        />
      )}

      {usesPool(abilities.method) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Assign your scores</h3>
            {kit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setAbilities(autoAssign(abilities, kit.abilityPriority))
                }
              >
                <Wand2 /> Suggest for a {kit.name}
              </Button>
            )}
          </div>
          <AssignGrid draft={abilities} asi={asi} onChange={setAbilities} />
        </div>
      )}
    </div>
  )
}
