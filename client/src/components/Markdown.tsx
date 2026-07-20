import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useRouter } from '@tanstack/react-router'
import { cn } from '#/lib/utils'
import { parsePages, resolveWikiLinks } from '#/lib/formatMarkdown'
import type { Components } from 'react-markdown'

function useMarkdownComponents(): Components {
  const router = useRouter()
  return {
    a: ({ href, children, ...props }) => {
      if (href === '#missing') {
        return (
          <span
            title="No article with this title exists yet"
            className="cursor-help underline decoration-dashed opacity-70"
          >
            {children}
          </span>
        )
      }
      if (href?.startsWith('/')) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              router.history.push(href)
            }}
            {...props}
          >
            {children}
          </a>
        )
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" {...props}>
          {children}
        </a>
      )
    },
  }
}

interface RenderContext {
  articles?: Array<{ id: number; title: string }>
  worldId?: number
}

/** A single D&D sourcebook page (see .dnd-page in styles.css). */
export function Markdown({
  children,
  columns = 2,
  articles,
  worldId,
}: { children: string; columns?: 1 | 2 } & RenderContext) {
  const components = useMarkdownComponents()
  const body =
    articles && worldId != null ? resolveWikiLinks(children, articles, worldId) : children
  return (
    <div className={cn('dnd-page', columns === 2 && 'dnd-columns')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  )
}

/** Full article view: splits on \page markers and honours \columns per page. */
export function BookView({ children, articles, worldId }: { children: string } & RenderContext) {
  const pages = parsePages(children)
  return (
    <div className="dnd-book flex flex-col gap-8">
      {pages.map((page, i) => (
        <Markdown key={i} columns={page.columns ?? 2} articles={articles} worldId={worldId}>
          {page.body}
        </Markdown>
      ))}
    </div>
  )
}
