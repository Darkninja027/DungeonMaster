import fs from 'node:fs'
import path from 'node:path'
import { resolveInWorld } from './sanitize'
import {
  LEGACY_WORLD_FILE,
  WORLD_FILE,
  WORLD_FILE_VERSION,
  atomicWrite,
  readWorldFile,
  worldRoot,
} from './worldStore'

/**
 * Per-world settings — the class/subclass list the character sheet's dropdowns
 * read from, sharing one file with the world's own name/description/createdAt.
 *
 * Lives at the world *root*, unlike the state under `.dm/`, because it is meant
 * to be found and hand-edited: the file watcher deliberately ignores dot-prefixed
 * paths, so a `.dm/` file's edits wouldn't be noticed until a restart. It stays
 * out of the sidebar and search index regardless, since readTree only collects
 * `*.md`.
 *
 * Two import rules keep the main-process graph acyclic, and nothing warns you if
 * you break them (eslint's import/no-cycle is off in this repo):
 *  - this module must NOT import ./session, which would duplicate what's here
 *    anyway — hence the small write helper below rather than writeWorldJson.
 *  - worldStore.ts must NOT import this module. It's the other way round (it
 *    owns the raw file I/O, since worldRoot() has to read the same file), so
 *    scaffolding on world creation is called from ipc.ts, which already imports
 *    both, rather than from inside initWorld.
 */

/** Re-exported under its settings-facing name; the file is shared now. */
export const WORLD_SETTINGS_FILE = WORLD_FILE

/**
 * The class list a new world starts with.
 *
 * Deliberately duplicated from PHB_CLASSES in src/lib/classes.ts: the renderer is
 * Vite/ESM behind the `#/` alias and this is esbuild/CJS, so sharing the constant
 * would mean teaching three build configs about a shared directory. A parity test
 * in src/lib/classes.test.ts fails loudly if the two ever drift.
 */
export const SEED_CLASSES = [
  {
    name: 'Barbarian',
    hitDie: 12,
    subclassLabel: 'Primal Path',
    subclasses: ['Path of the Berserker', 'Path of the Totem Warrior'],
  },
  {
    name: 'Bard',
    hitDie: 8,
    subclassLabel: 'Bard College',
    subclasses: ['College of Lore', 'College of Valor'],
  },
  {
    name: 'Cleric',
    hitDie: 8,
    subclassLabel: 'Divine Domain',
    subclasses: [
      'Knowledge Domain',
      'Life Domain',
      'Light Domain',
      'Nature Domain',
      'Tempest Domain',
      'Trickery Domain',
      'War Domain',
    ],
  },
  {
    name: 'Druid',
    hitDie: 8,
    subclassLabel: 'Druid Circle',
    subclasses: ['Circle of the Land', 'Circle of the Moon'],
  },
  {
    name: 'Fighter',
    hitDie: 10,
    subclassLabel: 'Martial Archetype',
    subclasses: ['Champion', 'Battle Master', 'Eldritch Knight'],
  },
  {
    name: 'Monk',
    hitDie: 8,
    subclassLabel: 'Monastic Tradition',
    subclasses: [
      'Way of the Open Hand',
      'Way of Shadow',
      'Way of the Four Elements',
    ],
  },
  {
    name: 'Paladin',
    hitDie: 10,
    subclassLabel: 'Sacred Oath',
    subclasses: [
      'Oath of Devotion',
      'Oath of the Ancients',
      'Oath of Vengeance',
    ],
  },
  {
    name: 'Ranger',
    hitDie: 10,
    subclassLabel: 'Ranger Archetype',
    subclasses: ['Hunter', 'Beast Master'],
  },
  {
    name: 'Rogue',
    hitDie: 8,
    subclassLabel: 'Roguish Archetype',
    subclasses: ['Thief', 'Assassin', 'Arcane Trickster'],
  },
  {
    name: 'Sorcerer',
    hitDie: 6,
    subclassLabel: 'Sorcerous Origin',
    subclasses: ['Draconic Bloodline', 'Wild Magic'],
  },
  {
    name: 'Warlock',
    hitDie: 8,
    subclassLabel: 'Otherworldly Patron',
    subclasses: ['The Archfey', 'The Fiend', 'The Great Old One'],
  },
  {
    name: 'Wizard',
    hitDie: 6,
    subclassLabel: 'Arcane Tradition',
    subclasses: [
      'School of Abjuration',
      'School of Conjuration',
      'School of Divination',
      'School of Enchantment',
      'School of Evocation',
      'School of Illusion',
      'School of Necromancy',
      'School of Transmutation',
    ],
  },
]

/** Kept in step with SETTINGS_COMMENT in src/lib/worldSettings.ts. */
const SEED_COMMENT =
  'Homebrew classes for this world. Class and subclass on a character are free ' +
  'text — this list only supplies dropdown suggestions and hit dice, so a ' +
  'class missing from here still works on a sheet.'

export const SEED_SETTINGS = {
  version: WORLD_FILE_VERSION,
  _comment: SEED_COMMENT,
  classes: SEED_CLASSES,
}

/** World metadata shares the file; a settings write must never drop it. */
const WORLD_META_KEYS = ['name', 'description', 'createdAt'] as const

