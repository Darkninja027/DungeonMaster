import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useRouter } from '@tanstack/react-router'
import { Dices } from 'lucide-react'
import { cn } from '#/lib/utils'
import {
  linkifyDice,
  parsePages,
  rangeMatches,
  resolveWikiLinks,
  rollDice,
} from '#/lib/formatMarkdown'
import type { DiceResult } from '#/lib/formatMarkdown'
import type { Components } from 'react-markdown'

function DiceChip({ notation }: { notation: string }) {
  const [result, setResult] = useState<DiceResult | null>(null)
  return (
    <button
      type="button"
      className="dnd-dice"
      title={result ? result.detail : `Roll ${notation}`}
      onClick={() => setResult(rollDice(notation))}
    >
      {notation}
      {result && <strong> = {result.total}</strong>}
    </button>
  )
}

/** Table whose first header cell is dice notation (d100, d12…) gets a Roll button. */
function RollableTable({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLTableElement>(null)
  const [die, setDie] = useState<number | null>(null)
  const [rolled, setRolled] = useState<number | null>(null)

  useEffect(() => {
    const header = ref.current?.querySelector('thead th')?.textContent.trim() ?? ''
    const m = header.match(/^d(\d+)$/i)
    setDie(m ? Number(m[1]) : null)
    setRolled(null)
  }, [children])

  const roll = () => {
    if (!die || !ref.current) return
    const n = 1 + Math.floor(Math.random() * die)
    setRolled(n)
    for (const tr of ref.current.querySelectorAll('tbody tr')) {
      const cell = tr.querySelector('td')?.textContent ?? ''
      tr.classList.toggle('dnd-roll-hit', rangeMatches(cell, n))
    }
  }

  return (
    <div>
      {die && (
        <div className="dnd-roll-bar">
          <button type="button" className="dnd-dice" onClick={roll}>
            <Dices className="inline size-3.5" /> Roll d{die}
            {rolled != null && <strong> = {rolled}</strong>}
          </button>
        </div>
      )}
      <table ref={ref}>{children}</table>
    </div>
  )
}

function createComponents(
  push: (href: string) => void,
  onCreateMissing?: (title: string) => void,
): Components {
  return {
    table: ({ children }) => <RollableTable>{children}</RollableTable>,
    a: ({ href, children, ...props }) => {
      if (href?.startsWith('dice:')) {
        return <DiceChip notation={decodeURIComponent(href.slice(5))} />
      }
      if (href?.startsWith('missing:')) {
        const title = decodeURIComponent(href.slice(8))
        return (
          <button
            type="button"
            title={`No article called "${title}" yet — click to create it`}
            className="cursor-pointer underline decoration-dashed opacity-70 hover:opacity-100"
            onClick={() => onCreateMissing?.(title)}
          >
            {children}
          </button>
        )
      }
      if (href?.startsWith('/')) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              push(href)
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
  onCreateMissing?: (title: string) => void
}

/** A single D&D sourcebook page (see .dnd-page in styles.css). */
export function Markdown({
  children,
  columns = 2,
  articles,
  worldId,
  onCreateMissing,
}: { children: string; columns?: 1 | 2 } & RenderContext) {
  const router = useRouter()
  const components = useMemo(
    () => createComponents((href) => router.history.push(href), onCreateMissing),
    [router, onCreateMissing],
  )
  const body = linkifyDice(
    articles && worldId != null ? resolveWikiLinks(children, articles, worldId) : children,
  )
  return (
    <div className={cn('dnd-page', columns === 2 && 'dnd-columns')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={(url) => url}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}

/** Full article view: splits on \page markers and honours \columns per page. */
export function BookView({
  children,
  articles,
  worldId,
  onCreateMissing,
}: { children: string } & RenderContext) {
  const pages = parsePages(children)
  return (
    <div className="dnd-book flex flex-col gap-8">
      {pages.map((page, i) => (
        <Markdown
          key={i}
          columns={page.columns ?? 2}
          articles={articles}
          worldId={worldId}
          onCreateMissing={onCreateMissing}
        >
          {page.body}
        </Markdown>
      ))}
    </div>
  )
}
