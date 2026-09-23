/**
 * The battlemap camera: screen pixels <-> map pixels <-> grid cells.
 *
 * `ImageLightbox` pans and zooms an image and never needs to know what is under
 * the cursor, so it only ever applies its transform. A battlemap has to invert
 * it — dropping a token means turning a pointer position back into a grid cell —
 * and that inverse is the one piece of genuinely new arithmetic in the feature.
 * It lives here, as pure functions over plain numbers, so it can be tested
 * without React, a DOM, or an image that has to load.
 *
 * The transform matches ImageLightbox's so the two read the same way:
 *
 *     screen = (map - centre) * scale + pan + viewportCentre
 *
 * i.e. the map is centred in the viewport, then scaled about that centre, then
 * panned. Inverting it is the whole job of `screenToMap`, and the round-trip
 * test is what stops a sign error surviving — a flipped sign is invisible at the
 * origin and at scale 1, which is exactly where a spot check would look.
 *
 * "Map pixels" are the background image's *natural* pixels, which is also what
 * `GridSpec.size` and `offset` are measured in. That is deliberate: it means a
 * grid calibrated once stays right at every zoom level and on every guest's
 * screen, however big their window is.
 */

import { cellSize, gridPixelSize } from './mapStore'
import type { BattleMap } from './mapStore'

export const MIN_SCALE = 0.1
export const MAX_SCALE = 8
/** Wheel zoom factor per notch, matching ImageLightbox. */
export const ZOOM_STEP = 1.15

export interface Camera {
  scale: number
  panX: number
  panY: number
}

export interface Viewport {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/**
 * The thing the camera frames, in map units.
 *
 * This is the **grid's** box, not the background image's: the grid is the map,
 * and the art is painted behind it. Taking a plain box rather than a BattleMap
 * keeps this module free of the map model, and means the caller decides what
 * is being framed.
 */
export interface Box {
  width: number
  height: number
}

export const IDENTITY: Camera = { scale: 1, panX: 0, panY: 0 }

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** Map pixels -> screen pixels, relative to the viewport's top-left. */
export function mapToScreen(
  point: Point,
  box: Box,
  cam: Camera,
  view: Viewport,
): Point {
  return {
    x: (point.x - box.width / 2) * cam.scale + cam.panX + view.width / 2,
    y: (point.y - box.height / 2) * cam.scale + cam.panY + view.height / 2,
  }
}

/**
 * Screen pixels -> map pixels. The exact inverse of `mapToScreen`.
 *
 * Every placement, drag and fog stroke goes through this, so a sign error here
 * is a token that lands somewhere other than where it was dropped. The
 * round-trip test is the guard.
 */
export function screenToMap(
  point: Point,
  box: Box,
  cam: Camera,
  view: Viewport,
): Point {
  return {
    x: (point.x - view.width / 2 - cam.panX) / cam.scale + box.width / 2,
    y: (point.y - view.height / 2 - cam.panY) / cam.scale + box.height / 2,
  }
}

/**
 * Map pixels -> grid cell, floored.
 *
 * Floored rather than rounded because a cell owns the square *starting* at its
 * origin: a point 0.9 of the way across cell 3 is still in cell 3.
 */
export function mapToCell(point: Point, map: BattleMap): Point {
  const size = cellSize(map)
  return {
    x: Math.floor(point.x / size),
    y: Math.floor(point.y / size),
  }
}

/** Grid cell -> map pixels at the cell's top-left corner. */
export function cellToMap(cell: Point, map: BattleMap): Point {
  const size = cellSize(map)
  return { x: cell.x * size, y: cell.y * size }
}

/** Screen pixels straight to a grid cell — what a click handler wants. */
export function screenToCell(
  point: Point,
  map: BattleMap,
  cam: Camera,
  view: Viewport,
): Point {
  return mapToCell(screenToMap(point, gridPixelSize(map), cam, view), map)
}

/** Grid cell -> screen pixels at the cell's top-left corner. */
export function cellToScreen(
  cell: Point,
  map: BattleMap,
  cam: Camera,
  view: Viewport,
): Point {
  return mapToScreen(cellToMap(cell, map), gridPixelSize(map), cam, view)
}

/**
 * Zoom about a fixed screen point, keeping whatever is under it still.
 *
 * The same rule ImageLightbox applies, and for the same reason: on a large map,
 * zooming that slides the thing you are looking at out from under the cursor
 * reads as broken rather than as zooming. Derived rather than copied, so the
 * two cannot drift — this returns a whole camera instead of nudging pan.
 */
export function zoomAt(
  cam: Camera,
  focus: Point,
  factor: number,
  view: Viewport,
): Camera {
  const next = clampScale(cam.scale * factor)
  // Nothing moves when the scale is already at a limit.
  if (next === cam.scale) return cam
  const ratio = next / cam.scale - 1
  const cx = focus.x - view.width / 2
  const cy = focus.y - view.height / 2
  return {
    scale: next,
    panX: cam.panX - (cx - cam.panX) * ratio,
    panY: cam.panY - (cy - cam.panY) * ratio,
  }
}

/**
 * The camera that fits the whole map in the viewport, with a little margin.
 *
 * `scale` may exceed 1 for a small image in a big window, which is what "fit"
 * should do — a 400px map in a 1200px window is meant to fill it.
 */
export function fitCamera(box: Box, view: Viewport, margin = 0.96): Camera {
  if (!view.width || !view.height || !box.width || !box.height) {
    return IDENTITY
  }
  const scale = clampScale(
    Math.min(view.width / box.width, view.height / box.height) * margin,
  )
  return { scale, panX: 0, panY: 0 }
}

/**
 * Every cell a straight drag passes through, so a sweep reveals a continuous
 * line of fog rather than dots wherever the pointer happened to be sampled.
 *
 * A plain Bresenham walk in cell space. Pointer events fire far apart under a
 * fast drag, and without this a quick sweep leaves gaps.
 */
export function cellsBetween(from: Point, to: Point): Array<Point> {
  const x0 = Math.round(from.x)
  const y0 = Math.round(from.y)
  const x1 = Math.round(to.x)
  const y1 = Math.round(to.y)

  const cells: Array<Point> = []
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0

  // Bounded so a nonsense coordinate cannot spin here forever.
  for (let guard = 0; guard <= dx + dy + 1; guard += 1) {
    cells.push({ x, y })
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
  return cells
}

/** Every cell in the square block a token of `span` cells occupies. */
export function cellsOfToken(origin: Point, span: number): Array<Point> {
  const cells: Array<Point> = []
  for (let y = 0; y < span; y += 1) {
    for (let x = 0; x < span; x += 1) {
      cells.push({ x: origin.x + x, y: origin.y + y })
    }
  }
  return cells
}
