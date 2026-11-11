import { describe, expect, it } from 'vitest'
import {
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  ZOOM_STEP,
  cellToMap,
  cellToScreen,
  cellsBetween,
  cellsOfToken,
  clampScale,
  fitCamera,
  mapToCell,
  mapToScreen,
  screenToCell,
  screenToMap,
  zoomAt,
} from './mapCamera'
import type { Camera, Point, Viewport } from './mapCamera'
import { newMap } from './mapStore'
import type { BattleMap } from './mapStore'

/**
 * `screenToMap` is the inverse of a transform that is applied in one place and
 * undone in another, which is exactly the shape of bug a spot check misses: a
 * sign error is invisible at the origin and at scale 1. So the centrepiece here
 * is the round-trip, run across a spread of cameras and viewports rather than
 * one convenient case.
 */

const VIEW: Viewport = { width: 1200, height: 800 }

function map(over: Partial<BattleMap> = {}): BattleMap {
  return newMap({
    id: 'm1',
    name: 'Cave',
    // 1000x600 in map units, at the 70px default cell.
    grid: { cols: 1000 / 70, rows: 600 / 70, size: 70 },
    ...over,
  })
}

/** The box the camera frames: the grid's, not the image's. */
const BOX = { width: 1000, height: 600 }

/** Cameras chosen to break symmetry: off-centre pan, non-unit scale, both signs. */
const CAMERAS: Array<Camera> = [
  IDENTITY,
  { scale: 1, panX: 0, panY: 0 },
  { scale: 2, panX: 0, panY: 0 },
  { scale: 0.5, panX: 0, panY: 0 },
  { scale: 1, panX: 130, panY: -70 },
  { scale: 2.5, panX: -240, panY: 310 },
  { scale: 0.35, panX: 480, panY: -190 },
]

const VIEWPORTS: Array<Viewport> = [
  { width: 1200, height: 800 },
  { width: 640, height: 1000 },
  { width: 300, height: 300 },
]

