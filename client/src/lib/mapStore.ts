/**
 * Battlemaps, persisted per-world to `.dm/maps.json`.
 *
 * A map is a background image from `_images/`, a grid laid over it, some tokens
 * and a fog layer. Pure functions over plain state, the same split
 * `encounterStore.ts` and `sessionStore.ts` use, so every rule here is
 * unit-testable without React or Electron.
 *
 * Three decisions worth knowing before changing anything:
 *
 * 1. **The background is an image id** — a path relative to `_images/`, exactly
 *    what `ImageInfo.id` gives ('Maps/City/tavern.png'). It is stored rather
 *    than a `world://` URL because that URL embeds the world id, which is hex of
 *    an absolute path on *this* machine: useless to a LAN guest and wrong the
 *    moment a world folder moves. The renderer builds the URL at display time,
 *    the same rule `Markdown.tsx` follows for images in prose.
 *
 * 2. **A token's position is in grid cells, not pixels.** Snapping is then a
 *    property of the model rather than of the drag, so a token stays on its
 *    square when the map is zoomed, re-opened, or shown on a guest's screen at a
 *    different size. `x`/`y` may be fractional for a token deliberately placed
 *    off-grid.
 *
 * 3. **`combatantId` links a token to the initiative tracker**, and the link is
 *    kept here rather than by adding coordinates to `Combatant`.
 *    `parseCombatState` picks its fields explicitly, so a coordinate added there
 *    would survive a save and vanish on the next load. Keeping it on this side
 *    means the tracker stays exactly what it was.
 *
 * Renaming or moving an image does **not** repoint a map: `rewriteImageRefs`
 * fixes markdown, and JSON under `.dm/` is invisible to it. A map whose
 * background has gone is still a valid map — it renders as an empty grid rather
 * than refusing to open, which is why `image` is never validated here.
 */

import { emptyFog, parseFog, resizeFog } from './fog'
import type { Fog } from './fog'

/** How big a token is, in grid squares. Mirrors 5e's size categories. */
export type TokenSize =
  'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan'

/** Side length in grid cells for each size. Tiny and small still fill a square. */
export const TOKEN_CELLS: Record<TokenSize, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
}

export const TOKEN_SIZES: Array<TokenSize> = [
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
  'gargantuan',
]

export interface Token {
  id: string
  /** Shown under the token, and what the DM searches by. */
  label: string
  /** Position of the token's top-left cell, in grid coordinates. */
  x: number
  y: number
  size: TokenSize
  /** A CSS colour for the disc. Ignored when `image` is set. */
  colour: string
  /** Optional portrait, an `_images`-relative id like the map's background. */
  image?: string
  /** Links this token to a row in the initiative tracker. */
  combatantId?: string
  /**
   * Whether the players can see this token at all.
   *
   * Hidden tokens are stripped before the state reaches a player window or a
   * guest — never merely hidden in CSS, which is the same discipline `:::dm`
   * blocks follow. See `forPlayers`.
   */
  hidden?: boolean
}

export interface GridSpec {
  /**
   * How many cells across and down. **These are the grid**, not something
   * derived from the background.
   *
   * A grid is a rectangle of square cells, and its shape comes from these two
   * numbers: 15 x 30 is a tall grid, 60 x 24 a wide one, and the cells are
   * square in both. The background image is painted behind it and does not get
   * a vote — if the art is a different shape, it is simply cropped or
   * letterboxed until the counts are set to match.
   */
  cols: number
  rows: number
  /**
   * Screen size of one cell, in the map's own units.
   *
   * Cells are always square, so this is one number. It is what the canvas
   * multiplies by the zoom, and what the background image is scaled against —
   * so changing the counts changes how much map there is, never the shape of
   * a cell.
   */
  size: number
}

export interface BattleMap {
  id: string
  name: string
  /** `_images`-relative id of the background, or '' for a bare grid. */
  image: string
  /** Natural pixel size of the background, needed to lay the grid out. */
  imageWidth: number
  imageHeight: number
  grid: GridSpec
  tokens: Array<Token>
  fog: Fog
  /** Whether fog is painted at all. Off means the whole map is visible. */
  fogEnabled: boolean
  savedAt: string
}

export interface MapFile {
  version: 1
  maps: Array<BattleMap>
}

export const DEFAULT_GRID_SIZE = 70

export function emptyMaps(): MapFile {
  return { version: 1, maps: [] }
}

/**
 * The `world://` URL for an `_images`-relative id, for display only.
 *
 * Built here rather than stored, because the world id is hex of an absolute
 * path on *this* machine: it is wrong the moment a world folder moves, and
 * meaningless to a LAN guest, who fetches the same image over the host's /img/
 * route instead. Encoded per segment — a whole-path `encodeURIComponent` turns
 * the separators into %2F, which this app tolerates and Obsidian does not.
 */
export function mapImageUrl(worldId: string, imageId: string): string {
  if (!imageId) return ''
  const encoded = imageId.split('/').map(encodeURIComponent).join('/')
  return `world://${worldId}/_images/${encoded}`
}

