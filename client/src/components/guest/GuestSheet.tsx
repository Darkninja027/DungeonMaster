import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookText,
  Eye,
  Package,
  RefreshCw,
  ScrollText,
  Shield,
  Sparkles,
  StickyNote,
  UserRound,
  X,
} from 'lucide-react'
import {
  claimCharacter,
  fetchCharacters,
  releaseCharacter,
  reloadSheet,
  sendSheetPatch,
  useGuest,
} from '#/lib/guestStore'
import type { OfferedCharacter } from '#/lib/guestStore'
import { api } from '#/lib/api'
import {
  isCharacterContent,
  noteTitles,
  parseCharacter,
  serializeCharacter,
} from '#/lib/character'
import type { Character } from '#/lib/character'
import { Markdown } from '#/components/Markdown'
import { SheetTab } from '#/components/character/SheetTab'
import { InventoryTab } from '#/components/character/InventoryTab'
import { EquipmentTab } from '#/components/character/EquipmentTab'
import { FeaturesTab } from '#/components/character/FeaturesTab'
import { NotesTab } from '#/components/character/NotesTab'
import { SheetFitPane, SheetPreview } from '#/components/character/SheetPreview'
import { Button } from '#/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'

/**
 * The guest's own character — the same tabbed view the DM gets, not a preview.
 *
 * The tabs are the REAL ones (SheetTab, InventoryTab, …), which is possible
 * because every one of them works off `character` + `onChange` and never
 * touches disk itself. Only where a change goes differs:
 *
 *   an 'own' character — written straight back to this machine's vault file,
 *     the ordinary local save.
 *   a claimed one — HP goes up to the host, which owns the file. Everything
 *     else is edited in memory and lost on reload, because the host's write
 *     allowlist is HP-only (SHEET_PATCH_FIELDS in electron/main/table.ts). The
 *     header says so rather than pretending the change stuck.
 *
 * Rolling is identical either way: the tabs' dice chips call the ordinary
 * logRoll, which guestStore subscribes to, so a click lands in this window's
 * log AND goes up to the host to be stamped with the seat.
 */

type SheetTabId =
  | 'sheet'
  | 'inventory'
  | 'equipment'
  | 'features'
  | 'notes'
  | 'backstory'
  | 'preview'

export function GuestSheet() {
  const guest = useGuest()

  if (!guest.characterId) return <CharacterPicker />
  if (!guest.sheet) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-muted-foreground text-sm">Loading your sheet…</p>
        <Button variant="outline" size="sm" onClick={() => void reloadSheet()}>
          <RefreshCw className="size-3.5" /> Retry
        </Button>
      </div>
    )
  }
  if (!isCharacterContent(guest.sheet.content)) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-muted-foreground text-sm">
          That article is not a character sheet.
        </p>
        <Button variant="outline" size="sm" onClick={releaseCharacter}>
          Pick another
        </Button>
      </div>
    )
  }
  // Keyed by sheet id so switching characters remounts rather than carrying
  // the previous one's draft across.
  return <PlayedSheet key={guest.sheet.id} />
}

