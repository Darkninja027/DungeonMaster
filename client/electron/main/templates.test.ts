import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// templates.ts resolves its path from Electron's userData dir at call time, so
// point that at a scratch folder instead of the real profile.
let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData },
}))

const { readTemplates, writeTemplates, MAX_TEMPLATES_BYTES } = await import(
  './templates'
)

function templatesFile(): string {
  return path.join(userData, 'templates.json')
}

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-templates-'))
})

afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('readTemplates', () => {
  it('returns null when the file is missing', () => {
    // The cold-start path: every install begins here, and it must read as "no
    // templates yet" rather than throwing before the app has a window.
    expect(readTemplates()).toBeNull()
  })

  it('returns null for a malformed file, leaving it untouched', () => {
    const corrupt = '{"version": 1, "templates": [{"id": "spe'
    fs.writeFileSync(templatesFile(), corrupt)

    expect(readTemplates()).toBeNull()
    // Reading must never repair or clear the file — a hand-editor who made a
    // typo gets their work back, not an empty object.
    expect(fs.readFileSync(templatesFile(), 'utf8')).toBe(corrupt)
  })
})

describe('writeTemplates', () => {
  it('round-trips a store, creating the userData folder if absent', () => {
    fs.rmSync(userData, { recursive: true, force: true })
    const store = {
      version: 1,
      templates: [{ id: 'shop', name: 'Shop', description: '', body: '# Shop' }],
    }

    writeTemplates(store)

    expect(readTemplates()).toEqual(store)
  })

  it('replaces the file wholesale rather than splicing keys', () => {
    writeTemplates({ version: 1, templates: [{ id: 'a', name: 'A' }] })
    writeTemplates({ version: 1, templates: [{ id: 'b', name: 'B' }] })

    // A key splice would leave 'a' behind and make deletion impossible.
    expect(readTemplates()).toEqual({
      version: 1,
      templates: [{ id: 'b', name: 'B' }],
    })
  })

  it('refuses an oversize payload without touching the existing file', () => {
    const good = { version: 1, templates: [{ id: 'keep', name: 'Keep' }] }
    writeTemplates(good)

    const huge = {
      version: 1,
      templates: [{ id: 'big', name: 'Big', body: 'x'.repeat(MAX_TEMPLATES_BYTES) }],
    }

    expect(() => writeTemplates(huge)).toThrow(
      'Template payload is unreasonably large — refusing to save.',
    )
    // The size check has to precede the write: a truncating oversize save would
    // lose every template the user had.
    expect(readTemplates()).toEqual(good)
  })

  it('resolves userData at call time, not at module load', () => {
    writeTemplates({ version: 1, templates: [{ id: 'first', name: 'First' }] })
    const firstDir = userData

    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-templates-second-'))
    try {
      writeTemplates({ version: 1, templates: [{ id: 'second', name: 'Second' }] })

      expect(readTemplates()).toEqual({
        version: 1,
        templates: [{ id: 'second', name: 'Second' }],
      })
      expect(fs.existsSync(path.join(firstDir, 'templates.json'))).toBe(true)
    } finally {
      fs.rmSync(userData, { recursive: true, force: true })
      userData = firstDir
    }
  })
})
