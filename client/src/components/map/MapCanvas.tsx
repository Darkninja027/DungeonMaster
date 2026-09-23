import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  IDENTITY,
  ZOOM_STEP,
  cellToScreen,
  cellsBetween,
  fitCamera,
  screenToCell,
  zoomAt,
} from '#/lib/mapCamera'
import type { Camera, Point, Viewport } from '#/lib/mapCamera'
import {
  TOKEN_CELLS,
  cellSize,
  gridExtent,
  imageFit,
  gridPixelSize,
  mapImageUrl,
} from '#/lib/mapStore'
import type { BattleMap, Token } from '#/lib/mapStore'
import { isRevealed } from '#/lib/fog'
import { tokenVitals } from '#/lib/mapTokens'
import {
  cellDistance,
  clipToGrid,
  feetBetween,
  formatDistance,
  templateCells,
  tokensInArea,
} from '#/lib/mapMeasure'
import type { TemplateKind } from '#/lib/mapMeasure'
import type { TokenVitals } from '#/lib/mapTokens'
import type { Combatant } from '#/lib/api'

/**
 * The battlemap surface: background image, grid, tokens and fog.
 *
 * Rendered as **inline SVG layers over an `<img>`**, not a `<canvas>`. The app
 * ships no canvas library and `SheetFrame` already establishes inline SVG with
 * transform matrices as an idiom here, so this adds no dependency and stays
 * inspectable in devtools. Everything positional goes through `lib/mapCamera`,
 * which is pure and tested — this component owns gestures and paint, not maths.
 *
 * Pans and zooms with `transform` for the same reason `ImageLightbox` does:
 * CSS `zoom` reflows and repaints, which is fine for a static page and terrible
 * at 60fps under a drag.
 *
 * Two modes, and the difference is a secrecy rule rather than a preference.
 * `audience="dm"` draws unrevealed fog as a translucent wash the DM can see
 * through, and draws hidden tokens dimmed. `audience="player"` draws fog opaque
 * — and is **never** given a hidden token in the first place, because
 * `forPlayers` strips them upstream. Nothing here relies on CSS to keep a
 * secret.
 */

/**
 * Where the selected token sits on screen, for anything floating beside it.
 *
 * Screen pixels relative to the canvas host, already through the camera, so
 * the caller positions absolutely and never does the maths itself.
 */
export interface TokenAnchor {
  /** The token's box on screen. */
  left: number
  top: number
  width: number
  height: number
  /** The host's own size, so a caller can keep a card inside it. */
  view: Viewport
}

/**
 * What a parent may do to the camera. See `cameraRef`.
 *
 * Two verbs, not the camera itself: zooming and framing are the only things
 * anything outside this component has ever wanted, and handing out `setCam`
 * would invite a parent to drive the pan at pointer rate.
 */
export interface MapCameraHandle {
  /** Multiply the zoom about the centre of the view. */
  zoomBy: (factor: number) => void
  /** Frame the whole grid. */
  fit: () => void
}

export type MapAudience = 'dm' | 'player'

/** What the pointer does on the map. Fog tools only ever appear for the DM. */
export type MapTool = 'select' | 'place' | 'reveal' | 'hide' | 'measure'

/**
 * A measurement or spell template in progress.
 *
 * Held as state rather than a ref, unlike the drag gestures, because the whole
 * point is that it is drawn while you hold the button — there is nothing to
 * show if it does not re-render.
 */
export interface Measurement {
  from: Point
  to: Point
}