/** Renderer payloads are small; anything bigger is a bug, not settings. */
export const MAX_SETTINGS_BYTES = 256 * 1024

/**
 * Write settings given a world *root*, not an id. initWorld needs this: it runs
 * while the marker file is still being created, and anything routing through
 * worldRoot() would throw on the missing marker.
 *
 * The world's name/description/createdAt live in this same file but are not the
 * renderer's to send, so any the payload omits are carried over from disk. Skip
 * that and saving the class list would erase the world's name.
 */
export function writeWorldSettingsAtRoot(
  root: string,
  settings: unknown,
): void {
  let payload = settings
  if (typeof payload === 'object' && payload !== null) {
    const existing = readWorldFile(root)
    const carried: Record<string, unknown> = {}
    for (const key of WORLD_META_KEYS) {
      if (!(key in payload) && existing && key in existing) {
        carried[key] = existing[key]
      }
    }
    payload = { ...carried, ...payload }
  }
  const json = JSON.stringify(payload, null, 2)
  if (Buffer.byteLength(json) > MAX_SETTINGS_BYTES) {
    throw new Error(
      'Settings payload is unreasonably large — refusing to save.',
    )
  }
  fs.mkdirSync(root, { recursive: true })
  atomicWrite(path.join(root, WORLD_SETTINGS_FILE), json)
}

/**
 * Give a world the default class list. Merges rather than replaces: by the time
 * this runs on a new world, initWorld has already written the name into the
 * same file.
 */
export function seedWorldSettings(root: string): void {
  writeWorldSettingsAtRoot(root, SEED_SETTINGS)
}

/**
 * The world's settings, scaffolding the class list if it isn't there yet —
 * that's what covers worlds created before this feature existed, and worlds
 * whose file so far holds only the metadata migrated out of world.json.
 *
 * Two rules hold here:
 *  - "needs seeding" is decided on the file being absent or having no `classes`
 *    key at all, never on "did the parse come back empty". A file that fails to
 *    parse is a hand edit with a typo in it, and rewriting over the top of it
 *    would destroy the user's work; and `"classes": []` is a list the user
 *    emptied on purpose, which must stay empty.
 *  - a failed write must never fail the read. Read-only mounts, network shares
 *    and folders opened just to browse still get working defaults, served from
 *    memory.
 */
export function readWorldSettings(worldId: string): unknown {
  const root = worldRoot(worldId)
  const abs = resolveInWorld(root, WORLD_SETTINGS_FILE)
  const existing = fs.existsSync(abs) ? readWorldFile(root) : null
  const needsSeed =
    !fs.existsSync(abs) || (existing !== null && !('classes' in existing))
  if (needsSeed) {
    try {
      seedWorldSettings(root)
    } catch {
      return SEED_SETTINGS // couldn't write: serve the seed anyway
    }
  }
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8')) as unknown
  } catch {
    return null // corrupt or unreadable: the renderer falls back to defaults
  }
}

export function writeWorldSettings(worldId: string, settings: unknown): void {
  writeWorldSettingsAtRoot(worldRoot(worldId), settings)
}

/**
 * Fold a legacy world.json into worldSettings.json and delete it, so a folder
 * ends up with one file describing the world instead of two.
 *
 * Runs on open, and is best-effort throughout: a read-only mount, a network
 * share or a corrupt file must still leave the world openable. Anything it
 * can't finish is retried the next time the world is opened.
 *
 * `remove` is injected so the caller can route the delete to the Recycle Bin —
 * shell.trashItem is async and would drag Electron into this module, which the
 * data-layer tests import without it.
 */
export function migrateWorldFolder(
  root: string,
  remove: (abs: string) => void = (abs) => fs.rmSync(abs, { force: true }),
): void {
  const legacyAbs = path.join(root, LEGACY_WORLD_FILE)
  if (!fs.existsSync(legacyAbs)) return

  try {
    const legacy = readWorldFile(root, LEGACY_WORLD_FILE)
    const mergedAbs = path.join(root, WORLD_SETTINGS_FILE)
    const hadMerged = fs.existsSync(mergedAbs)
    const merged = readWorldFile(root)

    // A merged file that exists but won't parse is a hand edit with a typo in
    // it. Leave both files alone rather than overwriting the user's work — the
    // same contract readWorldSettings holds.
    if (hadMerged && merged === null) return

    // The merged file wins on every field it already has, so re-running this on
    // a half-migrated folder can't roll newer data back to the legacy copy.
    const carried: Record<string, unknown> = {}
    if (legacy) {
      for (const key of WORLD_META_KEYS) {
        if (typeof legacy[key] === 'string' && !(merged && key in merged)) {
          carried[key] = legacy[key]
        }
      }
    }

    // version last of the three: migrating is exactly what makes a v1 file a v2
    // one, so the number on disk must not survive the merge.
    atomicWrite(
      mergedAbs,
      JSON.stringify(
        { ...(merged ?? {}), ...carried, version: WORLD_FILE_VERSION },
        null,
        2,
      ),
    )

    // Only drop the legacy file once its replacement is provably on disk and
    // readable — a failed write here must never cost the world its name.
    if (readWorldFile(root) === null) return
    remove(legacyAbs)
  } catch {
    // Leave world.json in place; it still counts as a marker, so the world
    // opens and the next attempt retries.
  }
}
