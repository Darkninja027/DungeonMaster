import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// images.ts imports net/protocol/shell from electron, which won't load under
// plain vitest. Stub it so the filesystem logic is testable; trashItem is a spy
// so deletes can be asserted without actually touching the Recycle Bin.
const trashItem = vi.fn(() => Promise.resolve())
const showItemInFolder = vi.fn()
vi.mock('electron', () => ({
  shell: {
    trashItem: (abs: string) => trashItem(abs),
    showItemInFolder: (abs: string) => showItemInFolder(abs),
  },
  net: {},
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
}))

const { encodeWorldId } = await import('./sanitize')
const { createArticle, getArticle, initWorld } = await import('./worldStore')
const {
  countImagesIn,
  createImageFolder,
  deleteImage,
  deleteImageFolder,
  listImageTree,
  moveImage,
  moveImageFolder,
  renameImage,
  renameImageFolder,
  revealImage,
  rewriteImageRefsInText,
  uploadImage,
} = await import('./images')

const PNG = new ArrayBuffer(8)

describe('rewriteImageRefsInText', () => {
  const rewrite = (text: string) =>
    rewriteImageRefsInText(text, 'Maps/elf guy.png', 'Portraits/elf guy.png')

  it('rewrites the encoded form the picker inserts', () => {
    expect(rewrite('![x](_images/Maps/elf%20guy.png)')).toBe(
      '![x](_images/Portraits/elf%20guy.png)',
    )
  })

  it('leaves a hand-typed plain path plain', () => {
    // Churning Obsidian-authored text into percent-escapes would make noisy
    // diffs in the user's git repo for no benefit.
    expect(rewrite('![x](_images/Maps/elf guy.png)')).toBe(
      '![x](_images/Portraits/elf guy.png)',
    )
  })

  it('rewrites a bare statblock image: line', () => {
    expect(rewrite('image: _images/Maps/elf guy.png')).toBe(
      'image: _images/Portraits/elf guy.png',
    )
  })

  it('rewrites picker markdown on a statblock image: line', () => {
    expect(rewrite('image: ![x](_images/Maps/elf%20guy.png)')).toBe(
      'image: ![x](_images/Portraits/elf%20guy.png)',
    )
  })

  it('preserves the image option fragment', () => {
    expect(rewrite('![x](_images/Maps/elf%20guy.png#right&w=45%)')).toBe(
      '![x](_images/Portraits/elf%20guy.png#right&w=45%)',
    )
    expect(rewrite('image: _images/Maps/elf guy.png#noframe')).toBe(
      'image: _images/Portraits/elf guy.png#noframe',
    )
  })

  it('matches case-insensitively (Windows paths)', () => {
    expect(rewrite('![x](_images/maps/ELF GUY.png)')).toBe(
      '![x](_images/Portraits/elf guy.png)',
    )
  })

  it('rewrites the angle-bracket form markdown needs for plain spaces', () => {
    // `![x](_images/a b.png)` never parses as an image — an unescaped space ends
    // the link destination. Authors who want a plain path must write <...>, and
    // the brackets sit outside the matched path so it rewrites cleanly.
    expect(rewrite('![x](<_images/Maps/elf guy.png>)')).toBe(
      '![x](<_images/Portraits/elf guy.png>)',
    )
  })

  it('keeps a trailing link title and trailing prose out of the path', () => {
    // The path run has to allow spaces for unencoded filenames, so it can
    // over-reach; whatever follows the real filename must survive untouched.
    expect(rewrite('![x](_images/Maps/elf guy.png "The Elf")')).toBe(
      '![x](_images/Portraits/elf guy.png "The Elf")',
    )
    expect(rewrite('See _images/Maps/elf guy.png for the elf.')).toBe(
      'See _images/Portraits/elf guy.png for the elf.',
    )
  })

  it('respects the path boundary and leaves unrelated paths alone', () => {
    expect(rewrite('![x](_images/Maps2/elf guy.png)')).toBe(
      '![x](_images/Maps2/elf guy.png)',
    )
    expect(rewrite('![x](_images/other.png)')).toBe('![x](_images/other.png)')
  })

  it('rewrites descendants on a folder rename, keeping their casing', () => {
    const out = rewriteImageRefsInText(
      '![a](_images/Maps/City/Tavern.PNG) and ![b](_images/Maps)',
      'Maps',
      'Regions',
    )
    expect(out).toBe(
      '![a](_images/Regions/City/Tavern.PNG) and ![b](_images/Regions)',
    )
  })

  it('rewrites a remote URL that happens to contain the path', () => {
    // The regex is deliberately shape-agnostic, so it matches the tail of an
    // absolute URL too. Pinned so the behaviour is a decision, not an accident.
    expect(rewrite('![x](https://example.com/_images/Maps/elf guy.png)')).toBe(
      '![x](https://example.com/_images/Portraits/elf guy.png)',
    )
  })
})

