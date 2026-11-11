import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CornerDownLeft, Dices, Settings2, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import {
  CRAFT_TIPS,
  detailsBlock,
  findSubject,
  rollEntry,
  subjectForType,
} from '#/lib/describe/subjects'
import type { DescribeSubject } from '#/lib/describe/subjects'
import {
  canRollFullName,
  groupLabel,
  nameCategories,
  rollFullName,
} from '#/lib/describe/names'
import type { NameGroup } from '#/lib/describe/names'
import { groupsOf } from '#/lib/describe/details'
import { useDescribeLists } from '#/lib/describe/useDescribeLists'

const PREFS_KEY = 'dm.describePrefs'

interface Prefs {
  mode: 'describe' | 'names'
  subject: string
  category: string
  group: string
}

// Empty picks fall through to the first entry of whatever lists are loaded,
// built-in or the DM's own, so a default can never name something missing.
const DEFAULT_PREFS: Prefs = {
  mode: 'describe',
  subject: '',
  category: '',
  group: '',
}

/** Last-used mode and pickers. Per-viewer convenience only, so any failure is just the defaults. */
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(
      localStorage.getItem(PREFS_KEY) ?? '',
    ) as Partial<Prefs>
    return { ...DEFAULT_PREFS, ...raw }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage blocked: the panel still works, it just forgets.
  }
}

const selectClass =
  'bg-background text-foreground h-8 w-full rounded border px-2 text-xs'

/**
 * The Describe pane: writing prompts and rollable details for describing a
 * place, person or landscape, plus rollable names. It sits beside the editor
 * like the Outline and only ever *inserts* — every rolled line is a suggestion
 * the DM places, so nothing here touches the article on its own.
 *
 * Rolled values are component state and reset when the article changes (the
 * route keys the panel by article id); only the pickers are remembered.
 */
