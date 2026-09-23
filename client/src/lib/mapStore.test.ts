import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRID_SIZE,
  addToken,
  dropMap,
  emptyMaps,
  findMap,
  forPlayers,
  gridExtent,
  moveToken,
  newMap,
  parseMaps,
  removeToken,
  gridFromImage,
  gridPixelSize,
  setGridSize,
  sortedMaps,
  updateToken,
  upsertMap,
  withMap,
} from './mapStore'
import type { BattleMap, Token } from './mapStore'
import { isRevealed, revealedCount, setCells } from './fog'

/**
 * `.dm/maps.json` travels with a world folder and is hand-editable, so the
 * parse has to be tolerant in the same way `parseEncounters` is. The two tests
 * that matter most are the one asserting a bad row is dropped rather than
 * taking the file with it, and `forPlayers` — which is a secrecy rule, not a
 * display preference.
 */

function token(over: Partial<Token> = {}): Token {
  return {
    id: 't1',
    label: 'Goblin',
    x: 0,
    y: 0,
    size: 'medium',
    colour: '#8b1a1a',
    ...over,
  }
}

function map(over: Partial<BattleMap> = {}): BattleMap {
  return newMap({
    id: 'm1',
    name: 'Cave',
    grid: { cols: 10, rows: 10, size: 70 },
    savedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  })
}