export function MapCanvas({
  worldId,
  map,
  audience = 'dm',
  tool = 'select',
  selectedTokenId = null,
  combatants = [],
  activeCombatantId = null,
  onSelectToken,
  onMoveToken,
  onPaintFog,
  onPlaceAt,
  template = null,
  templateFeet = 20,
  cameraRef,
  onScale,
  overlay,
  className,
}: {
  worldId: string
  map: BattleMap
  audience?: MapAudience
  tool?: MapTool
  selectedTokenId?: string | null
  /**
   * The initiative tracker's rows, so a linked token can show HP and whose turn
   * it is. Empty when there is no fight running, which is the ordinary case.
   */
  combatants?: Array<Combatant>
  activeCombatantId?: string | null
  onSelectToken?: (id: string | null) => void
  onMoveToken?: (id: string, x: number, y: number) => void
  onPaintFog?: (cells: Array<Point>, revealed: boolean) => void
  /** Clicked an empty cell with the place tool active. */
  onPlaceAt?: (cell: Point) => void
  /**
   * The spell template the measure tool lays down. `null` measures a plain
   * distance instead, which is the common case ("can I reach him").
   */
  template?: TemplateKind | null
  /** Radius/length of the template, in feet. Ignored when measuring distance. */
  templateFeet?: number
  /**
   * Drive the camera from outside — zoom buttons, a Fit control.
   *
   * An imperative handle rather than lifting `cam` into the parent: the camera
   * is this component's business (every gesture in here writes it, at pointer
   * rate), and hoisting it would put a 60fps value in a parent that re-renders
   * a toolbar. The parent gets the two verbs it actually wants.
   */
  cameraRef?: React.Ref<MapCameraHandle>
  /**
   * Anything to draw over the map, given where the selected token is.
   *
   * A render prop because the caller owns the content (the token card) while
   * only this component knows the camera — and the camera moves at pointer
   * rate, so handing it out would re-render a card on every pan. `anchor` is
   * null when nothing is selected or the token has gone.
   */
  overlay?: (anchor: TokenAnchor | null) => React.ReactNode
  /** Called when the zoom changes, for a readout. */
  onScale?: (scale: number) => void
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<Viewport>({ width: 0, height: 0 })
  const [cam, setCam] = useState<Camera>(IDENTITY)
  const [fitted, setFitted] = useState<string | null>(null)

  // One of three gestures at a time. Held in a ref because a drag updates far
  // faster than React should re-render for.
  const pan = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  )
  const dragToken = useRef<{ id: string } | null>(null)
  const paint = useRef<{ last: Point; revealed: boolean } | null>(null)
  // State, not a ref: a measurement exists to be drawn as you drag it.
  const [measuring, setMeasuring] = useState<Measurement | null>(null)

  // Measure the host so the camera has a viewport. ResizeObserver rather than a
  // window listener: the panel this sits in resizes without the window doing.
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setView({ width: el.clientWidth, height: el.clientHeight })
    })
    ro.observe(el)
    setView({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    setCam(fitCamera(gridPixelSize(map), view))
  }, [map, view])

  // Zoom about the middle of the view, which is what a button means — the
  // wheel zooms about the cursor instead, and `zoomAt` serves both.
  const zoomBy = useCallback(
    (factor: number) => {
      const focus = { x: view.width / 2, y: view.height / 2 }
      setCam((c) => zoomAt(c, focus, factor, view))
    },
    [view],
  )

  useImperativeHandle(cameraRef, () => ({ zoomBy, fit }), [zoomBy, fit])

  // Report the zoom for a readout. Effect rather than calling from every
  // writer, so a gesture, a button and the initial fit all announce it once.
  useEffect(() => {
    onScale?.(cam.scale)
  }, [cam.scale, onScale])

  // Fit once per map, as soon as there is a box to fit into. Keyed by map id so
  // switching maps re-fits, but a resize mid-session does not yank the DM's
  // carefully positioned view back to centre.
  useEffect(() => {
    if (!view.width || !view.height) return
    if (fitted === map.id) return
    setFitted(map.id)
    setCam(fitCamera(gridPixelSize(map), view))
  }, [map, view, fitted])

  const { cols, rows } = gridExtent(map)
  const gridBox = gridPixelSize(map)
  const interactive = audience === 'dm'

  // The cells a template covers, and who is standing in them. Computed here so
  // both the overlay and the token ring read the same answer.
  const area = measuring
    ? clipToGrid(
        template
          ? templateCells({
              kind: template,
              origin: measuring.from,
              toward: measuring.to,
              feet: templateFeet,
            })
          : [],
        cols,
        rows,
      )
    : []
  const caught = new Set(
    tokensInArea(map.tokens, area, (t) => TOKEN_CELLS[t.size]).map((t) => t.id),
  )

  function cellAt(e: { clientX: number; clientY: number }): Point {
    const rect = hostRef.current?.getBoundingClientRect()
    const point = {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    }
    return screenToCell(point, map, cam, view)
  }

  // Where the selected token is on screen, for the overlay. Recomputed on
  // every camera change by design: a card beside a token has to follow it.
  const selected =
    selectedTokenId === null
      ? null
      : (map.tokens.find((t) => t.id === selectedTokenId) ?? null)
  const anchor: TokenAnchor | null = (() => {
    if (!selected || !view.width || !view.height) return null
    const span = TOKEN_CELLS[selected.size]
    const topLeft = cellToScreen(
      { x: selected.x, y: selected.y },
      map,
      cam,
      view,
    )
    const side = cellSize(map) * span * cam.scale
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: side,
      height: side,
      view,
    }
  })()

  return (
    <div
      ref={hostRef}
      className={`relative overflow-hidden bg-neutral-900 ${className ?? ''}`}
      onWheel={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const focus = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        setCam((c) =>
          zoomAt(c, focus, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, view),
        )
      }}
      onPointerDown={(e) => {
        // Pointer (not mouse) events so a pen or touchscreen works; capture so a
        // fast drag off the element does not strand the gesture.
        e.currentTarget.setPointerCapture(e.pointerId)

        if (interactive && tool === 'measure') {
          const cell = cellAt(e)
          setMeasuring({ from: cell, to: cell })
          return
        }

        if (interactive && tool === 'place' && e.button === 0) {
          // Placing beats picking: clicking a cell that already holds a token
          // should still drop the new one beside it, because that is what the
          // tool you chose says it does.
          onPlaceAt?.(cellAt(e))
          return
        }

        if (interactive && (tool === 'reveal' || tool === 'hide')) {
          const cell = cellAt(e)
          paint.current = { last: cell, revealed: tool === 'reveal' }
          onPaintFog?.([cell], tool === 'reveal')
          return
        }

        // Middle button and space-free right-drag are always a pan, so the DM
        // can move the view without switching tools mid-fight.
        const token =
          interactive && e.button === 0 ? tokenAt(map, cellAt(e)) : null
        if (token) {
          dragToken.current = { id: token.id }
          onSelectToken?.(token.id)
          return
        }
        if (interactive && e.button === 0) onSelectToken?.(null)
        pan.current = { x: e.clientX, y: e.clientY, px: cam.panX, py: cam.panY }
      }}
      onPointerMove={(e) => {
        if (measuring) {
          setMeasuring({ from: measuring.from, to: cellAt(e) })
          return
        }
        if (paint.current) {
          const cell = cellAt(e)
          const run = cellsBetween(paint.current.last, cell)
          paint.current.last = cell
          onPaintFog?.(run, paint.current.revealed)
          return
        }
        if (dragToken.current) {
          const cell = cellAt(e)
          onMoveToken?.(dragToken.current.id, cell.x, cell.y)
          return
        }
        const p = pan.current
        if (!p) return
        setCam((c) => ({
          ...c,
          panX: p.px + (e.clientX - p.x),
          panY: p.py + (e.clientY - p.y),
        }))
      }}
      onPointerUp={(e) => {
        pan.current = null
        dragToken.current = null
        paint.current = null
        // The measurement is cleared on release rather than left on the map:
        // it answers a question ("can I reach him") and then it is done. A
        // template you want to keep is a token, not a measurement.
        setMeasuring(null)
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onDoubleClick={fit}
    >
      {/*
        The background fills the GRID's box, not its own pixel dimensions: the
        grid is the map, and the art is painted behind it.

        `cover` crops whatever does not line up — right for art drawn to a grid,
        and badly wrong for anything else, since a 1920x1080 map on a 20x20 grid
        loses 44% of its width. `contain` shows all of it and letterboxes
        instead. Per map, because both answers are correct for different art.
      */}
      {map.image ? (
        <img
          src={mapImageUrl(worldId, map.image)}
          alt=""
          draggable={false}
          className={`pointer-events-none absolute select-none ${
            imageFit(map) === 'contain' ? 'object-contain' : 'object-cover'
          }`}
          style={{
            left: '50%',
            top: '50%',
            width: gridBox.width,
            height: gridBox.height,
            transform: `translate(-50%, -50%) translate(${cam.panX}px, ${cam.panY}px) scale(${cam.scale})`,
          }}
        />
      ) : null}

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        // A map with no box yet would render a degenerate viewBox.
        viewBox={view.width ? `0 0 ${view.width} ${view.height}` : undefined}
        // WITHOUT this the default is "xMidYMid meet", which rescales and
        // recentres everything in the SVG to fit the element whenever the
        // viewBox and the element disagree. They disagree on every resize,
        // because `view` comes from a ResizeObserver and therefore lags by a
        // frame: the grid, tokens and fog would jump to a scale the camera
        // knows nothing about while the background <img>, positioned by CSS,
        // stayed put. `none` makes the viewBox a plain coordinate declaration
        // — which is all it was ever meant to be, since every point inside is
        // already in screen pixels from `mapToScreen`.
        preserveAspectRatio="none"
      >
        <GridLines map={map} cam={cam} view={view} cols={cols} rows={rows} />
        <FogLayer
          map={map}
          cam={cam}
          view={view}
          cols={cols}
          rows={rows}
          audience={audience}
        />
        {map.tokens.map((t) => (
          <TokenShape
            key={t.id}
            worldId={worldId}
            token={t}
            map={map}
            cam={cam}
            view={view}
            audience={audience}
            selected={t.id === selectedTokenId}
            vitals={tokenVitals(t, combatants, activeCombatantId)}
            caught={caught.has(t.id)}
          />
        ))}
        {measuring ? (
          <MeasureLayer
            measuring={measuring}
            map={map}
            cam={cam}
            view={view}
            template={template}
            templateFeet={templateFeet}
            area={area}
          />
        ) : null}
      </svg>

      {overlay ? overlay(anchor) : null}

      {!map.image ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/50">
          No background image — pick one to draw on.
        </p>
      ) : null}
    </div>
  )
}