export function DescribePanel({
  worldId,
  articleType,
  onInsertText,
  onInsertBlock,
  onClose,
}: {
  /** For the "Edit lists" link; the lists themselves are app-wide. */
  worldId: string
  /** Frontmatter `type:` — picks a sensible starting subject. */
  articleType?: string
  onInsertText: (text: string) => void
  onInsertBlock: (block: string) => void
  onClose: () => void
}) {
  const lists = useDescribeLists()
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs)
  // The article's content (and so its type) arrives after the panel mounts,
  // so follow the type as it changes rather than reading it once. Adjusting
  // state during render is React's sanctioned pattern for this; it is not
  // persisted, so an NPC article never overwrites the subject a DM last chose.
  const [seenType, setSeenType] = useState<string | undefined>(undefined)
  if (articleType !== seenType) {
    setSeenType(articleType)
    const fromType = subjectForType(articleType, lists.subjects)
    if (fromType) setPrefsState((prev) => ({ ...prev, subject: fromType.id }))
  }
  const setPrefs = (patch: Partial<Prefs>) =>
    setPrefsState((prev) => {
      const next = { ...prev, ...patch }
      savePrefs(next)
      return next
    })

  return (
    <div className="flex w-72 shrink-0 flex-col border-l">
      <div className="flex items-center gap-1 border-b px-3 py-1.5">
        <span className="text-muted-foreground text-xs font-medium">
          Describe
        </span>
        <div className="ml-2 flex gap-0.5">
          {(['describe', 'names'] as const).map((mode) => (
            <Button
              key={mode}
              variant={prefs.mode === mode ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs capitalize"
              onClick={() => setPrefs({ mode })}
            >
              {mode === 'describe' ? 'Details' : 'Names'}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6"
          title="Edit these lists"
          asChild
        >
          <Link
            to="/worlds/$worldId/settings"
            params={{ worldId }}
            search={{ section: 'describe' }}
          >
            <Settings2 className="size-3.5" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          title="Hide the describe helper"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {prefs.mode === 'describe' ? (
          <DetailsMode
            subjects={lists.subjects}
            subject={
              findSubject(prefs.subject, lists.subjects) ?? lists.subjects[0]
            }
            onSubject={(subject) => setPrefs({ subject })}
            onInsertText={onInsertText}
            onInsertBlock={onInsertBlock}
          />
        ) : (
          <NamesMode
            nameGroups={lists.nameGroups}
            category={prefs.category}
            group={prefs.group}
            onPick={(category, group) => setPrefs({ category, group })}
            onInsertText={onInsertText}
          />
        )}
      </div>
    </div>
  )
}

function DetailsMode({
  subjects,
  subject,
  onSubject,
  onInsertText,
  onInsertBlock,
}: {
  subjects: ReadonlyArray<DescribeSubject>
  subject: DescribeSubject
  onSubject: (id: string) => void
  onInsertText: (text: string) => void
  onInsertBlock: (block: string) => void
}) {
  // Keyed by subject + table so switching subjects and back keeps what was
  // rolled — the shared tables (weather, light) deliberately do not leak
  // between subjects, which is what the subject prefix is for.
  const [rolled, setRolled] = useState<Record<string, string>>({})
  const key = (tableId: string) => `${subject.id}/${tableId}`

  const roll = (tableId: string) => {
    const table = subject.tables.find((t) => t.id === tableId)
    const value = table && rollEntry(table.entries)
    if (value) setRolled((prev) => ({ ...prev, [key(tableId)]: value }))
  }
  const rollAll = () =>
    setRolled((prev) => {
      const next = { ...prev }
      for (const table of subject.tables) {
        const value = rollEntry(table.entries)
        if (value) next[key(table.id)] = value
      }
      return next
    })

  const rolledHere = subject.tables.flatMap((t) => {
    const value = rolled[key(t.id)]
    return value ? [{ label: t.label, value }] : []
  })

  return (
    <div className="space-y-3 p-3 text-xs">
      <select
        aria-label="Subject"
        className={selectClass}
        value={subject.id}
        onChange={(e) => onSubject(e.target.value)}
      >
        {groupsOf(subjects).map((group) => (
          <optgroup key={group} label={group}>
            {subjects
              .filter((s) => s.group === group)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>

      <details className="group">
        <summary className="text-muted-foreground cursor-pointer select-none">
          Tips for any description
        </summary>
        <ul className="text-muted-foreground mt-1.5 list-disc space-y-1 pl-4">
          {CRAFT_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </details>

      <section>
        <h3 className="mb-1 font-medium">Ask yourself</h3>
        {/* Checkboxes are a scratch aid, not data: they reset with the
            subject because ticking "smell" on a tavern says nothing about a
            forest. Keyed on subject so React drops the old ones. */}
        <ul key={subject.id} className="space-y-1">
          {subject.prompts.map((prompt) => (
            <li key={prompt}>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" className="mt-0.5 shrink-0" />
                <span>{prompt}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-1 flex items-center">
          <h3 className="font-medium">Details</h3>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs"
            title="Roll every table for this subject"
            onClick={rollAll}
          >
            <Dices className="size-3.5" /> Roll all
          </Button>
        </div>
        <ul className="space-y-2">
          {subject.tables.map((table) => (
            <RollRow
              key={table.id}
              label={table.label}
              hint={`${table.entries.length} options`}
              value={rolled[key(table.id)]}
              onRoll={() => roll(table.id)}
              onInsert={onInsertText}
            />
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 h-7 w-full text-xs"
          disabled={rolledHere.length === 0}
          title="Insert every rolled detail as a DM-only notes block"
          onClick={() => onInsertBlock(detailsBlock(subject, rolledHere))}
        >
          <CornerDownLeft className="size-3.5" /> Insert rolled as DM notes
        </Button>
      </section>
    </div>
  )
}

function NamesMode({
  nameGroups,
  category: savedCategory,
  group,
  onPick,
  onInsertText,
}: {
  nameGroups: ReadonlyArray<NameGroup>
  category: string
  group: string
  onPick: (category: string, group: string) => void
  onInsertText: (text: string) => void
}) {
  const categories = nameCategories(nameGroups)
  // A remembered category can vanish when the DM edits their lists.
  const category = categories.includes(savedCategory)
    ? savedCategory
    : (categories.at(0) ?? '')
  const groups = nameGroups.filter((g) => g.category === category)
  // Typed as possibly undefined: an empty category leaves nothing to show.
  const current: NameGroup | undefined =
    groups.find((g) => groupLabel(g) === group) ?? groups.at(0)
  const [rolled, setRolled] = useState<Record<string, string>>({})
  const rowKey = (label: string) =>
    current ? `${current.category}/${groupLabel(current)}/${label}` : label

  const rollList = (label: string, names: ReadonlyArray<string>) => {
    const value = rollEntry(names)
    if (value) setRolled((prev) => ({ ...prev, [rowKey(label)]: value }))
  }
  const FULL = '\u0000full'

  return (
    <div className="space-y-3 p-3 text-xs">
      <select
        aria-label="Name category"
        className={selectClass}
        value={category}
        onChange={(e) => onPick(e.target.value, '')}
      >
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {groups.length > 0 && current && (
        <select
          aria-label="Name list"
          className={selectClass}
          value={groupLabel(current)}
          onChange={(e) => onPick(category, e.target.value)}
        >
          {groups.map((g) => (
            <option key={groupLabel(g)} value={groupLabel(g)}>
              {groupLabel(g)}
            </option>
          ))}
        </select>
      )}
      {current?.note && (
        <p className="text-muted-foreground italic">{current.note}</p>
      )}
      {current && (
        <ul className="space-y-2">
          {canRollFullName(current) && (
            <RollRow
              label="Full name"
              hint="given + family"
              value={rolled[rowKey(FULL)]}
              onRoll={() => {
                const value = rollFullName(current)
                if (value)
                  setRolled((prev) => ({ ...prev, [rowKey(FULL)]: value }))
              }}
              onInsert={onInsertText}
            />
          )}
          {current.lists.map((list) => (
            <RollRow
              key={list.label}
              label={list.label}
              hint={`${list.names.length} names`}
              value={rolled[rowKey(list.label)]}
              onRoll={() => rollList(list.label, list.names)}
              onInsert={onInsertText}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function RollRow({
  label,
  hint,
  value,
  onRoll,
  onInsert,
}: {
  label: string
  hint: string
  value: string | undefined
  onRoll: () => void
  onInsert: (text: string) => void
}) {
  return (
    <li className="rounded border p-2">
      <div className="flex items-center gap-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">· {hint}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6"
          title={`Roll ${label.toLowerCase()}`}
          aria-label={`Roll ${label}`}
          onClick={onRoll}
        >
          <Dices className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          title="Insert at the cursor"
          aria-label={`Insert ${label}`}
          disabled={!value}
          onClick={() => value && onInsert(value)}
        >
          <CornerDownLeft className="size-3.5" />
        </Button>
      </div>
      <p
        className={cn(
          'mt-1',
          value ? 'text-foreground' : 'text-muted-foreground italic',
        )}
      >
        {value ?? 'Not rolled yet'}
      </p>
    </li>
  )
}
