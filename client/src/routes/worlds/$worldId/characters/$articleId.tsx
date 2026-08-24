import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  Eye,
  FileDown,
  FileText,
  FolderOpen,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react'
import { api } from '#/lib/api'
import { REVEAL_LABEL, revealer } from '#/lib/reveal'
import { parseCharacter, serializeCharacter, setLevel } from '#/lib/character'
import type { Character } from '#/lib/character'
import { findClass, subclassLabelFor, subclassesFor } from '#/lib/classes'
import { classesFrom } from '#/lib/tables'
import { useTables } from '#/lib/useHomebrew'
import { exportPdf } from '#/lib/exportPdf'
import { useShortcut } from '#/lib/useShortcut'
import { useArticleEditorSave } from '#/lib/useArticleEditorSave'
import { useMarkdownEditor } from '#/lib/useMarkdownEditor'
import { useWikiLinkOpener } from '#/lib/useWikiLinkOpener'
import { MarkdownContextMenu } from '#/components/MarkdownContextMenu'
import type { RollSource } from '#/lib/rollLog'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { cn } from '#/lib/utils'
import { NumField } from '#/components/character/NumField'
import { LevelUpDialog } from '#/components/character/levelup/LevelUpDialog'
import { SheetTab } from '#/components/character/SheetTab'
import { InventoryTab } from '#/components/character/InventoryTab'
import { EquipmentTab } from '#/components/character/EquipmentTab'
import { FeaturesTab } from '#/components/character/FeaturesTab'
import { NotesTab } from '#/components/character/NotesTab'
import {
  SheetFitPane,
  SheetPreview,
  hasSpellcasting,
} from '#/components/character/SheetPreview'
import { loadSpellCards, saveSpellCards } from '#/lib/sheetPrintPrefs'
import { CreateMissingArticleDialog } from '#/components/CreateMissingArticleDialog'

/**
 * Poll a settled flag until it trips, or give up. Used by the PDF export to wait
 * for the spell-card articles, which land asynchronously after the preview tab
 * mounts — see the export handler for why exporting early fails silently.
 *
 * A poll rather than a promise because the flag is owned by a child component's
 * query state, and there is no single fetch to await.
 */
async function waitForCards(
  settled: { current: boolean },
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!settled.current && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 60))
  }
}

export const Route = createFileRoute('/worlds/$worldId/characters/$articleId')({
  component: CharacterPage,
})