describe('images against a real temp world', () => {
  let root: string
  let worldId: string

  beforeEach(() => {
    trashItem.mockClear()
    showItemInFolder.mockClear()
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-img-'))
    initWorld(root, 'Test World', 'a test')
    worldId = encodeWorldId(root)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  const imagesPath = (...parts: Array<string>) =>
    path.join(root, '_images', ...parts)

  describe('listImageTree', () => {
    it('is empty when the world has no _images folder', () => {
      expect(listImageTree(worldId)).toEqual({ folders: [], images: [] })
    })

    it('walks nested folders and reports ids relative to _images', () => {
      createImageFolder(worldId, null, 'Maps')
      createImageFolder(worldId, 'Maps', 'City')
      uploadImage(worldId, 'tavern.png', PNG, 'Maps/City')
      uploadImage(worldId, 'root.png', PNG)

      const tree = listImageTree(worldId)
      expect(tree.folders.map((f) => f.id)).toEqual(['Maps', 'Maps/City'])
      expect(tree.folders[1].parentFolderId).toBe('Maps')
      expect(tree.images.map((i) => i.id)).toEqual([
        'Maps/City/tavern.png',
        'root.png',
      ])

      const nested = tree.images[0]
      expect(nested.fileName).toBe('tavern.png')
      expect(nested.folderId).toBe('Maps/City')
      expect(nested.relPath).toBe('_images/Maps/City/tavern.png')
      expect(nested.contentType).toBe('image/png')
      expect(tree.images[1].folderId).toBeNull()
    })

    it('lists folders that are still empty', () => {
      createImageFolder(worldId, null, 'Handouts')
      expect(listImageTree(worldId).folders.map((f) => f.id)).toEqual([
        'Handouts',
      ])
    })

    it('skips non-image files and dotfiles', () => {
      fs.mkdirSync(imagesPath(), { recursive: true })
      fs.writeFileSync(imagesPath('notes.txt'), 'x')
      fs.writeFileSync(imagesPath('.hidden.png'), 'x')
      fs.writeFileSync(imagesPath('real.png'), 'x')
      expect(listImageTree(worldId).images.map((i) => i.id)).toEqual([
        'real.png',
      ])
    })

    it('percent-encodes the url one segment at a time', () => {
      // Whole-path encodeURIComponent would emit %2F for the separators, which
      // Obsidian would not resolve.
      createImageFolder(worldId, null, 'Maps North')
      uploadImage(worldId, 'elf guy.png', PNG, 'Maps North')
      const image = listImageTree(worldId).images[0]
      expect(image.url).toBe(
        `world://${worldId}/_images/Maps%20North/elf%20guy.png`,
      )
      expect(image.encodedRelPath).toBe('_images/Maps%20North/elf%20guy.png')
    })
  })

  describe('uploadImage', () => {
    it('writes into a nested folder, creating it if needed', () => {
      const info = uploadImage(worldId, 'city.png', PNG, 'Maps/Regions')
      expect(info.id).toBe('Maps/Regions/city.png')
      expect(fs.existsSync(imagesPath('Maps', 'Regions', 'city.png'))).toBe(
        true,
      )
    })

    it('ignores any directory part in the supplied file name', () => {
      const info = uploadImage(worldId, '../../escape.png', PNG)
      expect(info.id).toBe('escape.png')
      expect(fs.existsSync(imagesPath('escape.png'))).toBe(true)
    })

    it('dedupes case-insensitively rather than overwriting', () => {
      uploadImage(worldId, 'MAP.PNG', PNG)
      const second = uploadImage(worldId, 'map.png', PNG)
      expect(second.id).toBe('map (2).png')
      expect(fs.existsSync(imagesPath('MAP.PNG'))).toBe(true)
    })

    it('rejects non-image extensions and oversized files', () => {
      expect(() => uploadImage(worldId, 'evil.txt', PNG)).toThrow(/allowed/)
      expect(() =>
        uploadImage(worldId, 'huge.png', new ArrayBuffer(21 * 1024 * 1024)),
      ).toThrow(/20 MB/)
    })

    it('accepts svg', () => {
      expect(uploadImage(worldId, 'sigil.svg', PNG).contentType).toBe(
        'image/svg+xml',
      )
    })

    it('refuses a folder id that escapes _images', () => {
      expect(() => uploadImage(worldId, 'x.png', PNG, '../NPCs')).toThrow()
      expect(() =>
        uploadImage(worldId, 'x.png', PNG, '../../outside'),
      ).toThrow()
    })
  })

  describe('createImageFolder', () => {
    it('creates nested folders and works with no _images yet', () => {
      expect(createImageFolder(worldId, null, 'Maps').id).toBe('Maps')
      expect(createImageFolder(worldId, 'Maps', 'City').id).toBe('Maps/City')
      expect(fs.existsSync(imagesPath('Maps', 'City'))).toBe(true)
    })

    it('rejects duplicates case-insensitively', () => {
      createImageFolder(worldId, null, 'Maps')
      expect(() => createImageFolder(worldId, null, 'maps')).toThrow(/exists/)
    })

    it('validates the name as a single segment', () => {
      expect(() => createImageFolder(worldId, null, 'a/b')).toThrow()
      expect(() => createImageFolder(worldId, null, 'CON')).toThrow(/reserved/)
      expect(() => createImageFolder(worldId, null, '_images')).toThrow()
    })
  })

  describe('folder rename and move', () => {
    beforeEach(() => {
      createImageFolder(worldId, null, 'Maps')
      uploadImage(worldId, 'city.png', PNG, 'Maps')
    })

    it('renames, carrying its files, and repoints references', async () => {
      createArticle({
        worldId,
        title: 'Waterdeep',
        content: '![c](_images/Maps/city.png)',
      })
      const { id } = await renameImageFolder(worldId, 'Maps', 'Regions')
      expect(id).toBe('Regions')
      expect(fs.existsSync(imagesPath('Regions', 'city.png'))).toBe(true)
      expect(getArticle(worldId, 'Waterdeep').content).toBe(
        '![c](_images/Regions/city.png)',
      )
    })

    it('allows a case-only rename', async () => {
      await renameImageFolder(worldId, 'Maps', 'MAPS')
      expect(listImageTree(worldId).folders[0].name).toBe('MAPS')
    })

    it('rejects a rename onto an existing sibling', async () => {
      createImageFolder(worldId, null, 'Handouts')
      await expect(
        renameImageFolder(worldId, 'Maps', 'Handouts'),
      ).rejects.toThrow(/exists/)
    })

    it('refuses to move a folder into its own descendant', async () => {
      createImageFolder(worldId, 'Maps', 'City')
      await expect(
        moveImageFolder(worldId, 'Maps', 'Maps/City'),
      ).rejects.toThrow(/into itself/)
    })

    it('moves into a sibling and repoints references', async () => {
      createImageFolder(worldId, null, 'Art')
      createArticle({
        worldId,
        title: 'Notes',
        content: 'image: _images/Maps/city.png',
      })
      const { id } = await moveImageFolder(worldId, 'Maps', 'Art')
      expect(id).toBe('Art/Maps')
      expect(fs.existsSync(imagesPath('Art', 'Maps', 'city.png'))).toBe(true)
      expect(getArticle(worldId, 'Notes').content).toBe(
        'image: _images/Art/Maps/city.png',
      )
    })

    it('is a no-op when moving into the folder it already sits in', async () => {
      const { id } = await moveImageFolder(worldId, 'Maps', null)
      expect(id).toBe('Maps')
    })
  })

  describe('renameImage', () => {
    beforeEach(() => {
      createImageFolder(worldId, null, 'Maps')
      uploadImage(worldId, 'city.png', PNG, 'Maps')
    })

    it('renames and repoints references', async () => {
      createArticle({
        worldId,
        title: 'Waterdeep',
        content: '![c](_images/Maps/city.png)',
      })
      const info = await renameImage(worldId, 'Maps/city.png', 'harbour.png')
      expect(info.id).toBe('Maps/harbour.png')
      expect(getArticle(worldId, 'Waterdeep').content).toBe(
        '![c](_images/Maps/harbour.png)',
      )
    })

    it('keeps the original extension when none is given', async () => {
      const info = await renameImage(worldId, 'Maps/city.png', 'harbour')
      expect(info.id).toBe('Maps/harbour.png')
    })

    it('refuses a non-image extension', async () => {
      // Otherwise the file drops out of listImageTree and vanishes from the app
      // while still sitting on disk.
      await expect(
        renameImage(worldId, 'Maps/city.png', 'city.txt'),
      ).rejects.toThrow(/extension/)
    })

    it('rejects a collision but allows a case-only rename', async () => {
      uploadImage(worldId, 'harbour.png', PNG, 'Maps')
      await expect(
        renameImage(worldId, 'Maps/city.png', 'harbour.png'),
      ).rejects.toThrow(/exists/)
      const info = await renameImage(worldId, 'Maps/city.png', 'CITY.png')
      expect(info.fileName).toBe('CITY.png')
    })
  })

  describe('moveImage', () => {
    beforeEach(() => {
      createImageFolder(worldId, null, 'Maps')
      createImageFolder(worldId, null, 'Art')
      uploadImage(worldId, 'city.png', PNG, 'Maps')
    })

    it('moves between folders and repoints references', async () => {
      createArticle({
        worldId,
        title: 'Notes',
        content: '![c](_images/Maps/city.png)',
      })
      const info = await moveImage(worldId, 'Maps/city.png', 'Art')
      expect(info.id).toBe('Art/city.png')
      expect(getArticle(worldId, 'Notes').content).toBe(
        '![c](_images/Art/city.png)',
      )
    })

    it('moves to the _images root', async () => {
      const info = await moveImage(worldId, 'Maps/city.png', null)
      expect(info.id).toBe('city.png')
      expect(info.folderId).toBeNull()
    })

    it('is a no-op within the same folder', async () => {
      const info = await moveImage(worldId, 'Maps/city.png', 'Maps')
      expect(info.id).toBe('Maps/city.png')
    })

    it('rejects a collision in the target folder', async () => {
      uploadImage(worldId, 'city.png', PNG, 'Art')
      await expect(moveImage(worldId, 'Maps/city.png', 'Art')).rejects.toThrow(
        /exists/,
      )
    })
  })

  describe('deletes', () => {
    it('sends an image to the trash', async () => {
      uploadImage(worldId, 'city.png', PNG, 'Maps')
      await deleteImage(worldId, 'Maps/city.png')
      expect(trashItem).toHaveBeenCalledWith(imagesPath('Maps', 'city.png'))
    })

    it('sends a folder to the trash', async () => {
      createImageFolder(worldId, null, 'Maps')
      await deleteImageFolder(worldId, 'Maps')
      expect(trashItem).toHaveBeenCalledWith(imagesPath('Maps'))
    })

    it('refuses paths that escape the images folder', async () => {
      await expect(deleteImage(worldId, '../world.json')).rejects.toThrow()
      await expect(
        deleteImageFolder(worldId, '../../outside'),
      ).rejects.toThrow()
      await expect(deleteImageFolder(worldId, '')).rejects.toThrow()
      expect(trashItem).not.toHaveBeenCalled()
    })
  })

  describe('revealImage', () => {
    it('reveals an image and a folder in the file manager', () => {
      createImageFolder(worldId, null, 'Maps')
      uploadImage(worldId, 'city.png', PNG, 'Maps')
      revealImage(worldId, 'Maps/city.png')
      expect(showItemInFolder).toHaveBeenCalledWith(
        imagesPath('Maps', 'city.png'),
      )
      revealImage(worldId, 'Maps')
      expect(showItemInFolder).toHaveBeenCalledWith(imagesPath('Maps'))
    })

    it("reveals the _images folder itself for ''", () => {
      createImageFolder(worldId, null, 'Maps')
      revealImage(worldId, '')
      expect(showItemInFolder).toHaveBeenCalledWith(imagesPath())
    })

    it('throws for a missing path instead of opening nothing', () => {
      expect(() => revealImage(worldId, 'gone.png')).toThrow(/no longer/)
      expect(showItemInFolder).not.toHaveBeenCalled()
    })

    it('refuses paths that escape the images folder', () => {
      expect(() => revealImage(worldId, '../world.json')).toThrow()
      expect(() => revealImage(worldId, '../../outside')).toThrow()
      expect(showItemInFolder).not.toHaveBeenCalled()
    })
  })

  describe('countImagesIn', () => {
    it('counts a whole subtree', () => {
      createImageFolder(worldId, null, 'Maps')
      createImageFolder(worldId, 'Maps', 'City')
      uploadImage(worldId, 'a.png', PNG, 'Maps')
      uploadImage(worldId, 'b.png', PNG, 'Maps/City')
      uploadImage(worldId, 'c.png', PNG)
      expect(countImagesIn(worldId, 'Maps')).toBe(2)
      expect(countImagesIn(worldId, 'Maps/City')).toBe(1)
    })
  })
})
