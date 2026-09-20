import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parse as parseYaml } from 'yaml'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { api } from '#/lib/api'
import { splitFrontmatter } from '#/lib/formatMarkdown'
import { takenIds, templateId, upsertTemplate } from '#/lib/templateStore'
import { useSaveTemplates, useTemplateStore } from '#/lib/useTemplates'

/** The article being promoted, or null when the dialog is closed. */
export interface PromoteSource {
  worldId: string
  articleId: string
  title: string
  /**
   * The editor's live content, when promoting from an article that is open.
   * Without it the article's *saved* content is fetched — which is what the
   * sidebar has to promote, since it holds the tree and not the text.
   */
  content?: string
}

/**
 * Turn an article you have already written into a template.
 *
 * This authors something *new*; overriding a built-in is the settings section's
 * job. So there is no "replace the Location template" option here, and a name
 * that slugs into a taken id is suffixed rather than allowed to collide.
 */
export function PromoteToTemplateDialog({
  source,
  onClose,
}: {
  source: PromoteSource | null
  onClose: () => void
}) {
  const { data: stored } = useTemplateStore()
  const save = useSaveTemplates()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // The editor has this cached already, so promoting from an open article costs
  // nothing; from the sidebar it is one cheap read.
  const article = useQuery({
    queryKey: ['articles', source?.articleId],
    queryFn: () => api.articles.get(source!.worldId, source!.articleId),
    enabled: source != null && source.content == null,
  })

  useEffect(() => {
    if (!source) return
    setName(source.title)
    setDescription('')
  }, [source])

  if (!source || !stored) return null

  const body = source.content ?? article.data?.content ?? ''
  const { frontmatter } = splitFrontmatter(body)
  const hasFrontmatter = frontmatter !== null
  const id = templateId(name, takenIds(stored))
  const slugged = id !== name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const loading = source.content == null && article.isLoading

  /**
   * The article's own `type`, when it has one. Only used for an article with no
   * frontmatter — one that has its own carries the type in the body, and
   * `newArticleContent` will not add a second header.
   */
  const inheritedType = (() => {
    if (!hasFrontmatter) return ''
    try {
      const fm = parseYaml(frontmatter) as Record<string, unknown>
      return typeof fm.type === 'string' ? fm.type : ''
    } catch {
      return ''
    }
  })()

  const commit = () => {
    save.mutate(
      upsertTemplate(stored, {
        id,
        name: name.trim(),
        description: description.trim(),
        body,
        // An article with its own frontmatter needs no synthesised header, so
        // a `type` here would be a field that silently does nothing.
        ...(!hasFrontmatter && inheritedType !== '' && { type: inheritedType }),
      }),
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New template from this article</DialogTitle>
          <DialogDescription>
            Its text becomes the starting point for new articles, in every
            world.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="promote-name" className="text-xs">
              Name
            </Label>
            <Input
              id="promote-name"
              className="h-8 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim() !== '') commit()
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="promote-description" className="text-xs">
              Description
            </Label>
            <Input
              id="promote-description"
              className="h-8 text-sm"
              placeholder="What this template is for"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <p className="text-muted-foreground text-xs">
            {loading
              ? 'Reading the article…'
              : hasFrontmatter
                ? 'This article has its own frontmatter, so the template keeps it exactly as written.'
                : 'Copied as plain text. You can set an article type for it afterwards in Settings → Templates.'}
            {slugged && name.trim() !== '' && (
              <>
                {' '}
                Stored as <code>{id}</code>.
              </>
            )}
          </p>

          {save.error && (
            <p className="text-destructive text-xs">{save.error.message}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={name.trim() === '' || loading || save.isPending}
            onClick={commit}
          >
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
