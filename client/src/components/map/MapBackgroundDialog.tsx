import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '#/lib/api'
import type { ImageInfo } from '#/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'

/**
 * Pick a background for a battlemap from this world's `_images/`.
 *
 * Deliberately **not** `ImagePickerDialog`, which is the editor's image
 * library: it owns its own trigger button and hands back a *markdown* string to
 * insert. A map needs the `ImageInfo` itself — the `id` to store and the `url`
 * to measure the natural size from — and turning markdown back into an id would
 * be parsing our own output to recover what we already had.
 *
 * A flat, searchable grid rather than a folder tree, because picking a map is
 * "find the one called tavern", not "organise my images".
 */
export function MapBackgroundDialog({
  worldId,
  onPick,
  onClose,
}: {
  worldId: string
  onPick: (image: ImageInfo) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const tree = useQuery({
    queryKey: ['worlds', worldId, 'images'],
    queryFn: () => api.images.tree(worldId),
  })

  const needle = query.trim().toLowerCase()
  const images = (tree.data?.images ?? []).filter(
    (i) => !needle || i.id.toLowerCase().includes(needle),
  )

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Map background</DialogTitle>
          <DialogDescription>
            Any image in this world. The grid is measured against the
            image&rsquo;s own pixels, so it stays right at every zoom level.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search images…"
          className="h-9"
        />

        <ScrollArea className="max-h-[55vh]">
          {images.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {tree.isLoading
                ? 'Loading…'
                : needle
                  ? 'No image matches that.'
                  : 'This world has no images yet. Add one from the editor’s image library first.'}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 p-1 sm:grid-cols-4">
              {images.map((image) => (
                <li key={image.id}>
                  <button
                    type="button"
                    onClick={() => onPick(image)}
                    className="group w-full overflow-hidden rounded border text-left hover:border-primary"
                    title={image.id}
                  >
                    <img
                      src={image.url}
                      alt=""
                      loading="lazy"
                      className="aspect-video w-full bg-muted object-cover"
                    />
                    <span className="block truncate px-1.5 py-1 text-xs">
                      {image.fileName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
