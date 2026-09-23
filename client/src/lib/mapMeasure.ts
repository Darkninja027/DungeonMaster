/**
 * Distance and area-of-effect geometry, in grid cells.
 *
 * Pure functions over plain numbers, like `mapCamera` — no React, no DOM. The
 * point of measuring on a battlemap is settling "can I reach him" and "who is
 * in the fireball", so every function here answers in **cells covered**, which
 * the canvas then paints and the DM reads off.
 *
 * **Diagonals use the 5e default: every square is 5 feet, diagonal included.**
 * That is the PHB's own simplification (the "optional" rule in the DMG alternates
 * 5/10), and it makes distance the Chebyshev metric — `max(dx, dy)` — rather than
 * Euclidean. It is what a table actually plays, and it is what makes a 20-foot
 * radius a 4x4-ish block rather than a ragged circle. `DIAGONAL_RULE` names the
 * choice so nobody has to reverse-engineer it from the arithmetic; the
 * alternating rule is deliberately not implemented, because this app does not
 * enforce rules and a second mode would be a setting nobody asked for.
 *
 * Templates are **cell-inclusion tests**, not vector shapes: a cell is in the
 * area when its centre is. That matches how a grid is adjudicated at a table,
 * and it is what lets the result be a plain list of cells the fog and token
 * layers can already draw.
 */

import type { Point } from './mapCamera'

/** Feet per grid square. 5e's standard, and what `GridSpec.size` represents. */
export const FEET_PER_CELL = 5

export const DIAGONAL_RULE = 'chebyshev' as const

/**
 * Distance in cells between two cells, counting a diagonal as one step.
 *
 * Chebyshev, per the note above. Euclidean here would make a diagonal 1.41
 * squares and turn every reach question into arithmetic nobody does mid-fight.
 */
export function cellDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
}

/** The same, in feet. */
export function feetBetween(a: Point, b: Point): number {
  return cellDistance(a, b) * FEET_PER_CELL
}

/** Format for the readout on the map: "30 ft." and, past 5000, "1 mile". */
export function formatDistance(feet: number): string {
  if (feet >= 5280) {
    const miles = feet / 5280
    return `${miles % 1 === 0 ? miles : miles.toFixed(1)} mi.`
  }
  return `${feet} ft.`
}

export type TemplateKind = 'circle' | 'cone' | 'line' | 'square'

export interface Template {
  kind: TemplateKind
  /** Where the effect comes from — the caster, or the centre of a burst. */
  origin: Point
  /** Where it is aimed. Ignored by `circle` and `square`, which are radial. */
  toward: Point
  /** Radius, length or side, in **feet** — the unit a spell is written in. */
  feet: number
}

/** Radius/length in cells, at least one so a 5-foot effect is never empty. */
function cells(feet: number): number {
  return Math.max(1, Math.round(feet / FEET_PER_CELL))
}

/**
 * Every cell a template covers.
 *
 * Bounded by the template's own extent, so a nonsense radius cannot walk the
 * whole grid; the caller clips to the map.
 */
export function templateCells(template: Template): Array<Point> {
  switch (template.kind) {
    case 'circle':
      return circleCells(template.origin, cells(template.feet))
    case 'square':
      return squareCells(template.origin, cells(template.feet))
    case 'cone':
      return coneCells(template.origin, template.toward, cells(template.feet))
    case 'line':
      return lineCells(template.origin, template.toward, cells(template.feet))
  }
}

/**
 * A burst: every cell within `radius` of the origin, Chebyshev.
 *
 * This is a square block rather than a disc, which looks wrong until you
 * remember it is how a 20-foot-radius fireball is actually adjudicated on a
 * grid where diagonals cost 5 feet. Keeping the metric consistent with
 * `cellDistance` matters more than the shape looking round.
 */
