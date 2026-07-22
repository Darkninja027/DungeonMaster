import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '#/lib/api'
import { articleTemplates, newArticleContent } from '#/lib/templates'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
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
 */
export function CreateMissingArticleDialog({
  worldId,
  title,
  onClose,
}: {
  worldId: string
  title: string | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [templateId, setTemplateId] = useState('blank')

  // Fresh template choice each time the dialog opens for a new title.
  useEffect(() => {
    if (title !== null) setTemplateId('blank')
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

  return (
    <Dialog open={title !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create "{title}"</DialogTitle>
        </DialogHeader>
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
              <span className="block text-sm font-medium">{template.name}</span>
              <span className="text-muted-foreground block text-xs">
                {template.description}
              </span>
            </button>
          ))}
        </div>
        {create.isError && (
          <p className="text-destructive text-sm">{create.error.message}</p>
        )}
        <DialogFooter>
          <Button disabled={create.isPending} onClick={() => create.mutate()}>
            Create article
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
