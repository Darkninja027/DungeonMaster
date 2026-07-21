import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  SquarePen,
  X,
} from 'lucide-react'
import { api } from '#/lib/api'
import { splitFrontmatter } from '#/lib/formatMarkdown'
import {
  consumeSpellPanelRequest,
  useSpellPanelRequest,
} from '#/lib/spellPanel'
import { articleTemplates } from '#/lib/templates'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'
import { InlineMarkdown } from '#/components/Markdown'

const SPELLS_FOLDER = 'Spells'

/**
 * The expanded spell description: its article's markdown with live dice
 * chips, so "3d4+3" (or an At Higher Levels roll) is rollable in the panel.
 */
function SpellArticle({
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
      className="text-sm [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1 [&_table]:my-1 [&_td]:border [&_td]:px-1 [&_th]:border [&_th]:px-1"
    >
      {splitFrontmatter(article.data.content).body}
    </InlineMarkdown>
  )
}

/**
 * Session-panel spell reference: the world's spell library (every article in
 * the Spells/ folder), searchable, with inline expandable descriptions — a
 * shared wiki for every caster at the table, not tied to one character.
 * Character sheets link against this library when adding spells.
 */
export function SpellReference({ worldId }: { worldId: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })

  const [filter, setFilter] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [newSpell, setNewSpell] = useState('')

  // Fulfil "open this spell" requests from character sheets.
  const request = useSpellPanelRequest()
  useEffect(() => {
    if (!request) return
    setFilter('')
    setOpenId(request.articleId)
    consumeSpellPanelRequest()
  }, [request])

  // Create a library spell and jump to its article to write the description.
  const createSpell = useMutation({
    mutationFn: async (title: string) => {
      try {
        await api.folders.create({
          worldId,
          parentFolderId: null,
          name: SPELLS_FOLDER,
        })
      } catch {
        // folder already exists
      }
      const template = articleTemplates.find((t) => t.id === 'spell')
      return api.articles.create({
        worldId,
        folderId: SPELLS_FOLDER,
        title,
        content: template?.body ?? '',
      })
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
      setNewSpell('')
      navigate({
        to: '/worlds/$worldId/articles/$articleId',
        params: { worldId, articleId: created.id },
      })
    },
    onError: (error) => alert(error.message),
  })

  const submitNewSpell = () => {
    const title = newSpell.trim()
    if (!title || createSpell.isPending) return
    createSpell.mutate(title)
  }

  if (tree.isPending) {
    return <p className="text-muted-foreground p-4 text-sm">Loading…</p>
  }
  if (tree.isError) {
    return (
      <p className="text-destructive p-4 text-sm">
        Failed to load the spell library: {tree.error.message}
      </p>
    )
  }

  const spells = tree.data.articles
    .filter(
      (a) =>
        a.folderId === SPELLS_FOLDER ||
        a.folderId?.startsWith(`${SPELLS_FOLDER}/`),
    )
    .filter(
      (a) =>
        !filter.trim() ||
        a.title.toLowerCase().includes(filter.trim().toLowerCase()),
    )
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    )

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-2 py-1.5">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            value={filter}
            placeholder="Search spells…"
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
        {spells.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            {filter.trim()
              ? 'No spells match.'
              : 'The spell library is empty. Add one below, or add a spell on a character sheet — unknown spells land here automatically.'}
          </p>
        ) : (
          <ul className="divide-y">
            {spells.map((spell) => {
              const open = openId === spell.id
              return (
                <li key={spell.id} className="group px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
                      title={open ? 'Hide description' : 'Show description'}
                      onClick={() => setOpenId(open ? null : spell.id)}
                    >
                      {open ? (
                        <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {spell.title}
                      </span>
                    </button>
                    <Link
                      to="/worlds/$worldId/articles/$articleId"
                      params={{ worldId, articleId: spell.id }}
                      className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
                      title="Edit the spell's article"
                    >
                      <SquarePen className="size-3.5" />
                    </Link>
                  </div>
                  {open && (
                    <div className="bg-muted/40 ml-5 mt-1.5 rounded p-2">
                      <SpellArticle
                        worldId={worldId}
                        articleId={spell.id}
                        title={spell.title}
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
          value={newSpell}
          placeholder="New spell name…"
          className="h-7 min-w-0 flex-1 text-sm"
          onChange={(e) => setNewSpell(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitNewSpell()}
        />
        <Button
          size="sm"
          className="h-7 shrink-0"
          disabled={!newSpell.trim() || createSpell.isPending}
          onClick={submitNewSpell}
        >
          <Plus className="size-3.5" />
          {createSpell.isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </div>
  )
}
