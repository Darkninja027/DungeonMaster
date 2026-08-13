import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  SquarePen,
  TriangleAlert,
  X,
} from 'lucide-react'
import { api } from '#/lib/api'
import { splitFrontmatter } from '#/lib/formatMarkdown'
import { parseStatBlock } from '#/lib/statblock'
import { articleTemplates, newArticleContent } from '#/lib/templates'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'
import { InlineMarkdown, PANEL_PROSE } from '#/components/Markdown'

const MONSTERS_FOLDER = 'Monsters'

/**
 * The expanded monster entry: its article's markdown, which renders the
 * ```statblock fence as a full PHB card with live dice chips — so attack
 * damage is rollable straight from the panel mid-combat.
 */
function MonsterArticle({
  worldId,
  articleId,
  title,
  articles,
}: {
  worldId: string
  articleId: string
  title: string
  articles?: Array<{ id: string; title: string }>
}) {
  const article = useQuery({
    queryKey: ['articles', articleId],
    queryFn: () => api.articles.get(worldId, articleId),
  })
  if (article.isPending)
    return <p className="text-muted-foreground text-xs">Loading…</p>
  if (article.isError)
    return <p className="text-destructive text-xs">Failed to load article.</p>
  return (
    <InlineMarkdown
      worldId={worldId}
      articles={articles}
      source={{ worldId, articleId, title }}
      className={PANEL_PROSE}
    >
      {splitFrontmatter(article.data.content).body}
    </InlineMarkdown>
  )
}

/**
 * Session-panel monster reference: the world's bestiary, searchable, with
 * inline expandable stat blocks. The counterpart to SpellReference — the
 * sidebar is for worldbuilding, so monsters live here instead of in the tree.
 *
 * A monster is any article in the Monsters/ folder *or* any article whose
 * frontmatter says `type: monster` (the same rule the encounter builder uses),
 * so creatures written elsewhere in the world still show up.
 */
export function MonsterReference({ worldId }: { worldId: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })
  const typed = useQuery({
    queryKey: ['worlds', worldId, 'query', { type: 'monster' }],
    queryFn: () => api.worlds.query(worldId, { type: 'monster' }),
  })

  const [filter, setFilter] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [newMonster, setNewMonster] = useState('')

  // Create a bestiary entry and jump to its article to write the stat block.
  const createMonster = useMutation({
    mutationFn: async (title: string) => {
      try {
        await api.folders.create({
          worldId,
          parentFolderId: null,
          name: MONSTERS_FOLDER,
        })
      } catch {
        // folder already exists
      }
      const template = articleTemplates.find((t) => t.id === 'monster')
      return api.articles.create({
        worldId,
        folderId: MONSTERS_FOLDER,
        title,
        // newArticleContent, not template.body — the monster template carries
        // no frontmatter of its own, and without the `type: monster` header
        // this article would be invisible to the encounter builder.
        content: template ? newArticleContent(template) : '',
      })
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
      setNewMonster('')
      navigate({
        to: '/worlds/$worldId/articles/$articleId',
        params: { worldId, articleId: created.id },
      })
    },
    onError: (error) => alert(error.message),
  })

  const submitNewMonster = () => {
    const title = newMonster.trim()
    if (!title || createMonster.isPending) return
    createMonster.mutate(title)
  }

  // Folder members plus `type: monster` articles, deduped by id. `queryable`
  // tracks which ones carry the frontmatter: the encounter builder matches on
  // `type: monster` alone, so a folder-only entry is invisible there and the
  // row flags it rather than letting the two lists disagree in silence.
  const monsters = useMemo(() => {
    const queryable = new Set((typed.data ?? []).map((a) => a.id))
    const byId = new Map<
      string,
      { id: string; title: string; queryable: boolean }
    >()
    for (const a of tree.data?.articles ?? []) {
      if (
        a.folderId === MONSTERS_FOLDER ||
        a.folderId?.startsWith(`${MONSTERS_FOLDER}/`)
      ) {
        byId.set(a.id, {
          id: a.id,
          title: a.title,
          queryable: queryable.has(a.id),
        })
      }
    }
    for (const a of typed.data ?? [])
      byId.set(a.id, { id: a.id, title: a.title, queryable: true })
    return [...byId.values()].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    )
  }, [tree.data, typed.data])

  // CR/XP for the list rows. Cached by React Query, so re-renders don't re-read
  // disk — the same pattern the encounter builder uses.
  const contents = useQueries({
    queries: monsters.map((m) => ({
      queryKey: ['worlds', worldId, 'articles', m.id],
      queryFn: () => api.articles.get(worldId, m.id),
    })),
  })
  const crById = useMemo(() => {
    const map = new Map<string, { cr: string | null; xp: number | null }>()
    for (const q of contents) {
      if (!q.data) continue
      const sb = parseStatBlock(q.data.content)
      map.set(q.data.id, { cr: sb.cr, xp: sb.xp })
    }
    return map
  }, [contents])

  if (tree.isPending) {
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>
  }
  if (tree.isError) {
    return (
      <p className="text-destructive p-4 text-sm">
        Failed to load the bestiary: {tree.error.message}
      </p>
    )
  }

  const needle = filter.trim().toLowerCase()
  const visible = needle
    ? monsters.filter((m) => m.title.toLowerCase().includes(needle))
    : monsters

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-2 py-1.5">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            value={filter}
            placeholder="Search monsters…"
            className="h-7 px-7 text-sm"
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setFilter('')}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {visible.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            {needle
              ? 'No monsters match.'
              : 'The bestiary is empty. Add one below to start a stat block.'}
          </p>
        ) : (
          <ul className="divide-y">
            {visible.map((monster) => {
              const open = openId === monster.id
              const stats = crById.get(monster.id)
              return (
                <li key={monster.id} className="group px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
                      title={open ? 'Hide stat block' : 'Show stat block'}
                      onClick={() => setOpenId(open ? null : monster.id)}
                    >
                      {open ? (
                        <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {monster.title}
                      </span>
                      {!monster.queryable && (
                        <span
                          className="shrink-0 text-amber-600"
                          title="No `type: monster` frontmatter — the encounter builder can't see this one. Open the article and add it."
                        >
                          <TriangleAlert className="size-3.5" />
                        </span>
                      )}
                      {stats?.cr != null && (
                        <span className="text-muted-foreground shrink-0 text-xs">
                          CR {stats.cr}
                        </span>
                      )}
                    </button>
                    <Link
                      to="/worlds/$worldId/articles/$articleId"
                      params={{ worldId, articleId: monster.id }}
                      className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
                      title="Edit the monster's article"
                    >
                      <SquarePen className="size-3.5" />
                    </Link>
                  </div>
                  {open && (
                    <div className="bg-muted/40 ml-5 mt-1.5 rounded p-2">
                      <MonsterArticle
                        worldId={worldId}
                        articleId={monster.id}
                        title={monster.title}
                        articles={tree.data.articles}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
      <div className="flex gap-1.5 border-t p-2">
        <Input
          value={newMonster}
          placeholder="New monster name…"
          className="h-7 min-w-0 flex-1 text-sm"
          onChange={(e) => setNewMonster(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitNewMonster()}
        />
        <Button
          size="sm"
          className="h-7 shrink-0"
          disabled={!newMonster.trim() || createMonster.isPending}
          onClick={submitNewMonster}
        >
          <Plus className="size-3.5" />
          {createMonster.isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </div>
  )
}