/** The topmost token covering this cell, so overlapping tokens pick sensibly. */
function tokenAt(map: BattleMap, cell: Point): Token | undefined {
  for (let i = map.tokens.length - 1; i >= 0; i -= 1) {
    const t = map.tokens[i]
    const span = TOKEN_CELLS[t.size]
    if (
      cell.x >= t.x &&
      cell.x < t.x + span &&
      cell.y >= t.y &&
      cell.y < t.y + span
    ) {
      return t
    }
  }
  return undefined
}

function GridLines({
  map,
  cam,
  view,
  cols,
  rows,
}: {
  map: BattleMap
  cam: Camera
  view: Viewport
  cols: number
  rows: number
}) {
  // Below about four screen pixels a square, the grid is moire rather than
  // information — drawing thousands of invisible lines helps nobody.
  const step = cellSize(map) * cam.scale
  if (step < 4 || !view.width) return null

  const lines: Array<React.ReactElement> = []
  for (let x = 0; x <= cols; x += 1) {
    const a = cellToScreen({ x, y: 0 }, map, cam, view)
    const b = cellToScreen({ x, y: rows }, map, cam, view)
    lines.push(<line key={`v${x}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />)
  }
  for (let y = 0; y <= rows; y += 1) {
    const a = cellToScreen({ x: 0, y }, map, cam, view)
    const b = cellToScreen({ x: cols, y }, map, cam, view)
    lines.push(<line key={`h${y}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />)
  }
  return (
    <g stroke="rgba(255,255,255,0.22)" strokeWidth={1}>
      {lines}
    </g>
  )
}

/**
 * Unrevealed cells.
 *
 * For the DM this is a wash they can see through — they are meant to know what
 * is behind it. For players it is opaque. Both are drawn from the same fog
 * layer; the difference is only the alpha, because a player view never receives
 * a token it should not see (see `forPlayers`).
 */
function FogLayer({
  map,
  cam,
  view,
  cols,
  rows,
  audience,
}: {
  map: BattleMap
  cam: Camera
  view: Viewport
  cols: number
  rows: number
  audience: MapAudience
}) {
  if (!map.fogEnabled || !view.width) return null
  const cw = cellSize(map) * cam.scale
  const ch = cw
  const rects: Array<React.ReactElement> = []
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (isRevealed(map.fog, x, y)) continue
      const p = cellToScreen({ x, y }, map, cam, view)
      // Skip anything off-screen: a big map at high zoom is mostly off-screen,
      // and thousands of clipped rects is the slow way to draw nothing.
      if (
        p.x + cw < 0 ||
        p.y + ch < 0 ||
        p.x > view.width ||
        p.y > view.height
      ) {
        continue
      }
      rects.push(
        <rect key={`${x},${y}`} x={p.x} y={p.y} width={cw} height={ch} />,
      )
    }
  }
  return (
    <g fill={audience === 'dm' ? 'rgba(10,12,20,0.55)' : '#0a0c14'}>{rects}</g>
  )
}

