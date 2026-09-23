/**
 * Merging one entry into a whole-file JSON payload, by id.
 *
 * This is the fix for a clobber that whole-file writes make unavoidable once
 * more than one window can edit. `writeWorldJson` replaces the entire file, so
 * two renderers each holding their own copy and each saving on a debounce lose
 * whole entries deterministically: the editor saves {A(edited), B, C}, the DM
 * window then flushes its stale {A(old), B, C} because it renamed C, and A's
 * edits are gone. Atomic writes prevent a *torn* file, not a clobbered one, and
 * no amount of debounce tuning helps — it follows from the unit of the write.
 *
 * So a renderer never sends a whole file any more. It sends one entry, and this
 * splices it into the authoritative copy held in the main process. Two windows
 * touching different entries then touch disjoint array slots and cannot collide
 * at all. Two windows touching the *same* entry is still last-writer-wins, which
 * is both unavoidable and what a person would predict.
 *
 * Deliberately Electron-free and schema-free, which is what makes it the one
 * piece of this design that is unit-tested. It knows only that the payload has
 * an array under `key` whose entries have an `id` — the tolerant parse stays in
 * the renderer (`lib/mapStore.ts`, `lib/sessionStore.ts`), the same split
 * `ipc.ts` already states for every other `.dm/` file. Teaching the main process
 * the BattleMap schema would duplicate it in a second place that could drift.
 */

/** Add-or-replace one entry, or drop one. Never both. */
export interface StatePatch {
  /** The entry to upsert, matched on its `id`. */
  entry?: unknown
  /** The id to remove. */
  removeId?: string
}

function idOf(row: unknown): string | null {
  if (typeof row !== 'object' || row === null) return null
  const id = (row as { id?: unknown }).id
  return typeof id === 'string' && id ? id : null
}

/**
 * Apply one patch to a raw file payload, returning a new object.
 *
 * Tolerant in the same way the renderer parsers are: a file that is missing,
 * null, or has no array under `key` is treated as empty rather than refused,
 * because `.dm/` files are hand-editable and one bad file must never make the
 * app unable to save. A patch whose entry has no usable id is ignored — writing
 * it would produce a row nothing can ever address again.
 *
 * `version` is carried through unchanged when present, so this never silently
 * rewrites a field it does not understand.
 */
export function applyStatePatch(
  file: unknown,
  key: string,
  patch: StatePatch,
): Record<string, unknown> {
  const base =
    typeof file === 'object' && file !== null
      ? (file as Record<string, unknown>)
      : {}
  const listRaw = base[key]
  const list = Array.isArray(listRaw) ? listRaw : []

  if (patch.removeId !== undefined) {
    return {
      ...base,
      [key]: list.filter((row) => idOf(row) !== patch.removeId),
    }
  }

  const id = idOf(patch.entry)
  if (!id) return { ...base, [key]: list }

  const at = list.findIndex((row) => idOf(row) === id)
  const next = at === -1 ? [...list, patch.entry] : list.slice()
  if (at !== -1) next[at] = patch.entry
  return { ...base, [key]: next }
}
