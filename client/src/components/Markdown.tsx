import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  splitFrontmatter,
} from '#/lib/formatMarkdown'
import type { DiceResult } from '#/lib/formatMarkdown'
import { logRoll } from '#/lib/rollLog'
import type { RollSource } from '#/lib/rollLog'
import type { Components } from 'react-markdown'

/**
 * Book pages are fixed US-Letter-proportioned sheets (816×1056 css px = 8.5×11"
 * at 96dpi). Content flows through fixed-height CSS columns; when it overflows,
 * the browser creates overflow columns to the right and we window two columns
 * (or one) per sheet — that is the "smart page break". A hidden measurer counts
 * how many columns the content needs, which gives the sheet count.
 */
export const PAGE_W = 816
export const PAGE_H = 1056
const PAD_X = 52
const PAD_Y = 48
const COL_GAP = 40
const CONTENT_W = PAGE_W - 2 * PAD_X // 712
const CONTENT_H = PAGE_H - 2 * PAD_Y // 960

function DiceChip({
  notation,
  label,
  source,
}: {
  notation: string
  /** Optional roll name, e.g. "Short Sword" from [Short Sword](dice:2d6+3). */
  label?: string
  source?: RollSource
}) {
  const [result, setResult] = useState<DiceResult | null>(null)
  return (
    <button
      type="button"
      className="dnd-dice"
      title={result ? `${notation}: ${result.detail}` : `Roll ${notation}`}
      onClick={() => {
        const rolled = rollDice(notation)
        setResult(rolled)
        if (rolled)
          logRoll({
            notation,
            label,
            total: rolled.total,
            detail: rolled.detail,
            source,
          })
      }}
    >
      {label ? `${label} | ${notation}` : notation}
      {result && <strong> = {result.total}</strong>}
    </button>
  )
}

