import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronsRight, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { api } from '#/lib/api'
import {
  combatActions,
  hydrateSession,
  turnOrder,
  useCombat,
} from '#/lib/sessionStore'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'

export function InitiativeTracker({ worldId }: { worldId: string }) {
  const combat = useCombat()

  useEffect(() => {
    void hydrateSession(worldId)
  }, [worldId])

  // Add form
  const [name, setName] = useState('')
  const [initiative, setInitiative] = useState('')
  const [hp, setHp] = useState('')
  const [ac, setAc] = useState('')
  const [pickedArticleId, setPickedArticleId] = useState<string | undefined>(
    undefined,
  )

  // Quick-add: suggest article titles (NPCs, monsters) from the cached tree.
  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })
  const suggestions =
    name.trim().length > 0 && pickedArticleId === undefined
      ? (tree.data?.articles ?? [])
          .filter((a) =>
            a.title.toLowerCase().includes(name.trim().toLowerCase()),
          )
          .slice(0, 6)
      : []

  const canAdd =
    name.trim().length > 0 &&
    initiative.trim() !== '' &&
    !isNaN(Number(initiative))

  const add = () => {
    if (!canAdd) return
    const hpValue =
      hp.trim() === '' || isNaN(Number(hp)) ? 0 : Math.max(0, Number(hp))
    combatActions.add({
      name: name.trim(),
      initiative: Number(initiative),
      hp: hpValue,
      maxHp: hpValue > 0 ? hpValue : null,
      ac: ac.trim() === '' || isNaN(Number(ac)) ? null : Number(ac),
      note: '',
      articleId: pickedArticleId,
    })
    setName('')
    setInitiative('')
    setHp('')
    setAc('')
    setPickedArticleId(undefined)
  }

  const order = turnOrder(combat)

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1.5 border-b p-2">
        <Input
          value={name}
          placeholder="Name (matches article titles)"
          className="h-7 text-sm"
          onChange={(e) => {
            setName(e.target.value)
            setPickedArticleId(undefined)
          }}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestions.map((a) => (
              <button
                key={a.id}
                type="button"
                className="hover:bg-accent rounded border px-1.5 py-0.5 text-xs"
                onClick={() => {
                  setName(a.title)
                  setPickedArticleId(a.id)
                }}
              >
                {a.title}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <Input
            value={initiative}
            placeholder="Init"
            className="h-7 text-sm"
            inputMode="numeric"
            onChange={(e) => setInitiative(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Input
            value={hp}
            placeholder="HP"
            className="h-7 text-sm"
            inputMode="numeric"
            onChange={(e) => setHp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Input
            value={ac}
            placeholder="AC"
            className="h-7 text-sm"
            inputMode="numeric"
            onChange={(e) => setAc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button
            size="sm"
            className="h-7 shrink-0"
            disabled={!canAdd}
            onClick={add}
          >
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {order.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            Add combatants above to start tracking initiative.
          </p>
        ) : (
          <ul className="divide-y">
            {order.map((c) => {
              const down = c.hp <= 0
              const active = combat.activeId === c.id
              return (
                <li
                  key={c.id}
                  className={cn(
                    'group px-2 py-1.5 text-sm',
                    active && 'bg-accent',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="bg-muted w-7 shrink-0 rounded text-center font-mono text-xs">
                      {c.initiative}
                    </span>
                    {c.articleId ? (
                      <Link
                        to="/worlds/$worldId/articles/$articleId"
                        params={{ worldId, articleId: c.articleId }}
                        className={cn(
                          'min-w-0 flex-1 truncate font-medium underline-offset-2 hover:underline',
                          down && 'text-destructive line-through',
                        )}
                      >
                        {c.name}
                      </Link>
                    ) : (
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate font-medium',
                          down && 'text-destructive line-through',
                        )}
                      >
                        {c.name}
                      </span>
                    )}
                    {c.ac != null && (
                      <span className="text-muted-foreground shrink-0 text-xs">
                        AC {c.ac}
                      </span>
                    )}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100"
                      title="Remove"
                      onClick={() => combatActions.remove(c.id)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-5"
                      title="Damage 1"
                      onClick={() =>
                        combatActions.update(c.id, { hp: c.hp - 1 })
                      }
                    >
                      <Minus className="size-3" />
                    </Button>
                    <Input
                      value={String(c.hp)}
                      className="h-5 w-14 px-1 text-center text-xs"
                      inputMode="numeric"
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (!isNaN(v)) combatActions.update(c.id, { hp: v })
                      }}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-5"
                      title="Heal 1"
                      onClick={() =>
                        combatActions.update(c.id, { hp: c.hp + 1 })
                      }
                    >
                      <Plus className="size-3" />
                    </Button>
                    <span className="text-muted-foreground text-xs">
                      {c.maxHp != null && `/ ${c.maxHp} HP`}
                      {down && ' — down'}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>

      <div className="flex items-center gap-2 border-t p-2">
        <span className="text-sm font-medium">Round {combat.round}</span>
        <Button
          size="sm"
          className="ml-auto h-7"
          disabled={order.length === 0}
          onClick={combatActions.nextTurn}
        >
          <ChevronsRight className="size-3.5" /> Next turn
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          title="Reset combat"
          disabled={order.length === 0 && combat.round === 1}
          onClick={() => {
            if (confirm('Clear all combatants and reset the round counter?')) {
              combatActions.reset()
            }
          }}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
