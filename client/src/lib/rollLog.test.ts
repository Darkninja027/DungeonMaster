import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearRollLog,
  logRoll,
  mergeRoll,
  rollLogSnapshot,
} from './rollLog'
import type { RollEntry } from './rollLog'

/**
 * The cross-window merge path. `logRoll` records a roll made in this window;
 * `mergeRoll` applies one that arrived from another BrowserWindow. The two must
 * agree on ordering and must never double-count, because a window can be told
 * about a roll it already has (a relay retry, or its own entry echoing back).
 *
 * There is no window.dmApi in this environment, so logRoll's broadcast is inert
 * by design (see `bridged` in rollLog.ts) — these cover the store, not IPC.
 */

const entry = (over: Partial<RollEntry> = {}): RollEntry => ({
  id: 'id',
  notation: '1d20',
  total: 10,
  detail: '10',
  at: 1000,
  ...over,
})

describe('roll log merge', () => {
  beforeEach(() => clearRollLog())

  it('dedupes an entry that arrives twice', () => {
    const e = entry({ id: 'abc' })
    mergeRoll(e)
    mergeRoll(e)
    expect(rollLogSnapshot()).toHaveLength(1)
  })

  it('orders newest first regardless of arrival order', () => {
    mergeRoll(entry({ id: 'old', at: 100 }))
    mergeRoll(entry({ id: 'new', at: 900 }))
    mergeRoll(entry({ id: 'mid', at: 500 }))
    expect(rollLogSnapshot().map((e) => e.id)).toEqual(['new', 'mid', 'old'])
  })

  it('keeps a locally logged roll and a relayed one in one list', () => {
    logRoll({ notation: '1d20', total: 11, detail: '11' })
    mergeRoll(entry({ id: 'remote', at: Date.now() + 5000 }))
    const all = rollLogSnapshot()
    expect(all).toHaveLength(2)
    expect(all[0].id).toBe('remote')
  })

  it('a relayed roll echoing back to its origin is not duplicated', () => {
    logRoll({ notation: '2d6', total: 7, detail: '3 + 4' })
    const mine = rollLogSnapshot()[0]
    mergeRoll(mine)
    expect(rollLogSnapshot()).toHaveLength(1)
  })

  it('caps the log and drops the oldest entries', () => {
    for (let i = 0; i < 210; i++) {
      mergeRoll(entry({ id: `e${i}`, at: i }))
    }
    const all = rollLogSnapshot()
    expect(all).toHaveLength(200)
    expect(all[0].id).toBe('e209')
    expect(all.some((e) => e.id === 'e0')).toBe(false)
  })

  it('clear empties the log', () => {
    logRoll({ notation: '1d4', total: 2, detail: '2' })
    clearRollLog()
    expect(rollLogSnapshot()).toHaveLength(0)
  })
})
