import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '#/lib/utils'

/** Renders markdown styled like a page from a D&D sourcebook (see .dnd-page in styles.css). */
export function Markdown({ children, columns = true }: { children: string; columns?: boolean }) {
  return (
    <div className={cn('dnd-page', columns && 'dnd-columns')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
