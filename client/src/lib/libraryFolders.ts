/**
 * Folders that hold reference libraries rather than worldbuilding content.
 * Each has a dedicated home in the UI — Characters in the sidebar's own
 * section, Spells and Monsters in the session panel — so the sidebar tree
 * hides them and stays purely about the world.
 *
 * They are still real folders on disk; hiding is a view concern only, so the
 * world stays portable and opens normally in Obsidian.
 */
export const LIBRARY_FOLDERS = ['Characters', 'Spells', 'Monsters'] as const

/** True when `folderId` is a library folder or lives inside one. */
export function isLibraryFolder(folderId: string | null): boolean {
  if (folderId == null) return false
  return LIBRARY_FOLDERS.some(
    (name) => folderId === name || folderId.startsWith(`${name}/`),
  )
}
