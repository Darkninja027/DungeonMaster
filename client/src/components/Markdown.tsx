import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '#/lib/utils'
import { parsePages } from '#/lib/formatMarkdown'

/** A single D&D sourcebook page (see .dnd-page in styles.css). */
export function Markdown({ children, columns = 2 }: { children: string; columns?: 1 | 2 }) {
  return (
    <div className={cn('dnd-page', columns === 2 && 'dnd-columns')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}

/** Full article view: splits on \page markers and honours \columns per page. */
export function BookView({ children }: { children: string }) {
  const pages = parsePages(children)
  return (
    <div className="flex flex-col gap-8">
      {pages.map((page, i) => (
        <Markdown key={i} columns={page.columns ?? 2}>
          {page.body}
        </Markdown>
      ))}
    </div>
  )
}