function circleCells(origin: Point, radius: number): Array<Point> {
  const out: Array<Point> = []
  for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
    for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
      if (cellDistance(origin, { x, y }) <= radius) out.push({ x, y })
    }
  }
  return out
}

/** A cube or a square area, given by its half-extent from the origin. */
function squareCells(origin: Point, half: number): Array<Point> {
  const out: Array<Point> = []
  for (let y = origin.y - half; y <= origin.y + half; y += 1) {
    for (let x = origin.x - half; x <= origin.x + half; x += 1) {
      out.push({ x, y })
    }
  }
  return out
}

/**
 * A cone: a 53-degree wedge, which is 5e's "as wide as it is long".
 *
 * Tested by the angle between the cell and the aim direction rather than by
 * stepping rows outward, so it works at any rotation instead of only the eight
 * compass points. A cell is in when it is within range **and** within half the
 * spread of the aim.
 */
function coneCells(origin: Point, toward: Point, length: number): Array<Point> {
  const dx = toward.x - origin.x
  const dy = toward.y - origin.y
  if (dx === 0 && dy === 0) return [origin]
  const aim = Math.atan2(dy, dx)
  // 5e's cone is as wide at its end as it is long, i.e. 2*atan(0.5) ~= 53deg.
  const halfSpread = Math.atan(0.5)

  const out: Array<Point> = []
  for (let y = origin.y - length; y <= origin.y + length; y += 1) {
    for (let x = origin.x - length; x <= origin.x + length; x += 1) {
      const cell = { x, y }
      const dist = cellDistance(origin, cell)
      if (dist === 0) {
        out.push(cell) // the caster's own square is in the cone's mouth
        continue
      }
      if (dist > length) continue
      const angle = Math.atan2(y - origin.y, x - origin.x)
      if (Math.abs(angleDelta(angle, aim)) <= halfSpread) out.push(cell)
    }
  }
  return out
}

/** Signed smallest angle from `b` to `a`, in radians, wrapped to [-pi, pi]. */
function angleDelta(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/**
 * A line: every cell the ray crosses, out to `length`.
 *
 * Supercover rather than Bresenham — a line that clips a corner catches **both**
 * cells, because a lightning bolt that passes through your square hits you, and
 * a template that silently skipped you would be worse than no template.
 */
function lineCells(origin: Point, toward: Point, length: number): Array<Point> {
  const dx = toward.x - origin.x
  const dy = toward.y - origin.y
  if (dx === 0 && dy === 0) return [origin]
  const norm = Math.max(Math.abs(dx), Math.abs(dy))
  const stepX = dx / norm
  const stepY = dy / norm

  const seen = new Set<string>()
  const out: Array<Point> = []
  const add = (p: Point) => {
    const key = `${p.x},${p.y}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(p)
  }

  // Sample finely enough that no crossed cell is stepped over.
  const steps = length * 4
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * length
    add({
      x: Math.round(origin.x + stepX * t),
      y: Math.round(origin.y + stepY * t),
    })
  }
  return out
}

/** Clip a template's cells to the grid, so nothing paints off the map. */
export function clipToGrid(
  points: Array<Point>,
  cols: number,
  rows: number,
): Array<Point> {
  return points.filter((p) => p.x >= 0 && p.y >= 0 && p.x < cols && p.y < rows)
}

/**
 * Which of these tokens a template catches.
 *
 * A token counts as caught when **any** cell of its footprint is in the area —
 * a dragon whose tail is in the fireball is in the fireball. Takes the shape it
 * needs rather than a `Token`, so this module stays free of the map model.
 */
export function tokensInArea<T extends { id: string; x: number; y: number }>(
  tokens: Array<T>,
  area: Array<Point>,
  span: (token: T) => number,
): Array<T> {
  const covered = new Set(area.map((p) => `${p.x},${p.y}`))
  return tokens.filter((t) => {
    const n = span(t)
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        if (covered.has(`${t.x + x},${t.y + y}`)) return true
      }
    }
    return false
  })
}
