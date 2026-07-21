import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeWorldId } from './sanitize'
import { initWorld, readTree } from './worldStore'
import { readSession, writeSession } from './session'

describe('session file in the world folder', () => {
  let root: string
  let worldId: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-session-'))
    initWorld(root, 'Test World', '')
    worldId = encodeWorldId(root)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('returns null when nothing has been saved', () => {
    expect(readSession(worldId)).toBeNull()
  })

  it('round-trips state through .dm/session.json', () => {
    const state = { version: 1, combatants: [], activeId: null, round: 2 }
    writeSession(worldId, state)
    expect(readSession(worldId)).toEqual(state)
    expect(fs.existsSync(path.join(root, '.dm', 'session.json'))).toBe(true)
  })

  it('stays invisible in the article tree', () => {
    writeSession(worldId, { version: 1 })
    const tree = readTree(root)
    expect(tree.folders).toHaveLength(0)
    expect(tree.articles).toHaveLength(0)
  })

  it('returns null for a corrupt file instead of throwing', () => {
    fs.mkdirSync(path.join(root, '.dm'))
    fs.writeFileSync(path.join(root, '.dm', 'session.json'), '{not json')
    expect(readSession(worldId)).toBeNull()
  })

  it('refuses unreasonably large payloads', () => {
    expect(() =>
      writeSession(worldId, { blob: 'x'.repeat(300 * 1024) }),
    ).toThrow(/large/)
  })
})
