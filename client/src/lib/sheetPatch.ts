import {
  isCharacterContent,
  parseCharacter,
  serializeCharacter,
} from './character'
import type { Character } from './character'

/**
 * Apply a guest's sheet edit to article content, on the HOST.
 *
 * Scope is deliberately HP and nothing else. That is what changes minute to
 * minute at a table, and every other candidate turned out not to be a field the
 * sheet has: `Character` carries no `conditions`, and `notes` is an array of
 * structured CharacterNote entries rather than a string, so neither can be
 * patched as a scalar. Widening this means teaching the patch those shapes, not
 * loosening the allowlist — see SHEET_PATCH_FIELDS in electron/main/table.ts,
 * which must be narrowed to match.
 *
 * Pure: content in, content out, so it is unit-tested without Electron, React
 * or a disk. The caller writes the result through the ordinary articles:update
 * path so atomic writes behave exactly as they do for a local edit.
 */

export interface SheetPatch {
  hpCurrent?: number
  hpTemp?: number
}

/**
 * Merge a patch into article content.
 *
 * Returns null when nothing would change, so the caller can skip the write
 * rather than touching the file and waking watchers for nothing. Also null when
 * the article is not a character sheet: parseCharacter is deliberately tolerant
 * and never throws, so prose would parse to an EMPTY sheet and serializing that
 * back would replace someone's article with a blank character.
 */
export function applySheetPatch(
  content: string,
  patch: SheetPatch,
): string | null {
  if (!isCharacterContent(content)) return null

  const { character, body } = parseCharacter(content)
  const next: Character = { ...character, hp: { ...character.hp } }
  let changed = false

  if (patch.hpCurrent !== undefined) {
    // Clamped to the sheet's own maximum: a guest may drop to 0, never exceed
    // max. A sheet with no max set (0) is left ungoverned rather than pinned.
    const max = character.hp.max
    const value =
      max > 0
        ? Math.max(0, Math.min(patch.hpCurrent, max))
        : Math.max(0, patch.hpCurrent)
    if (value !== character.hp.current) {
      next.hp.current = value
      changed = true
    }
  }

  if (patch.hpTemp !== undefined) {
    const value = Math.max(0, patch.hpTemp)
    if (value !== character.hp.temp) {
      next.hp.temp = value
      changed = true
    }
  }

  if (!changed) return null
  return serializeCharacter(next, body)
}
