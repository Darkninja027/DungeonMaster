import { describe, expect, it } from 'vitest'
import { isLibraryFolder } from './libraryFolders'

describe('isLibraryFolder', () => {
  it('matches the library folders themselves', () => {
    expect(isLibraryFolder('Characters')).toBe(true)
    expect(isLibraryFolder('Spells')).toBe(true)
    expect(isLibraryFolder('Monsters')).toBe(true)
  })

  it('matches subfolders of a library folder', () => {
    expect(isLibraryFolder('Spells/Cantrips')).toBe(true)
    expect(isLibraryFolder('Monsters/Undead/Vampires')).toBe(true)
  })

  it('treats the world root as worldbuilding content', () => {
    expect(isLibraryFolder(null)).toBe(false)
  })

  it('does not match folders that merely share a prefix', () => {
    expect(isLibraryFolder('Spellslinger')).toBe(false)
    expect(isLibraryFolder('Monsters of the Deep')).toBe(false)
    expect(isLibraryFolder('CharactersOfNote')).toBe(false)
  })

  it('does not match a library name nested under worldbuilding content', () => {
    // Only top-level libraries are hidden — "Barovia/Monsters" is world lore.
    expect(isLibraryFolder('Barovia/Monsters')).toBe(false)
    expect(isLibraryFolder('Lore/Spells')).toBe(false)
  })
})
