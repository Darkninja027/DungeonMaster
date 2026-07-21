import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Save, Trash2 } from 'lucide-react'
import { api } from '#/lib/api'
import { parseCharacter, serializeCharacter } from '#/lib/character'
import type { Character } from '#/lib/character'
import { useShortcut } from '#/lib/useShortcut'
import type { RollSource } from '#/lib/rollLog'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { NumField } from '#/components/character/NumField'
import { SheetTab } from '#/components/character/SheetTab'
import { InventoryTab } from '#/components/character/InventoryTab'
import { NotesTab } from '#/components/character/NotesTab'

export const Route = createFileRoute('/worlds/$worldId/characters/$articleId')({
  component: CharacterPage,
})

function CharacterPage() {
  const { worldId, articleId } = Route.useParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const article = useQuery({
    queryKey: ['articles', articleId],
    queryFn: () => api.articles.get(worldId, articleId),
  })
  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })

  const [title, setTitle] = useState('')
  const [character, setCharacter] = useState<Character | null>(null)
  const [body, setBody] = useState('')
  const [dirty, setDirty] = useState(false)

  // Same guarded reset as the article editor: only load fresh state when a
  // different character arrives or nothing is unsaved.
  const loadedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!article.data) return
    if (loadedIdRef.current === article.data.id && dirty) return
    loadedIdRef.current = article.data.id
    const parsed = parseCharacter(article.data.content)
    setTitle(article.data.title)
    setCharacter(parsed.character)
    setBody(parsed.body)
    setDirty(false)
  }, [article.data, dirty])

  const save = useMutation({
    mutationFn: () => {
      const currentId = article.data?.id ?? articleId
      if (!character) throw new Error('Nothing to save.')
      return api.articles.update(worldId, currentId, {
        title,
        content: serializeCharacter(character, body),
      })
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['articles', updated.id], updated)
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
      setDirty(false)
      if (updated.id !== articleId) {
        navigate({
          to: '/worlds/$worldId/characters/$articleId',
          params: { worldId, articleId: updated.id },
          replace: true,
        })
      }
    },
  })

  const saveMutate = save.mutate
  const savePending = save.isPending
  useEffect(() => {
    if (!dirty || !title.trim() || savePending) return
    const timer = setTimeout(() => saveMutate(), 2000)
    return () => clearTimeout(timer)
  }, [dirty, title, character, body, savePending, saveMutate])

  useShortcut('s', () => {
    if (dirty && title.trim() && !save.isPending) save.mutate()
  })

  const remove = useMutation({
    mutationFn: () =>
      api.articles.delete(worldId, article.data?.id ?? articleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
      navigate({ to: '/worlds/$worldId', params: { worldId } })
    },
  })

  if (article.isLoading || !character) {
    return <p className="text-muted-foreground p-6">Loading character…</p>
  }
  if (article.isError) {
    return (
      <p className="text-destructive p-6">
        Failed to load character: {article.error.message}
      </p>
    )
  }

  const update = (next: Character) => {
    setCharacter(next)
    setDirty(true)
  }

  const source: RollSource = {
    worldId,
    articleId: article.data?.id ?? articleId,
    title: article.data?.title ?? title,
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2">
        <Input
          value={title}
          className="max-w-56 border-none text-lg font-semibold shadow-none focus-visible:ring-1"
          onChange={(e) => {
            setTitle(e.target.value)
            setDirty(true)
          }}
        />
        <Input
          value={character.race}
          placeholder="Race"
          className="h-7 w-28 text-sm"
          onChange={(e) => update({ ...character, race: e.target.value })}
        />
        <Input
          value={character.class}
          placeholder="Class"
          className="h-7 w-28 text-sm"
          onChange={(e) => update({ ...character, class: e.target.value })}
        />
        <label className="flex items-center gap-1 text-sm">
          Lvl
          <NumField
            value={character.level}
            min={1}
            max={20}
            className="w-10"
            onCommit={(v) => update({ ...character, level: v })}
          />
        </label>
        <Input
          value={character.background}
          placeholder="Background"
          className="h-7 w-28 text-sm"
          onChange={(e) => update({ ...character, background: e.target.value })}
        />
        <Input
          value={character.alignment}
          placeholder="Alignment"
          className="h-7 w-16 text-sm"
          onChange={(e) => update({ ...character, alignment: e.target.value })}
        />
        <label className="flex items-center gap-1 text-sm">
          XP
          <NumField
            value={character.xp}
            min={0}
            className="w-20"
            onCommit={(v) => update({ ...character, xp: v })}
          />
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
            <Link
              to="/worlds/$worldId/articles/$articleId"
              params={{ worldId, articleId: article.data?.id ?? articleId }}
              title="Edit the raw markdown/frontmatter"
            >
              <FileText className="size-3.5" /> Raw article
            </Link>
          </Button>
          <Button
            size="sm"
            disabled={!dirty || !title.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save />
            {save.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Delete character"
            onClick={() => {
              if (confirm(`Delete "${title}"? It goes to the Recycle Bin.`)) {
                remove.mutate()
              }
            }}
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </div>
      {save.isError && (
        <p className="text-destructive border-b px-4 py-1 text-sm">
          {save.error.message}
        </p>
      )}

      <Tabs defaultValue="sheet" className="min-h-0 flex-1 gap-0">
        <div className="border-b px-4 py-1.5">
          <TabsList className="h-8">
            <TabsTrigger value="sheet" className="text-xs">
              Sheet
            </TabsTrigger>
            <TabsTrigger value="inventory" className="text-xs">
              Inventory ({character.inventory.length})
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-xs">
              Notes ({character.notes.length})
            </TabsTrigger>
            <TabsTrigger value="backstory" className="text-xs">
              Backstory
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="sheet" className="min-h-0 flex-1 overflow-y-auto">
          <SheetTab character={character} onChange={update} source={source} />
        </TabsContent>
        <TabsContent
          value="inventory"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <InventoryTab
            character={character}
            onChange={update}
            worldId={worldId}
            articles={tree.data?.articles}
          />
        </TabsContent>
        <TabsContent value="notes" className="min-h-0 flex-1 overflow-y-auto">
          <NotesTab
            character={character}
            onChange={update}
            worldId={worldId}
            articles={tree.data?.articles}
          />
        </TabsContent>
        <TabsContent value="backstory" className="flex min-h-0 flex-1 flex-col">
          <Textarea
            value={body}
            placeholder="Backstory, bonds, ideals, flaws — markdown with [[wiki links]]."
            className="h-full min-h-0 flex-1 resize-none rounded-none border-none font-mono text-sm shadow-none focus-visible:ring-0"
            onChange={(e) => {
              setBody(e.target.value)
              setDirty(true)
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