function PlayedSheet() {
  const guest = useGuest()
  const sheet = guest.sheet!
  const own = guest.origin === 'own'

  // Local draft so a keystroke never waits on a round trip. guest.sheet.content
  // is what it was last loaded from.
  const initial = useMemo(() => parseCharacter(sheet.content), [sheet.content])
  const [character, setCharacter] = useState<Character>(initial.character)
  const [tab, setTab] = useState<SheetTabId>('sheet')
  const [saveError, setSaveError] = useState<string | null>(null)
  const body = initial.body

  // A reload from the host, or a fresh claim, replaces the draft.
  useEffect(() => setCharacter(initial.character), [initial])

  // A vault character's own world, for image resolution and wiki links. A
  // claimed one has no local world, so this stays disabled.
  const tree = useQuery({
    queryKey: ['worlds', guest.ownWorldId, 'tree'],
    queryFn: () => api.worlds.tree(guest.ownWorldId!),
    enabled: Boolean(guest.ownWorldId),
  })

  const source = {
    worldId: guest.ownWorldId ?? guest.session?.tableId ?? 'table',
    articleId: sheet.id,
    title: sheet.title,
  }

  const update = (next: Character) => {
    const prev = character
    setCharacter(next)
    setSaveError(null)

    if (own && guest.ownWorldId) {
      void api.articles
        .update(guest.ownWorldId, sheet.id, {
          title: sheet.title,
          content: serializeCharacter(next, body),
        })
        .catch(() => setSaveError('Could not save to your vault.'))
      return
    }

    // The DM's file. Only HP is writable, so only an HP change is sent —
    // pushing the rest would be a silent no-op dressed up as a save.
    if (next.hp.current !== prev.hp.current || next.hp.temp !== prev.hp.temp) {
      void sendSheetPatch({
        hpCurrent: next.hp.current,
        hpTemp: next.hp.temp,
      }).catch(() => setSaveError('The DM did not accept that change.'))
    }
  }

  const titles = noteTitles(character.notes)
  const articles = tree.data?.articles

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as SheetTabId)}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <span className="min-w-0 truncate text-sm font-medium">
          {sheet.title}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {own ? 'yours' : "the DM's — only HP saves"}
        </span>
        {!own && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            title="Reload from the DM"
            onClick={() => void reloadSheet()}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7 shrink-0"
          title="Put this character down"
          onClick={releaseCharacter}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <TabsList variant="line" className="h-8 shrink-0 gap-0 px-2">
        <TabsTrigger value="sheet" className="shrink-0 px-1.5 text-xs">
          <ScrollText className="size-3.5" /> Sheet
        </TabsTrigger>
        <TabsTrigger value="inventory" className="shrink-0 px-1.5 text-xs">
          <Package className="size-3.5" /> Inv
          <span className="tabular-nums opacity-70">
            {character.inventory.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="equipment" className="shrink-0 px-1.5 text-xs">
          <Shield className="size-3.5" /> Equip
        </TabsTrigger>
        <TabsTrigger value="features" className="shrink-0 px-1.5 text-xs">
          <Sparkles className="size-3.5" /> Feats
          <span className="tabular-nums opacity-70">
            {character.features.length +
              character.traits.length +
              character.feats.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="notes" className="shrink-0 px-1.5 text-xs">
          <StickyNote className="size-3.5" /> Notes
          <span className="tabular-nums opacity-70">
            {character.notes.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="backstory" className="shrink-0 px-1.5 text-xs">
          <BookText className="size-3.5" /> Story
        </TabsTrigger>
        <TabsTrigger value="preview" className="shrink-0 px-1.5 text-xs">
          <Eye className="size-3.5" /> Preview
        </TabsTrigger>
      </TabsList>

      {saveError && (
        <p className="text-destructive shrink-0 border-b px-3 py-1 text-xs">
          {saveError}
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
          articles={articles}
          noteTitles={titles}
        />
      </TabsContent>
      <TabsContent value="inventory" className="min-h-0 flex-1 overflow-y-auto">
        <InventoryTab
          character={character}
          onChange={update}
          worldId={source.worldId}
          articles={articles}
          noteTitles={titles}
        />
      </TabsContent>
      <TabsContent value="equipment" className="min-h-0 flex-1 overflow-y-auto">
        <EquipmentTab character={character} onChange={update} />
      </TabsContent>
      <TabsContent value="features" className="min-h-0 flex-1 overflow-y-auto">
        <FeaturesTab
          character={character}
          onChange={update}
          worldId={source.worldId}
          articles={articles}
          noteTitles={titles}
        />
      </TabsContent>
      {/* No overflow-y: Notes is a multi-pane workspace that scrolls its own
          list and preview — the same reason the DM's route omits it there. */}
      <TabsContent value="notes" className="flex min-h-0 flex-1 flex-col">
        <NotesTab
          character={character}
          onChange={update}
          worldId={source.worldId}
          articles={articles}
          noteTitles={titles}
        />
      </TabsContent>
      <TabsContent
        value="backstory"
        className="min-h-0 flex-1 overflow-y-auto p-4"
      >
        {body.trim() ? (
          <Markdown worldId={guest.ownWorldId ?? undefined} articles={articles}>
            {body}
          </Markdown>
        ) : (
          <p className="text-muted-foreground text-sm">No backstory written.</p>
        )}
      </TabsContent>
      <TabsContent value="preview" className="min-h-0 flex-1 overflow-y-auto">
        <SheetFitPane max={1}>
          <SheetPreview
            character={character}
            body={body}
            title={sheet.title}
            source={source}
            worldId={source.worldId}
            articles={articles}
            spellCards={false}
          />
        </SheetFitPane>
      </TabsContent>
    </Tabs>
  )
}

/** Claim one of the DM's characters. */
function CharacterPicker() {
  const guest = useGuest()
  const [offered, setOffered] = useState<Array<OfferedCharacter>>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    void fetchCharacters().then(setOffered)
  }
  useEffect(load, [guest.seats])

  const claim = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      await claimCharacter(id)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not claim that one',
      )
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-3 p-6">
      <div>
        <h2 className="text-sm font-semibold">Your character</h2>
        <p className="text-muted-foreground text-xs">
          Claim one of the DM&apos;s to play it.
        </p>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {offered.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          The DM&apos;s world has no character sheets in it.
        </p>
      ) : (
        <ul className="space-y-1">
          {offered.map((character) => {
            const taken = character.claimedBy !== null
            return (
              <li key={character.id}>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  disabled={busy || taken}
                  onClick={() => void claim(character.id)}
                >
                  <UserRound className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">{character.title}</span>
                  {taken && (
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                      {character.claimedBy}
                    </span>
                  )}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