describe('mapStore', () => {
  describe('gridExtent', () => {
    it('is simply the counts that were set', () => {
      expect(
        gridExtent(map({ grid: { cols: 15, rows: 30, size: 70 } })),
      ).toEqual({ cols: 15, rows: 30 })
    })

    it('does not care what shape the background is', () => {
      // The grid is the map; the art is painted behind it.
      const m = map({
        grid: { cols: 15, rows: 30, size: 70 },
        imageWidth: 4000,
        imageHeight: 100,
      })
      expect(gridExtent(m)).toEqual({ cols: 15, rows: 30 })
    })

    it('never reports a zero-cell grid', () => {
      expect(gridExtent(map({ grid: { cols: 0, rows: 0, size: 70 } }))).toEqual(
        {
          cols: 1,
          rows: 1,
        },
      )
    })
  })

  describe('gridPixelSize', () => {
    it('is the counts times the cell size', () => {
      const m = map({ grid: { cols: 15, rows: 30, size: 50 } })
      expect(gridPixelSize(m)).toEqual({ width: 750, height: 1500 })
    })
  })

  describe('newMap', () => {
    it('sizes the fog layer to the grid', () => {
      const m = map({ grid: { cols: 10, rows: 5, size: 70 } })
      expect(m.fog.cols).toBe(10)
      expect(m.fog.rows).toBe(5)
    })
  })

  describe('parseMaps', () => {
    it('returns an empty file for anything unusable', () => {
      expect(parseMaps(null)).toEqual(emptyMaps())
      expect(parseMaps('nope')).toEqual(emptyMaps())
      expect(parseMaps({})).toEqual(emptyMaps())
      expect(parseMaps({ maps: 'no' })).toEqual(emptyMaps())
    })

    it('drops a bad row rather than the whole file', () => {
      const parsed = parseMaps({
        maps: [
          { id: 'good', name: 'Keep' },
          null,
          'nonsense',
          { id: '', name: 'No id' },
          { id: 'x', name: '   ' },
          { id: 'good', name: 'Duplicate id' },
        ],
      })
      expect(parsed.maps).toHaveLength(1)
      expect(parsed.maps[0].name).toBe('Keep')
    })

    it('defaults everything a row leaves out', () => {
      const m = parseMaps({ maps: [{ id: 'a', name: 'Bare' }] }).maps[0]
      expect(m.image).toBe('')
      expect(m.tokens).toEqual([])
      expect(m.fogEnabled).toBe(false)
      expect(m.grid.size).toBe(DEFAULT_GRID_SIZE)
      expect(m.imageWidth).toBeGreaterThan(0)
    })

    it('keeps a map whose background image is gone', () => {
      // rewriteImageRefs does not touch .dm/ JSON, so this is the ordinary
      // result of renaming an image — it must still open.
      const m = parseMaps({
        maps: [{ id: 'a', name: 'Cave', image: 'Maps/deleted.png' }],
      }).maps[0]
      expect(m.image).toBe('Maps/deleted.png')
    })

    it('drops bad tokens but keeps the good ones', () => {
      const m = parseMaps({
        maps: [
          {
            id: 'a',
            name: 'Cave',
            tokens: [
              { id: 't1', label: 'Goblin', x: 2, y: 3 },
              null,
              { label: 'No id' },
              { id: 't1', label: 'Duplicate' },
              { id: 't2', size: 'enormous' },
            ],
          },
        ],
      }).maps[0]
      expect(m.tokens).toHaveLength(2)
      expect(m.tokens[0]).toMatchObject({ id: 't1', x: 2, y: 3 })
      // An unknown size falls back rather than dropping the token.
      expect(m.tokens[1].size).toBe('medium')
    })

    it('omits optional token fields rather than storing empties', () => {
      const m = parseMaps({
        maps: [
          {
            id: 'a',
            name: 'C',
            tokens: [{ id: 't', image: '', combatantId: '' }],
          },
        ],
      }).maps[0]
      expect(m.tokens[0]).not.toHaveProperty('image')
      expect(m.tokens[0]).not.toHaveProperty('combatantId')
      expect(m.tokens[0]).not.toHaveProperty('hidden')
    })

    it('re-fits a fog layer saved against a different grid', () => {
      const small = setCells(
        { cols: 4, rows: 4, mask: '' },
        [{ x: 1, y: 1 }],
        true,
      )
      const m = parseMaps({
        maps: [
          {
            id: 'a',
            name: 'Cave',
            grid: { cols: 10, rows: 10, size: 70 },
            fog: small,
          },
        ],
      }).maps[0]
      expect(m.fog.cols).toBe(10)
      expect(isRevealed(m.fog, 1, 1)).toBe(true)
    })

    it('survives a fog layer that is not a fog layer', () => {
      const m = parseMaps({
        maps: [{ id: 'a', name: 'C', fog: 'wat' }],
      }).maps[0]
      expect(revealedCount(m.fog)).toBe(0)
    })
  })

  describe('legacy grid files', () => {
    it('defaults the counts for a file written before they existed', () => {
      const m = parseMaps({
        maps: [{ id: 'a', name: 'Old', grid: { size: 50 } }],
      }).maps[0]
      expect(m.grid.size).toBe(50)
      expect(gridExtent(m).cols).toBeGreaterThan(0)
      expect(gridExtent(m).rows).toBeGreaterThan(0)
    })

    it('reads the counts when they are there', () => {
      const m = parseMaps({
        maps: [
          { id: 'a', name: 'New', grid: { cols: 60, rows: 24, size: 70 } },
        ],
      }).maps[0]
      expect(gridExtent(m)).toEqual({ cols: 60, rows: 24 })
    })

    it('takes cellWidth as the cell size from the brief two-axis version', () => {
      const m = parseMaps({
        maps: [
          { id: 'a', name: 'Mid', grid: { cellWidth: 40, cellHeight: 90 } },
        ],
      }).maps[0]
      // An oblong grid cannot be said any more, so it squares off at the width.
      expect(m.grid.size).toBe(40)
    })
  })

  describe('save round trip', () => {
    it('survives a save and load with a tall grid intact', () => {
      const tall = setGridSize(map(), { cols: 15, rows: 30 })
      const file = upsertMap(emptyMaps(), tall)
      const back = parseMaps(JSON.parse(JSON.stringify(file)))
      expect(gridExtent(back.maps[0])).toEqual({ cols: 15, rows: 30 })
      expect(back.maps[0].grid.size).toBe(tall.grid.size)
    })

    it('keeps tokens and fog across the same round trip', () => {
      let m = map({ imageWidth: 700, imageHeight: 700, fogEnabled: true })
      m = addToken(m, token({ id: 't1', x: 3, y: 4 }))
      m = { ...m, fog: setCells(m.fog, [{ x: 2, y: 2 }], true) }
      const back = parseMaps(
        JSON.parse(JSON.stringify(upsertMap(emptyMaps(), m))),
      ).maps[0]
      expect(back.tokens[0]).toMatchObject({ id: 't1', x: 3, y: 4 })
      expect(isRevealed(back.fog, 2, 2)).toBe(true)
    })
  })

  describe('map list', () => {
    it('sorts newest first', () => {
      const file = {
        version: 1 as const,
        maps: [
          map({ id: 'old', savedAt: '2026-01-01T00:00:00.000Z' }),
          map({ id: 'new', savedAt: '2026-06-01T00:00:00.000Z' }),
        ],
      }
      expect(sortedMaps(file).map((m) => m.id)).toEqual(['new', 'old'])
    })

    it('upserts by id, replacing in place', () => {
      const first = map({ id: 'm1', name: 'Cave' })
      const file = upsertMap(emptyMaps(), first)
      const again = upsertMap(file, { ...first, name: 'Deeper Cave' })
      expect(again.maps).toHaveLength(1)
      expect(again.maps[0].name).toBe('Deeper Cave')
    })

    it('allows two maps to share a name', () => {
      const file = upsertMap(
        upsertMap(emptyMaps(), map({ id: 'a' })),
        map({ id: 'b' }),
      )
      expect(file.maps).toHaveLength(2)
    })

    it('drops and finds by id', () => {
      const file = upsertMap(emptyMaps(), map({ id: 'm1' }))
      expect(findMap(file, 'm1')?.name).toBe('Cave')
      expect(findMap(dropMap(file, 'm1'), 'm1')).toBeUndefined()
    })

    it('changes one map and leaves the others alone', () => {
      const file = upsertMap(
        upsertMap(emptyMaps(), map({ id: 'a' })),
        map({ id: 'b' }),
      )
      const next = withMap(file, 'a', (m) => ({ ...m, name: 'Renamed' }))
      expect(findMap(next, 'a')?.name).toBe('Renamed')
      expect(findMap(next, 'b')?.name).toBe('Cave')
    })
  })

  describe('tokens', () => {
    it('adds, updates and removes', () => {
      let m = addToken(map(), token({ id: 't1' }))
      expect(m.tokens).toHaveLength(1)
      m = updateToken(m, 't1', { label: 'Hobgoblin' })
      expect(m.tokens[0].label).toBe('Hobgoblin')
      expect(removeToken(m, 't1').tokens).toEqual([])
    })

    it('will not let an update rewrite the id', () => {
      const m = updateToken(addToken(map(), token({ id: 't1' })), 't1', {
        id: 'hijacked',
      })
      expect(m.tokens[0].id).toBe('t1')
    })

    it('clamps a move to the grid', () => {
      // 700x700 at 70px = a 10x10 grid.
      const m = addToken(map(), token({ id: 't1' }))
      expect(moveToken(m, 't1', 99, 99).tokens[0]).toMatchObject({ x: 9, y: 9 })
      expect(moveToken(m, 't1', -5, -5).tokens[0]).toMatchObject({ x: 0, y: 0 })
    })

    it('clamps a large token by its own footprint', () => {
      const m = addToken(map(), token({ id: 't1', size: 'huge' }))
      // A huge token spans 3 cells, so its top-left stops at 7 on a 10x10.
      expect(moveToken(m, 't1', 99, 99).tokens[0]).toMatchObject({ x: 7, y: 7 })
    })

    it('ignores a move for a token that is not there', () => {
      const m = map()
      expect(moveToken(m, 'ghost', 1, 1)).toEqual(m)
    })
  })

  describe('setGridSize', () => {
    it('stores exactly the counts you asked for', () => {
      // The bug this fixes: 15 x 30 used to be recomputed into 15 x 15 (or
      // into rectangles), because the image was allowed a vote.
      const m = setGridSize(map(), { cols: 15, rows: 30 })
      expect(gridExtent(m)).toEqual({ cols: 15, rows: 30 })
    })

    it('keeps cells square whatever the counts are', () => {
      const m = setGridSize(map(), { cols: 15, rows: 30 })
      // One size, so a cell cannot be anything but square.
      expect(m.grid.size).toBe(map().grid.size)
      expect(gridPixelSize(m)).toEqual({
        width: 15 * m.grid.size,
        height: 30 * m.grid.size,
      })
    })

    it('changes one axis without touching the other', () => {
      const m = setGridSize(map(), { cols: 15, rows: 30 })
      expect(gridExtent(setGridSize(m, { cols: 60 }))).toEqual({
        cols: 60,
        rows: 30,
      })
      expect(gridExtent(setGridSize(m, { rows: 24 }))).toEqual({
        cols: 15,
        rows: 24,
      })
    })

    it('keeps the fog reveals that still fit', () => {
      let m = map()
      m = { ...m, fog: setCells(m.fog, [{ x: 1, y: 1 }], true) }
      const next = setGridSize(m, { cols: 20, rows: 20 })
      expect(next.fog.cols).toBe(20)
      expect(isRevealed(next.fog, 1, 1)).toBe(true)
    })

    it('refuses a nonsense count', () => {
      expect(gridExtent(setGridSize(map(), { cols: 0 })).cols).toBe(1)
      expect(gridExtent(setGridSize(map(), { cols: -5 })).cols).toBe(1)
      // Nothing typed leaves the map alone rather than guessing.
      expect(setGridSize(map(), {})).toEqual(map())
    })
  })

  describe('gridFromImage', () => {
    it('reads the cell counts a tool export implies', () => {
      // A 60x24 map exported at 70px a cell.
      expect(gridFromImage(4200, 1680, 70)).toEqual({ cols: 60, rows: 24 })
    })

    it('falls back rather than dividing by zero', () => {
      expect(gridFromImage(700, 700, 0).cols).toBeGreaterThan(0)
    })
  })

  describe('save round trip', () => {
    it('survives a save and load with a tall grid intact', () => {
      const tall = setGridSize(map(), { cols: 15, rows: 30 })
      const file = upsertMap(emptyMaps(), tall)
      const back = parseMaps(JSON.parse(JSON.stringify(file)))
      expect(gridExtent(back.maps[0])).toEqual({ cols: 15, rows: 30 })
      expect(back.maps[0].grid.size).toBe(tall.grid.size)
    })

    it('keeps tokens and fog across the same round trip', () => {
      let m = map({ imageWidth: 700, imageHeight: 700, fogEnabled: true })
      m = addToken(m, token({ id: 't1', x: 3, y: 4 }))
      m = { ...m, fog: setCells(m.fog, [{ x: 2, y: 2 }], true) }
      const back = parseMaps(
        JSON.parse(JSON.stringify(upsertMap(emptyMaps(), m))),
      ).maps[0]
      expect(back.tokens[0]).toMatchObject({ id: 't1', x: 3, y: 4 })
      expect(isRevealed(back.fog, 2, 2)).toBe(true)
    })
  })

  describe('map list', () => {
    it('sorts newest first', () => {
      const file = {
        version: 1 as const,
        maps: [
          map({ id: 'old', savedAt: '2026-01-01T00:00:00.000Z' }),
          map({ id: 'new', savedAt: '2026-06-01T00:00:00.000Z' }),
        ],
      }
      expect(sortedMaps(file).map((m) => m.id)).toEqual(['new', 'old'])
    })

    it('upserts by id, replacing in place', () => {
      const first = map({ id: 'm1', name: 'Cave' })
      const file = upsertMap(emptyMaps(), first)
      const again = upsertMap(file, { ...first, name: 'Deeper Cave' })
      expect(again.maps).toHaveLength(1)
      expect(again.maps[0].name).toBe('Deeper Cave')
    })

    it('allows two maps to share a name', () => {
      const file = upsertMap(
        upsertMap(emptyMaps(), map({ id: 'a' })),
        map({ id: 'b' }),
      )
      expect(file.maps).toHaveLength(2)
    })

    it('drops and finds by id', () => {
      const file = upsertMap(emptyMaps(), map({ id: 'm1' }))
      expect(findMap(file, 'm1')?.name).toBe('Cave')
      expect(findMap(dropMap(file, 'm1'), 'm1')).toBeUndefined()
    })

    it('changes one map and leaves the others alone', () => {
      const file = upsertMap(
        upsertMap(emptyMaps(), map({ id: 'a' })),
        map({ id: 'b' }),
      )
      const next = withMap(file, 'a', (m) => ({ ...m, name: 'Renamed' }))
      expect(findMap(next, 'a')?.name).toBe('Renamed')
      expect(findMap(next, 'b')?.name).toBe('Cave')
    })
  })

  describe('tokens', () => {
    it('adds, updates and removes', () => {
      let m = addToken(map(), token({ id: 't1' }))
      expect(m.tokens).toHaveLength(1)
      m = updateToken(m, 't1', { label: 'Hobgoblin' })
      expect(m.tokens[0].label).toBe('Hobgoblin')
      expect(removeToken(m, 't1').tokens).toEqual([])
    })

    it('will not let an update rewrite the id', () => {
      const m = updateToken(addToken(map(), token({ id: 't1' })), 't1', {
        id: 'hijacked',
      })
      expect(m.tokens[0].id).toBe('t1')
    })

    it('clamps a move to the grid', () => {
      // 700x700 at 70px = a 10x10 grid.
      const m = addToken(map(), token({ id: 't1' }))
      expect(moveToken(m, 't1', 99, 99).tokens[0]).toMatchObject({ x: 9, y: 9 })
      expect(moveToken(m, 't1', -5, -5).tokens[0]).toMatchObject({ x: 0, y: 0 })
    })

    it('clamps a large token by its own footprint', () => {
      const m = addToken(map(), token({ id: 't1', size: 'huge' }))
      // A huge token spans 3 cells, so its top-left stops at 7 on a 10x10.
      expect(moveToken(m, 't1', 99, 99).tokens[0]).toMatchObject({ x: 7, y: 7 })
    })

    it('ignores a move for a token that is not there', () => {
      const m = map()
      expect(moveToken(m, 'ghost', 1, 1)).toEqual(m)
    })
  })

  describe('forPlayers', () => {
    it('removes hidden tokens from the payload entirely', () => {
      const m = addToken(
        addToken(map(), token({ id: 'seen' })),
        token({ id: 'ambush', hidden: true }),
      )
      const shown = forPlayers(m)
      expect(shown.tokens.map((t) => t.id)).toEqual(['seen'])
      // The point of the rule: nothing about the hidden token may survive into
      // what the players are sent, not even flagged as hidden.
      expect(JSON.stringify(shown)).not.toContain('ambush')
    })

    it('leaves the original untouched', () => {
      const m = addToken(map(), token({ id: 'ambush', hidden: true }))
      forPlayers(m)
      expect(m.tokens).toHaveLength(1)
    })
  })
})
