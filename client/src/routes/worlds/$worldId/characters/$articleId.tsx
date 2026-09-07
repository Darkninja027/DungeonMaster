import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookText,
  Columns2,
  Eye,
  ImagePlus,
  List,
  Package,
  ScrollText,
  Shield,
  Sparkles,
  StickyNote,
  WandSparkles,
} from 'lucide-react'
import { api } from '#/lib/api'
import { revealer } from '#/lib/reveal'
import { usePublishCharacterRuleset } from '#/lib/openCharacterRuleset'
import {
  findNoteByTitle,
  noteFromWikiLink,
  noteTitles,
  parseCharacter,
  serializeCharacter,
} from '#/lib/character'
import type { Character } from '#/lib/character'
import { classesFrom } from '#/lib/tables'
import { useTables } from '#/lib/useHomebrew'
import { exportPdf } from '#/lib/exportPdf'
import { useShortcut } from '#/lib/useShortcut'
import { useArticleEditorSave } from '#/lib/useArticleEditorSave'
import { useMarkdownEditor } from '#/lib/useMarkdownEditor'
import { useWikiLinkOpener } from '#/lib/useWikiLinkOpener'
import { MarkdownContextMenu } from '#/components/MarkdownContextMenu'
import type { ContextMenuEditor } from '#/components/MarkdownContextMenu'
import { LiveMarkdownEditor } from '#/components/LiveMarkdownEditor'
import type { LiveEditorHandle } from '#/components/LiveMarkdownEditor'
import { LivePreviewPane } from '#/components/LivePreviewPane'
import { TableOfContents } from '#/components/TableOfContents'
import { activeHeadingAt, editorScrollTopFor, parseHeadings } from '#/lib/toc'
import type { TocHeading } from '#/lib/toc'
import { padBlock } from '#/lib/markdownEditing'
import { snippets } from '#/lib/formatMarkdown'
import { ImagePickerDialog } from '#/components/ImagePickerDialog'
import { useIsVault, useWorldSettings } from '#/lib/useWorldSettings'
import { Button } from '#/components/ui/button'
import type { RollSource } from '#/lib/rollLog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { cn } from '#/lib/utils'
import { CharacterHeader } from '#/components/character/CharacterHeader'
import { LevelUpDialog } from '#/components/character/levelup/LevelUpDialog'
import { SheetTab } from '#/components/character/SheetTab'
import { InventoryTab } from '#/components/character/InventoryTab'
import { EquipmentTab } from '#/components/character/EquipmentTab'
import { FeaturesTab } from '#/components/character/FeaturesTab'
import { NotesTab } from '#/components/character/NotesTab'
import {
  SheetFitPane,
  SheetPreview,
  backstoryDoc,
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

/**
 * The Story tab's outline visibility. Its own key rather than the article
 * route's `dm.articleToc`: the two surfaces are opened for different reasons and
 * wanting the outline on one says nothing about wanting it on the other.
 */
const STORY_TOC_KEY = 'dm.characterStoryToc'
/**
 * Live edit is the SAME key the article route uses. It is a preference about the
 * editing surface itself, not about one tab, and a character's backstory is the
 * very same markdown body the article editor edits — so flipping it in one place
 * and finding it off in the other would be the surprise.
 */
const LIVE_EDIT_KEY = 'dm.articleLiveEdit'

function loadFlag(key: string, field: 'open' | 'on'): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '') as Record<
      string,
      unknown
    >
    return raw[field] === true
  } catch {
    return false
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
  // Controlled so Export PDF can switch to the preview before capturing it,
  // and so a [[link]] resolving to a note can open the Notes tab.
  const [tab, setTab] = useState('sheet')
  // Broken [[link]] clicked in inventory/notes -> offer to create the article,
  // or, in the vault, a note on this character (see CreateMissingArticleDialog).
  const [missingTitle, setMissingTitle] = useState<string | null>(null)
  // A note to select once the Notes tab is open. A note created from a link is
  // always prepended, so that request is always index 0.
  const [selectNote, setSelectNote] = useState<number | null>(null)
  // Referentially stable, or every memo downstream that takes it defeats itself.
  const characterNoteTitles = useMemo(
    () => noteTitles(character?.notes ?? []),
    [character?.notes],
  )
  // The vault has no `ruleset` of its own — it holds characters from several
  // different games — so a character there states its own edition and the sheet
  // offers the control. A campaign world answers for every character in it.
  const isVault = useIsVault(worldId)
  // The Spells and Monsters panels are world-scoped, and the vault's world has
  // no edition to give them. Publish this sheet's own so they follow it.
  usePublishCharacterRuleset(character?.ruleset ?? null)
  const clearSelectNote = useCallback(() => setSelectNote(null), [])
  const goToNote = useCallback((index: number) => {
    setTab('notes')
    setSelectNote(index)
  }, [])
  const openNoteByTitle = useCallback(
    (t: string) => {
      const hit = findNoteByTitle(character?.notes ?? [], t)
      if (hit) goToNote(hit.index)
    },
    [character?.notes, goToNote],
  )
  // Ctrl+Click / Ctrl+Enter on a [[link]] in the raw backstory text.
  const openWikiLink = useWikiLinkOpener({
    worldId,
    articles: tree.data?.articles,
    noteTitles: characterNoteTitles,
    onNote: openNoteByTitle,
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
  const [exporting, setExporting] = useState(false)

  // --- Story tab: the same three affordances the article editor has ------
  const liveEditorRef = useRef<LiveEditorHandle>(null)
  const [storyTocOpen, setStoryTocOpen] = useState(() =>
    loadFlag(STORY_TOC_KEY, 'open'),
  )
  const [storyLivePreview, setStoryLivePreview] = useState(false)
  const [rememberedLiveEdit, setRememberedLiveEdit] = useState(() =>
    loadFlag(LIVE_EDIT_KEY, 'on'),
  )
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  /**
   * Sampled as the context menu opens, never read during render: opening the
   * Radix menu moves focus off the editor, so a live read reports "no selection"
   * by the time Cut and Copy render. Same reasoning as the article route.
   */
  const [liveHasSelection, setLiveHasSelection] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORY_TOC_KEY, JSON.stringify({ open: storyTocOpen }))
  }, [storyTocOpen])
  useEffect(() => {
    localStorage.setItem(
      LIVE_EDIT_KEY,
      JSON.stringify({ on: rememberedLiveEdit }),
    )
  }, [rememberedLiveEdit])

  /**
   * The world's setting decides the editing surface; `remember` hands the
   * decision back to the toggle and the localStorage memory. `worldLiveEdit`
   * therefore doubles as "is the toggle shown".
   */
  const worldLiveEdit = useWorldSettings(worldId).data?.liveEdit ?? 'remember'
  const liveEdit =
    worldLiveEdit === 'remember'
      ? rememberedLiveEdit
      : worldLiveEdit === 'always'

  // The backstory IS the markdown body, so the outline parses it directly.
  const headings = useMemo(() => parseHeadings(body), [body])

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

  /**
   * Insert routing. In live-edit mode the textarea is not mounted, so
   * `useMarkdownEditor` would silently no-op — every insert affordance has to
   * ask CodeMirror instead. Mirrors the article route's two shims.
   */
  const insertAtCursor = useCallback(
    (text: string) => {
      if (liveEditorRef.current) liveEditorRef.current.insert(text)
      else backstoryEditor.insertText(text)
    },
    [backstoryEditor],
  )
  const insertBlock = useCallback(
    (snippet: string) => {
      if (liveEditorRef.current)
        liveEditorRef.current.transform((text, start, end) =>
          padBlock(text, { start, end }, snippet),
        )
      else backstoryEditor.insertBlock(snippet)
    },
    [backstoryEditor],
  )

  /** The same right-click menu over CodeMirror, via the structural interface. */
  const liveMenuEditor = useMemo<ContextMenuEditor>(
    () => ({
      onContextMenu: () =>
        setLiveHasSelection(liveEditorRef.current?.hasSelection() ?? false),
      hasSelection: liveHasSelection,
      execEditorCommand: (command) =>
        liveEditorRef.current?.execCommand(command),
      wrap: (wrapper) => liveEditorRef.current?.wrap(wrapper),
      transform: (fn) => liveEditorRef.current?.transform(fn),
      insertBlock,
      insertText: insertAtCursor,
    }),
    [liveHasSelection, insertBlock, insertAtCursor],
  )

  /**
   * Jump to a heading. Which surface is mounted decides how: CodeMirror knows
   * its own geometry, while the textarea needs `editorScrollTopFor` to measure
   * where a soft-wrapped line actually sits.
   */
  const goToHeading = useCallback(
    (heading: TocHeading) => {
      setActiveHeadingId(heading.id)
      // setTimeout(0): the editor may not be focusable until React has committed.
      setTimeout(() => {
        if (liveEditorRef.current) {
          liveEditorRef.current.goTo(heading.offset)
          return
        }
        const textarea = backstoryEditor.ref.current
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(heading.offset, heading.offset)
        textarea.scrollTop = editorScrollTopFor(textarea, heading.offset)
      }, 0)
    },
    [backstoryEditor],
  )

  /**
   * Upload dropped/pasted image files into the world and insert them at the
   * cursor — the character portrait's shortest path. Clipboard screenshots all
   * arrive named "image.png", which the upload dedupe turns into
   * "image (2).png" and so on.
   */
  const uploadAndInsert = async (files: Array<File>) => {
    const pictures = files.filter((f) => f.type.startsWith('image/'))
    if (pictures.length === 0) return
    try {
      for (const file of pictures) {
        const image = await api.images.upload(worldId, file)
        const alt = image.fileName.replace(/\.[^.]+$/, '')
        insertAtCursor(`![${alt}](${image.encodedRelPath})`)
      }
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId, 'images'] })
    } catch (error) {
      alert((error as Error).message)
    }
  }

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

  /*
    Kept in the route rather than the header: it closes over the tab state, the
    settled ref and the title, and the header has no business knowing that
    exporting means "switch tabs, wait, then screenshot the DOM".
  */
  const handleExport = async () => {
    setTab('preview')
    setExporting(true)
    try {
      // The spell cards read one article each, so the sheet is not whole for a
      // moment after the tab mounts — and exportPdf captures whatever .dnd-page
      // elements it finds, silently skipping any that measure zero. Without this
      // wait a PDF taken too early is simply missing pages, with no error to
      // notice.
      //
      // Bounded, not infinite: an article on a disconnected network drive should
      // cost a few seconds and one absent card, not a permanently dead export
      // button.
      await waitForCards(cardsSettledRef)
      // let the preview tab mount and paint before capturing
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      )
      const area = document.querySelector<HTMLElement>('.print-area')
      if (area) await exportPdf(area, `${title.trim() || 'character'}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  return (
    /*
      Tabs is the outermost element so the tab strip can live inside the header
      row: TabsList reads Tabs' context through the React tree, not the DOM, but
      it still has to be a descendant of the root. Tabs already renders
      `flex data-[orientation=horizontal]:flex-col`, so this reproduces the
      wrapper div it replaced.
    */
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <CharacterHeader
        title={title}
        onTitleChange={(v) => {
          setTitle(v)
          titleDirtyRef.current = true
        }}
        onTitleCommit={() => {
          titleDirtyRef.current = false
          commitTitle()
        }}
        onTitleRevert={() => {
          setTitle(article.data?.title ?? title)
          titleDirtyRef.current = false
        }}
        character={character}
        onChange={update}
        classes={classes}
        onLevelUp={setLevelUpTo}
        showRuleset={isVault}
        worldId={worldId}
        articleId={article.data?.id ?? articleId}
        dirty={dirty}
        isPending={isPending}
        onSave={saveNow}
        onReveal={() => reveal(`${article.data?.id ?? articleId}.md`)}
        onDelete={() => {
          if (confirm(`Delete "${title}"? It goes to the Recycle Bin.`)) {
            remove.mutate()
          }
        }}
        spellCards={spellCards}
        onToggleSpellCards={() => setSpellCards((on) => !on)}
        showSpellCards={hasSpellcasting(character)}
        exporting={exporting}
        cardsSettled={cardsSettled}
        onExport={handleExport}
      >
        {/* Inside <Tabs>, so it reads Tabs' context through the React tree; the
            header only decides where in the row it sits. Labels are shortened
            because the strip now shares a row with everything else. */}
        <TabsList variant="line" className="h-8 shrink-0 gap-0">
          <TabsTrigger
            value="sheet"
            aria-label="Sheet"
            className="shrink-0 px-1.5 text-xs"
          >
            <ScrollText className="size-3.5" />
            <span className="hidden @[53rem]/hdr:inline">Sheet</span>
          </TabsTrigger>
          <TabsTrigger
            value="inventory"
            aria-label="Inventory"
            className="shrink-0 px-1.5 text-xs"
          >
            <Package className="size-3.5" />
            <span className="hidden @[53rem]/hdr:inline">Inv</span>
            <span className="tabular-nums opacity-70">
              {character.inventory.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="equipment"
            aria-label="Equipment"
            className="shrink-0 px-1.5 text-xs"
          >
            <Shield className="size-3.5" />
            <span className="hidden @[53rem]/hdr:inline">Equip</span>
          </TabsTrigger>
          <TabsTrigger
            value="features"
            aria-label="Features"
            className="shrink-0 px-1.5 text-xs"
          >
            <Sparkles className="size-3.5" />
            <span className="hidden @[53rem]/hdr:inline">Feats</span>
            <span className="tabular-nums opacity-70">
              {character.features.length +
                character.traits.length +
                character.feats.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            aria-label="Notes"
            className="shrink-0 px-1.5 text-xs"
          >
            <StickyNote className="size-3.5" />
            <span className="hidden @[53rem]/hdr:inline">Notes</span>
            <span className="tabular-nums opacity-70">
              {character.notes.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="backstory"
            aria-label="Backstory"
            className="shrink-0 px-1.5 text-xs"
          >
            <BookText className="size-3.5" />
            <span className="hidden @[53rem]/hdr:inline">Story</span>
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            aria-label="Preview"
            className="shrink-0 px-1.5 text-xs"
          >
            <Eye className="size-3.5" />
            <span className="hidden @[53rem]/hdr:inline">Preview</span>
          </TabsTrigger>
        </TabsList>
      </CharacterHeader>
      {error && (
        <p className="text-destructive shrink-0 border-b px-4 py-1 text-sm">
          {error.message}
        </p>
      )}

      <TabsContent
        value="sheet"
        className="@container/sheet min-h-0 flex-1 overflow-y-auto"
      >
        <SheetTab
          character={character}
          onChange={update}
          source={source}
          articles={tree.data?.articles}
          noteTitles={characterNoteTitles}
          onOpenNote={openNoteByTitle}
          onCreateMissing={setMissingTitle}
        />
      </TabsContent>
      <TabsContent value="inventory" className="min-h-0 flex-1 overflow-y-auto">
        <InventoryTab
          character={character}
          onChange={update}
          worldId={worldId}
          articles={tree.data?.articles}
          noteTitles={characterNoteTitles}
          onOpenNote={openNoteByTitle}
          onCreateMissing={setMissingTitle}
        />
      </TabsContent>
      <TabsContent value="equipment" className="min-h-0 flex-1 overflow-y-auto">
        <EquipmentTab character={character} onChange={update} />
      </TabsContent>
      <TabsContent value="features" className="min-h-0 flex-1 overflow-y-auto">
        <FeaturesTab
          character={character}
          onChange={update}
          worldId={worldId}
          articles={tree.data?.articles}
          noteTitles={characterNoteTitles}
          onOpenNote={openNoteByTitle}
          onCreateMissing={setMissingTitle}
        />
      </TabsContent>
      {/* No overflow-y here: the Notes tab is a three-pane workspace that
          scrolls its own list and preview independently, the way the Story tab
          does. Letting the container scroll instead would grow the panes past
          the viewport and put the editor out of reach. */}
      <TabsContent value="notes" className="flex min-h-0 flex-1 flex-col">
        <NotesTab
          character={character}
          onChange={update}
          worldId={worldId}
          articles={tree.data?.articles}
          noteTitles={characterNoteTitles}
          onOpenNote={openNoteByTitle}
          onCreateMissing={setMissingTitle}
          selectIndex={selectNote}
          onSelectIndexHandled={clearSelectNote}
        />
      </TabsContent>
      <TabsContent value="backstory" className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1">
          <span className="text-muted-foreground text-xs">
            The character's prose — this is the markdown body of the file.
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              title="Insert a portrait that the story text wraps around"
              onClick={() => insertBlock(snippets.portraitImage)}
            >
              <ImagePlus className="size-3.5" /> Portrait
            </Button>
            <ImagePickerDialog worldId={worldId} onInsert={insertAtCursor} />
            {worldLiveEdit === 'remember' && (
              <Button
                variant={liveEdit ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                title="Experimental: hide markdown syntax while editing. Set a default for the whole world in Settings."
                onClick={() => setRememberedLiveEdit((v) => !v)}
              >
                <WandSparkles className="size-3.5" /> Live edit
              </Button>
            )}
            <Button
              variant={storyLivePreview ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              title="Show a live preview beside the editor"
              onClick={() => setStoryLivePreview((v) => !v)}
            >
              <Columns2 className="size-3.5" /> Live preview
            </Button>
            <Button
              variant={storyTocOpen ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              title="Show the backstory outline"
              onClick={() => setStoryTocOpen((v) => !v)}
            >
              <List className="size-3.5" /> Outline
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          {liveEdit ? (
            <MarkdownContextMenu editor={liveMenuEditor}>
              <LiveMarkdownEditor
                ref={liveEditorRef}
                value={body}
                className="min-h-0 min-w-0 flex-1 overflow-hidden"
                source={source}
                onWikiLinkOpen={openWikiLink}
                onFiles={uploadAndInsert}
                articles={tree.data?.articles}
                currentArticleId={article.data?.id ?? articleId}
                onChange={(next) => {
                  setBody(next)
                  // Load-bearing: useArticleEditorSave's debounce keys on
                  // editSeq, which only advances through setDirty. Without this,
                  // edits are typed, shown, and never written to disk while the
                  // button still reads "Saved".
                  setDirty(true)
                }}
                onSelectionChange={(offset) => {
                  const line = body.slice(0, offset).split('\n').length - 1
                  setActiveHeadingId(
                    activeHeadingAt(headings, line)?.id ?? null,
                  )
                }}
              />
            </MarkdownContextMenu>
          ) : (
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
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.files)
                  if (files.some((f) => f.type.startsWith('image/'))) {
                    e.preventDefault()
                    uploadAndInsert(files)
                  }
                }}
                onDragOver={(e) => {
                  // Only claim the drop for files — the textarea's own
                  // text-drag behaviour must keep working.
                  if (e.dataTransfer.types.indexOf('Files') >= 0)
                    e.preventDefault()
                }}
                onDrop={(e) => {
                  const files = Array.from(e.dataTransfer.files)
                  if (files.some((f) => f.type.startsWith('image/'))) {
                    e.preventDefault()
                    uploadAndInsert(files)
                  }
                }}
                onKeyUp={() => {
                  // The outline follows the caret: count the newlines behind it
                  // to get the line, then take the last heading at or above it.
                  const textarea = backstoryEditor.ref.current
                  if (!textarea) return
                  const line =
                    textarea.value.slice(0, textarea.selectionStart).split('\n')
                      .length - 1
                  setActiveHeadingId(
                    activeHeadingAt(headings, line)?.id ?? null,
                  )
                }}
              />
            </MarkdownContextMenu>
          )}
          {storyLivePreview && (
            <LivePreviewPane
              // The printed doc, not the raw body: the sheet prepends a title
              // heading when the prose lacks one, and a preview that disagreed
              // about that is the mismatch backstoryDoc exists to prevent.
              content={backstoryDoc(body, title)}
              articles={tree.data?.articles}
              worldId={worldId}
              source={source}
              noteTitles={characterNoteTitles}
              onOpenNote={openNoteByTitle}
              onCreateMissing={setMissingTitle}
            />
          )}
          {storyTocOpen && (
            <TableOfContents
              headings={headings}
              activeId={activeHeadingId}
              onSelect={goToHeading}
              onClose={() => setStoryTocOpen(false)}
            />
          )}
        </div>
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

      {/* Both portal to document.body; they sit here only to be in scope. */}
      <CreateMissingArticleDialog
        worldId={worldId}
        title={missingTitle}
        onClose={() => setMissingTitle(null)}
        existingNoteTitles={characterNoteTitles}
        onOpenNote={openNoteByTitle}
        onCreateNote={(draft) => {
          // Prepended, matching NotesTab's own addNote: a note is addressed by
          // its index, and two insertion points would be two rules. The write
          // rides update() + the existing debounced autosave — no second path
          // to the same file.
          update({
            ...character,
            notes: [
              noteFromWikiLink(draft.title, draft.text),
              ...character.notes,
            ],
          })
          goToNote(0)
        }}
      />

      <LevelUpDialog
        worldId={worldId}
        character={character}
        toLevel={levelUpTo}
        onClose={() => setLevelUpTo(null)}
        onApply={update}
      />
    </Tabs>
  )
}
