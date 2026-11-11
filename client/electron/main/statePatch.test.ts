import { describe, expect, it } from 'vitest'
import { applyStatePatch } from './statePatch'

/**
 * The invariant these exist for: a patch touches ONE entry and leaves every
 * other one exactly as it was. That is the whole reason the patch protocol
 * replaced whole-file writes, so the sibling-preservation assertions below are
 * the point of the file rather than incidental detail.
 */
describe('applyStatePatch', () => {
  const file = {
    version: 1,
    maps: [
      { id: 'a', name: 'Cave', tokens: [] },
      { id: 'b', name: 'Tavern', tokens: [] },
      { id: 'c', name: 'Road', tokens: [] },
    ],
  }

  it('replaces one entry in place, leaving its siblings untouched', () => {
    const next = applyStatePatch(file, 'maps', {
      entry: { id: 'b', name: 'The Tavern', tokens: [{ id: 't1' }] },
    })

    expect(next.maps).toEqual([
      { id: 'a', name: 'Cave', tokens: [] },
      { id: 'b', name: 'The Tavern', tokens: [{ id: 't1' }] },
      { id: 'c', name: 'Road', tokens: [] },
    ])
  })

  it('keeps the entry at its original index rather than moving it to the end', () => {
    // Order is what the map list renders. A patch that re-ordered the list
    // would make the rail jump under the DM every time a goblin moved.
    const next = applyStatePatch(file, 'maps', {
      entry: { id: 'a', name: 'Cave II' },
    })
    expect((next.maps as Array<{ id: string }>).map((m) => m.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('appends an entry whose id is new', () => {
    const next = applyStatePatch(file, 'maps', { entry: { id: 'd', name: 'Keep' } })
    expect(next.maps).toHaveLength(4)
    expect((next.maps as Array<{ id: string }>)[3].id).toBe('d')
  })

  it('removes by id, leaving the rest', () => {
    const next = applyStatePatch(file, 'maps', { removeId: 'b' })
    expect((next.maps as Array<{ id: string }>).map((m) => m.id)).toEqual([
      'a',
      'c',
    ])
  })

  it('does not mutate the file it was given', () => {
    // Main holds one authoritative object per world; mutating it in place would
    // make the `rev` comparison meaningless, since readers would see the change
    // before the revision that announced it.
    const before = JSON.stringify(file)
    applyStatePatch(file, 'maps', { entry: { id: 'a', name: 'Changed' } })
    expect(JSON.stringify(file)).toBe(before)
  })

  it('carries through keys it does not understand', () => {
    const next = applyStatePatch({ version: 1, maps: [], future: 'keep me' }, 'maps', {
      entry: { id: 'a' },
    })
    expect(next.version).toBe(1)
    expect(next.future).toBe('keep me')
  })

  describe('tolerance, so one bad file never blocks saving', () => {
    it('treats a missing file as empty', () => {
      expect(applyStatePatch(null, 'maps', { entry: { id: 'a' } })).toEqual({
        maps: [{ id: 'a' }],
      })
    })

    it('treats a non-object file as empty', () => {
      expect(applyStatePatch('nonsense', 'maps', { entry: { id: 'a' } })).toEqual(
        { maps: [{ id: 'a' }] },
      )
    })

    it('treats a missing or non-array list as empty', () => {
      expect(
        applyStatePatch({ version: 1, maps: 'broken' }, 'maps', {
          entry: { id: 'a' },
        }).maps,
      ).toEqual([{ id: 'a' }])
    })

    it('ignores an entry with no usable id rather than writing an unaddressable row', () => {
      expect(applyStatePatch(file, 'maps', { entry: { name: 'no id' } }).maps)
        .toHaveLength(3)
      expect(applyStatePatch(file, 'maps', { entry: { id: '' } }).maps)
        .toHaveLength(3)
      expect(applyStatePatch(file, 'maps', { entry: null }).maps).toHaveLength(3)
    })

    it('skips rows on disk that have no id when matching', () => {
      const messy = { maps: [{ noId: true }, { id: 'a', name: 'Cave' }] }
      const next = applyStatePatch(messy, 'maps', {
        entry: { id: 'a', name: 'Cave II' },
      })
      expect(next.maps).toEqual([{ noId: true }, { id: 'a', name: 'Cave II' }])
    })
  })

  it('works for any keyed list, not just maps', () => {
    // The same mechanism guards .dm/session.json, where losing the fight in
    // progress is worse than losing a token position.
    const combat = { version: 1, combatants: [{ id: 'x', hp: 10 }] }
    const next = applyStatePatch(combat, 'combatants', {
      entry: { id: 'x', hp: 4 },
    })
    expect(next.combatants).toEqual([{ id: 'x', hp: 4 }])
  })
})
