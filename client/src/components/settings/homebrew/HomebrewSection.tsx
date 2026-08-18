import { useEffect, useRef, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import type { Homebrew } from '#/lib/homebrew'
import { useHomebrew, useSaveHomebrew, useTables } from '#/lib/useHomebrew'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { BackgroundEditor, blankBackground } from './BackgroundEditor'
import { ClassKitEditor, blankKit } from './ClassKitEditor'
import { RaceEditor, blankRace } from './RaceEditor'

type Tab = 'races' | 'backgrounds' | 'kits'

const TABS: Array<{ id: Tab; label: string; blurb: string }> = [
  {
    id: 'races',
    label: 'Races',
    blurb: 'Ability increases, speed, traits and subraces.',
  },
  {
    id: 'backgrounds',
    label: 'Backgrounds',
    blurb: 'Skills, equipment and a feature.',
  },
  {
    id: 'kits',
    label: 'Class kits',
    blurb: 'What a class starts with at 1st level.',
  },
]

/**
 * Homebrew shared by every world.
 *
 * Edits are held locally and written on Save rather than per keystroke, the
 * same reasoning as the class list: every write rewrites the whole file, so
 * saving per character typed would be a lot of pointless disk churn.
 *
 * App-wide rather than per-world, which is why it sits next to Library in the
 * settings nav. The tradeoff is stated in the header below, because "my races
 * didn't travel with the world I sent you" is otherwise a nasty surprise.
 */
export function HomebrewSection({ worldId }: { worldId: string }) {
  const { data: stored } = useHomebrew()
  const save = useSaveHomebrew()
  const tables = useTables(worldId)

  const [tab, setTab] = useState<Tab>('races')
  const [draft, setDraft] = useState<Homebrew | null>(null)
  const [selected, setSelected] = useState(0)

  // Adopt the file's contents whenever a *different* one arrives — first load,
  // and every later external edit. Keyed on the last value adopted rather than
  // on "is the draft null", which would latch onto the first load and ignore
  // everything after it.
  const adoptedRef = useRef<Homebrew | null>(null)
  useEffect(() => {
    if (!stored) return
    if (adoptedRef.current === stored) return
    adoptedRef.current = stored
    setDraft(stored)
  }, [stored])

  const homebrew = draft ?? stored
  const dirty = draft !== null && draft !== adoptedRef.current

  if (!homebrew) return null

  const list = homebrew[tab]
  const current = list.at(selected)

  const patchList = (next: Array<unknown>) => {
    setDraft({ ...homebrew, [tab]: next })
  }

  const add = () => {
    const blank =
      tab === 'races'
        ? blankRace()
        : tab === 'backgrounds'
          ? blankBackground()
          : blankKit()
    patchList([...list, blank])
    setSelected(list.length)
  }

  const remove = (i: number) => {
    patchList(list.filter((_, j) => j !== i))
    setSelected((s) => (s >= i && s > 0 ? s - 1 : s))
  }

  const replace = (entry: unknown) => {
    patchList(list.map((e, j) => (j === selected ? entry : e)))
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          Offered in every world alongside the built-in SRD entries. A world can
          override any of these by defining the same name in its own settings.{' '}
          <strong className="text-foreground font-medium">
            These live with the app, not the world folder
          </strong>
          , so they don&rsquo;t travel when you send a world to someone else.
        </p>
        <Button
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={!dirty || save.isPending}
          onClick={() => {
            save.mutate(homebrew, {
              onSuccess: () => {
                adoptedRef.current = null
                setDraft(null)
              },
            })
          }}
        >
          <Save className="size-3.5" /> {dirty ? 'Save' : 'Saved'}
        </Button>
      </div>

      {save.error && (
        <p className="text-destructive text-xs">{save.error.message}</p>
      )}

      <div className="flex gap-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            title={entry.blurb}
            onClick={() => {
              setTab(entry.id)
              setSelected(0)
            }}
            className={cn(
              'rounded-md px-2.5 py-1 text-sm transition-colors',
              tab === entry.id ? 'bg-accent font-medium' : 'hover:bg-accent/50',
            )}
          >
            {entry.label}
            <span className="text-muted-foreground ml-1.5 text-xs">
              {homebrew[entry.id].length}
            </span>
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[200px_1fr]">
        <div className="flex min-h-0 flex-col gap-1">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {list.map((entry, i) => (
              <button
                key={`${entry.id}-${i}`}
                type="button"
                className={cn(
                  'group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                  i === selected ? 'bg-accent' : 'hover:bg-accent/50',
                )}
                onClick={() => setSelected(i)}
              >
                <span className="min-w-0 flex-1 truncate">
                  {entry.name || (
                    <span className="text-muted-foreground italic">
                      Untitled
                    </span>
                  )}
                </span>
                <Trash2
                  className="text-muted-foreground hover:text-destructive size-3.5 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(i)
                  }}
                />
              </button>
            ))}
            {list.length === 0 && (
              <p className="text-muted-foreground p-2 text-xs">
                Nothing yet. The SRD entries are always offered regardless.
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={add}
          >
            <Plus className="size-3.5" /> Add
          </Button>
        </div>

        <div className="min-h-0 overflow-y-auto pr-1">
          {!current ? (
            <p className="text-muted-foreground p-2 text-xs">
              Select something on the left, or add one.
            </p>
          ) : tab === 'races' ? (
            <RaceEditor race={homebrew.races[selected]} onChange={replace} />
          ) : tab === 'backgrounds' ? (
            <BackgroundEditor
              background={homebrew.backgrounds[selected]}
              onChange={replace}
            />
          ) : (
            <ClassKitEditor
              kit={homebrew.kits[selected]}
              classNames={tables.classes.map((c) => c.name)}
              onChange={replace}
            />
          )}
        </div>
      </div>
    </div>
  )
}