/**
 * The ruler and the spell template, drawn while the pointer is down.
 *
 * Distance is read off `cellDistance`, which counts a diagonal as one square —
 * 5e's own simplification, and the reason a 3-square diagonal reads 15 ft here
 * rather than 21. See lib/mapMeasure.
 */
function MeasureLayer({
  measuring,
  map,
  cam,
  view,
  template,
  templateFeet,
  area,
}: {
  measuring: Measurement
  map: BattleMap
  cam: Camera
  view: Viewport
  template: TemplateKind | null
  templateFeet: number
  area: Array<Point>
}) {
  const cw = cellSize(map) * cam.scale
  const ch = cw
  const a = cellToScreen(measuring.from, map, cam, view)
  const b = cellToScreen(measuring.to, map, cam, view)
  // Centre of each cell, so the line runs between squares rather than corners.
  const ax = a.x + cw / 2
  const ay = a.y + ch / 2
  const bx = b.x + cw / 2
  const by = b.y + ch / 2

  const feet = template
    ? templateFeet
    : feetBetween(measuring.from, measuring.to)
  const squares = cellDistance(measuring.from, measuring.to)

  return (
    <g>
      {area.map((c) => {
        const p = cellToScreen(c, map, cam, view)
        return (
          <rect
            key={`${c.x},${c.y}`}
            x={p.x}
            y={p.y}
            width={cw}
            height={ch}
            fill="rgba(251,191,36,0.28)"
            stroke="rgba(251,191,36,0.5)"
            strokeWidth={1}
          />
        )
      })}

      <line
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke="#fbbf24"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      <circle cx={ax} cy={ay} r={4} fill="#fbbf24" />
      <circle cx={bx} cy={by} r={4} fill="#fbbf24" />

      <text
        x={bx + 10}
        y={by - 10}
        fontSize={14}
        fill="#fff"
        stroke="rgba(0,0,0,0.85)"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {formatDistance(feet)}
        {!template && squares > 0 ? ` (${squares} sq)` : ''}
      </text>
    </g>
  )
}

