import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import {
  builtInTemplate,
  dropTemplate,
  mergeTemplates,
  setTemplateHidden,
  takenIds,
  templateId,
  upsertTemplate,
} from '#/lib/templateStore'
import type { StoredTemplate, TemplateStore } from '#/lib/templateStore'
import { useSaveTemplates, useTemplateStore } from '#/lib/useTemplates'
import type { ArticleTemplate } from '#/lib/templates'
import { TemplateEditor } from './TemplateEditor'

/**
 * The Templates settings section: edit, hide, add and delete the article
 * templates the New-article picker and the editor's Insert menu offer.
 *
 * App-wide rather than per-world, which is why it sits beside Homebrew and
 * Library in the nav. The tradeoff is stated in the header below, because "my
 * templates didn't travel with the world I sent you" is otherwise a surprise.
 *
 * Edits are held locally and written on Save, the same reasoning as Homebrew:
 * every write rewrites the whole file, so saving per keystroke would be a lot
 * of pointless disk churn.
 *
 * The rule that shapes the whole screen: **a built-in can be edited or hidden,
 * never deleted.** The bestiary, the spell panel and the character wizard each
 * create articles from a specific template by id, so a missing one would be a
 * silently broken feature elsewhere in the app. Editing a built-in stores an
 * override that layers on top; "Reset to built-in" drops the override rather
 * than restoring a copy.
 */
export function TemplatesSection() {
  const { data: stored } = useTemplateStore()
  const save = useSaveTemplates()

  const [draft, setDraft] = useState<TemplateStore | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Adopt the file's contents whenever a *different* one arrives — first load,
  // and every later external edit. Keyed on the last value adopted rather than
  // on "is the draft null", which would latch onto the first load and ignore
  // everything after it.
  const adoptedRef = useRef<TemplateStore | null>(null)
  useEffect(() => {
    if (!stored) return
    if (adoptedRef.current === stored) return
    adoptedRef.current = stored
    setDraft(stored)
  }, [stored])

  const store = draft ?? stored
  const dirty = draft !== null && draft !== adoptedRef.current

  if (!store) return null

  // Merge the *draft*, not what is on disk: an edit has to be visible in the
  // list and its badge before it is saved. This is the same function the
  // pickers go through, so the two can never disagree about precedence.
  const list = mergeTemplates(store)
  // Never empty: mergeTemplates always emits every built-in, whatever the
  // store says. So there is always something selected and something to edit.
  const selected = list.find((t) => t.id === selectedId) ?? list[0]
  const storedEntry = store.templates.find((t) => t.id === selected.id)

  /**
   * Apply a patch to a template. For a built-in with no stored row this
   * materialises the override — on the first keystroke rather than on
   * selection, so merely clicking a built-in does not mark the file dirty.
   */
  const patch = (entry: ArticleTemplate, changes: Partial<ArticleTemplate>) => {
    const { origin: _origin, ...base } = entry
    const next: StoredTemplate = { ...base, ...changes }
    // An emptied type is absent rather than '', so a round-trip through the
    // file does not sprout keys nobody set.
    if (next.type != null && next.type.trim() === '') delete next.type

    // Re-slug a template of your own while it is still unsaved. Add gives it
    // the placeholder name, so freezing the id at creation would file every
    // template anyone ever adds as `new-template`. Once it is on disk the id
    // is fixed: it is stored, and churning it on a rename would orphan
    // anything that had come to refer to it.
    const onDisk = stored?.templates.some((t) => t.id === entry.id) === true
    if (entry.origin === 'user' && !onDisk && changes.name != null) {
      const taken = new Set(
        [...takenIds(store)].filter((id) => id !== entry.id),
      )
      next.id = templateId(next.name, taken)
      setDraft(upsertTemplate(dropTemplate(store, entry.id), next))
      setSelectedId(next.id)
      return
    }

    setDraft(upsertTemplate(store, next))
  }

  const addTemplate = () => {
    const id = templateId('New template', takenIds(store))
    setDraft(
      upsertTemplate(store, {
        id,
        name: 'New template',
        description: '',
        body: '',
      }),
    )
    setSelectedId(id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          The templates offered when you create an article, in every world.{' '}
          <strong className="text-foreground font-medium">
            These live with the app, not the world folder
          </strong>
          , so they don&rsquo;t travel when you send a world to someone else.
          Built-in templates can be edited or hidden but not deleted, because
          parts of the app create articles from them by name.
        </p>
        <Button
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={!dirty || save.isPending}
          onClick={() => {
            save.mutate(store, {
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

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[220px_1fr]">
        <div className="flex min-h-0 flex-col gap-1">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {list.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  'group flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm',
                  entry.id === selected.id ? 'bg-accent' : 'hover:bg-accent/50',
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => setSelectedId(entry.id)}
                >
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      entry.hidden && 'text-muted-foreground line-through',
                    )}
                  >
                    {entry.name}
                  </span>
                  {badgeFor(entry) != null && (
                    <span className="text-muted-foreground shrink-0 text-[10px] tracking-wide uppercase">
                      {badgeFor(entry)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  title={
                    entry.hidden ? 'Show in the picker' : 'Hide from the picker'
                  }
                  onClick={() =>
                    setDraft(
                      setTemplateHidden(store, entry.id, entry.hidden !== true),
                    )
                  }
                >
                  {entry.hidden ? (
                    <EyeOff className="text-muted-foreground hover:text-foreground size-3.5 shrink-0" />
                  ) : (
                    <Eye className="text-muted-foreground hover:text-foreground size-3.5 shrink-0 opacity-0 group-hover:opacity-100" />
                  )}
                </button>
                {/* Only a template of your own can be deleted. A built-in gets
                    Reset in the detail pane instead. */}
                {entry.origin === 'user' && (
                  <button
                    type="button"
                    title="Delete this template"
                    onClick={() => {
                      setDraft(dropTemplate(store, entry.id))
                      if (selectedId === entry.id) setSelectedId(null)
                    }}
                  >
                    <Trash2 className="text-muted-foreground hover:text-destructive size-3.5 shrink-0 opacity-0 group-hover:opacity-100" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={addTemplate}
          >
            <Plus className="size-3.5" /> New template
          </Button>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <TemplateEditor
            key={selected.id}
            template={selected}
            onChange={(changes) => patch(selected, changes)}
          />
          {selected.origin === 'override' && (
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <p className="text-muted-foreground text-xs">
                You have edited this built-in. Resetting drops your version and
                goes back to the one the app ships.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={() => setDraft(dropTemplate(store, selected.id))}
              >
                <RotateCcw className="size-3.5" /> Reset to built-in
              </Button>
            </div>
          )}
          {selected.origin === 'user' && storedEntry && (
            <p className="text-muted-foreground border-t pt-3 text-xs">
              Stored as <code>{selected.id}</code> in templates.json.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The badge a row carries, or null for a built-in as it ships.
 *
 * "Edited" has to mean *edited*. Hiding a built-in stores an otherwise
 * verbatim copy of it to carry the flag, so branching on `origin` alone would
 * label a template nobody has touched — and the strikethrough already says it
 * is hidden.
 */
function badgeFor(entry: ArticleTemplate): string | null {
  if (entry.origin === 'user') return 'Yours'
  if (entry.origin !== 'override') return null
  const builtIn = builtInTemplate(entry.id)
  if (!builtIn) return 'Edited'
  const changed =
    entry.name !== builtIn.name ||
    entry.description !== builtIn.description ||
    entry.body !== builtIn.body ||
    (entry.type ?? '') !== (builtIn.type ?? '')
  return changed ? 'Edited' : null
}