/** Random rather than slugged: two maps may share a name over time. */
export function newMapId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function newTokenId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Cell size, falling back when the stored value is nonsense. */
export function cellSize(map: BattleMap): number {
  return map.grid.size > 0 ? map.grid.size : DEFAULT_GRID_SIZE
}

/**
 * The grid's dimensions — simply what was set.
 *
 * Kept as a function because every caller already uses it, and because it is
 * the one place to clamp a hand-edited file to something sane.
 */
export function gridExtent(map: BattleMap): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.round(map.grid.cols)),
    rows: Math.max(1, Math.round(map.grid.rows)),
  }
}

/** The grid's full size in map units, which is what the background fills. */
export function gridPixelSize(map: BattleMap): {
  width: number
  height: number
} {
  const { cols, rows } = gridExtent(map)
  const size = cellSize(map)
  return { width: cols * size, height: rows * size }
}

export function newMap(over: Partial<BattleMap> = {}): BattleMap {
  const base: BattleMap = {
    id: newMapId(),
    name: 'Untitled map',
    image: '',
    imageWidth: 1000,
    imageHeight: 1000,
    grid: { cols: 20, rows: 20, size: DEFAULT_GRID_SIZE },
    tokens: [],
    fog: emptyFog(1, 1),
    fogEnabled: false,
    savedAt: new Date().toISOString(),
    ...over,
  }
  // The fog layer has to match the grid the map actually has.
  const { cols, rows } = gridExtent(base)
  return { ...base, fog: resizeFog(base.fog, cols, rows) }
}

/**
 * Tolerant parse of whatever was on disk.
 *
 * Drops bad rows rather than rejecting the file, the same rule
 * `parseEncounters` follows: `.dm/maps.json` travels with a world folder and is
 * hand-editable, so one broken map must never cost someone every other one.
 * A map needs an id and a name; everything else has a sane default.
 */
