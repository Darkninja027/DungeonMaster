import { createFileRoute } from '@tanstack/react-router'
import { BookOpen } from 'lucide-react'

export const Route = createFileRoute('/worlds/$worldId/')({
  component: WorldHome,
})

function WorldHome() {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
      <BookOpen className="size-12" />
      <p>Select an article from the sidebar, or create a new one.</p>
    </div>
  )
}
