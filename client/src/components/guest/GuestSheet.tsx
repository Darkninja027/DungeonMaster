import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, UserRound, X } from 'lucide-react'
import {
  claimCharacter,
  fetchCharacters,
  releaseCharacter,
  reloadSheet,
  useGuest,
  bringOwnCharacter,
} from '#/lib/guestStore'
import type { OfferedCharacter } from '#/lib/guestStore'
import { api } from '#/lib/api'
import { isCharacterContent, parseCharacter } from '#/lib/character'
import { SheetPreview } from '#/components/character/SheetPreview'
import { Button } from '#/components/ui/button'

/**
 * The guest's own character: pick one, then roll it.
 *
 * A character can come from either side, and the two behave differently on
 * purpose:
 *
 *   the DM's world — claimed from the offered list. The DM holds the file, so
 *     HP changes write back to their disk and they can fix or level the sheet.
 *   this machine's vault — brought to the table. The sheet never leaves this
 *     machine; only the rolls are shared, and there is nothing to write back
 *     because the file is already local.
 *
 * Rolling works the same either way, and no roll code is duplicated for
 * guests: SheetPreview's dice chips call the ordinary logRoll, which
 * guestStore has subscribed to, so a click lands in this window's log AND goes
 * up to the host to be stamped with the seat and fanned out.
 */
export function GuestSheet() {
  const guest = useGuest()
  const [offered, setOffered] = useState<Array<OfferedCharacter>>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    void fetchCharacters().then(setOffered)
  }

  // The list changes as other people claim, so refresh when the seat list does
  // rather than only on mount.
  useEffect(load, [guest.seats])

  // This machine's own vault, if it has one. A guest may have no vault at all,
  // which is the ordinary case for someone who only ever joins games.
  const vault = useQuery({
    queryKey: ['vault'],
    queryFn: () => api.vault.get(),
  })
  const mine = useQuery({
    queryKey: ['vault', vault.data?.worldId, 'characters'],
    queryFn: () => api.characters.list(vault.data!.worldId),
    enabled: Boolean(vault.data?.worldId) && vault.data?.available === true,
  })

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

  const bringOwn = async (articleId: string, title: string) => {
    const worldId = vault.data?.worldId
    if (!worldId) return
    setBusy(true)
    setError(null)
    try {
      const article = await api.articles.get(worldId, articleId)
      bringOwnCharacter(
        worldId,
        articleId,
        article.title || title,
        article.content,
      )
    } catch {
      setError('Could not open that character.')
    } finally {
      setBusy(false)
    }
  }

  if (!guest.characterId) {
    return (
      <div className="space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">Your character</h2>
          <p className="text-muted-foreground text-xs">
            Claim one of the DM&apos;s, or bring your own.
          </p>
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}

        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium">
            At this table
          </p>
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
                      <span className="min-w-0 truncate">
                        {character.title}
                      </span>
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

        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium">
            From your characters
          </p>
          {!vault.data?.available || (mine.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Nothing in your vault yet. Characters you make on the home screen
              show up here.
            </p>
          ) : (
            <ul className="space-y-1">
              {(mine.data ?? []).map((character) => (
                <li key={character.id}>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={busy}
                    onClick={() => void bringOwn(character.id, character.title)}
                  >
                    <UserRound className="size-4 shrink-0" />
                    <span className="min-w-0 truncate">{character.title}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-xs">
            Yours stays on this machine — the DM sees your rolls, not your
            sheet.
          </p>
        </div>
      </div>
    )
  }

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

  const { character, body } = parseCharacter(guest.sheet.content)
  const own = guest.origin === 'own'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {guest.sheet.title}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {own ? 'yours' : "DM's"}
        </span>
        {!own && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="Reload from the DM"
            onClick={() => void reloadSheet()}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          title="Put this character down"
          onClick={releaseCharacter}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/*
          `source` labels the roll in the shared history. For an 'own'
          character the worldId is this machine's vault, so the link resolves;
          for a claimed one it is the table handle, which does not resolve here
          and is deliberate — the alternative is sending the DM's world id over
          the wire, and that is hex of their absolute path.
        */}
        <SheetPreview
          character={character}
          body={body}
          title={guest.sheet.title}
          /*
            For an 'own' character this is a real local world, so its portrait
            resolves through world://. For a claimed one there is no local
            world and images on the sheet will not render — the host serves
            them over /img/ and wiring that up is still outstanding.
          */
          worldId={guest.ownWorldId ?? guest.session?.tableId ?? 'table'}
          source={{
            worldId: guest.ownWorldId ?? guest.session?.tableId ?? 'table',
            articleId: guest.sheet.id,
            title: guest.sheet.title,
          }}
          spellCards={false}
        />
      </div>
    </div>
  )
}
