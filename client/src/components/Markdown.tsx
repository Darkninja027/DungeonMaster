import {
  isValidElement,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useRouter } from '@tanstack/react-router'
import { Dices } from 'lucide-react'
import { cn } from '#/lib/utils'
import {
  DM_CALLOUT_MARKER,
  linkifyDice,
  parsePages,
  rangeMatches,
  resolveNoteLinks,
  resolveWikiLinks,
  rollDice,
  splitFrontmatter,
  transformDmBlocks,
} from '#/lib/formatMarkdown'
import type { DiceResult } from '#/lib/formatMarkdown'
import { focusImage } from '#/lib/playerFocus'
import { logRoll } from '#/lib/rollLog'
import type { RollSource } from '#/lib/rollLog'
import {
  ABILITY_ORDER,
  abilityModLabel,
  parseStatBlockCard,
} from '#/lib/statblock'
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
const COL_GAP = 40
const CONTENT_W = PAGE_W - 2 * PAD_X // 712

/**
 * Hoisted so they are referentially stable: passing fresh literals would make
 * every ReactMarkdown re-render even behind React.memo.
 */
const REMARK_PLUGINS = [remarkGfm]
const identityUrl = (url: string) => url

/**
 * How many sheets a flow needs, given the total width its columns occupy.
 *
 * `scrollWidth` spans every column the content generated, including the gaps
 * between them — so the column count is (width + one gap) / (column + gap),
 * and sheets hold `columns` of them.
 *
 * Exported for tests: this is measured from the live DOM, so the arithmetic is
 * the only part that can be checked without a browser.
 */
export function sheetsForWidth(scrollWidth: number, columns: 1 | 2): number {
  const colW = columns === 2 ? (CONTENT_W - COL_GAP) / 2 : CONTENT_W
  const cols = Math.max(
    1,
    Math.round((scrollWidth + COL_GAP) / (colW + COL_GAP)),
  )
  return Math.ceil(cols / columns)
}

function DiceChip({
  notation,
  label,
  hideLabel,
  source,
}: {
  notation: string
  /** Optional roll name, e.g. "Short Sword" from [Short Sword](dice:2d6+3). */
  label?: string
  /** Log the label to roll history but don't show it on the chip (#hidename). */
  hideLabel?: boolean
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
      {label && !hideLabel ? `${label} | ${notation}` : notation}
      {result && <strong> = {result.total}</strong>}
    </button>
  )
}