function CharacterPage() {
  const { worldId, articleId } = Route.useParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const reveal = revealer(worldId)

  const article = useQuery({
    queryKey: ['articles', articleId],
    queryFn: () => api.articles.get(worldId, articleId),
  })
  const tree = useQuery({
    queryKey: ['worlds', worldId, 'tree'],
    queryFn: () => api.worlds.tree(worldId),
  })
  // This world's own class list, from its worldSettings.json — homebrew included.
  // Must stay above the early return below: hook order can't be conditional.
  // Classes come from the merged tables now: SRD kits, plus global homebrew,
  // plus this world's own. The sheet only wants a hit die and the subclass
  // suggestions, which is exactly what classesFrom hands back.
  const classes = classesFrom(useTables(worldId))

  const [title, setTitle] = useState('')
  const [character, setCharacter] = useState<Character | null>(null)
  const [body, setBody] = useState('')
  // `editSeq` bumps on every edit so the autosave debounce restarts on each
  // keystroke; `dirty` alone stays true and would fire 2s after the first one.
  const [{ dirty, editSeq }, setDirtyState] = useState({
    dirty: false,
    editSeq: 0,
  })
  const setDirty = useCallback((next: boolean) => {
    setDirtyState((prev) => ({
      dirty: next,
      editSeq: next ? prev.editSeq + 1 : prev.editSeq,
    }))
  }, [])
  // Broken [[link]] clicked in inventory/notes -> offer to create the article.
  const [missingTitle, setMissingTitle] = useState<string | null>(null)
  // Ctrl+Click / Ctrl+Enter on a [[link]] in the raw backstory text.
  const openWikiLink = useWikiLinkOpener({
    worldId,
    articles: tree.data?.articles,
    onMissing: setMissingTitle,
  })
  // Formatting shortcuts for the Backstory tab's markdown textarea.
  const backstoryEditor = useMarkdownEditor({
    onFallbackChange: (value) => {
      setBody(value)
      setDirty(true)
    },
    onWikiLinkOpen: openWikiLink,
  })
  // Controlled so Export PDF can switch to the preview before capturing it.
  const [tab, setTab] = useState('sheet')
  const [exporting, setExporting] = useState(false)

  // Same guarded reset as the article editor: only load fresh state when a
  // different character arrives or nothing is unsaved.
  const loadedIdRef = useRef<string | null>(null)
  // Content of the last successful save. A save writes the result back into the
  // query cache, which hands this effect a new `article.data` object with
  // `dirty` freshly false — so without this guard every autosave reparses the
  // character into all-new objects mid-edit, collapsing the open note (and
  // churning every other tab's fields underneath the cursor).
  const savedContentRef = useRef<string | null>(null)
  // A half-typed title isn't tracked by `dirty` (it isn't content), so it needs
  // its own guard or a background refetch would clobber it mid-word.
  const titleDirtyRef = useRef(false)
  useEffect(() => {
    if (!article.data) return
    if (loadedIdRef.current === article.data.id) {
      if (dirty || titleDirtyRef.current) return
      if (article.data.content === savedContentRef.current) return
    }
    loadedIdRef.current = article.data.id
    const parsed = parseCharacter(article.data.content)
    setTitle(article.data.title)
    setCharacter(parsed.character)
    setBody(parsed.body)
    setDirty(false)
  }, [article.data, dirty])

  const { commitTitle, saveNow, isPending, error } = useArticleEditorSave({
    worldId,
    routeArticleId: articleId,
    article: article.data,
    title,
    getContent: () => {
      if (!character) throw new Error('Nothing to save.')
      return serializeCharacter(character, body)
    },
    dirty,
    setDirty,
    editSeq,
    onSaved: (updated) => {
      savedContentRef.current = updated.content
    },
    onRenamed: (newId) => {
      navigate({
        to: '/worlds/$worldId/characters/$articleId',
        params: { worldId, articleId: newId },
        replace: true,
      })
    },
  })

  useShortcut('s', () => {
    commitTitle()
    if (dirty) saveNow()
  })

  const remove = useMutation({
    mutationFn: () =>
      api.articles.delete(worldId, article.data?.id ?? articleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
      navigate({ to: '/worlds/$worldId', params: { worldId } })
    },
  })

  /**
   * The level being levelled to while the wizard is open; null when closed.
   * Declared up here with the other hooks — the early returns below mean a
   * useState placed after them renders a different number of hooks depending
   * on load state, which React refuses outright.
   */
  const [levelUpTo, setLevelUpTo] = useState<number | null>(null)

  /**
   * Whether the printed sheet carries the spell-description pages, and whether
   * their articles have finished loading.
   *
   * `cardsSettled` is a ref rather than state because only the export handler
   * reads it, and re-rendering the whole route as two dozen article reads land
   * would be pure churn. The button's own disabled state uses the state copy.
   */
  const [spellCards, setSpellCards] = useState(loadSpellCards)
  const [cardsSettled, setCardsSettled] = useState(true)
  const cardsSettledRef = useRef(true)
  useEffect(() => {
    saveSpellCards(spellCards)
  }, [spellCards])

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
        {/* The title is the filename, so committing it renames the file and
            rewrites [[links]] world-wide. Far too expensive (and racy) to do on
            a keystroke — hence blur/Enter, not `dirty`. */}
        <Input
          value={title}
          className="max-w-56 border-none text-lg font-semibold shadow-none focus-visible:ring-1"
          onChange={(e) => {
            setTitle(e.target.value)
            titleDirtyRef.current = true
          }}
          onBlur={() => {
            titleDirtyRef.current = false
            commitTitle()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              setTitle(article.data?.title ?? title)
              titleDirtyRef.current = false
            }
          }}
        />
        <Input
          value={character.race}
          placeholder="Race"
          className="h-7 w-28 text-sm"
          onChange={(e) => update({ ...character, race: e.target.value })}
        />
        {/* A datalist, not a <select>: the world's class names are one click
            away but homebrew stays typeable, which the on-disk format
            requires. */}
        <Input
          list="dm-classes"
          value={character.class}
          placeholder="Class"
          className="h-7 w-28 text-sm"
          onChange={(e) => {
            const value = e.target.value
            const known = findClass(classes, value)
            update({
              ...character,
              class: value,
              // Naming a known class sets its hit die; homebrew leaves whatever
              // size the sheet already had.
              hitDice: known
                ? { ...character.hitDice, size: known.hitDie }
                : character.hitDice,
            })
          }}
        />
        <datalist id="dm-classes">
          {classes.map((cl) => (
            <option key={cl.id} value={cl.name} />
          ))}
        </datalist>
        <Input
          list="dm-subclasses"
          value={character.subclass}
          placeholder={subclassLabelFor(classes, character.class)}
          className="h-7 w-36 text-sm"
          onChange={(e) => update({ ...character, subclass: e.target.value })}
        />
        <datalist id="dm-subclasses">
          {subclassesFor(classes, character.class).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label className="flex items-center gap-1 text-sm">
          Lvl
          <NumField
            value={character.level}
            min={1}
            max={20}
            className="w-10"
            /*
              A rise opens the level-up wizard; anything else is a correction
              and behaves as it always did. Safe to hang off the spinner
              because NumField commits on blur or Enter only — typing "12" when
              you meant 1 then 2 can't fire a nine-level wizard mid-keystroke.
            */
            onCommit={(v) => {
              if (v > character.level) setLevelUpTo(v)
              else update(setLevel(character, v))
            }}
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
          {/* Only shown for a caster — a fighter's toolbar shouldn't carry a
              control that changes nothing. Gated on the same predicate the sheet
              itself uses, so the two can't disagree about who is a caster. */}
          {hasSpellcasting(character) && (
            <Button
              variant={spellCards ? 'default' : 'outline'}
              size="icon"
              className="size-8"
              aria-pressed={spellCards}
              title={
                spellCards
                  ? 'Spell descriptions are printed with the sheet — click to leave them out'
                  : 'Spell descriptions are left out — click to print them with the sheet'
              }
              onClick={() => setSpellCards((on) => !on)}
            >
              <BookOpen className="size-3.5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            title={
              spellCards && !cardsSettled
                ? 'Loading spell descriptions…'
                : 'Export the character sheet as PDF'
            }
            disabled={exporting || (spellCards && !cardsSettled)}
            onClick={async () => {
              setTab('preview')
              setExporting(true)
              try {
                // The spell cards read one article each, so the sheet is not
                // whole for a moment after the tab mounts — and exportPdf
                // captures whatever .dnd-page elements it finds, silently
                // skipping any that measure zero. Without this wait a PDF taken
                // too early is simply missing pages, with no error to notice.
                //
                // Bounded, not infinite: an article on a disconnected network
                // drive should cost a few seconds and one absent card, not a
                // permanently dead export button.
                await waitForCards(cardsSettledRef)
                // let the preview tab mount and paint before capturing
                await new Promise((r) =>
                  requestAnimationFrame(() => requestAnimationFrame(r)),
                )
                const area = document.querySelector<HTMLElement>('.print-area')
                if (area)
                  await exportPdf(area, `${title.trim() || 'character'}.pdf`)
              } finally {
                setExporting(false)
              }
            }}
          >
            {exporting ? <Loader2 className="animate-spin" /> : <FileDown />}
          </Button>
          <Button size="sm" disabled={!dirty || isPending} onClick={saveNow}>
            <Save />
            {isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={REVEAL_LABEL}
            onClick={() => reveal(`${article.data?.id ?? articleId}.md`)}
          >
            <FolderOpen />
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
      {error && (
        <p className="text-destructive border-b px-4 py-1 text-sm">
          {error.message}
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
        <div className="border-b px-4 py-1.5">
          <TabsList className="h-8">
            <TabsTrigger value="sheet" className="text-xs">
              Sheet
            </TabsTrigger>
            <TabsTrigger value="inventory" className="text-xs">
              Inventory ({character.inventory.length})
            </TabsTrigger>
            <TabsTrigger value="equipment" className="text-xs">
              Equipment
            </TabsTrigger>
            <TabsTrigger value="features" className="text-xs">
              Features (
              {character.features.length +
                character.traits.length +
                character.feats.length}
              )
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-xs">
              Notes ({character.notes.length})
            </TabsTrigger>
            <TabsTrigger value="backstory" className="text-xs">
              Backstory
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs">
              <Eye className="size-3.5" /> Preview
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="sheet" className="min-h-0 flex-1 overflow-y-auto">
          <SheetTab
            character={character}
            onChange={update}
            source={source}
            articles={tree.data?.articles}
            onCreateMissing={setMissingTitle}
          />
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
            onCreateMissing={setMissingTitle}
          />
        </TabsContent>
        <TabsContent
          value="equipment"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <EquipmentTab character={character} onChange={update} />
        </TabsContent>
        <TabsContent
          value="features"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <FeaturesTab
            character={character}
            onChange={update}
            worldId={worldId}
            articles={tree.data?.articles}
            onCreateMissing={setMissingTitle}
          />
        </TabsContent>
        <TabsContent value="notes" className="min-h-0 flex-1 overflow-y-auto">
          <NotesTab
            character={character}
            onChange={update}
            worldId={worldId}
            articles={tree.data?.articles}
            onCreateMissing={setMissingTitle}
          />
        </TabsContent>
        <TabsContent value="backstory" className="flex min-h-0 flex-1 flex-col">
          <MarkdownContextMenu editor={backstoryEditor}>
            <Textarea
              ref={backstoryEditor.ref}
              value={body}
              placeholder="Backstory, bonds, ideals, flaws — markdown with [[wiki links]]."
              className={cn(
                'h-full min-h-0 flex-1 resize-none rounded-none border-none font-mono text-sm shadow-none focus-visible:ring-0',
                // Ctrl held over a [[link]]: show it is clickable.
                backstoryEditor.wikiLinkHovered && 'cursor-pointer',
              )}
              onMouseMove={backstoryEditor.onMouseMove}
              onMouseLeave={backstoryEditor.onMouseLeave}
              onChange={(e) => {
                setBody(e.target.value)
                setDirty(true)
              }}
              onClick={backstoryEditor.onClick}
              onKeyDown={backstoryEditor.onKeyDown}
              onBeforeInput={backstoryEditor.onBeforeInput}
            />
          </MarkdownContextMenu>
        </TabsContent>
        <TabsContent
          value="preview"
          className="min-h-0 flex-1 overflow-y-auto bg-stone-800/90 dark:bg-stone-950"
        >
          {/* .print-area sits outside the zoom wrapper so browser Ctrl+P
              doesn't inherit the scale; exportPdf finds .dnd-page either way. */}
          <div className="print-area">
            <SheetFitPane>
              <SheetPreview
                character={character}
                body={body}
                title={title}
                source={source}
                worldId={worldId}
                articles={tree.data?.articles}
                spellCards={spellCards}
                onSpellCardsSettled={(s) => {
                  cardsSettledRef.current = s
                  setCardsSettled(s)
                }}
              />
            </SheetFitPane>
          </div>
        </TabsContent>
      </Tabs>

      <CreateMissingArticleDialog
        worldId={worldId}
        title={missingTitle}
        onClose={() => setMissingTitle(null)}
      />

      <LevelUpDialog
        worldId={worldId}
        character={character}
        toLevel={levelUpTo}
        onClose={() => setLevelUpTo(null)}
        onApply={update}
      />
    </div>
  )
}
