import fs from 'node:fs'
import path from 'node:path'
import { resolveInWorld } from './sanitize'
import { atomicWrite, worldRoot } from './worldStore'

/**
 * Per-world settings — currently the class/subclass list the character sheet's
 * dropdowns read from.
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
 *  - worldStore.ts must NOT import this module. It's the other way round (for
 *    atomicWrite), so scaffolding on world creation is called from ipc.ts, which
 *    already imports both, rather than from inside initWorld.
 */

export const WORLD_SETTINGS_FILE = 'worldSettings.json'

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
  version: 1,
  _comment: SEED_COMMENT,
  classes: SEED_CLASSES,
}

/** Renderer payloads are small; anything bigger is a bug, not settings. */
export const MAX_SETTINGS_BYTES = 256 * 1024

/**
 * Write settings given a world *root*, not an id. initWorld needs this: it runs
 * while world.json is still being created, and anything routing through
 * worldRoot() would throw on the missing marker.
 */
export function writeWorldSettingsAtRoot(
  root: string,
  settings: unknown,
): void {
  const json = JSON.stringify(settings, null, 2)
  if (Buffer.byteLength(json) > MAX_SETTINGS_BYTES) {
    throw new Error(
      'Settings payload is unreasonably large — refusing to save.',
    )
  }
  fs.mkdirSync(root, { recursive: true })
  atomicWrite(path.join(root, WORLD_SETTINGS_FILE), json)
}

/** Seed a world that has no settings file yet. */
export function seedWorldSettings(root: string): void {
  writeWorldSettingsAtRoot(root, SEED_SETTINGS)
}

/**
 * The world's settings, scaffolding the file if it doesn't exist yet — that's
 * what covers worlds created before this feature existed.
 *
 * Two rules hold here:
 *  - the missing check is `existsSync`, never "did the parse come back empty".
 *    A file that fails to parse is a hand edit with a typo in it, and rewriting
 *    over the top of it would destroy the user's work.
 *  - a failed write must never fail the read. Read-only mounts, network shares
 *    and folders opened just to browse still get working defaults, served from
 *    memory.
 */
export function readWorldSettings(worldId: string): unknown {
  const root = worldRoot(worldId)
  const abs = resolveInWorld(root, WORLD_SETTINGS_FILE)
  if (!fs.existsSync(abs)) {
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