/** Table whose first header cell is dice notation (d100, d12…) gets a Roll button. */
function RollableTable({
  children,
  source,
}: {
  children?: React.ReactNode
  source?: RollSource
}) {
  const ref = useRef<HTMLTableElement>(null)
  const [die, setDie] = useState<number | null>(null)
  const [rolled, setRolled] = useState<number | null>(null)

  useEffect(() => {
    const header =
      ref.current?.querySelector('thead th')?.textContent.trim() ?? ''
    const m = header.match(/^d(\d+)$/i)
    setDie(m ? Number(m[1]) : null)
    setRolled(null)
  }, [children])

  const roll = () => {
    if (!die || !ref.current) return
    const n = 1 + Math.floor(Math.random() * die)
    setRolled(n)
    let hitText = ''
    for (const tr of ref.current.querySelectorAll('tbody tr')) {
      const cell = tr.querySelector('td')?.textContent ?? ''
      const hit = rangeMatches(cell, n)
      tr.classList.toggle('dnd-roll-hit', hit)
      if (hit) hitText = tr.textContent.trim().replace(/\s+/g, ' ')
    }
    // The second header cell names the table ("| d100 | Magic Item |").
    const ths = ref.current.querySelectorAll('thead th')
    const label = ths.length > 1 ? ths[1].textContent.trim() : ''
    logRoll({
      notation: `d${die}`,
      label: label || undefined,
      total: n,
      detail: hitText,
      source,
    })
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

/**
 * Image options ride in the URL hash: ![map](url#right&w=45%&h=200)
 *   left | right | center — placement (text fills the space around left/right)
 *   nowrap (or block)     — keep the image on its own line, no text wrap
 *   w=300, w=45%, h=200   — width/height (bare numbers are px)
 * The hash is only stripped when it contains recognized tokens, so ordinary
 * anchors in image URLs are left alone.
 */
function parseImageSrc(src: string | undefined): {
  src: string | undefined
  style: React.CSSProperties
  className?: string
} {
  if (!src) return { src, style: {} }
  const i = src.indexOf('#')
  if (i < 0) return { src, style: {} }
  const style: React.CSSProperties = {}
  let float: string | undefined
  let nowrap = false
  let recognized = false
  // markdown URL normalization encodes stray "%" (45% → 45%25) — undo it
  let frag = src.slice(i + 1)
  try {
    frag = decodeURIComponent(frag)
  } catch {
    /* leave as-is */
  }
  for (const token of frag.split(/[&,]/)) {
    const t = token.trim().toLowerCase()
    if (t === 'left' || t === 'right' || t === 'center') {
      float = t
      recognized = true
      continue
    }
    if (t === 'nowrap' || t === 'block') {
      nowrap = true
      recognized = true
      continue
    }
    const m = t.match(/^(w|h|width|height)=(\d+(?:\.\d+)?)(%|px)?$/)
    if (m) {
      const value = m[2] + (m[3] ?? 'px')
      if (m[1].startsWith('w')) style.width = value
      else {
        style.height = value
        style.objectFit = 'cover'
      }
      recognized = true
    }
  }
  if (!recognized) return { src, style: {} }
  const className =
    nowrap && float !== 'center'
      ? cn('dnd-img-block', float && `dnd-img-block-${float}`)
      : float
        ? `dnd-img-${float}`
        : undefined
  return { src: src.slice(0, i), style, className }
}

/** Plain text of a rendered link's children — the visible label. */
function childText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(childText).join('')
  return ''
}

function createComponents(
  push: (href: string) => void,
  onCreateMissing?: (title: string) => void,
  worldId?: string,
  source?: RollSource,
): Components {
  return {
    table: ({ children }) => (
      <RollableTable source={source}>{children}</RollableTable>
    ),
    img: ({ src, alt, ...props }) => {
      const parsed = parseImageSrc(typeof src === 'string' ? src : undefined)
      // Markdown on disk references images by portable relative path
      // (_images/foo.png); the app serves them through the world:// protocol.
      if (parsed.src?.startsWith('_images/') && worldId) {
        parsed.src = `world://${worldId}/${parsed.src}`
      }
      return (
        <img
          src={parsed.src}
          alt={alt}
          style={parsed.style}
          className={parsed.className}
          {...props}
        />
      )
    },
    a: ({ href, children, ...props }) => {
      if (href?.startsWith('dice:')) {
        const notation = decodeURIComponent(href.slice(5))
        const text = childText(children).trim()
        return (
          <DiceChip
            notation={notation}
            label={text && text !== notation ? text : undefined}
            source={source}
          />
        )
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
  articles?: Array<{ id: string; title: string }>
  worldId?: string
  onCreateMissing?: (title: string) => void
  /** Where rolls made in this view are attributed in the roll history. */
  source?: RollSource
}

/**
 * Compact markdown without the book-page layout — for panels and popups.
 * Same wiki links, dice chips, and rollable tables as the book renderer,
 * so damage notation in spell descriptions stays clickable everywhere.
 */
export function InlineMarkdown({
  children,
  articles,
  worldId,
  onCreateMissing,
  source,
  className,
}: { children: string; className?: string } & RenderContext) {
  const router = useRouter()
  const components = useMemo(
    () =>
      createComponents(
        (href) => router.history.push(href),
        onCreateMissing,
        worldId,
        source,
      ),
    [router, onCreateMissing, worldId, source],
  )
  const body = linkifyDice(
    articles && worldId != null
      ? resolveWikiLinks(children, articles, worldId)
      : children,
  )
  return (
    <div className={className}>
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

/**
 * One `\page` chunk, rendered as however many fixed-size sheets its content
 * needs (see .dnd-page / .dnd-flow in styles.css).
 */
export function Markdown({
  children,
  columns = 2,
  articles,
  worldId,
  onCreateMissing,
  source,
}: { children: string; columns?: 1 | 2 } & RenderContext) {
  const router = useRouter()
  const components = useMemo(
    () =>
      createComponents(
        (href) => router.history.push(href),
        onCreateMissing,
        worldId,
        source,
      ),
    [router, onCreateMissing, worldId, source],
  )
  const body = linkifyDice(
    articles && worldId != null
      ? resolveWikiLinks(children, articles, worldId)
      : children,
  )

  const measureRef = useRef<HTMLDivElement>(null)
  const [sheetCount, setSheetCount] = useState(1)

  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const colW = columns === 2 ? (CONTENT_W - COL_GAP) / 2 : CONTENT_W
    const measure = () => {
      const cols = Math.max(
        1,
        Math.round((el.scrollWidth + COL_GAP) / (colW + COL_GAP)),
      )
      setSheetCount(Math.ceil(cols / columns))
    }
    measure()
    // images finishing to load change the flow — re-measure (capture phase:
    // load events don't bubble)
    el.addEventListener('load', measure, true)
    document.fonts.ready.then(measure)
    return () => el.removeEventListener('load', measure, true)
  }, [body, columns])

  const flowClass = cn('dnd-flow', columns === 2 ? 'dnd-flow-2' : 'dnd-flow-1')
  const markdown = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
      urlTransform={(url) => url}
    >
      {body}
    </ReactMarkdown>
  )

  return (
    <>
      {/* hidden measurer: same flow, offscreen, used only to count columns */}
      <div className="dnd-page dnd-measure" aria-hidden>
        <div
          ref={measureRef}
          className={flowClass}
          style={{ width: CONTENT_W, height: CONTENT_H, overflow: 'hidden' }}
        >
          {markdown}
        </div>
      </div>
      {Array.from({ length: sheetCount }, (_, i) => (
        <div key={i} className="dnd-page">
          <div className="dnd-frame">
            <div
              className={flowClass}
              style={{
                width: CONTENT_W,
                marginLeft: i ? -i * (CONTENT_W + COL_GAP) : 0,
              }}
            >
              {markdown}
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

/** Full article view: splits on \page markers and honours \columns per page. */
export function BookView({
  children,
  articles,
  worldId,
  onCreateMissing,
  source,
}: { children: string } & RenderContext) {
  // Frontmatter (character stats etc.) is data, not prose — never render it.
  const pages = parsePages(splitFrontmatter(children).body)
  return (
    <div className="dnd-book flex flex-col items-center gap-8">
      {pages.map((page, i) => (
        <Markdown
          key={i}
          columns={page.columns ?? 2}
          articles={articles}
          worldId={worldId}
          onCreateMissing={onCreateMissing}
          source={source}
        >
          {page.body}
        </Markdown>
      ))}
    </div>
  )
}
