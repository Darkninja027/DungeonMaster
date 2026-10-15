import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Point userData at a scratch folder, never the real profile. trashItem is
// stubbed to a plain delete so the test can see the file go.
let userData = ''
const trashItem = vi.fn((file: string) => {
  fs.rmSync(file)
  return Promise.resolve()
})
vi.mock('electron', () => ({
  app: { getPath: () => userData },
  shell: { trashItem: (file: string) => trashItem(file) },
}))

const { readDescribeLists, writeDescribeList, MAX_DESCRIBE_BYTES } =
  await import('./describeLists')

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-describe-'))
  trashItem.mockClear()
})

afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('describe lists', () => {
  it('reads null for both kinds on a fresh install', () => {
    expect(readDescribeLists()).toEqual({ names: null, details: null })
  })

  it('round-trips each kind into its own .md file', async () => {
    await writeDescribeList('names', '# NPC Names\n')
    await writeDescribeList('details', '# Buildings\n')
    expect(readDescribeLists()).toEqual({
      names: '# NPC Names\n',
      details: '# Buildings\n',
    })
    expect(
      fs.readFileSync(path.join(userData, 'describe-names.md'), 'utf8'),
    ).toBe('# NPC Names\n')
  })

  it('resets to the built-ins via the Recycle Bin, and tolerates no file', async () => {
    await writeDescribeList('names', 'x')
    await writeDescribeList('names', null)
    expect(trashItem).toHaveBeenCalledOnce()
    expect(readDescribeLists().names).toBeNull()
    await writeDescribeList('names', null)
    expect(trashItem).toHaveBeenCalledOnce()
  })

  it('refuses a kind that is not on the list, before touching disk', async () => {
    // The kind arrives over IPC and becomes part of a filename.
    await expect(writeDescribeList('../config', 'x')).rejects.toThrow(
      /Unknown describe list/,
    )
    await expect(writeDescribeList('names', 42)).rejects.toThrow(/text/)
    expect(fs.readdirSync(userData)).toEqual([])
  })

  it('refuses an oversize payload and keeps the existing file', async () => {
    await writeDescribeList('details', 'keep me')
    await expect(
      writeDescribeList('details', 'x'.repeat(MAX_DESCRIBE_BYTES + 1)),
    ).rejects.toThrow(/large/)
    expect(readDescribeLists().details).toBe('keep me')
  })
})