function TokenShape({
  worldId,
  token,
  map,
  cam,
  view,
  audience,
  selected,
  vitals,
  caught,
}: {
  worldId: string
  token: Token
  map: BattleMap
  cam: Camera
  view: Viewport
  audience: MapAudience
  selected: boolean
  vitals: TokenVitals | null
  /** Standing in the spell template being aimed right now. */
  caught: boolean
}) {
  if (!view.width) return null
  const span = TOKEN_CELLS[token.size]
  const size = cellSize(map) * cam.scale * span
  const w = size
  const h = size
  const p = cellToScreen({ x: token.x, y: token.y }, map, cam, view)
  const r = size / 2
  const cx = p.x + r
  const cy = p.y + r
  // Hidden tokens only ever reach the DM; forPlayers removes them upstream.
  const dim = audience === 'dm' && token.hidden
  const down = vitals?.down ?? false

  return (
    <g opacity={dim ? 0.45 : 1}>
      {caught ? (
        // Who the fireball catches, while you are still aiming it.
        <circle
          cx={cx}
          cy={cy}
          r={r * 1.1}
          fill="none"
          stroke="#f97316"
          strokeWidth={Math.max(2, r * 0.14)}
        />
      ) : null}
      {vitals?.active ? (
        // Whose turn it is, drawn UNDER the token so it reads as a spotlight on
        // the floor rather than another ring around the miniature.
        <circle
          cx={cx}
          cy={cy}
          r={r * 1.22}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={Math.max(2, r * 0.12)}
          opacity={0.9}
        />
      ) : null}
      {token.image ? (
        <>
          <clipPath id={`clip-${token.id}`}>
            <circle cx={cx} cy={cy} r={r * 0.92} />
          </clipPath>
          <image
            href={mapImageUrl(worldId, token.image)}
            x={p.x}
            y={p.y}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#clip-${token.id})`}
          />
        </>
      ) : (
        <circle cx={cx} cy={cy} r={r * 0.92} fill={token.colour} />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.92}
        fill="none"
        stroke={selected ? '#fbbf24' : 'rgba(0,0,0,0.65)'}
        strokeWidth={selected ? 3 : 1.5}
      />
      {dim ? (
        // A dashed ring, not just opacity: "hidden" has to survive a glance at
        // a dim screen across a table.
        <circle
          cx={cx}
          cy={cy}
          r={r * 0.99}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      ) : null}
      {down ? (
        // Struck through in the tracker, crossed out here. Colour alone would
        // not survive a glance at a dim screen across a table.
        <g
          stroke="#ef4444"
          strokeWidth={Math.max(2, r * 0.16)}
          strokeLinecap="round"
        >
          <line
            x1={cx - r * 0.5}
            y1={cy - r * 0.5}
            x2={cx + r * 0.5}
            y2={cy + r * 0.5}
          />
          <line
            x1={cx + r * 0.5}
            y1={cy - r * 0.5}
            x2={cx - r * 0.5}
            y2={cy + r * 0.5}
          />
        </g>
      ) : null}
      {vitals && vitals.hpFraction !== null && !down && size > 20 ? (
        // A bar under the token, not a number: mid-fight you want "how hurt" at
        // a glance, and the exact figure is in the tracker two feet away.
        <g>
          <rect
            x={p.x + w * 0.1}
            y={p.y + h * 0.94}
            width={w * 0.8}
            height={Math.max(3, size * 0.07)}
            rx={2}
            fill="rgba(0,0,0,0.7)"
          />
          <rect
            x={p.x + w * 0.1}
            y={p.y + h * 0.94}
            width={w * 0.8 * vitals.hpFraction}
            height={Math.max(3, size * 0.07)}
            rx={2}
            fill={
              vitals.hpFraction > 0.5
                ? '#22c55e'
                : vitals.hpFraction > 0.25
                  ? '#eab308'
                  : '#ef4444'
            }
          />
        </g>
      ) : null}
      {token.label && size > 26 ? (
        <text
          x={cx}
          y={p.y + h + 12}
          textAnchor="middle"
          fontSize={Math.min(14, Math.max(9, size / 4))}
          fill="#fff"
          stroke="rgba(0,0,0,0.85)"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {token.label}
        </text>
      ) : null}
    </g>
  )
}
