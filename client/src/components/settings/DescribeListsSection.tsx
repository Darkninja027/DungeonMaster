import { useMemo, useState } from 'react'
import { RotateCcw, Save, Undo2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { cn } from '#/lib/utils'
import { RECYCLE_BIN_NOTE } from '#/lib/confirmText'
import { DESCRIBE_SUBJECTS } from '#/lib/describe/subjects'
import { BUILT_IN_NAMES_MARKDOWN, parseNameLists } from '#/lib/describe/names'
import { parseDetails, serializeDetails } from '#/lib/describe/details'
import {
  useDescribeLists,
  useSaveDescribeList,
} from '#/lib/describe/useDescribeLists'
import type { DescribeListKind } from '#/lib/describe/useDescribeLists'

const KINDS: Array<{ kind: DescribeListKind; label: string }> = [
  { kind: 'names', label: 'Names' },
  { kind: 'details', label: 'Details' },
]

const FORMAT_HELP: Record<DescribeListKind, Array<[string, string]>> = {
  names: [
    ['# NPC Names', 'a category (first dropdown)'],
    ['## Dwarf', 'a name list (second dropdown)'],
    ['### Duergar', 'optional sub-list, shown as "Dwarf › Duergar"'],
    ['- **Masculine:** Thrain, Borin', 'a labelled list of names'],
    [
      '- **Clan names:** Ironfist',
      'labels with surname, family, clan, house, epithet, nickname or tribe pair with given names for "Full name"',
    ],
    [
      'Ashford, Coldwell, Dunmore, Marsh',
      'an unlabelled list (needs 4+ names)',
    ],
    ['Any other sentence', 'shown as a note'],
  ],
  details: [
    ['# Buildings', 'a group in the subject picker'],
    ['## Tavern or inn', 'a subject'],
    ['Types: npc, character', 'optional: article types that open on it'],
    ['- What is the mood tonight?', 'bullets right under ## are prompts'],
    ['### Mood tonight', 'a rollable table'],
    ['- loud and happy', 'one bullet per entry'],
  ],
}

// Serialised once: the built-in details text is ~2,000 lines and every
// keystroke compares against it.
let builtInDetails: string | undefined
function builtInText(kind: DescribeListKind): string {
  if (kind === 'names') return BUILT_IN_NAMES_MARKDOWN
  builtInDetails ??= serializeDetails(DESCRIBE_SUBJECTS)
  return builtInDetails
}

/** One line on what the text parses to, so a typo shows before saving. */
function summarise(
  kind: DescribeListKind,
  text: string,
): {
  line: string
  empty: boolean
} {
  if (kind === 'names') {
    const groups = parseNameLists(text)
    const names = groups.reduce(
      (n, g) => n + g.lists.reduce((m, l) => m + l.names.length, 0),
      0,
    )
    const categories = new Set(groups.map((g) => g.category)).size
    return {
      line: `${categories} categories, ${groups.length} lists, ${names} names`,
      empty: groups.length === 0,
    }
  }
  const subjects = parseDetails(text)
  const tables = subjects.reduce((n, s) => n + s.tables.length, 0)
  return {
    line: `${subjects.length} subjects, ${tables} tables`,
    empty: subjects.length === 0,
  }
}

/**
 * Settings → Describe lists: edit the names and detail tables the editor's
 * Describe pane rolls from.
 *
 * One textarea of markdown per kind rather than a form, because these are
 * hundreds of short lines and bullets are the fastest editor for them. The
 * textarea opens on the built-in text, so "add a name" is just typing one and
 * saving — the first save makes it the DM's own copy, and **from then on that
 * copy replaces the built-ins entirely** (that is what lets a built-in name be
 * deleted). Reset puts the built-ins back.
 *
 * App-wide like Templates: saved as `describe-names.md` and
 * `describe-details.md` in the app's data folder, not in the world.
 */
export function DescribeListsSection() {
  const lists = useDescribeLists()
  const save = useSaveDescribeList()
  const [kind, setKind] = useState<DescribeListKind>('names')
  // Unsaved edits per kind, so flipping tabs doesn't lose either one.
  const [drafts, setDrafts] = useState<
    Partial<Record<DescribeListKind, string>>
  >({})
  const [confirmingReset, setConfirmingReset] = useState(false)

  const isDirty = (k: DescribeListKind) => {
    const d = drafts[k]
    return d !== undefined && d !== (lists.raw[k] ?? builtInText(k))
  }
  const saved = lists.raw[kind]
  const value = drafts[kind] ?? saved ?? builtInText(kind)
  const dirty = isDirty(kind)
  const summary = useMemo(() => summarise(kind, value), [kind, value])

  const clearDraft = (k: DescribeListKind) =>
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[k]
      return next
    })

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          The names and detail tables the editor&rsquo;s Describe pane rolls
          from, in every world. Edit the text and save: your copy then{' '}
          <strong className="text-foreground font-medium">
            replaces the built-in list
          </strong>
          , so you can remove names as well as add them. These live with the
          app, not the world folder.
        </p>
        <Button
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={!dirty || summary.empty || save.isPending}
          title={
            summary.empty
              ? 'Nothing in this text is recognisable as a list'
              : undefined
          }
          onClick={() =>
            save.mutate(
              { kind, text: value },
              { onSuccess: () => clearDraft(kind) },
            )
          }
        >
          <Save className="size-3.5" /> {dirty ? 'Save' : 'Saved'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5" role="tablist">
          {KINDS.map((k) => (
            <Button
              key={k.kind}
              role="tab"
              aria-selected={kind === k.kind}
              variant={kind === k.kind ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setKind(k.kind)
                setConfirmingReset(false)
              }}
            >
              {k.label}
              {isDirty(k.kind) && ' •'}
            </Button>
          ))}
        </div>
        <span
          className={cn(
            'text-xs',
            saved == null ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {saved == null ? 'Using the built-in list' : 'Using your list'}
        </span>
        <span
          className={cn(
            'ml-auto text-xs',
            summary.empty ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {summary.empty
            ? 'Nothing recognisable yet — check the format below'
            : summary.line}
        </span>
      </div>

      {save.error && (
        <p className="text-destructive text-xs">{save.error.message}</p>
      )}

      <Textarea
        aria-label={`${kind} list`}
        className="min-h-64 flex-1 resize-none font-mono text-xs"
        spellCheck={false}
        value={value}
        onChange={(e) =>
          setDrafts((prev) => ({ ...prev, [kind]: e.target.value }))
        }
      />

      <div className="flex flex-wrap items-start gap-2">
        <details className="min-w-0 flex-1 text-xs">
          <summary className="text-muted-foreground cursor-pointer select-none">
            Format
          </summary>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {FORMAT_HELP[kind].map(([code, meaning]) => (
              <div key={code} className="contents">
                <dt>
                  <code className="bg-muted rounded px-1">{code}</code>
                </dt>
                <dd className="text-muted-foreground">{meaning}</dd>
              </div>
            ))}
          </dl>
        </details>
        {dirty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => clearDraft(kind)}
          >
            <Undo2 className="size-3.5" /> Discard changes
          </Button>
        )}
        {saved != null &&
          (confirmingReset ? (
            <div className="flex items-center gap-2 text-xs">
              <span>Reset to the built-in list? {RECYCLE_BIN_NOTE}</span>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(
                    { kind, text: null },
                    {
                      onSuccess: () => {
                        clearDraft(kind)
                        setConfirmingReset(false)
                      },
                    },
                  )
                }
              >
                Reset
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setConfirmingReset(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setConfirmingReset(true)}
            >
              <RotateCcw className="size-3.5" /> Reset to built-in
            </Button>
          ))}
      </div>
    </div>
  )
}
