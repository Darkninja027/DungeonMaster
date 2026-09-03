import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '#/lib/api'
import { articleTemplates, newArticleContent } from '#/lib/templates'
import { useVaultCheck } from '#/lib/useWorldSettings'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

/**
 * "Create the article this [[broken link]] points at" — template picker +
 * create + navigate. Shared by the editor preview and the character tabs.
 * Open while `title` is non-null.
 *
 * In the **vault** — the world holding characters that belong to no campaign —
 * it writes a note on the character instead. An article there would land at the
 * world root, which Player mode's sidebar never renders (worldMode.ts), so it
 * would be created and then be invisible. The branch keys on `onCreateNote`
 * rather than on the vault alone: the generic article route is reachable in the
 * vault too, and there is no character in scope there to attach a note to.
 */
export function CreateMissingArticleDialog({
  worldId,
  title,
  onClose,
  onCreateNote,
  onOpenNote,
  existingNoteTitles,
}: {
  worldId: string
  title: string | null
  onClose: () => void
  /** Vault only, and only where a character is in scope. */
  onCreateNote?: (draft: { title: string; text: string }) => void
  onOpenNote?: (title: string) => void
  existingNoteTitles?: Array<string>
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [templateId, setTemplateId] = useState('blank')
  const [text, setText] = useState('')
  const { isVault, isLoading } = useVaultCheck(worldId)

  // Fresh template choice and body each time the dialog opens for a new title.
  useEffect(() => {
    if (title !== null) {
      setTemplateId('blank')
      setText('')
    }
  }, [title])

  const create = useMutation({
    mutationFn: () => {
      const template = articleTemplates.find((t) => t.id === templateId)
      return api.articles.create({
        worldId,
        title: title ?? '',
        content: template ? newArticleContent(template) : '',
      })
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['worlds', worldId] })
      onClose()
      navigate({
        to: '/worlds/$worldId/articles/$articleId',
        params: { worldId, articleId: created.id },
      })
    },
  })

  const noteMode = isVault && onCreateNote != null
  const existing =
    title !== null &&
    (existingNoteTitles ?? []).some(
      (t) => t.trim().toLowerCase() === title.trim().toLowerCase(),
    )

  return (
    <Dialog open={title !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {noteMode ? `Add a note about "${title}"` : `Create "${title}"`}
          </DialogTitle>
        </DialogHeader>

        {noteMode ? (
          existing ? (
            <p className="text-muted-foreground text-sm">
              You already have a note called "{title}".
            </p>
          ) : (
            <>
              <Textarea
                autoFocus
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`What do you know about ${title}? Markdown works — leave blank to fill in later.`}
              />
              <p className="text-muted-foreground text-xs">
                Saved to this character's notes, not as a world article — the
                vault holds characters, not a campaign.
              </p>
            </>
          )
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {articleTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={cn(
                    'rounded-md border p-2 text-left transition-colors',
                    templateId === template.id
                      ? 'border-primary bg-accent'
                      : 'hover:bg-accent/50',
                  )}
                  onClick={() => setTemplateId(template.id)}
                >
                  <span className="block text-sm font-medium">
                    {template.name}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {template.description}
                  </span>
                </button>
              ))}
            </div>
            {isVault && (
              <p className="text-muted-foreground text-xs">
                This will be a world article, not a character note.
              </p>
            )}
          </>
        )}

        {create.isError && (
          <p className="text-destructive text-sm">{create.error.message}</p>
        )}

        <DialogFooter>
          {noteMode ? (
            existing ? (
              <Button
                disabled={isLoading}
                onClick={() => {
                  onOpenNote?.(title.trim())
                  onClose()
                }}
              >
                Open the note
              </Button>
            ) : (
              // No useMutation: the write rides the character route's own
              // update() + debounced autosave, so there is never a second write
              // path to the same file.
              <Button
                disabled={isLoading}
                onClick={() => {
                  onCreateNote({ title: (title ?? '').trim(), text })
                  onClose()
                }}
              >
                Add note
              </Button>
            )
          ) : (
            <Button
              disabled={create.isPending || isLoading}
              onClick={() => create.mutate()}
            >
              Create article
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
