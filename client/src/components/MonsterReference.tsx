import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  SquarePen,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { api } from '#/lib/api'
import { splitFrontmatter } from '#/lib/formatMarkdown'
import { REVEAL_LABEL, revealer } from '#/lib/reveal'
import { parseStatBlock } from '#/lib/statblock'
import { articleTemplates, newArticleContent } from '#/lib/templates'
import {
  collectMonsters,
  entryKey,
  filterEntries,
  mergeEntries,
} from '#/lib/bestiary'
import type { LibraryEntry } from '#/lib/bestiary'
import { useLibraryEntries } from '#/lib/useGlobalLibrary'
import { LibraryImportButton } from '#/components/LibraryImportButton'
import { VirtualList } from '#/components/VirtualList'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
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
  // Keyed by world as well as article: a global library entry and a world
  // article can share an id (both worlds have Monsters/Goblin), and a bare
  // articleId key would serve one world's content for the other's row.
  const article = useQuery({
    queryKey: ['worlds', worldId, 'articles', articleId],
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
  // No panel-level revealer: each row builds one from its own entry's world, so
  // a library entry reveals in the library folder rather than this one.
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

  // Only ever called for this world's own entries — a library entry is
  // read-only here, and deleting one from inside a world would remove it from
  // every other world too.
  const deleteMonster = useMutation({
    mutationFn: (entry: LibraryEntry) =>
      api.articles.delete(entry.worldId, entry.articleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
      setOpenId(null)
    },
    onError: (error: Error) => alert(error.message),
  })

  // The editable escape hatch for a read-only library entry: copy it in, then
  // it's an ordinary article of this world and every affordance works.
  const copyToWorld = useMutation({
    mutationFn: async (entry: LibraryEntry) => {
      const source = await api.articles.get(entry.worldId, entry.articleId)
      try {
        await api.folders.create({
          worldId,
          parentFolderId: null,
          name: MONSTERS_FOLDER,
        })
      } catch {
        // folder already exists
      }
      return api.articles.create({
        worldId,
        folderId: MONSTERS_FOLDER,
        title: entry.title,
        content: source.content,
      })
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
      navigate({
        to: '/worlds/$worldId/articles/$articleId',
        params: { worldId, articleId: created.id },
      })
    },
    onError: (error: Error) => alert(error.message),
  })

  // The world's own bestiary, plus the global library's, merged into one list.
  // Library entries carry the library's world id so every per-row action —
  // fetch, reveal, render — targets the folder the article actually lives in.
  const library = useLibraryEntries('Monsters')
  const monsters = useMemo(
    () =>
      mergeEntries(
        collectMonsters(worldId, tree.data, typed.data, {
          folder: MONSTERS_FOLDER,
        }),
        library.entries,
      ),
    [worldId, tree.data, typed.data, library.entries],
  )

  // CR/XP for the list rows, taken from the frontmatter the query already
  // parsed. This used to fetch every monster's full article — one IPC
  // round-trip each, which at library scale meant several hundred of them on
  // every panel open, to re-derive two numbers the main process had in hand.
  //
  // Only entries with no frontmatter cr fall back to reading the article, so
  // hand-written stat blocks still show a rating. That set is normally empty
  // and always small; the bundled bestiary declares both fields throughout.
  const visible = useMemo(
    () => filterEntries(monsters, filter),
    [monsters, filter],
  )

  const needsFetch = useMemo(
    () => monsters.filter((m) => m.cr == null),
    [monsters],
  )
  const fetched = useQueries({
    queries: needsFetch.map((m) => ({
      queryKey: ['worlds', m.worldId, 'articles', m.articleId],
      queryFn: () => api.articles.get(m.worldId, m.articleId),
    })),
  })
  // Keyed by entryKey, not article id: two worlds can hold Monsters/Goblin, and
  // a bare id would show one row's CR on the other's.
  const crByKey = useMemo(() => {
    const map = new Map<string, { cr: string | null; xp: number | null }>()
    for (const m of monsters) {
      if (m.cr != null) map.set(entryKey(m), { cr: m.cr, xp: m.xp ?? null })
    }
    // fetched is mapped from needsFetch, so the indices line up one-to-one.
    fetched.forEach((q, i) => {
      if (!q.data) return
      const sb = parseStatBlock(q.data.content)
      map.set(entryKey(needsFetch[i]), { cr: sb.cr, xp: sb.xp })
    })
    return map
  }, [monsters, needsFetch, fetched])

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
  // A configured-but-missing library (moved folder, drive not plugged in) is
  // said out loud rather than silently showing a shorter list.
  const libraryUnavailable = library.info !== null && !library.info.available
  const libraryPath = library.info?.path ?? ''

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-2 py-1.5">
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
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
          <LibraryImportButton target="Monsters" />
        </div>
        {libraryUnavailable && (
          <p className="text-muted-foreground mt-1.5 text-xs">
            Global library unavailable — {libraryPath}
          </p>
        )}
      </div>
      <VirtualList
        className="min-h-0 flex-1"
        items={visible}
        estimateHeight={32}
        getKey={entryKey}
        empty={
          <p className="text-muted-foreground p-4 text-sm">
            {needle
              ? 'No monsters match.'
              : 'The bestiary is empty. Add one below to start a stat block.'}
          </p>
        }
        renderRow={(monster) => {
          const key = entryKey(monster)
          const open = openId === key
          const stats = crByKey.get(key)
          return (
            <>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
                  title={open ? 'Hide stat block' : 'Show stat block'}
                  onClick={() => setOpenId(open ? null : key)}
                >
                  {open ? (
                    <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {monster.title}
                  </span>
                  {monster.global && (
                    <span
                      className="bg-muted text-muted-foreground shrink-0 rounded px-1 text-[10px]"
                      title="From your global library — shared by every world."
                    >
                      Global
                    </span>
                  )}
                  {/* Only for the world's own entries: a global monster is
                        invisible to the encounter builder for a different
                        reason (no world qualifier on combatants yet), so the
                        "add the frontmatter" advice would be wrong here. */}
                  {!monster.queryable && !monster.global && (
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
                {monster.global ? (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
                    title="Library entries are read-only here"
                    onClick={() =>
                      alert(
                        `"${monster.title}" lives in your global library, so it is read-only from inside a world.\n\nUse "Copy to this world" to make an editable copy, or open the library folder to edit it everywhere.`,
                      )
                    }
                  >
                    <SquarePen className="size-3.5" />
                  </button>
                ) : (
                  <Link
                    to="/worlds/$worldId/articles/$articleId"
                    params={{ worldId, articleId: monster.articleId }}
                    className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
                    title="Edit the monster's article"
                  >
                    <SquarePen className="size-3.5" />
                  </Link>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {monster.global && (
                      <DropdownMenuItem
                        disabled={copyToWorld.isPending}
                        onClick={() => copyToWorld.mutate(monster)}
                      >
                        <Copy /> Copy to this world
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() =>
                        revealer(monster.worldId)(`${monster.articleId}.md`)
                      }
                    >
                      <FolderOpen /> {REVEAL_LABEL}
                    </DropdownMenuItem>
                    {/* World entries only. Deleting a library entry from
                          inside a world would take it out of every world. */}
                    {!monster.global && (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          if (
                            confirm(
                              `Delete "${monster.title}"? It goes to the Recycle Bin.`,
                            )
                          ) {
                            deleteMonster.mutate(monster)
                          }
                        }}
                      >
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {open && (
                <div className="bg-muted/40 ml-5 mt-1.5 rounded p-2">
                  {/* Both the world id and the article list come from the
                        entry's own world, so [[links]] resolve within the
                        library and _images/ portraits load over world://. */}
                  <MonsterArticle
                    worldId={monster.worldId}
                    articleId={monster.articleId}
                    title={monster.title}
                    articles={
                      monster.global ? library.articles : tree.data.articles
                    }
                  />
                </div>
              )}
            </>
          )
        }}
      />
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
