import { X } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import type { TocHeading } from '#/lib/toc'

/**
 * The article outline. Purely presentational — the headings are parsed from the
 * markdown source by `parseHeadings`, and jumping to one is the route's job,
 * because where a click lands depends on which tab is open.
 */
export function TableOfContents({
  headings,
  activeId,
  onSelect,
  onClose,
}: {
  headings: Array<TocHeading>
  activeId: string | null
  onSelect: (heading: TocHeading) => void
  onClose: () => void
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col border-l">
      <div className="flex items-center gap-1 border-b px-3 py-1.5">
        <span className="text-muted-foreground text-xs font-medium">
          Outline
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6"
          title="Hide the outline"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {headings.length === 0 ? (
        <p className="text-muted-foreground p-3 text-xs">
          No headings yet. Start a line with # to add one.
        </p>
      ) : (
        <nav className="min-h-0 flex-1 overflow-y-auto py-1">
          {headings.map((heading) => (
            <button
              key={heading.id}
              type="button"
              className={cn(
                'hover:bg-accent block w-full truncate py-1 pr-3 text-left text-xs',
                heading.level === 1 && 'font-semibold',
                activeId === heading.id && 'bg-accent text-accent-foreground',
              )}
              // Inline rather than a Tailwind class: Tailwind 4 can't generate
              // class names from a runtime value, and a six-entry lookup map is
              // more code than the arithmetic.
              style={{ paddingLeft: 12 + (heading.level - 1) * 10 }}
              title={heading.text}
              onClick={() => onSelect(heading)}
            >
              {heading.text || (
                <span className="text-muted-foreground italic">(untitled)</span>
              )}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
