import { createFileRoute } from '@tanstack/react-router'
import { BookOpen } from 'lucide-react'

export const Route = createFileRoute('/worlds/$worldId/')({
  component: WorldHome,
})

function WorldHome() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <BookOpen aria-hidden className="text-(--tome-gold) size-10 opacity-60" />
      <h2 className="tome-heading text-base">Nothing open</h2>
      <p className="tome-quiet max-w-[42ch] text-sm">
        Select an article from the sidebar, or create a new one.
      </p>
    </div>
  )
}