describe('mapCamera', () => {
  describe('screen <-> map round trip', () => {
    it('returns the point it started from, for every camera and viewport', () => {
      const points: Array<Point> = [
        { x: 0, y: 0 },
        { x: 500, y: 300 },
        { x: 1000, y: 600 },
        { x: -120, y: 45 },
        { x: 333.25, y: 199.75 },
      ]
      for (const cam of CAMERAS) {
        for (const view of VIEWPORTS) {
          for (const p of points) {
            const back = screenToMap(
              mapToScreen(p, BOX, cam, view),
              BOX,
              cam,
              view,
            )
            expect(back.x).toBeCloseTo(p.x, 6)
            expect(back.y).toBeCloseTo(p.y, 6)
          }
        }
      }
    })

    it('round-trips the other way too, screen -> map -> screen', () => {
      for (const cam of CAMERAS) {
        for (const view of VIEWPORTS) {
          const screen = { x: 217, y: 388 }
          const back = mapToScreen(
            screenToMap(screen, BOX, cam, view),
            BOX,
            cam,
            view,
          )
          expect(back.x).toBeCloseTo(screen.x, 6)
          expect(back.y).toBeCloseTo(screen.y, 6)
        }
      }
    })

    it('puts the map centre at the viewport centre when unpanned', () => {
      const centre = mapToScreen({ x: 500, y: 300 }, BOX, IDENTITY, VIEW)
      expect(centre.x).toBeCloseTo(600)
      expect(centre.y).toBeCloseTo(400)
    })

    it('moves a point by exactly the pan', () => {
      const a = mapToScreen({ x: 500, y: 300 }, BOX, IDENTITY, VIEW)
      const b = mapToScreen(
        { x: 500, y: 300 },
        BOX,
        { scale: 1, panX: 40, panY: -25 },
        VIEW,
      )
      expect(b.x - a.x).toBeCloseTo(40)
      expect(b.y - a.y).toBeCloseTo(-25)
    })

    it('distinguishes x from y on a non-square map and viewport', () => {
      // A transposition bug survives square inputs; this one is 1000x600 in a
      // 640x1000 window.
      const view = { width: 640, height: 1000 }
      const p = mapToScreen({ x: 1000, y: 0 }, BOX, IDENTITY, view)
      expect(p.x).toBeCloseTo(640 / 2 + 500)
      expect(p.y).toBeCloseTo(1000 / 2 - 300)
    })
  })

  describe('grid coordinates', () => {
    it('floors to the cell that owns the point', () => {
      const m = map() // 70px grid
      expect(mapToCell({ x: 0, y: 0 }, m)).toEqual({ x: 0, y: 0 })
      expect(mapToCell({ x: 69.9, y: 0 }, m)).toEqual({ x: 0, y: 0 })
      expect(mapToCell({ x: 70, y: 0 }, m)).toEqual({ x: 1, y: 0 })
      expect(mapToCell({ x: 209, y: 140 }, m)).toEqual({ x: 2, y: 2 })
    })

    it('round-trips a cell through map pixels', () => {
      const m = map()
      for (const cell of [
        { x: 0, y: 0 },
        { x: 3, y: 5 },
        { x: 9, y: 2 },
      ]) {
        expect(mapToCell(cellToMap(cell, m), m)).toEqual(cell)
      }
    })

    it('goes from a screen point to a cell and back', () => {
      const m = map()
      const cam = { scale: 1.75, panX: -60, panY: 90 }
      for (const cell of [
        { x: 0, y: 0 },
        { x: 4, y: 3 },
      ]) {
        const screen = cellToScreen(cell, m, cam, VIEW)
        // The cell's own top-left corner must land back in that same cell.
        expect(screenToCell(screen, m, cam, VIEW)).toEqual(cell)
      }
    })

    it('falls back to the default grid size when it is nonsense', () => {
      const m = { ...map(), grid: { cols: 10, rows: 10, size: 0 } }
      expect(mapToCell({ x: 70, y: 0 }, m)).toEqual({ x: 1, y: 0 })
    })
  })

  describe('zoomAt', () => {
    it('keeps the focused screen point still', () => {
      const cam = { scale: 1, panX: 0, panY: 0 }
      const focus = { x: 900, y: 250 }
      const before = screenToMap(focus, BOX, cam, VIEW)
      const after = screenToMap(
        focus,
        BOX,
        zoomAt(cam, focus, ZOOM_STEP, VIEW),
        VIEW,
      )
      expect(after.x).toBeCloseTo(before.x, 6)
      expect(after.y).toBeCloseTo(before.y, 6)
    })

    it('keeps it still when zooming out too', () => {
      const cam = { scale: 2, panX: 55, panY: -30 }
      const focus = { x: 320, y: 610 }
      const before = screenToMap(focus, BOX, cam, VIEW)
      const after = screenToMap(
        focus,
        BOX,
        zoomAt(cam, focus, 1 / ZOOM_STEP, VIEW),
        VIEW,
      )
      expect(after.x).toBeCloseTo(before.x, 6)
      expect(after.y).toBeCloseTo(before.y, 6)
    })

    it('clamps and then stops moving at the limits', () => {
      const cam = { scale: MAX_SCALE, panX: 10, panY: 10 }
      // Already at the ceiling: nothing should shift, pan included.
      expect(zoomAt(cam, { x: 0, y: 0 }, 2, VIEW)).toEqual(cam)
      const low = { scale: MIN_SCALE, panX: 3, panY: 4 }
      expect(zoomAt(low, { x: 0, y: 0 }, 0.5, VIEW)).toEqual(low)
    })

    it('never leaves the scale range', () => {
      expect(clampScale(999).valueOf()).toBe(MAX_SCALE)
      expect(clampScale(0).valueOf()).toBe(MIN_SCALE)
      expect(zoomAt(IDENTITY, { x: 0, y: 0 }, 1000, VIEW).scale).toBe(MAX_SCALE)
    })
  })

  describe('fitCamera', () => {
    it('fits a wide map by its width', () => {
      const cam = fitCamera({ width: 2400, height: 600 }, VIEW)
      expect(cam.scale).toBeCloseTo((1200 / 2400) * 0.96)
      expect(cam.panX).toBe(0)
    })

    it('fits a tall map by its height', () => {
      const cam = fitCamera({ width: 600, height: 2400 }, VIEW)
      expect(cam.scale).toBeCloseTo((800 / 2400) * 0.96)
    })

    it('scales a small map up to fill the window', () => {
      const cam = fitCamera({ width: 300, height: 200 }, VIEW)
      expect(cam.scale).toBeGreaterThan(1)
    })

    it('survives a viewport that has not been measured yet', () => {
      // First render, before the ref has a box: must not divide by zero.
      expect(
        fitCamera({ width: 100, height: 100 }, { width: 0, height: 0 }),
      ).toEqual(IDENTITY)
      expect(fitCamera({ width: 0, height: 0 }, VIEW)).toEqual(IDENTITY)
    })
  })

  describe('cellsBetween', () => {
    it('includes both ends of a single step', () => {
      expect(cellsBetween({ x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([
        { x: 0, y: 0 },
      ])
    })

    it('walks a straight horizontal run with no gaps', () => {
      expect(cellsBetween({ x: 0, y: 2 }, { x: 3, y: 2 })).toEqual([
        { x: 0, y: 2 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 3, y: 2 },
      ])
    })

    it('walks backwards as happily as forwards', () => {
      expect(cellsBetween({ x: 2, y: 0 }, { x: 0, y: 0 })).toEqual([
        { x: 2, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 0 },
      ])
    })

    it('leaves no diagonal gap on a fast sweep', () => {
      // The reason this function exists: pointer events under a quick drag land
      // far apart, and plotting only the samples leaves a dotted line.
      const cells = cellsBetween({ x: 0, y: 0 }, { x: 10, y: 6 })
      expect(cells[0]).toEqual({ x: 0, y: 0 })
      expect(cells[cells.length - 1]).toEqual({ x: 10, y: 6 })
      for (let i = 1; i < cells.length; i += 1) {
        const step =
          Math.abs(cells[i].x - cells[i - 1].x) +
          Math.abs(cells[i].y - cells[i - 1].y)
        // Every step is to a side- or diagonally-adjacent cell, never a jump.
        expect(step).toBeLessThanOrEqual(2)
        expect(step).toBeGreaterThan(0)
      }
    })

    it('terminates on a long run', () => {
      const cells = cellsBetween({ x: -50, y: -30 }, { x: 120, y: 90 })
      expect(cells[cells.length - 1]).toEqual({ x: 120, y: 90 })
    })
  })

  describe('cellsOfToken', () => {
    it('covers one cell for a medium token', () => {
      expect(cellsOfToken({ x: 3, y: 4 }, 1)).toEqual([{ x: 3, y: 4 }])
    })

    it('covers the whole block for a large one', () => {
      expect(cellsOfToken({ x: 1, y: 1 }, 2)).toEqual([
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
      ])
    })
  })
})
