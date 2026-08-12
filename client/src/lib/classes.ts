/**
 * The 12 PHB classes: hit die and subclass *names* only.
 *
 * Deliberately not a rules engine — no features by level, no spell slot
 * progression. This table exists so the sheet can offer a dropdown and fill in
 * the hit die, and so a subclass field can suggest sensible values. Everything
 * downstream treats `Character.class` and `Character.subclass` as free text
 * (see the note on ARMOR_PROFICIENCIES in character.ts): a homebrew class must
 * survive a round trip through the editor untouched.
 */

export interface ClassInfo {
  id: string
  name: string
  /** Hit die size, e.g. 10 for a d10. */
  hitDie: number
  /**
   * What the PHB calls this class's subclass choice — "Sacred Oath" for a
   * paladin, "Otherworldly Patron" for a warlock. Used as the subclass field's
   * placeholder so the prompt matches the class you picked.
   */
  subclassLabel: string
  /** PHB subclass names, alphabetical. Names only, no rules text. */
  subclasses: Array<string>
}

export const CLASSES: Array<ClassInfo> = [
  {
    id: 'barbarian',
    name: 'Barbarian',
    hitDie: 12,
    subclassLabel: 'Primal Path',
    subclasses: ['Path of the Berserker', 'Path of the Totem Warrior'],
  },
  {
    id: 'bard',
    name: 'Bard',
    hitDie: 8,
    subclassLabel: 'Bard College',
    subclasses: ['College of Lore', 'College of Valor'],
  },
  {
    id: 'cleric',
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
    id: 'druid',
    name: 'Druid',
    hitDie: 8,
    subclassLabel: 'Druid Circle',
    subclasses: ['Circle of the Land', 'Circle of the Moon'],
  },
  {
    id: 'fighter',
    name: 'Fighter',
    hitDie: 10,
    subclassLabel: 'Martial Archetype',
    subclasses: ['Champion', 'Battle Master', 'Eldritch Knight'],
  },
  {
    id: 'monk',
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
    id: 'paladin',
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
    id: 'ranger',
    name: 'Ranger',
    hitDie: 10,
    subclassLabel: 'Ranger Archetype',
    subclasses: ['Hunter', 'Beast Master'],
  },
  {
    id: 'rogue',
    name: 'Rogue',
    hitDie: 8,
    subclassLabel: 'Roguish Archetype',
    subclasses: ['Thief', 'Assassin', 'Arcane Trickster'],
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    hitDie: 6,
    subclassLabel: 'Sorcerous Origin',
    subclasses: ['Draconic Bloodline', 'Wild Magic'],
  },
  {
    id: 'warlock',
    name: 'Warlock',
    hitDie: 8,
    subclassLabel: 'Otherworldly Patron',
    subclasses: ['The Archfey', 'The Fiend', 'The Great Old One'],
  },
  {
    id: 'wizard',
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

/**
 * Looks a class up by name or id, case- and whitespace-insensitively. Returns
 * undefined for homebrew — callers must treat that as "leave it alone", never
 * as an error.
 */
export function findClass(name: string): ClassInfo | undefined {
  const key = name.trim().toLowerCase()
  if (key === '') return undefined
  return CLASSES.find((cl) => cl.id === key || cl.name.toLowerCase() === key)
}

/** Subclass suggestions for a class name; empty for homebrew or blank. */
export function subclassesFor(className: string): Array<string> {
  return findClass(className)?.subclasses ?? []
}

/**
 * The subclass field's placeholder. Falls back to the generic word when the
 * class is homebrew or not yet filled in.
 */
export function subclassLabelFor(className: string): string {
  return findClass(className)?.subclassLabel ?? 'Subclass'
}
