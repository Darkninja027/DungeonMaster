import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  Pencil,
  Plus,
  X,
} from 'lucide-react'
import { api } from '#/lib/api'
import type { ArticleQuery, SavedView } from '#/lib/api'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'

/** A human-readable one-line summary of a query, for the editor preview. */
function describeQuery(query: ArticleQuery): string {
  const parts: Array<string> = []
  if (query.type) parts.push(`type:${query.type}`)
  for (const t of query.tags ?? []) parts.push(`tag:${t}`)
  for (const [k, v] of Object.entries(query.fields ?? {})) parts.push(`${k}:${v}`)
  return parts.join(' ') || 'no filters (matches nothing)'
}

/**
 * Parse a query-builder text box into an ArticleQuery. Each whitespace-separated
 * token is `key:value`; `type:` and `tag:` are special, everything else is a
 * scalar field match. Bare tokens (no colon) are treated as tags.
 */
/** Clean a typed value: drop wrapping [ ] and quotes people copy from YAML. */
function cleanValue(raw: string): string {
  return raw.trim().replace(/^\[|\]$/g, '').replace(/^["']|["']$/g, '').trim()
}

function parseQueryInput(text: string): ArticleQuery {
  const query: ArticleQuery = {}
  const tags: Array<string> = []
  const fields: Record<string, string> = {}
  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    const colon = token.indexOf(':')
    if (colon < 0) {
      // Bare word(s) are tags; a comma-separated bare token adds several.
      for (const t of token.split(',').map(cleanValue).filter(Boolean))
        tags.push(t)
      continue
    }
    const key = token.slice(0, colon).toLowerCase()
    const rawValue = token.slice(colon + 1)
    if (key === 'type') {
      const value = cleanValue(rawValue)
      if (value) query.type = value
    } else if (key === 'tag' || key === 'tags') {
      // Accept tag:test, tag:[test], tag:a,b — all become individual tags.
      for (const t of rawValue.split(',').map(cleanValue).filter(Boolean))
        tags.push(t)
    } else {
      const value = cleanValue(rawValue)
      if (value) fields[key] = value
    }
  }
  if (tags.length > 0) query.tags = tags
  if (Object.keys(fields).length > 0) query.fields = fields
  return query
}

/** Serialize a query back into the text-box form the editor reads. */
function queryToInput(query: ArticleQuery): string {
  return describeQuery(query) === 'no filters (matches nothing)'
    ? ''
    : describeQuery(query)
}

const VIEW_QUERY_KEY = (worldId: string) => ['worlds', worldId, 'views']

/**
 * Smart Views: saved frontmatter queries that surface matching articles as a
 * virtual folder in the sidebar. Persisted to .dm/views.json so they travel
 * with the world.
 */
export function SmartViews({
  worldId,
  activeArticleId,
}: {
  worldId: string
  activeArticleId: string | null
}) {
  const queryClient = useQueryClient()
  const views = useQuery({
    queryKey: VIEW_QUERY_KEY(worldId),
    queryFn: async () => (await api.views.get(worldId)) ?? [],
  })

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editor, setEditor] = useState<{
    id: string | null
    name: string
    text: string
  } | null>(null)

  const list = views.data ?? []

  const save = async (next: Array<SavedView>) => {
    await api.views.set(worldId, next)
    queryClient.setQueryData(VIEW_QUERY_KEY(worldId), next)
  }

  const submitEditor = () => {
    if (!editor || !editor.name.trim()) return
    const query = parseQueryInput(editor.text)
    if (editor.id) {
      void save(
        list.map((v) =>
          v.id === editor.id ? { ...v, name: editor.name.trim(), query } : v,
        ),
      )
    } else {
      const view: SavedView = {
        id: crypto.randomUUID(),
        name: editor.name.trim(),
        query,
      }
      void save([...list, view])
      setExpanded((prev) => new Set(prev).add(view.id))
    }
    setEditor(null)
  }

  const remove = (id: string) => {
    void save(list.filter((v) => v.id !== id))
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="border-b">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
          <Filter className="size-3.5" /> Smart Views
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          title="New smart view"
          onClick={() => setEditor({ id: null, name: '', text: '' })}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="px-2 pb-1.5">
        {list.length === 0 && (
          <p className="text-muted-foreground px-2 pb-1 text-xs">
            No saved views. Try type:monster or tag:undead.
          </p>
        )}
        {list.map((view) => (
          <SmartViewRow
            key={view.id}
            worldId={worldId}
            view={view}
            expanded={expanded.has(view.id)}
            activeArticleId={activeArticleId}
            onToggle={() => toggle(view.id)}
            onEdit={() =>
              setEditor({
                id: view.id,
                name: view.name,
                text: queryToInput(view.query),
              })
            }
            onDelete={() => remove(view.id)}
          />
        ))}
      </div>

      <Dialog open={editor !== null} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor?.id ? 'Edit smart view' : 'New smart view'}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={editor?.name ?? ''}
            placeholder="View name (e.g. Living NPCs in Barovia)"
            onChange={(e) =>
              setEditor((prev) => prev && { ...prev, name: e.target.value })
            }
            onKeyDown={(e) => e.key === 'Enter' && submitEditor()}
          />
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wide">
              Query
            </p>
            <Input
              value={editor?.text ?? ''}
              placeholder="type:monster tag:undead region:Barovia"
              onChange={(e) =>
                setEditor((prev) => prev && { ...prev, text: e.target.value })
              }
              onKeyDown={(e) => e.key === 'Enter' && submitEditor()}
            />
            <p className="text-muted-foreground mt-1.5 text-xs">
              Space-separated <code>key:value</code> filters. Use{' '}
              <code>type:</code> for the article type, <code>tag:</code> (or a
              bare word) for tags, and any <code>field:value</code> to match
              frontmatter.
            </p>
          </div>
          <DialogFooter>
            <Button
              disabled={!editor?.name.trim()}
              onClick={submitEditor}
            >
              {editor?.id ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SmartViewRow({
  worldId,
  view,
  expanded,
  activeArticleId,
  onToggle,
  onEdit,
  onDelete,
}: {
  worldId: string
  view: SavedView
  expanded: boolean
  activeArticleId: string | null
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const results = useQuery({
    queryKey: ['worlds', worldId, 'query', view.query],
    queryFn: () => api.worlds.query(worldId, view.query),
  })
  const count = results.data?.length ?? 0

  return (
    <div>
      <div className="hover:bg-accent group flex items-center gap-1 rounded px-2 py-1 text-sm">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={onToggle}
        >
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          <Filter className="size-3.5 shrink-0 text-sky-600" />
          <span className="truncate font-medium">{view.name}</span>
          <span className="text-muted-foreground shrink-0 text-xs">
            {results.isSuccess ? count : '…'}
          </span>
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
          title="Edit view"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100"
          title="Delete view"
          onClick={() => {
            if (confirm(`Delete the "${view.name}" smart view?`)) onDelete()
          }}
        >
          <X className="size-3.5" />
        </button>
      </div>
      {expanded && (
        <div>
          {results.isLoading && (
            <p className="text-muted-foreground py-1 pl-9 text-xs">Loading…</p>
          )}
          {results.isSuccess && count === 0 && (
            <p className="text-muted-foreground py-1 pl-9 text-xs">
              No matching articles.
            </p>
          )}
          {results.data?.map((article) => (
            <Link
              key={article.id}
              to="/worlds/$worldId/articles/$articleId"
              params={{ worldId, articleId: article.id }}
              className={cn(
                'hover:bg-accent flex items-center gap-1.5 rounded py-1 pl-9 pr-2 text-sm',
                activeArticleId === article.id && 'bg-accent font-medium',
              )}
            >
              <FileText className="text-muted-foreground size-3.5 shrink-0" />
              <span className="truncate">{article.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