export function parseMaps(raw: unknown): MapFile {
  if (typeof raw !== 'object' || raw === null) return emptyMaps()
  const list = (raw as { maps?: unknown }).maps
  if (!Array.isArray(list)) return emptyMaps()

  const seen = new Set<string>()
  const maps: Array<BattleMap> = []
  for (const row of list) {
    if (typeof row !== 'object' || row === null) continue
    const r = row as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : ''
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    if (!id || !name || seen.has(id)) continue
    seen.add(id)

    const grid = parseGrid(r.grid)
    const map: BattleMap = {
      id,
      name,
      image: typeof r.image === 'string' ? r.image : '',
      imageWidth: positive(r.imageWidth, 1000),
      imageHeight: positive(r.imageHeight, 1000),
      grid,
      tokens: parseTokens(r.tokens),
      fog: emptyFog(1, 1),
      fogEnabled: r.fogEnabled === true,
      savedAt: typeof r.savedAt === 'string' ? r.savedAt : '',
    }
    const { cols, rows } = gridExtent(map)
    const fog = parseFog(r.fog)
    // A fog layer saved against a different grid is re-fitted rather than
    // dropped, so changing the grid size does not silently erase the reveals.
    map.fog = fog ? resizeFog(fog, cols, rows) : emptyFog(cols, rows)
    maps.push(map)
  }
  return { version: 1, maps }
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

/**
 * Read a grid, accepting every shape this field has had.
 *
 * `size` is the current form and was also the original one. A file written by
 * the brief two-axis version has `cellWidth`/`cellHeight` instead, and its
 * width is what a square grid becomes — an oblong grid from that version
 * cannot be represented any more and is squared off rather than refused.
 * `offsetX`/`offsetY` are read and dropped for the same reason.
 */
function parseGrid(raw: unknown): GridSpec {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >
  return {
    cols: Math.max(1, Math.round(positive(r.cols, 20))),
    rows: Math.max(1, Math.round(positive(r.rows, 20))),
    size: positive(r.size, positive(r.cellWidth, DEFAULT_GRID_SIZE)),
  }
}

/** The grid as written to disk. One number, because cells are square. */
export function serializeGrid(grid: GridSpec): Record<string, number> {
  return { cols: grid.cols, rows: grid.rows, size: grid.size }
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseTokens(raw: unknown): Array<Token> {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const tokens: Array<Token> = []
  for (const row of raw) {
    if (typeof row !== 'object' || row === null) continue
    const r = row as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    const size = r.size
    tokens.push({
      id,
      label: typeof r.label === 'string' ? r.label : '',
      x: finite(r.x, 0),
      y: finite(r.y, 0),
      size: isTokenSize(size) ? size : 'medium',
      colour: typeof r.colour === 'string' ? r.colour : '#8b1a1a',
      ...(typeof r.image === 'string' && r.image ? { image: r.image } : {}),
      ...(typeof r.combatantId === 'string' && r.combatantId
        ? { combatantId: r.combatantId }
        : {}),
      ...(r.hidden === true ? { hidden: true } : {}),
    })
  }
  return tokens
}

function isTokenSize(value: unknown): value is TokenSize {
  return typeof value === 'string' && value in TOKEN_CELLS
}

/** Newest first, so the list reads as "what I worked on most recently". */
export function sortedMaps(file: MapFile): Array<BattleMap> {
  return [...file.maps].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export function findMap(file: MapFile, id: string): BattleMap | undefined {
  return file.maps.find((m) => m.id === id)
}

/**
 * Add or replace by id.
 *
 * By id rather than by name, unlike `upsertEncounter`: two maps called "Cave"
 * on different levels of the same dungeon is an ordinary thing to want, and a
 * map is opened from a list rather than summoned by name.
 */
export function upsertMap(file: MapFile, map: BattleMap): MapFile {
  const exists = file.maps.some((m) => m.id === map.id)
  return {
    version: 1,
    maps: exists
      ? file.maps.map((m) => (m.id === map.id ? map : m))
      : [...file.maps, map],
  }
}

export function dropMap(file: MapFile, id: string): MapFile {
  return { version: 1, maps: file.maps.filter((m) => m.id !== id) }
}

/** Replace one map's contents, leaving the rest of the file alone. */
export function withMap(
  file: MapFile,
  id: string,
  change: (map: BattleMap) => BattleMap,
): MapFile {
  return {
    version: 1,
    maps: file.maps.map((m) => (m.id === id ? change(m) : m)),
  }
}

export function addToken(map: BattleMap, token: Token): BattleMap {
  return { ...map, tokens: [...map.tokens, token] }
}

export function updateToken(
  map: BattleMap,
  id: string,
  patch: Partial<Token>,
): BattleMap {
  return {
    ...map,
    tokens: map.tokens.map((t) =>
      t.id === id ? { ...t, ...patch, id: t.id } : t,
    ),
  }
}

export function removeToken(map: BattleMap, id: string): BattleMap {
  return { ...map, tokens: map.tokens.filter((t) => t.id !== id) }
}

/**
 * Move a token to a cell, clamped to the grid.
 *
 * Clamped rather than rejected because a drag that ends past the edge should
 * leave the token at the edge, not snap it back to where it started.
 */
export function moveToken(
  map: BattleMap,
  id: string,
  x: number,
  y: number,
): BattleMap {
  const { cols, rows } = gridExtent(map)
  const token = map.tokens.find((t) => t.id === id)
  if (!token) return map
  const span = TOKEN_CELLS[token.size]
  return updateToken(map, id, {
    x: clamp(x, 0, Math.max(0, cols - span)),
    y: clamp(y, 0, Math.max(0, rows - span)),
  })
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/**
 * Re-fit the fog when the grid changes, so reveals survive a resize.
 *
 * Use this rather than writing `grid` directly — setting the cell size without
 * it leaves a fog layer sized for the old grid, which reads as the reveals
 * having jumped sideways.
 */
export function setGrid(map: BattleMap, grid: Partial<GridSpec>): BattleMap {
  const next: BattleMap = { ...map, grid: { ...map.grid, ...grid } }
  const { cols, rows } = gridExtent(next)
  return { ...next, fog: resizeFog(map.fog, cols, rows) }
}

/**
 * Set the column and/or row count.
 *
 * Each axis is independent and neither disturbs the other, because **the grid's
 * shape is the counts**: 15 x 30 is a tall grid of square cells, and that is a
 * perfectly ordinary thing to want. Cells stay square regardless — `size` is
 * untouched here.
 */
export function setGridSize(
  map: BattleMap,
  size: { cols?: number; rows?: number },
): BattleMap {
  return setGrid(map, {
    ...(size.cols === undefined
      ? {}
      : { cols: Math.max(1, Math.floor(size.cols)) }),
    ...(size.rows === undefined
      ? {}
      : { rows: Math.max(1, Math.floor(size.rows)) }),
  })
}

/**
 * Set the grid to the cell counts a background image implies, at a given cell
 * size in the image's own pixels.
 *
 * For art exported from a map tool, where the image is a whole number of cells
 * across — a 60x24 map at 70px a cell. Nothing calls this automatically: an
 * image is a backdrop, and guessing its grid from its pixel size would be
 * wrong more often than right.
 */
export function gridFromImage(
  imageWidth: number,
  imageHeight: number,
  pixelsPerCell: number,
): { cols: number; rows: number } {
  const per = pixelsPerCell > 0 ? pixelsPerCell : DEFAULT_GRID_SIZE
  return {
    cols: Math.max(1, Math.round(imageWidth / per)),
    rows: Math.max(1, Math.round(imageHeight / per)),
  }
}

/**
 * The version of a map that may be shown to players.
 *
 * Hidden tokens are **removed**, not flagged — this is what the player window
 * and the LAN guest are sent, so a token the DM has not revealed must not be in
 * the payload at all. Hiding it in CSS would put the ambush in the DOM of a
 * screen the players are looking at.
 */
export function forPlayers(map: BattleMap): BattleMap {
  return { ...map, tokens: map.tokens.filter((t) => !t.hidden) }
}
