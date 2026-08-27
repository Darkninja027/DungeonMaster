import { useEffect, useRef, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import type { Homebrew, HomebrewSubclass } from '#/lib/homebrew'
import { homebrewId, upsert } from '#/lib/homebrew'
import { useHomebrew, useSaveHomebrew, useTables } from '#/lib/useHomebrew'
import { SRD_TABLES, isBareSubclass, nameKey } from '#/lib/tables'
import type { BackgroundInfo, ClassKit, FeatInfo, RaceInfo } from '#/lib/srd'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { BackgroundEditor, blankBackground } from './BackgroundEditor'
import { BuiltInPreview } from './BuiltInPreview'
import type { BuiltInSubclass } from './BuiltInPreview'
import { ClassKitEditor, blankKit } from './ClassKitEditor'
import { DuplicateDialog } from './DuplicateDialog'
import { FeatEditor, blankFeat } from './FeatEditor'
import { StandaloneSubclassEditor } from './StandaloneSubclassEditor'
import { RaceEditor, blankRace } from './RaceEditor'
import { SubclassWizard } from './SubclassWizard'

type Tab = 'races' | 'backgrounds' | 'kits' | 'subclasses' | 'feats'

type Entry = RaceInfo | BackgroundInfo | ClassKit | FeatInfo | HomebrewSubclass

/**
 * Which row the detail pane is showing.
 *
 * A bare index used to be enough, when the list was only ever the user's own
 * entries. Now that built-ins are listed too, the index alone is ambiguous —
 * and `replace`/`remove` both key off it, so a built-in selection reaching them
 * would edit or delete an unrelated homebrew entry.
 */
type Selection =
  { source: 'homebrew'; index: number } | { source: 'srd'; index: number }

/** Singular noun for a tab, for prose. */
const KIND_LABEL: Record<Tab, string> = {
  races: 'race',
  backgrounds: 'background',
  kits: 'class',
  subclasses: 'subclass',
  feats: 'feat',
}

/**
 * Every built-in subclass, flattened out of the classes that offer them.
 *
 * There is no top-level subclass table to read — a subclass lives inside its
 * kit — so this is what lets the Subclasses tab show the built-ins at all, and
 * with them the "duplicate College of Lore and edit it" path that every other
 * tab already has.
 *
 * Only the ones that actually carry something. `classKits.ts` seeds every
 * archetype 5e offers as a bare name, and listing eighty empty rows would bury
 * the dozen with content in them.
 */
function builtInSubclasses(): Array<BuiltInSubclass> {
  return SRD_TABLES.kits.flatMap((kit) =>
    kit.subclasses
      .filter((sub) => !isBareSubclass(sub))
      .map((sub) => ({ ...sub, className: kit.name })),
  )
}

const TABS: Array<{ id: Tab; label: string; blurb: string }> = [
  {
    id: 'races',
    label: 'Races',
    blurb: 'Ability increases, speed, traits and subraces.',
  },
  {
    id: 'kits',
    label: 'Classes',
    blurb: 'Hit die, subclasses, and what the class starts with.',
  },
  {
    id: 'subclasses',
    label: 'Subclasses',
    blurb: 'Added to a class you name, without duplicating it.',
  },
  {
    id: 'backgrounds',
    label: 'Backgrounds',
    blurb: 'Skills, equipment and a feature.',
  },
  {
    id: 'feats',
    label: 'Feats',
    blurb: 'Not in the SRD — everything here is yours.',
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
  const [selected, setSelected] = useState<Selection>({
    source: 'homebrew',
    index: 0,
  })
  const [duplicating, setDuplicating] = useState<Entry | null>(null)
  const [wizard, setWizard] = useState(false)

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
  // Subclasses have no top-level built-in list — they live inside kits — so the
  // built-in column is flattened out of every class that offers one. That is
  // what makes "duplicate College of Lore and edit it" possible here.
  const builtIns: Array<Entry> =
    tab === 'subclasses' ? builtInSubclasses() : SRD_TABLES[tab]
  const srdCount = builtIns.length

  const current =
    selected.source === 'homebrew' ? list.at(selected.index) : undefined
  const currentBuiltIn =
    selected.source === 'srd' ? builtIns.at(selected.index) : undefined

  // Which built-ins the user has already overridden, by name. Built once per
  // render rather than per row: the lists are small, but a `some()` inside the
  // row map is the kind of thing that quietly becomes O(n²).
  const homebrewNames = new Set(list.map((e) => nameKey(e.name)))

  const patchList = (next: Array<unknown>) => {
    setDraft({ ...homebrew, [tab]: next })
  }

  const add = () => {
    // Subclasses are authored through a wizard rather than a blank row: the
    // class is a genuine first question, and nothing should reach the list
    // until it has been answered. The other tabs still append and edit in
    // place — see `SubclassWizard` on why create and edit differ.
    if (tab === 'subclasses') {
      setWizard(true)
      return
    }
    const blank =
      tab === 'races'
        ? blankRace()
        : tab === 'backgrounds'
          ? blankBackground()
          : tab === 'feats'
            ? blankFeat()
            : blankKit()
    patchList([...list, blank])
    setSelected({ source: 'homebrew', index: list.length })
  }

  const remove = (i: number) => {
    patchList(list.filter((_, j) => j !== i))
    setSelected((s) =>
      s.source === 'homebrew' && s.index >= i && s.index > 0
        ? { source: 'homebrew', index: s.index - 1 }
        : s,
    )
  }

  // Guarded: an editor only ever renders for a homebrew selection, but the
  // built-ins are read-only and nothing should be able to write through them.
  const replace = (entry: unknown) => {
    if (selected.source !== 'homebrew') return
    patchList(list.map((e, j) => (j === selected.index ? entry : e)))
  }

  /**
   * Fork a built-in into the draft under `name`.
   *
   * Deep-cloned because `grant`, `subraces`, `equipment` and `subclasses` are
   * all nested — a shallow copy would leave the new entry sharing structure
   * with the frozen SRD constant. The id is re-derived from the new name rather
   * than copied: an SRD id must never reach disk.
   *
   * Replaces a same-named homebrew entry instead of appending one, for the same
   * reason `HomebrewDialog` does — the parser drops the later of two entries
   * sharing a name, so appending would discard this copy on the next load.
   */
  const duplicate = (source: Entry, name: string) => {
    const copy = { ...structuredClone(source), name, id: homebrewId(name) }
    const at = list.findIndex((e) => nameKey(e.name) === nameKey(name))
    if (at === -1) {
      patchList([...list, copy])
      setSelected({ source: 'homebrew', index: list.length })
    } else {
      patchList(list.map((e, j) => (j === at ? copy : e)))
      setSelected({ source: 'homebrew', index: at })
    }
    setDuplicating(null)
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
              setSelected({ source: 'homebrew', index: 0 })
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
                  selected.source === 'homebrew' && i === selected.index
                    ? 'bg-accent'
                    : 'hover:bg-accent/50',
                )}
                onClick={() => setSelected({ source: 'homebrew', index: i })}
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
                {srdCount === 0
                  ? 'Nothing yet. Feats aren’t in the SRD, so every feat the character wizards offer comes from here.'
                  : 'Nothing of your own yet — add one, or duplicate a built-in below to start from it.'}
              </p>
            )}

            {/* No divider when there is nothing under it — an empty "Built-in
                (0)" heading reads as a list that failed to load. */}
            {srdCount > 0 && (
              <div className="text-muted-foreground mt-3 mb-1 px-2 text-[10px] font-medium tracking-wide uppercase">
                Built-in ({srdCount})
              </div>
            )}
            {builtIns.map((entry, i) => {
              const shadowed = homebrewNames.has(nameKey(entry.name))
              return (
                <button
                  key={entry.id}
                  type="button"
                  title={
                    shadowed
                      ? `Overridden by your ${entry.name}`
                      : `Built-in ${KIND_LABEL[tab]}`
                  }
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                    selected.source === 'srd' && i === selected.index
                      ? 'bg-accent'
                      : 'hover:bg-accent/50',
                  )}
                  onClick={() => setSelected({ source: 'srd', index: i })}
                >
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      shadowed
                        ? 'text-muted-foreground line-through'
                        : 'text-muted-foreground',
                    )}
                  >
                    {entry.name}
                  </span>
                </button>
              )
            })}
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
          {currentBuiltIn ? (
            <BuiltInPreview
              entry={currentBuiltIn}
              kind={tab}
              shadowedBy={
                list.find(
                  (e) => nameKey(e.name) === nameKey(currentBuiltIn.name),
                )?.name
              }
              onDuplicate={() => setDuplicating(currentBuiltIn)}
            />
          ) : !current ? (
            <p className="text-muted-foreground p-2 text-xs">
              Select something on the left, or add one.
            </p>
          ) : tab === 'races' ? (
            <RaceEditor
              race={homebrew.races[selected.index]}
              onChange={replace}
            />
          ) : tab === 'backgrounds' ? (
            <BackgroundEditor
              background={homebrew.backgrounds[selected.index]}
              onChange={replace}
            />
          ) : tab === 'feats' ? (
            <FeatEditor
              feat={homebrew.feats[selected.index]}
              onChange={replace}
            />
          ) : tab === 'subclasses' ? (
            <StandaloneSubclassEditor
              subclass={homebrew.subclasses[selected.index]}
              kits={tables.kits}
              onChange={replace}
            />
          ) : (
            <ClassKitEditor
              kit={homebrew.kits[selected.index]}
              classNames={tables.kits.map((k) => k.name)}
              onChange={replace}
            />
          )}
        </div>
      </div>

      <SubclassWizard
        open={wizard}
        kits={tables.kits}
        onCancel={() => setWizard(false)}
        onCreate={(sub) => {
          // `upsert` rather than append: ids derive from names, so a
          // same-named entry would be dropped by `parseHomebrew`'s dedupe on
          // the next load — the newer one, at that.
          const next = upsert(homebrew.subclasses, sub)
          patchList(next)
          setSelected({
            source: 'homebrew',
            index: next.findIndex((e) => e === sub),
          })
          setWizard(false)
        }}
      />

      <DuplicateDialog
        open={duplicating !== null}
        sourceName={duplicating?.name ?? ''}
        kindLabel={KIND_LABEL[tab]}
        existingNames={list.map((e) => e.name)}
        onCancel={() => setDuplicating(null)}
        onConfirm={(name) => duplicating && duplicate(duplicating, name)}
      />
    </div>
  )
}
