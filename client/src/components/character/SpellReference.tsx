import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  X,
} from 'lucide-react'
import { api } from '#/lib/api'
import { splitFrontmatter } from '#/lib/formatMarkdown'
import { REVEAL_LABEL, revealer } from '#/lib/reveal'
import {
  consumeSpellPanelRequest,
  useSpellPanelRequest,
} from '#/lib/spellPanel'
import { articleTemplates } from '#/lib/templates'
import {
  collectSpells,
  entryKey,
  filterEntries,
  mergeEntries,
} from '#/lib/bestiary'
import type { LibraryEntry } from '#/lib/bestiary'
import { useLibraryEntries } from '#/lib/useGlobalLibrary'
import { LibraryImportButton } from '#/components/LibraryImportButton'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'
import { InlineMarkdown, PANEL_PROSE } from '#/components/Markdown'

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
  // Keyed by world as well as article: a global library entry and a world
  // article can share an id (both have Spells/Fireball), and a bare articleId
  // key would serve one world's content for the other's row.
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
 * Session-panel spell reference: the world's spell library (every article in
 * the Spells/ folder), searchable, with inline expandable descriptions — a
 * shared wiki for every caster at the table, not tied to one character.
 * Character sheets link against this library when adding spells.
 */
export function SpellReference({ worldId }: { worldId: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  // No panel-level revealer: each row builds one from its own entry's world, so
  // a library entry reveals in the library folder rather than this one.
  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })

  const [filter, setFilter] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [newSpell, setNewSpell] = useState('')

  // The world's own spell library, plus the global one, merged into one list.
  const library = useLibraryEntries('Spells')
  const spells = useMemo(
    () =>
      mergeEntries(
        collectSpells(worldId, tree.data, { folder: SPELLS_FOLDER }),
        library.entries,
      ),
    [worldId, tree.data, library.entries],
  )

  // Fulfil "open this spell" requests from character sheets. The request only
  // carries an article id, so prefer this world's copy and fall back to the
  // library — a sheet's spell is far more likely to be the local one.
  const request = useSpellPanelRequest()
  useEffect(() => {
    if (!request) return
    const match =
      spells.find((s) => !s.global && s.articleId === request.articleId) ??
      spells.find((s) => s.articleId === request.articleId)
    setFilter('')
    if (match) setOpenId(entryKey(match))
    consumeSpellPanelRequest()
  }, [request, spells])

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

  // Only ever called for this world's own entries — a library entry is
  // read-only here, and deleting one from inside a world would remove it from
  // every other world too.
  const deleteSpell = useMutation({
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
          name: SPELLS_FOLDER,
        })
      } catch {
        // folder already exists
      }
      return api.articles.create({
        worldId,
        folderId: SPELLS_FOLDER,
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

  const visible = filterEntries(spells, filter)
  // A configured-but-missing library (moved folder, drive not plugged in) is
  // said out loud rather than silently showing a shorter list.
  const libraryUnavailable = library.info !== null && !library.info.available

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-2 py-1.5">
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
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
          <LibraryImportButton target="Spells" />
        </div>
        {libraryUnavailable && (
          <p className="text-muted-foreground mt-1.5 text-xs">
            Global library unavailable — {library.info?.path}
          </p>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {visible.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            {filter.trim()
              ? 'No spells match.'
              : 'The spell library is empty. Add one below, or add a spell on a character sheet — unknown spells land here automatically.'}
          </p>
        ) : (
          <ul className="divide-y">
            {visible.map((spell) => {
              const key = entryKey(spell)
              const open = openId === key
              return (
                <li key={key} className="group px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
                      title={open ? 'Hide description' : 'Show description'}
                      onClick={() => setOpenId(open ? null : key)}
                    >
                      {open ? (
                        <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {spell.title}
                      </span>
                      {spell.global && (
                        <span
                          className="bg-muted text-muted-foreground shrink-0 rounded px-1 text-[10px]"
                          title="From your global library — shared by every world."
                        >
                          Global
                        </span>
                      )}
                    </button>
                    {spell.global ? (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
                        title="Library entries are read-only here"
                        onClick={() =>
                          alert(
                            `"${spell.title}" lives in your global library, so it is read-only from inside a world.\n\nUse "Copy to this world" to make an editable copy, or open the library folder to edit it everywhere.`,
                          )
                        }
                      >
                        <SquarePen className="size-3.5" />
                      </button>
                    ) : (
                      <Link
                        to="/worlds/$worldId/articles/$articleId"
                        params={{ worldId, articleId: spell.articleId }}
                        className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
                        title="Edit the spell's article"
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
                        {spell.global && (
                          <DropdownMenuItem
                            disabled={copyToWorld.isPending}
                            onClick={() => copyToWorld.mutate(spell)}
                          >
                            <Copy /> Copy to this world
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() =>
                            revealer(spell.worldId)(`${spell.articleId}.md`)
                          }
                        >
                          <FolderOpen /> {REVEAL_LABEL}
                        </DropdownMenuItem>
                        {/* World entries only. Deleting a library entry from
                            inside a world would take it out of every world. */}
                        {!spell.global && (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete "${spell.title}"? It goes to the Recycle Bin.`,
                                )
                              ) {
                                deleteSpell.mutate(spell)
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
                          library and _images/ paths load over world://. */}
                      <SpellArticle
                        worldId={spell.worldId}
                        articleId={spell.articleId}
                        title={spell.title}
                        articles={
                          spell.global ? library.articles : tree.data.articles
                        }
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
