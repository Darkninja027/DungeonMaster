import { useEffect, useRef, useState } from 'react'
import { Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { HIT_DIE_SIZES } from '#/lib/character'
import { PHB_CLASSES } from '#/lib/classes'
import type { ClassInfo } from '#/lib/classes'
import { classId } from '#/lib/worldSettings'
import { useWorldSettingsSection } from '#/lib/useWorldSettings'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { cn } from '#/lib/utils'

const blankClass = (): ClassInfo => ({
  id: '',
  name: '',
  hitDie: 8,
  subclassLabel: 'Subclass',
  subclasses: [],
})

/**
 * The world's class list.
 *
 * Edits are held locally and written on Save rather than per keystroke: every
 * write is an atomic temp-file-plus-rename of the whole file, so saving on each
 * character typed would be a lot of pointless disk churn.
 */
export function ClassesSection({ worldId }: { worldId: string }) {
  const { settings, patch, isPending, error } = useWorldSettingsSection(worldId)

  const [draft, setDraft] = useState<Array<ClassInfo> | null>(null)
  const [selected, setSelected] = useState(0)
  const [newSubclass, setNewSubclass] = useState('')

  /**
   * Adopt the file's list whenever a *different* one arrives — first load, and
   * every later external edit, since a hand edit to the JSON should show up here
   * as well as on the sheet. Keyed on the last list we adopted rather than on
   * "is the draft null", which would latch onto the first load and ignore
   * everything after it. Unsaved local edits win until then.
   */
  const adoptedRef = useRef<Array<ClassInfo> | null>(null)
  useEffect(() => {
    if (!settings) return
    if (adoptedRef.current === settings.classes) return
    adoptedRef.current = settings.classes
    setDraft(settings.classes)
  }, [settings])

  const classes = draft ?? settings?.classes ?? []
  const dirty = draft !== null && draft !== adoptedRef.current
  // Indexing past the end is normal here — the list shrinks when you delete the
  // last class — so this genuinely can be undefined despite the index signature.
  const current = classes.at(selected)

  const update = (next: Array<ClassInfo>) => setDraft(next)

  const patchCurrent = (changes: Partial<ClassInfo>) => {
    update(
      classes.map((cl, i) =>
        i === selected
          ? // Keep the derived id in step with the name, so React keys and
            // lookups stay correct without waiting for a round trip through disk.
            { ...cl, ...changes, id: classId(changes.name ?? cl.name) }
          : cl,
      ),
    )
  }

  const addClass = () => {
    update([...classes, blankClass()])
    setSelected(classes.length)
  }

  const removeClass = (index: number) => {
    update(classes.filter((_, i) => i !== index))
    setSelected((s) => Math.max(0, s > index ? s - 1 : s))
  }

  const addSubclass = () => {
    const name = newSubclass.trim()
    if (!name || !current) return
    if (current.subclasses.some((s) => s.toLowerCase() === name.toLowerCase())) {
      setNewSubclass('')
      return
    }
    patchCurrent({ subclasses: [...current.subclasses, name] })
    setNewSubclass('')
  }

  const save = () => {
    // Nameless rows can't be picked or looked up, so they're dropped on the
    // way out rather than written to a file the user may hand-edit later.
    const next = classes.filter((cl) => cl.name.trim() !== '')
    patch(
      { classes: next },
      {
        // Mark the saved list as adopted too, so the button settles back to
        // "Saved" rather than looking dirty against the pre-save value.
        onSuccess: () => {
          adoptedRef.current = next
          setDraft(next)
        },
      },
    )
  }

  const resetToPhb = () => {
    if (
      !confirm(
        'Replace this world’s class list with the 12 PHB classes? Any homebrew here is lost.',
      )
    )
      return
    update(PHB_CLASSES)
    setSelected(0)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">Classes</h2>
          <p className="text-muted-foreground text-xs">
            Class and subclass on a character are free text — this list only
            supplies dropdown suggestions and hit dice.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 text-xs"
          onClick={resetToPhb}
        >
          <RotateCcw className="size-3.5" /> Reset to PHB
        </Button>
        <Button
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={!dirty || isPending}
          onClick={save}
        >
          <Save className="size-3.5" /> {dirty ? 'Save' : 'Saved'}
        </Button>
      </div>

      {error && <p className="text-destructive text-xs">{error.message}</p>}

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[220px_1fr]">
        {/* Class list */}
        <div className="flex min-h-0 flex-col gap-1">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {classes.map((cl, i) => (
              <button
                key={`${cl.id}-${i}`}
                type="button"
                className={cn(
                  'group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                  i === selected ? 'bg-accent' : 'hover:bg-accent/50',
                )}
                onClick={() => setSelected(i)}
              >
                <span className="min-w-0 flex-1 truncate">
                  {cl.name || (
                    <span className="text-muted-foreground italic">
                      Untitled
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  d{cl.hitDie}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {cl.subclasses.length}
                </span>
                <Trash2
                  className="text-muted-foreground hover:text-destructive size-3.5 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeClass(i)
                  }}
                />
              </button>
            ))}
            {classes.length === 0 && (
              <p className="text-muted-foreground p-2 text-xs">
                No classes. Characters can still type any class by hand.
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={addClass}
          >
            <Plus className="size-3.5" /> Add class
          </Button>
        </div>

        {/* Selected class */}
        {current ? (
          <div className="min-h-0 overflow-y-auto">
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm">
                Name
                <Input
                  value={current.name}
                  placeholder="Blood Hunter"
                  className="h-8"
                  onChange={(e) => patchCurrent({ name: e.target.value })}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm">
                  Hit die
                  {/* A datalist, not a select: homebrew can use any die. */}
                  <Input
                    type="number"
                    list="dm-hit-dice"
                    min={2}
                    max={100}
                    value={current.hitDie}
                    className="h-8"
                    onChange={(e) =>
                      patchCurrent({ hitDie: Number(e.target.value) || 8 })
                    }
                  />
                  <datalist id="dm-hit-dice">
                    {HIT_DIE_SIZES.map((size) => (
                      <option key={size} value={size} />
                    ))}
                  </datalist>
                </label>
                <label className="grid gap-1 text-sm">
                  Subclass called
                  <Input
                    value={current.subclassLabel}
                    placeholder="Sacred Oath"
                    className="h-8"
                    onChange={(e) =>
                      patchCurrent({ subclassLabel: e.target.value })
                    }
                  />
                </label>
              </div>

              <div className="grid gap-1 text-sm">
                Subclasses
                <div className="grid gap-1">
                  {current.subclasses.map((name, i) => (
                    <div
                      key={`${name}-${i}`}
                      className="flex items-center gap-1"
                    >
                      <Input
                        value={name}
                        className="h-8"
                        onChange={(e) =>
                          patchCurrent({
                            subclasses: current.subclasses.map((s, j) =>
                              j === i ? e.target.value : s,
                            ),
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        title="Remove subclass"
                        onClick={() =>
                          patchCurrent({
                            subclasses: current.subclasses.filter(
                              (_, j) => j !== i,
                            ),
                          })
                        }
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    value={newSubclass}
                    placeholder={`Add a ${current.subclassLabel.toLowerCase()}…`}
                    className="h-8"
                    onChange={(e) => setNewSubclass(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSubclass()}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8 shrink-0"
                    title="Add subclass"
                    onClick={addSubclass}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>

              <p className="text-muted-foreground text-xs">
                Renaming or deleting a class leaves existing characters alone —
                they keep whatever they have written down, and simply stop being
                offered suggestions for it.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Select a class, or add one.
          </p>
        )}
      </div>
    </div>
  )
}
