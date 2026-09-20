import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeWorldId } from './sanitize'
import { initWorld, readTree } from './worldStore'
import {
  readEncounters,
  readSession,
  writeEncounters,
  writeSession,
} from './session'

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

describe('encounters file in the world folder', () => {
  let root: string
  let worldId: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-encounters-'))
    initWorld(root, 'Test World', '')
    worldId = encodeWorldId(root)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('returns null when nothing has been saved', () => {
    expect(readEncounters(worldId)).toBeNull()
  })

  it('round-trips prepared encounters through .dm/encounters.json', () => {
    const state = {
      version: 1,
      encounters: [
        {
          id: 'a1',
          name: 'Goblin Ambush',
          counts: { 'w1:Monsters/Goblin': 4 },
          party: ['Characters/Verron'],
          savedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }
    writeEncounters(worldId, state)
    expect(readEncounters(worldId)).toEqual(state)
  })

  it('keeps the in-progress fight and the prepared roster apart', () => {
    // Two files, not one: losing the encounter you prepared must not cost the
    // combat you are in the middle of, and vice versa.
    writeSession(worldId, {
      version: 1,
      combatants: [],
      activeId: null,
      round: 7,
    })
    writeEncounters(worldId, { version: 1, encounters: [] })

    expect(readSession(worldId)).toMatchObject({ round: 7 })
    expect(readEncounters(worldId)).toEqual({ version: 1, encounters: [] })
    expect(fs.existsSync(path.join(root, '.dm', 'session.json'))).toBe(true)
    expect(fs.existsSync(path.join(root, '.dm', 'encounters.json'))).toBe(true)
  })
})