/** Table whose first header cell is dice notation (d100, d12…) gets a Roll button. */
function RollableTable({
  children,
  source,
  readOnly,
}: {
  children?: React.ReactNode
  source?: RollSource
  readOnly?: boolean
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
      {die && !readOnly && (
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

const ABILITY_LABEL: Record<(typeof ABILITY_ORDER)[number], string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
}

/**
 * A PHB-style monster stat block rendered from a ```statblock fence. Fields lay
 * out in dedicated slots (so nothing wraps the way a raw markdown table does),
 * and the prose section is rendered as inline markdown so damage rolls and wiki
 * links stay live inside traits and actions.
 */
const StatBlockCard = memo(function StatBlockCard({
  fence,
  worldId,
  articles,
  onCreateMissing,
  source,
  readOnly,
}: { fence: string } & RenderContext) {
  // Each card also renders an InlineMarkdown per attribute plus one for its
  // prose, so re-parsing the fence on every render multiplied up quickly.
  const card = useMemo(() => parseStatBlockCard(fence), [fence])
  const hasAbilities = ABILITY_ORDER.some((a) => card.abilities[a] != null)
  const attributes: Array<{ label: string; value: string }> = [
    ...(card.ac != null ? [{ label: 'Armor Class', value: card.ac }] : []),
    ...(card.hp != null ? [{ label: 'Hit Points', value: card.hp }] : []),
    ...(card.speed != null ? [{ label: 'Speed', value: card.speed }] : []),
    ...(card.cr != null
      ? [
          {
            label: 'Challenge',
            value: card.xp != null ? `${card.cr} (${card.xp} XP)` : card.cr,
          },
        ]
      : []),
  ]

  // Portable image paths (_images/foo.png) are served via the world:// protocol.
  const imageSrc =
    card.image && card.image.startsWith('_images/') && worldId
      ? `world://${worldId}/${card.image}`
      : card.image

  return (
    <div className="dnd-statblock">
      {/* Header row: portrait on the left, name/type/AC-HP-Speed-CR on the right.
          The image height tracks this row so it never runs past the stat lines. */}
      <div
        className={cn(
          'dnd-statblock-header',
          imageSrc && 'dnd-statblock-header-withimg',
        )}
      >
        {imageSrc && (
          <div className="dnd-statblock-image-wrap">
            <img
              className={cn(
                'dnd-statblock-image',
                card.imageNoFrame && 'dnd-statblock-image-noframe',
              )}
              src={imageSrc}
              alt={card.name ?? 'Creature portrait'}
              // A placeholder/broken path shouldn't leave an ugly broken-image
              // icon in the card — hide it until a real image is set.
              onError={(e) => {
                const wrap = e.currentTarget.parentElement
                if (wrap) wrap.style.display = 'none'
              }}
            />
          </div>
        )}
        <div className="dnd-statblock-heading">
          {card.name && <div className="dnd-statblock-name">{card.name}</div>}
          {card.subtitle && (
            <div className="dnd-statblock-subtitle">{card.subtitle}</div>
          )}

          {attributes.length > 0 && (
            <div className="dnd-statblock-attrs">
              {attributes.map((a) => (
                <div key={a.label}>
                  <span className="dnd-statblock-attr-label">{a.label}</span>{' '}
                  <InlineMarkdown
                    className="dnd-statblock-attr-value"
                    worldId={worldId}
                    articles={articles}
                    onCreateMissing={onCreateMissing}
                    source={source}
                    readOnly={readOnly}
                  >
                    {a.value}
                  </InlineMarkdown>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {hasAbilities && (
        <div className="dnd-statblock-abilities">
          {ABILITY_ORDER.map((key) => {
            const score = card.abilities[key]
            return (
              <div key={key} className="dnd-statblock-ability">
                <div className="dnd-statblock-ability-name">
                  {ABILITY_LABEL[key]}
                </div>
                <div className="dnd-statblock-ability-score">
                  {score == null ? '—' : `${score} (${abilityModLabel(score)})`}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {card.extras.length > 0 && (
        <div className="dnd-statblock-extras">
          {card.extras.map((e) => (
            <div key={e.label}>
              <span className="dnd-statblock-attr-label">{e.label}</span>{' '}
              {e.value}
            </div>
          ))}
        </div>
      )}

      {card.prose && (
        <InlineMarkdown
          className="dnd-statblock-prose"
          worldId={worldId}
          articles={articles}
          onCreateMissing={onCreateMissing}
          source={source}
          readOnly={readOnly}
        >
          {card.prose}
        </InlineMarkdown>
      )}
    </div>
  )
})

/**
 * Image options ride in the URL hash: ![map](url#right&w=45%&h=200)
 *   left | right | center — placement (text fills the space around left/right)
 *   nowrap (or block)     — keep the image on its own line, no text wrap
 *   noframe               — no photo frame (for transparent images)
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
  let noframe = false
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
    if (t === 'noframe') {
      noframe = true
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
  const className = cn(
    nowrap && float !== 'center'
      ? cn('dnd-img-block', float && `dnd-img-block-${float}`)
      : float
        ? `dnd-img-${float}`
        : undefined,
    noframe && 'dnd-img-noframe',
  )
  return { src: src.slice(0, i), style, className: className || undefined }
}

/** Plain text of a rendered link's children — the visible label. */
function childText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(childText).join('')
  return ''
}

/**
 * If a <pre>'s child is a ```statblock fenced code block, return its raw text;
 * otherwise null. react-markdown renders the fence as a <code> element carrying
 * `className="language-statblock"` and the literal fence body as its children.
 */
function statBlockFence(children: React.ReactNode): string | null {
  const child = Array.isArray(children) ? children[0] : children
  if (!isValidElement(child)) return null
  const props = child.props as {
    className?: string
    children?: React.ReactNode
  }
  if (
    typeof props.className === 'string' &&
    /\blanguage-statblock\b/.test(props.className)
  ) {
    return childText(props.children)
  }
  return null
}

/**
 * Stamp each heading with the text the outline pane knows it by, so a click
 * there can find it in the rendered flow.
 *
 * Deliberately NOT an id or an incrementing ordinal: the same components object
 * serves every sheet copy of the document (see the sheet loop below), so a
 * counter would keep climbing across sheets and ids would be duplicated
 * `sheetCount` times over. A text attribute is identical in every copy, which
 * is exactly what the lookup wants — it queries one sheet's flow and reads the
 * heading's horizontal offset from it.
 */
function headingComponent(level: 1 | 2 | 3 | 4 | 5 | 6) {
  const Tag = `h${level}` as const
  return function Heading({
    children,
    ...props
  }: {
    children?: React.ReactNode
  }) {
    return (
      <Tag data-toc-text={childText(children).trim()} {...props}>
        {children}
      </Tag>
    )
  }
}

function createComponents(
  push: (href: string) => void,
  onCreateMissing?: (title: string) => void,
  worldId?: string,
  source?: RollSource,
  articles?: Array<{ id: string; title: string }>,
  readOnly?: boolean,
  onOpenNote?: (title: string) => void,
): Components {
  return {
    h1: headingComponent(1),
    h2: headingComponent(2),
    h3: headingComponent(3),
    h4: headingComponent(4),
    h5: headingComponent(5),
    h6: headingComponent(6),
    table: ({ children }) => (
      <RollableTable source={source} readOnly={readOnly}>
        {children}
      </RollableTable>
    ),
    blockquote: ({ children, ...props }) => {
      // A :::dm block arrives here as a blockquote whose first child is a
      // paragraph holding only DM_CALLOUT_MARKER (see transformDmBlocks). The
      // marker is stripped and the rest renders as a tinted "DM only" box.
      // Checking the first child rather than the whole text keeps a normal
      // read-aloud blockquote that merely mentions the marker unaffected.
      const kids = Array.isArray(children) ? children : [children]
      const first = kids.find((k) => isValidElement(k))
      if (
        isValidElement(first) &&
        childText(
          (first.props as { children?: React.ReactNode }).children,
        ).trim() === DM_CALLOUT_MARKER
      ) {
        return (
          <blockquote className="dnd-dm-block" {...props}>
            {kids.filter((k) => k !== first)}
          </blockquote>
        )
      }
      return <blockquote {...props}>{children}</blockquote>
    },
    pre: ({ children, ...props }) => {
      // A ```statblock fence renders as a PHB monster card instead of a code
      // block. react-markdown wraps fenced code in <pre><code class="language-…">;
      // unwrap it here so the card isn't nested inside a <pre>.
      const fence = statBlockFence(children)
      if (fence != null) {
        return (
          <StatBlockCard
            fence={fence}
            worldId={worldId}
            articles={articles}
            onCreateMissing={onCreateMissing}
            source={source}
            readOnly={readOnly}
          />
        )
      }
      return <pre {...props}>{children}</pre>
    },
    img: ({ src, alt, ...props }) => {
      const parsed = parseImageSrc(typeof src === 'string' ? src : undefined)
      // Markdown on disk references images by portable relative path
      // (_images/foo.png); the app serves them through the world:// protocol.
      if (parsed.src?.startsWith('_images/') && worldId) {
        parsed.src = `world://${worldId}/${parsed.src}`
      }
      // The one place readOnly ADDS interactivity rather than removing it: on
      // a projector a map wants to be enlarged, and clicking it is the whole
      // gesture. focusImage is a module-level store because these images sit
      // deep inside memoised subtrees — see lib/playerFocus.ts.
      if (readOnly && parsed.src) {
        const resolved = parsed.src
        return (
          <img
            src={resolved}
            alt={alt}
            style={parsed.style}
            className={cn(parsed.className, 'cursor-zoom-in')}
            onClick={() => focusImage({ src: resolved, alt })}
            {...props}
          />
        )
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
      // A player-facing surface renders every link as plain text. Not CSS:
      // pointer-events:none would stop the click but keep the affordance —
      // and an internal href calls router.history.push, which would navigate
      // the PLAYER window into the full DM app, sidebar and all, on the
      // projector. That is the worst failure this feature has, so it is
      // refused at the point the element is built.
      //
      // A missing: link matters for a second reason: its title reads "No
      // article called X yet — click to create it", which is the DM's private
      // worldbuilding TODO.
      if (readOnly) return <span {...props}>{children}</span>
      if (href?.startsWith('dice:')) {
        const notation = decodeURIComponent(href.slice(5))
        // A trailing #hidename keeps the name in roll history but hides it on
        // the chip: [Sneak Attack #hidename](3d6) renders as just the dice.
        const rawText = childText(children).trim()
        const hideLabel = /#hidename\s*$/i.test(rawText)
        const text = rawText.replace(/#hidename\s*$/i, '').trim()
        return (
          <DiceChip
            notation={notation}
            label={text && text !== notation ? text : undefined}
            hideLabel={hideLabel}
            source={source}
          />
        )
      }
      if (href?.startsWith('note:')) {
        const title = decodeURIComponent(href.slice(5))
        return (
          <button
            type="button"
            title="A note on this character — click to open it"
            className="text-primary cursor-pointer underline underline-offset-2"
            onClick={() => onOpenNote?.(title)}
          >
            {children}
          </button>
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

/**
 * Compact prose styling for markdown rendered inside a panel or list row rather
 * than on a book page: headings shrink to body size, lists get their bullets and
 * indent back (Tailwind's reset strips both), and vertical margins tighten so a
 * short description doesn't sit in a sea of white space.
 */
export const PANEL_PROSE =
  'text-sm [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1 [&_table]:my-1 [&_td]:border [&_td]:px-1 [&_th]:border [&_th]:px-1'

interface RenderContext {
  articles?: Array<{ id: string; title: string }>
  worldId?: string
  onCreateMissing?: (title: string) => void
  /**
   * Titles of the open character's notes, for the vault — where a missing
   * [[link]] becomes a note in the character's own frontmatter rather than an
   * article. Resolved BEFORE articles, but an article of the same name still
   * wins: see resolveNoteLinks. Empty or absent is an exact passthrough, which
   * is every non-vault caller. Keep the array referentially stable (useMemo at
   * the call site) or the body memo below defeats itself.
   */
  noteTitles?: Array<string>
  /** Clicking a resolved note: link — the character route jumps to its tab. */
  onOpenNote?: (title: string) => void
  /** Where rolls made in this view are attributed in the roll history. */
  source?: RollSource
  /**
   * Who is looking. `'dm'` (the default, so every existing call site is
   * unchanged) renders a :::dm block as a tinted box; `'player'` strips those
   * blocks entirely — see transformDmBlocks.
   *
   * NOTE: unrelated to WorldMode's `'player'` in lib/worldMode.ts, which is a
   * per-world chrome setting for someone playing a character.
   */
  audience?: 'dm' | 'player'
  /**
   * A read-only surface — the player window. Dice chips, rollable-table Roll
   * bars and every link render as inert text instead. See the `a` override for
   * why this is a real prop rather than a CSS rule.
   */
  readOnly?: boolean
  /**
   * How the book is laid out.
   *
   * `'sheets'` (the default) is the printing metaphor: fixed 816x1056 pages,
   * so what you see matches what a PDF prints.
   *
   * `'flow'` is one continuous parchment column that grows to fit. Used by the
   * secondary windows, which are reading surfaces rather than page proofs, and
   * it fixes two things at once: a statblock gets the full width instead of a
   * 336px column, and — more importantly — nothing overflows onto a second
   * sheet. In sheet mode each sheet re-renders the WHOLE document and windows
   * its own slice with a negative margin, so every dice chip exists once per
   * sheet and the later copies sit outside the visible box: in the DOM, and
   * impossible to click.
   */
  layout?: 'sheets' | 'flow'
}

/**
 * Compact markdown without the book-page layout — for panels and popups.
 * Same wiki links, dice chips, and rollable tables as the book renderer,
 * so damage notation in spell descriptions stays clickable everywhere.
 */
export const InlineMarkdown = memo(function InlineMarkdown({
  children,
  articles,
  worldId,
  onCreateMissing,
  noteTitles,
  onOpenNote,
  source,
  className,
  readOnly,
}: { children: string; className?: string } & RenderContext) {
  const router = useRouter()
  const components = useMemo(
    () =>
      createComponents(
        (href) => router.history.push(href),
        onCreateMissing,
        worldId,
        source,
        articles,
        readOnly,
        onOpenNote,
      ),
    [router, onCreateMissing, worldId, source, articles, readOnly, onOpenNote],
  )
  // A stat block renders one of these per attribute plus one for its prose,
  // so this pipeline runs many times over per card — worth memoising even
  // though each individual body is short.
  const body = useMemo(
    () =>
      linkifyDice(
        articles && worldId != null
          ? resolveWikiLinks(
              resolveNoteLinks(children, noteTitles ?? [], articles),
              articles,
              worldId,
            )
          : // Notes still resolve with no article list — the second arm is the
            // panel case, and a note has no article to be resolved against.
            resolveNoteLinks(children, noteTitles ?? []),
      ),
    [children, articles, worldId, noteTitles],
  )
  return (
    <div className={className}>
      <MarkdownBody body={body} components={components} />
    </div>
  )
})

/**
 * The parsed markdown body, isolated behind React.memo.
 *
 * react-markdown does no memoising of its own — every render re-runs the full
 * remark pipeline (parse → mdast → hast → elements). Each sheet mounts its own
 * instance (they are separate elements in the tree, so this cannot dedupe the
 * parse ACROSS sheets), but it does stop all of them re-parsing when something
 * unrelated re-renders — which is the typing case, where `body` is unchanged
 * and only the editor's own state moved.
 */
const MarkdownBody = memo(function MarkdownBody({
  body,
  components,
}: {
  body: string
  components: Components
}) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      components={components}
      urlTransform={identityUrl}
    >
      {body}
    </ReactMarkdown>
  )
})

/**
 * One `\page` chunk, rendered as however many fixed-size sheets its content
 * needs (see .dnd-page / .dnd-flow in styles.css).
 */
export const Markdown = memo(function Markdown({
  children,
  columns = 2,
  articles,
  worldId,
  onCreateMissing,
  noteTitles,
  onOpenNote,
  source,
  readOnly,
  layout = 'sheets',
}: { children: string; columns?: 1 | 2 } & RenderContext) {
  const router = useRouter()
  const components = useMemo(
    () =>
      createComponents(
        (href) => router.history.push(href),
        onCreateMissing,
        worldId,
        source,
        articles,
        readOnly,
        onOpenNote,
      ),
    [router, onCreateMissing, worldId, source, articles, readOnly, onOpenNote],
  )
  // Two whole-document regex passes; resolveWikiLinks also rebuilds a title
  // map of the world. Memoised so they don't re-run per sheet.
  const body = useMemo(
    () =>
      linkifyDice(
        articles && worldId != null
          ? resolveWikiLinks(
              resolveNoteLinks(children, noteTitles ?? [], articles),
              articles,
              worldId,
            )
          : // Notes still resolve with no article list — the second arm is the
            // panel case, and a note has no article to be resolved against.
            resolveNoteLinks(children, noteTitles ?? []),
      ),
    [children, articles, worldId, noteTitles],
  )

  // Sheet count comes from the FIRST sheet's own flow. It holds the same
  // content under the same width/height constraints as every other sheet, so
  // its scrollWidth already reports the full column extent — a separate hidden
  // measurer copy was rendering (and re-parsing) the whole document a second
  // time to learn something the visible sheet could answer.
  const measureRef = useRef<HTMLDivElement>(null)
  const [sheetCount, setSheetCount] = useState(1)

  useLayoutEffect(() => {
    // Flow mode has exactly one growing sheet; there is nothing to count, and
    // measuring would report a scrollWidth that means nothing here.
    if (layout === 'flow') {
      setSheetCount(1)
      return
    }
    const el = measureRef.current
    if (!el) return
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      // Only re-render when the count actually changes: setState with an equal
      // value still costs a render pass, and this runs on every edit.
      setSheetCount((prev) => {
        const next = sheetsForWidth(el.scrollWidth, columns)
        return next === prev ? prev : next
      })
    }
    measure()
    // images finishing to load change the flow — re-measure (capture phase:
    // load events don't bubble)
    el.addEventListener('load', measure, true)
    // `cancelled` guards this: the promise resolves once per content change
    // and would otherwise measure against a stale element.
    document.fonts.ready.then(measure)
    return () => {
      cancelled = true
      el.removeEventListener('load', measure, true)
    }
  }, [body, columns, layout])

  const flowClass = cn('dnd-flow', columns === 2 ? 'dnd-flow-2' : 'dnd-flow-1')

  return (
    <>
      {Array.from({ length: layout === 'flow' ? 1 : sheetCount }, (_, i) => (
        <div key={i} className="dnd-page">
          <div className="dnd-frame">
            <div
              ref={i === 0 ? measureRef : undefined}
              className={flowClass}
              // In flow mode the stylesheet overrides both of these (the sheet
              // grows and never windows), but leaving the inline width off
              // keeps the DOM honest about what is actually laying out.
              style={
                layout === 'flow'
                  ? undefined
                  : {
                      width: CONTENT_W,
                      marginLeft: i ? -i * (CONTENT_W + COL_GAP) : 0,
                    }
              }
            >
              <MarkdownBody body={body} components={components} />
            </div>
          </div>
        </div>
      ))}
    </>
  )
})

/** Full article view: splits on \page markers and honours \columns per page. */
export const BookView = memo(function BookView({
  children,
  articles,
  worldId,
  onCreateMissing,
  noteTitles,
  onOpenNote,
  source,
  audience = 'dm',
  readOnly,
  layout = 'sheets',
}: { children: string } & RenderContext) {
  // Frontmatter (character stats etc.) is data, not prose — never render it.
  // Memoised: this re-splits the whole document, and every page's body string
  // feeds a memo boundary below, so a new array would defeat all of them.
  //
  // DM blocks are resolved BEFORE parsePages, so a \page inside one goes with
  // it for a player (their page count legitimately differs from the DM's) and
  // never splits the callout box for the DM.
  const pages = useMemo(
    () =>
      parsePages(
        transformDmBlocks(
          splitFrontmatter(children).body,
          audience === 'player' ? 'strip' : 'mark',
        ),
      ),
    [children, audience],
  )
  return (
    <div
      className={cn(
        'dnd-book flex flex-col items-center gap-8',
        layout === 'flow' && 'dnd-book-flow',
      )}
    >
      {pages.map((page, i) => (
        // data-book-page / data-book-columns address each \page chunk for the
        // outline pane, which scrolls to a chunk and then works out which of
        // its sheets a heading landed on. `contents` keeps the wrapper out of
        // the layout so the sheets still lay out exactly as before.
        <div
          key={i}
          className="contents"
          data-book-page={i}
          data-book-columns={layout === 'flow' ? 1 : (page.columns ?? 2)}
        >
          <Markdown
            columns={layout === 'flow' ? 1 : (page.columns ?? 2)}
            layout={layout}
            articles={articles}
            worldId={worldId}
            onCreateMissing={onCreateMissing}
            noteTitles={noteTitles}
            onOpenNote={onOpenNote}
            source={source}
            readOnly={readOnly}
          >
            {page.body}
          </Markdown>
        </div>
      ))}
    </div>
  )
})
