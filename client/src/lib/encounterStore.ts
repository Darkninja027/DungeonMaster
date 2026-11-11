/**
 * Saved encounters, persisted per-world to `.dm/encounters.json`.
 *
 * The encounter builder could always rate a fight and push it into the
 * initiative tracker, but nothing kept one: a DM prepping next week's session
 * built the roster, ran it or lost it. This is the missing half, and it is
 * deliberately the *roster* rather than a snapshot of combat — the tracker
 * already persists a fight in progress to `.dm/session.json`. Saving here is
 * "this is the encounter I prepared"; that file is "this is the fight we are in
 * the middle of".
 *
 * Pure functions over plain state, the same split `sessionStore.ts` uses, so
 * every rule here is unit-testable without React or Electron.
 *
 * A monster key is `worldId:articleId` (see `entryKey`), which means a saved
 * encounter can legitimately reference the **global library** rather than this
 * world. That is why loading tolerates a key that no longer resolves: the
 * library is shared and editable, so a monster can vanish between saving and
 * loading, and dropping the whole encounter over one missing goblin would be
 * the wrong trade.
 */

export interface SavedEncounter {
  id: string
  name: string
  /** Monster counts keyed by `entryKey` — `worldId:articleId`. */
  counts: Record<string, number>
  /** Party member article ids. Always local to this world. */
  party: Array<string>
  /** ISO date, for ordering the list newest-first. */
  savedAt: string
}

export interface EncounterFile {
  version: 1
  encounters: Array<SavedEncounter>
}

export function emptyEncounters(): EncounterFile {
  return { version: 1, encounters: [] }
}

/**
 * Tolerant parse of whatever was on disk. A corrupt or hand-edited file must
 * never cost the user every other encounter, so this drops bad rows rather than
 * rejecting the file — the same rule `parseTemplateStore` follows.
 *
 * A row needs an id and a name to be usable; everything else has a sane empty.
 */
export function parseEncounters(raw: unknown): EncounterFile {
  if (typeof raw !== 'object' || raw === null) return emptyEncounters()
  const list = (raw as { encounters?: unknown }).encounters
  if (!Array.isArray(list)) return emptyEncounters()

  const seen = new Set<string>()
  const encounters: Array<SavedEncounter> = []
  for (const row of list) {
    if (typeof row !== 'object' || row === null) continue
    const r = row as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : ''
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    if (!id || !name || seen.has(id)) continue
    seen.add(id)

    const counts: Record<string, number> = {}
    if (typeof r.counts === 'object' && r.counts !== null) {
      for (const [key, value] of Object.entries(r.counts)) {
        // A non-positive or non-finite count is not a monster you can field.
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          counts[key] = Math.floor(value)
        }
      }
    }
    const party = Array.isArray(r.party)
      ? r.party.filter((p): p is string => typeof p === 'string')
      : []

    encounters.push({
      id,
      name,
      counts,
      party,
      savedAt: typeof r.savedAt === 'string' ? r.savedAt : '',
    })
  }
  return { version: 1, encounters }
}

/** Newest first, so the list reads as "what I prepared most recently". */
export function sortedEncounters(file: EncounterFile): Array<SavedEncounter> {
  return [...file.encounters].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

/**
 * Add or replace by **name**, case-insensitively, rather than appending.
 *
 * Saving "Goblin Ambush" twice should update the encounter, not leave two rows
 * a DM has to tell apart mid-session. The id of the existing row is kept so
 * anything holding it still resolves.
 */
export function upsertEncounter(
  file: EncounterFile,
  entry: Omit<SavedEncounter, 'id'> & { id?: string },
): EncounterFile {
  const name = entry.name.trim()
  const match = file.encounters.find(
    (e) => e.name.toLowerCase() === name.toLowerCase(),
  )
  const saved: SavedEncounter = {
    id: entry.id ?? match?.id ?? newEncounterId(),
    name,
    counts: entry.counts,
    party: entry.party,
    savedAt: entry.savedAt,
  }
  return {
    version: 1,
    encounters: match
      ? file.encounters.map((e) => (e.id === match.id ? saved : e))
      : [...file.encounters, saved],
  }
}

export function dropEncounter(file: EncounterFile, id: string): EncounterFile {
  return { version: 1, encounters: file.encounters.filter((e) => e.id !== id) }
}

/** Random rather than slugged: two encounters may share a name over time. */
export function newEncounterId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Total monsters in a saved encounter, for the list's summary line. */
export function monsterCount(entry: SavedEncounter): number {
  return Object.values(entry.counts).reduce((a, b) => a + b, 0)
}
