import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { api } from '#/lib/api'
import type { ImageInfo } from '#/lib/api'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { ScrollArea } from '#/components/ui/scroll-area'

interface Props {
  worldId: number
  onInsert: (markdown: string) => void
}

/** Image library for a world: upload new images and insert any as markdown. */
export function ImagePickerDialog({ worldId, onInsert }: Props) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const images = useQuery({
    queryKey: ['worlds', worldId, 'images'],
    queryFn: () => api.images.list(worldId),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['worlds', worldId, 'images'] })

  const upload = useMutation({
    mutationFn: (file: File) => api.images.upload(worldId, file),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: api.images.delete, onSuccess: invalidate })

  const insert = (image: ImageInfo) => {
    const alt = image.fileName.replace(/\.[^.]+$/, '')
    onInsert(`![${alt}](${image.url})`)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ImagePlus /> Images
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>World images</DialogTitle>
        </DialogHeader>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload.mutate(file)
              e.target.value = ''
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <Upload /> {upload.isPending ? 'Uploading…' : 'Upload image'}
          </Button>
          {upload.isError && (
            <p className="text-destructive mt-2 text-sm">{upload.error.message}</p>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {images.data?.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No images uploaded for this world yet.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3 p-1">
            {images.data?.map((image) => (
              <div key={image.id} className="group relative rounded border p-1">
                <button
                  type="button"
                  className="block w-full"
                  title={`Insert ${image.fileName}`}
                  onClick={() => insert(image)}
                >
                  <img
                    src={image.url}
                    alt={image.fileName}
                    className="h-28 w-full rounded object-cover"
                  />
                  <p className="text-muted-foreground mt-1 truncate text-xs">{image.fileName}</p>
                </button>
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute right-1.5 top-1.5 size-6 opacity-0 group-hover:opacity-100"
                  onClick={() => {
                    if (confirm(`Delete ${image.fileName}?`)) remove.mutate(image.id)
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
