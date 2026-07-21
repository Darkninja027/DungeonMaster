import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { noteSelfWrite, startWatching, stopWatching } from './watcher'
import type { ChangeBatch } from './watcher'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// debounce is 300ms; leave headroom for fs.watch event delivery
const SETTLE_MS = 800

describe('watcher against a real temp folder', () => {
  let root: string
  let batches: Array<ChangeBatch>

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-watch-'))
    batches = []
    startWatching(root, 'w1', (b) => batches.push(b))
  })

  afterEach(() => {
    stopWatching()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('emits one debounced batch for an external article write', async () => {
    fs.writeFileSync(path.join(root, 'Strahd.md'), 'external edit')
    await sleep(SETTLE_MS)
    expect(batches).toHaveLength(1)
    expect(batches[0].articleIds).toEqual(['Strahd'])
    expect(batches[0].worldId).toBe('w1')
  })

  it('collapses a burst of events into one batch', async () => {
    fs.writeFileSync(path.join(root, 'A.md'), '1')
    fs.writeFileSync(path.join(root, 'B.md'), '2')
    fs.writeFileSync(path.join(root, 'A.md'), '3')
    await sleep(SETTLE_MS)
    expect(batches).toHaveLength(1)
    expect(batches[0].articleIds.sort()).toEqual(['A', 'B'])
  })

  it('suppresses the app’s own writes via the self-write ledger', async () => {
    const abs = path.join(root, 'Self.md')
    noteSelfWrite(abs)
    fs.writeFileSync(abs, 'app write')
    await sleep(SETTLE_MS)
    expect(batches).toHaveLength(0)
  })

  it('ignores atomic temp files and dot-prefixed paths', async () => {
    fs.writeFileSync(path.join(root, `X.md.tmp-${process.pid}`), 'x')
    fs.mkdirSync(path.join(root, '.dm'))
    fs.writeFileSync(path.join(root, '.dm', 'session.json'), '{}')
    await sleep(SETTLE_MS)
    expect(batches).toHaveLength(0)
  })

  it('classifies _images changes separately from articles', async () => {
    fs.mkdirSync(path.join(root, '_images'))
    fs.writeFileSync(path.join(root, '_images', 'map.png'), 'x')
    await sleep(SETTLE_MS)
    expect(batches.length).toBeGreaterThanOrEqual(1)
    expect(batches[0].imagesChanged).toBe(true)
    expect(batches[0].articleIds).toEqual([])
  })
})
