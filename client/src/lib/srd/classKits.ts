/**
 * Level 1 starting kits for the twelve SRD 5.1 classes (CC BY 4.0 — see
 * ./index.ts).
 *
 * A kit is the *whole* definition of a class — hit die and subclasses for the
 * character sheet, starting gear and features for the creation wizard. These
 * were two separate tables once, joined by name; they are one now, so a class
 * is edited in one place and travels as one thing.
 *
 * A class the tables don't know still works: `Character.class` is free text,
 * and the sheet falls back to a d8 with a generic subclass label.
 *
 * Level 1 only, by design. No per-level feature tables, no slot progression —
 * see the header of lib/classes.ts. Features listed here are the ones gained at
 * 1st level; the sheet takes it from there.
 *
 * Ranger and Paladin have no `spellcasting` block because they gain spells at
 * 2nd level, which is correct for a level 1 build.
 */

import { ARTISAN_TOOLS, PACKS } from './equipment'
import type { ClassFeatureInfo, ClassKit, Grant, PickList } from './types'

/**
 * Fighting Style, as a real choice rather than a sentence listing the options.
 *
 * A factory because three classes gain this feature and pick ids are globally
 * unique — the owner's name is the prefix, so `fighter-fighting-style` and
 * `paladin-fighting-style` are distinct choices that happen to offer overlapping
 * options. Paladin and Ranger get narrower lists, which is what the book says
 * and what the `only` argument is for.
 *
 * The text on each option is a reminder in our own words, and none of it is
 * enforced: choosing Defense writes a row saying it grants +1 AC in armour. It
 * does not touch `Character.ac`, because that is a number the player also edits
 * and this app does not overrule its owner.
 */
/**
 * The fighting styles, each with the reminder its sheet row carries and — where
 * the app can honestly model it — what it grants.
 *
 * Most grant nothing. "+2 to attack rolls with a ranged weapon" is a combat
 * rule this app does not compute, so Archery's row is the reminder and that is
 * the whole of it; an empty grant here is correct rather than incomplete, the
 * same bargain the feat catalogue strikes. Two land on numbers the sheet
 * actually holds: Defense raises AC, and Superior Technique adds a superiority
 * die a Battle Master can spend.
 */
const FIGHTING_STYLES: Record<
  string,
  // `| undefined` because the per-class lists below are plain string arrays and
  // a name outside this table is a typo waiting to happen — the lookup has to
  // admit it can miss, or the check that catches it reads as dead code.
  | { text: string; grant?: Grant; resource?: ClassFeatureInfo['resource'] }
  | undefined
> = {
  Archery: {
    text: '+2 to attack rolls you make with a ranged weapon.',
  },
  'Blind Fighting': {
    text: 'Blindsight to 10 feet — you see anything not behind total cover in that range, even blinded or in darkness, including invisible creatures that have not hidden from you.',
  },
  Defense: {
    text: '+1 AC while you are wearing armour.',
    // The one style whose whole effect is a number on this sheet. The "while
    // wearing armour" half is checked once, at creation; see `acBonus`.
    grant: { acBonus: 1 },
  },
  Duelling: {
    text: '+2 damage when wielding a melee weapon in one hand and no other weapon.',
  },
  'Great Weapon Fighting': {
    text: 'Reroll a 1 or 2 on a damage die for a two-handed or versatile melee weapon.',
  },
  Interception: {
    text: 'Reaction to reduce damage to a creature within 5 feet by 1d10 + your proficiency bonus. You must be wielding a shield or a weapon.',
  },
  Protection: {
    text: 'Use your reaction and shield to impose disadvantage on an attack against a creature within 5 feet.',
  },
  'Superior Technique': {
    text: 'One Battle Master manoeuvre, and one superiority die (a d6) regained on a short or long rest.',
    // The die is a counter the sheet tracks, so it is offered like any other.
    // The manoeuvre it comes with is not granted: a pick that poses another
    // pick is a mechanism this table does not have, and inventing one for a
    // single style would be worse than the row saying so plainly.
    resource: { name: 'Superiority Dice', total: 1, resets: 'short' },
  },
  'Thrown Weapon Fighting': {
    text: 'Draw a thrown weapon as part of the attack, and +2 damage on a hit with one.',
  },
  'Two-Weapon Fighting': {
    text: 'Add your ability modifier to the damage of your off-hand attack.',
  },
  'Unarmed Fighting': {
    text: 'Your unarmed strikes deal 1d6 + your Strength modifier bludgeoning damage, a d8 with no weapon or shield in hand, and 1d4 to a creature you have grappled at the start of your turn.',
  },
}

/**
 * Which styles each class may take. Not one list: Tasha's widened the option
 * set per class rather than globally, so a Paladin has never been able to take
 * Archery and a Ranger has never been able to take Protection.
 */
const FIGHTER_STYLES = [
  'Archery',
  'Blind Fighting',
  'Defense',
  'Duelling',
  'Great Weapon Fighting',
  'Interception',
  'Protection',
  'Superior Technique',
  'Thrown Weapon Fighting',
  'Two-Weapon Fighting',
  'Unarmed Fighting',
]

const PALADIN_STYLES = [
  'Blind Fighting',
  'Defense',
  'Duelling',
  'Great Weapon Fighting',
  'Interception',
  'Protection',
]

const RANGER_STYLES = [
  'Archery',
  'Blind Fighting',
  'Defense',
  'Duelling',
  'Thrown Weapon Fighting',
  'Two-Weapon Fighting',
]

function FIGHTING_STYLE_PICK(owner: string, only?: Array<string>): PickList {
  const options = only ?? Object.keys(FIGHTING_STYLES)
  const grants: Record<string, Grant> = {}
  for (const name of options) {
    const grant = FIGHTING_STYLES[name]?.grant
    if (grant) grants[name] = grant
  }
  const pick: PickList = {
    id: `${owner}-fighting-style`,
    kind: 'feature',
    label: 'Choose a Fighting Style',
    count: 1,
    options,
    featureLabel: 'Fighting Style',
    featureText: Object.fromEntries(
      options.map((name) => [name, FIGHTING_STYLES[name]?.text ?? '']),
    ),
  }
  if (Object.keys(grants).length > 0) pick.featureGrant = grants
  return pick
}

/**
 * The Battle Master's manoeuvres, as a real choice.
 *
 * A factory for the same reason Fighting Style is one: the archetype learns
 * more of them at 7th, 10th and 15th level, and each of those is its own pick
 * with its own id in the one global keyspace. Every list offers all sixteen —
 * a manoeuvre already taken is greyed out by the pick UI rather than removed,
 * so the player can see what they chose earlier.
 *
 * Summaries in our own words, one line each, the same rule the feat catalogue
 * follows. Nothing here computes: taking Riposte writes a row that says what
 * Riposte does, and the superiority die it spends is the player's own counter.
 */
const MANEUVER_TEXT: Record<string, string> = {
  Ambush: 'Add the die to a Stealth check or initiative roll.',
  'Bait and Switch': 'Swap places with an ally, adding the die to their AC.',
  'Commander’s Strike':
    'Forgo an attack to let an ally strike, adding the die.',
  'Disarming Attack': 'On a hit, add the die and force a save or drop an item.',
  'Distracting Strike':
    'Add the die; the next attacker on that creature has advantage.',
  'Evasive Footwork': 'Add the die to your AC while you move.',
  'Feinting Attack':
    'Bonus action to gain advantage on your next attack, adding the die.',
  'Goading Attack':
    'On a hit, add the die and force a save or the target has disadvantage attacking anyone else.',
  'Lunging Attack': 'Add the die and reach 5 feet further with a melee attack.',
  'Maneuvering Attack':
    'On a hit, add the die and let an ally move without provoking.',
  'Menacing Attack':
    'On a hit, add the die and force a save or the target is frightened.',
  Parry:
    'Reaction to reduce melee damage by the die plus your Dexterity modifier.',
  'Precision Attack':
    'Add the die to an attack roll, before or after seeing the result.',
  'Pushing Attack':
    'On a hit, add the die and force a save or push the target 15 feet.',
  Rally:
    'Bonus action to grant an ally temporary hit points equal to the die plus your Charisma modifier.',
  Riposte: 'Reaction to attack a creature that misses you, adding the die.',
  'Sweeping Attack':
    'On a hit, deal the die as damage to a second creature within reach.',
  'Trip Attack':
    'On a hit, add the die and force a save or knock the target prone.',
}

function MANEUVER_PICK(owner: string, count: number): PickList {
  return {
    id: `${owner}-maneuvers`,
    kind: 'feature',
    label: count === 1 ? 'Choose a manoeuvre' : `Choose ${count} manoeuvres`,
    count,
    options: Object.keys(MANEUVER_TEXT),
    featureLabel: 'Manoeuvre',
    featureText: MANEUVER_TEXT,
  }
}

/** Every skill id, for classes whose list is "choose any". */
const ALL_SKILLS = [
  'acrobatics',
  'animal-handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight-of-hand',
  'stealth',
  'survival',
]

export const SRD_CLASS_KITS: Array<ClassKit> = [
  {
    id: 'barbarian',
    name: 'Barbarian',
    asiLevels: [4, 8, 12, 16, 19],
    hitDie: 12,
    subclassLabel: 'Primal Path',
    subclasses: [
      {
        id: 'path-of-the-berserker',
        name: 'Path of the Berserker',
        features: [],
      },
      {
        id: 'path-of-the-totem-warrior',
        name: 'Path of the Totem Warrior',
        features: [],
      },
    ],
    saves: ['str', 'con'],
    unarmoredDefense: 'con',
    abilityPriority: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
    skillChoices: {
      id: 'barbarian-skills',
      kind: 'skill',
      label: 'Choose two skills',
      count: 2,
      options: [
        'animal-handling',
        'athletics',
        'intimidation',
        'nature',
        'perception',
        'survival',
      ],
    },
    grant: {
      armor: ['light', 'medium', 'shields'],
      weapons: ['simple', 'martial'],
      items: [{ text: 'Javelin', qty: 4, weight: 2 }, PACKS.explorer],
    },
    equipment: [
      {
        id: 'barbarian-weapon-1',
        label: 'Primary weapon',
        options: [
          {
            label: 'A greataxe',
            grant: { items: [{ text: 'Greataxe', weight: 7 }] },
          },
          {
            label: 'Any martial melee weapon',
            grant: {
              picks: [
                {
                  id: 'barbarian-martial-choice',
                  kind: 'weapon',
                  label: 'Martial melee weapon',
                  count: 1,
                  options: [
                    'Battleaxe',
                    'Flail',
                    'Glaive',
                    'Greatsword',
                    'Halberd',
                    'Longsword',
                    'Maul',
                    'Morningstar',
                    'Warhammer',
                  ],
                  open: true,
                },
              ],
            },
          },
        ],
      },
      {
        id: 'barbarian-weapon-2',
        label: 'Secondary weapon',
        options: [
          {
            label: 'Two handaxes',
            grant: { items: [{ text: 'Handaxe', qty: 2, weight: 2 }] },
          },
          {
            label: 'Any simple weapon',
            grant: {
              picks: [
                {
                  id: 'barbarian-simple-choice',
                  kind: 'weapon',
                  label: 'Simple weapon',
                  count: 1,
                  options: [
                    'Club',
                    'Dagger',
                    'Greatclub',
                    'Handaxe',
                    'Javelin',
                    'Light hammer',
                    'Mace',
                    'Quarterstaff',
                    'Sickle',
                    'Spear',
                  ],
                  open: true,
                },
              ],
            },
          },
        ],
      },
    ],
    features: [
      {
        level: 1,
        name: 'Rage',
        text: 'In battle you fight with primal ferocity. As a bonus action you enter a rage for up to 1 minute: advantage on Strength checks and saves, a bonus to melee damage, and resistance to bludgeoning, piercing and slashing damage. Twice per long rest at 1st level.',
      },
      {
        level: 1,
        name: 'Unarmored Defense',
        text: 'While wearing no armor, your AC equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit.',
      },
      {
        level: 2,
        name: 'Reckless Attack',
        text: 'When you make your first attack on your turn, you can attack recklessly: advantage on melee Strength attacks this turn, and attacks against you have advantage until your next turn.',
      },
      {
        level: 2,
        name: 'Danger Sense',
        text: 'Advantage on Dexterity saving throws against effects you can see, such as traps and spells.',
      },
      {
        level: 3,
        name: 'Primal Path',
        text: 'Choose a path that shapes the nature of your rage.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        text: 'You can attack twice, instead of once, whenever you take the Attack action on your turn.',
      },
      {
        level: 5,
        name: 'Fast Movement',
        text: 'Your speed increases by 10 feet while you aren’t wearing heavy armor.',
      },
      {
        level: 7,
        name: 'Feral Instinct',
        text: 'Advantage on initiative rolls, and you can act normally on a surprise round if you enter your rage first.',
      },
      {
        level: 9,
        name: 'Brutal Critical',
        text: 'Roll one additional weapon damage die on a critical hit; two at 13th level, three at 17th.',
      },
      {
        level: 11,
        name: 'Relentless Rage',
        text: 'If you drop to 0 hit points while raging and don’t die outright, you can make a DC 10 Constitution save to drop to 1 instead.',
      },
      {
        level: 15,
        name: 'Persistent Rage',
        text: 'Your rage ends early only if you fall unconscious or choose to end it.',
      },
      {
        level: 18,
        name: 'Indomitable Might',
        text: 'If your total for a Strength check is less than your Strength score, use the score instead.',
      },
      {
        level: 20,
        name: 'Primal Champion',
        text: 'Your Strength and Constitution increase by 4, to a maximum of 24.',
      },
    ],
  },
  {
    id: 'bard',
    name: 'Bard',
    asiLevels: [4, 8, 12, 16, 19],
    hitDie: 8,
    subclassLabel: 'Bard College',
    subclasses: [
      { id: 'college-of-lore', name: 'College of Lore', features: [] },
      { id: 'college-of-valor', name: 'College of Valor', features: [] },
    ],
    saves: ['dex', 'cha'],
    subclassAtLevel1: false,
    abilityPriority: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
    skillChoices: {
      id: 'bard-skills',
      kind: 'skill',
      label: 'Choose any three skills',
      count: 3,
      options: ALL_SKILLS,
    },
    grant: {
      armor: ['light'],
      weapons: ['simple', 'hand crossbow', 'longsword', 'rapier', 'shortsword'],
      items: [
        { text: 'Dagger', weight: 1 },
        { text: 'Leather armor', weight: 10 },
      ],
      picks: [
        {
          id: 'bard-instruments',
          kind: 'tool',
          label: 'Three musical instruments',
          count: 3,
          options: [
            'Bagpipes',
            'Drum',
            'Dulcimer',
            'Flute',
            'Lute',
            'Lyre',
            'Horn',
            'Pan flute',
            'Shawm',
            'Viol',
          ],
          open: true,
        },
      ],
    },
    equipment: [
      {
        id: 'bard-weapon',
        label: 'Weapon',
        options: [
          {
            label: 'A rapier',
            grant: { items: [{ text: 'Rapier', weight: 2 }] },
          },
          {
            label: 'A longsword',
            grant: { items: [{ text: 'Longsword', weight: 3 }] },
          },
          {
            label: 'Any simple weapon',
            grant: {
              picks: [
                {
                  id: 'bard-simple-choice',
                  kind: 'weapon',
                  label: 'Simple weapon',
                  count: 1,
                  options: ['Club', 'Dagger', 'Mace', 'Quarterstaff', 'Spear'],
                  open: true,
                },
              ],
            },
          },
        ],
      },
      {
        id: 'bard-pack',
        label: 'Pack',
        options: [
          { label: 'A diplomat’s pack', grant: { items: [PACKS.diplomat] } },
          {
            label: 'An entertainer’s pack',
            grant: { items: [PACKS.entertainer] },
          },
        ],
      },
    ],
    spellcasting: {
      ability: 'cha',
      slotsAtLevel1: 2,
      cantripsKnown: 2,
      spellsKnown: 4,
      prepares: false,
      listLabel: 'Bard spells',
      slotsByLevel: {
        1: [2],
        2: [3],
        3: [4, 2],
        4: [4, 3],
        5: [4, 3, 2],
        6: [4, 3, 3],
        7: [4, 3, 3, 1],
        8: [4, 3, 3, 2],
        9: [4, 3, 3, 3, 1],
        10: [4, 3, 3, 3, 2],
        11: [4, 3, 3, 3, 2, 1],
        12: [4, 3, 3, 3, 2, 1],
        13: [4, 3, 3, 3, 2, 1, 1],
        14: [4, 3, 3, 3, 2, 1, 1],
        15: [4, 3, 3, 3, 2, 1, 1, 1],
        16: [4, 3, 3, 3, 2, 1, 1, 1],
        17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
        18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
        19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
        20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
      },
      cantripsByLevel: {
        1: 2,
        4: 3,
        10: 4,
      },
    },
    features: [
      {
        level: 1,
        name: 'Bardic Inspiration',
        text: 'As a bonus action, give one creature within 60 feet a d6 they can add to one ability check, attack roll or saving throw within the next 10 minutes. Uses equal to your Charisma modifier, regained on a long rest.',
      },
      {
        level: 1,
        name: 'Spellcasting',
        text: 'You have learned to untangle and reshape the fabric of reality in harmony with your music. Charisma is your spellcasting ability.',
      },
      {
        level: 2,
        name: 'Jack of All Trades',
        text: 'Add half your proficiency bonus, rounded down, to any ability check you make that doesn’t already include it.',
      },
      {
        level: 2,
        name: 'Song of Rest',
        text: 'You can use music to help revitalise wounded allies during a short rest, granting extra healing.',
      },
      {
        level: 3,
        name: 'Bard College',
        text: 'Choose a college that shapes your practice of bardic magic.',
      },
      {
        level: 3,
        name: 'Expertise',
        text: 'Choose two of your skill proficiencies; your proficiency bonus is doubled for them. Two more at 10th level.',
      },
      {
        level: 5,
        name: 'Font of Inspiration',
        text: 'You regain all expended Bardic Inspiration uses on a short or long rest, not just a long one.',
      },
      {
        level: 6,
        name: 'Countercharm',
        text: 'As an action, you can start a performance that gives allies within 30 feet advantage on saves against being frightened or charmed.',
      },
      {
        level: 10,
        name: 'Magical Secrets',
        text: 'Learn two spells from any class’s spell list. Two more at 14th and 18th level.',
      },
      {
        level: 20,
        name: 'Superior Inspiration',
        text: 'When you roll initiative and have no Bardic Inspiration uses left, you regain one.',
      },
    ],
  },
  {
    id: 'cleric',
    name: 'Cleric',
    asiLevels: [4, 8, 12, 16, 19],
    hitDie: 8,
    subclassLabel: 'Divine Domain',
    subclasses: [
      { id: 'knowledge-domain', name: 'Knowledge Domain', features: [] },
      { id: 'life-domain', name: 'Life Domain', features: [] },
      { id: 'light-domain', name: 'Light Domain', features: [] },
      { id: 'nature-domain', name: 'Nature Domain', features: [] },
      { id: 'tempest-domain', name: 'Tempest Domain', features: [] },
      { id: 'trickery-domain', name: 'Trickery Domain', features: [] },
      { id: 'war-domain', name: 'War Domain', features: [] },
    ],
    saves: ['wis', 'cha'],
    subclassAtLevel1: true,
    subclassLevel: 1,
    abilityPriority: ['wis', 'con', 'str', 'cha', 'dex', 'int'],
    skillChoices: {
      id: 'cleric-skills',
      kind: 'skill',
      label: 'Choose two skills',
      count: 2,
      options: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
    },
    grant: {
      armor: ['light', 'medium', 'shields'],
      weapons: ['simple'],
      items: [
        { text: 'Shield', weight: 6 },
        { text: 'Holy symbol', weight: 1 },
      ],
    },
    equipment: [
      {
        id: 'cleric-weapon',
        label: 'Weapon',
        options: [
          { label: 'A mace', grant: { items: [{ text: 'Mace', weight: 4 }] } },
          {
            label: 'A warhammer (if proficient)',
            grant: { items: [{ text: 'Warhammer', weight: 2 }] },
          },
        ],
      },
      {
        id: 'cleric-armor',
        label: 'Armor',
        options: [
          {
            label: 'Scale mail',
            grant: { items: [{ text: 'Scale mail', weight: 45 }] },
          },
          {
            label: 'Leather armor',
            grant: { items: [{ text: 'Leather armor', weight: 10 }] },
          },
          {
            label: 'Chain mail (if proficient)',
            grant: { items: [{ text: 'Chain mail', weight: 55 }] },
          },
        ],
      },
      {
        id: 'cleric-ranged',
        label: 'Ranged option',
        options: [
          {
            label: 'A light crossbow and 20 bolts',
            grant: {
              items: [
                { text: 'Light crossbow', weight: 5 },
                { text: 'Crossbow bolts', qty: 20, weight: 0.075, fits: null },
              ],
            },
          },
          {
            label: 'Any simple weapon',
            grant: {
              picks: [
                {
                  id: 'cleric-simple-choice',
                  kind: 'weapon',
                  label: 'Simple weapon',
                  count: 1,
                  options: ['Club', 'Dagger', 'Mace', 'Quarterstaff', 'Spear'],
                  open: true,
                },
              ],
            },
          },
        ],
      },
      {
        id: 'cleric-pack',
        label: 'Pack',
        options: [
          { label: 'A priest’s pack', grant: { items: [PACKS.priest] } },
          { label: 'An explorer’s pack', grant: { items: [PACKS.explorer] } },
        ],
      },
    ],
    spellcasting: {
      ability: 'wis',
      slotsAtLevel1: 2,
      cantripsKnown: 3,
      spellsKnown: 0,
      prepares: true,
      listLabel: 'Cleric spells',
      slotsByLevel: {
        1: [2],
        2: [3],
        3: [4, 2],
        4: [4, 3],
        5: [4, 3, 2],
        6: [4, 3, 3],
        7: [4, 3, 3, 1],
        8: [4, 3, 3, 2],
        9: [4, 3, 3, 3, 1],
        10: [4, 3, 3, 3, 2],
        11: [4, 3, 3, 3, 2, 1],
        12: [4, 3, 3, 3, 2, 1],
        13: [4, 3, 3, 3, 2, 1, 1],
        14: [4, 3, 3, 3, 2, 1, 1],
        15: [4, 3, 3, 3, 2, 1, 1, 1],
        16: [4, 3, 3, 3, 2, 1, 1, 1],
        17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
        18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
        19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
        20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
      },
      cantripsByLevel: {
        1: 3,
        4: 4,
        10: 5,
      },
    },
    features: [
      {
        level: 1,
        name: 'Spellcasting',
        text: 'As a conduit for divine power, you can cast cleric spells. You prepare a number of them each day equal to your Wisdom modifier + your cleric level.',
      },
      {
        level: 1,
        name: 'Divine Domain',
        text: 'You choose a domain related to your deity, granting you domain spells and other features at 1st level.',
      },
      {
        level: 2,
        name: 'Channel Divinity',
        text: 'You can channel divine energy to fuel magical effects, using it once per rest — twice at 6th level, three times at 18th.',
      },
      {
        level: 5,
        name: 'Destroy Undead',
        text: 'When an undead fails its save against your Turn Undead, it is destroyed if its challenge rating is at or below a threshold that rises with your level.',
      },
      {
        level: 10,
        name: 'Divine Intervention',
        text: 'You can call on your deity to intervene, with a percentage chance equal to your cleric level. Once per 7 days on a success.',
      },
      {
        level: 20,
        name: 'Divine Intervention Improvement',
        text: 'Your call for intervention succeeds automatically.',
      },
    ],
  },
  {
    id: 'druid',
    name: 'Druid',
    asiLevels: [4, 8, 12, 16, 19],
    hitDie: 8,
    subclassLabel: 'Druid Circle',
    subclasses: [
      { id: 'circle-of-the-land', name: 'Circle of the Land', features: [] },
      { id: 'circle-of-the-moon', name: 'Circle of the Moon', features: [] },
    ],
    saves: ['int', 'wis'],
    abilityPriority: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
    skillChoices: {
      id: 'druid-skills',
      kind: 'skill',
      label: 'Choose two skills',
      count: 2,
      options: [
        'arcana',
        'animal-handling',
        'insight',
        'medicine',
        'nature',
        'perception',
        'religion',
        'survival',
      ],
    },
    grant: {
      armor: ['light', 'medium', 'shields'],
      weapons: [
        'club',
        'dagger',
        'dart',
        'javelin',
        'mace',
        'quarterstaff',
        'scimitar',
        'sickle',
        'sling',
        'spear',
      ],
      tools: ['Herbalism kit'],
      items: [
        { text: 'Leather armor', weight: 10 },
        { text: 'Druidic focus', weight: 1 },
        PACKS.explorer,
      ],
    },
    equipment: [
      {
        id: 'druid-shield',
        label: 'Shield or weapon',
        options: [
          {
            label: 'A wooden shield',
            grant: { items: [{ text: 'Wooden shield', weight: 6 }] },
          },
          {
            label: 'Any simple weapon',
            grant: {
              picks: [
                {
                  id: 'druid-simple-choice',
                  kind: 'weapon',
                  label: 'Simple weapon',
                  count: 1,
                  options: ['Club', 'Dagger', 'Mace', 'Quarterstaff', 'Spear'],
                  open: true,
                },
              ],
            },
          },
        ],
      },
      {
        id: 'druid-weapon',
        label: 'Melee weapon',
        options: [
          {
            label: 'A scimitar',
            grant: { items: [{ text: 'Scimitar', weight: 3 }] },
          },
          {
            label: 'Any simple melee weapon',
            grant: {
              picks: [
                {
                  id: 'druid-melee-choice',
                  kind: 'weapon',
                  label: 'Simple melee weapon',
                  count: 1,
                  options: ['Club', 'Dagger', 'Mace', 'Quarterstaff', 'Spear'],
                  open: true,
                },
              ],
            },
          },
        ],
      },
    ],
    spellcasting: {
      ability: 'wis',
      slotsAtLevel1: 2,
      cantripsKnown: 2,
      spellsKnown: 0,
      prepares: true,
      listLabel: 'Druid spells',
      slotsByLevel: {
        1: [2],
        2: [3],
        3: [4, 2],
        4: [4, 3],
        5: [4, 3, 2],
        6: [4, 3, 3],
        7: [4, 3, 3, 1],
        8: [4, 3, 3, 2],
        9: [4, 3, 3, 3, 1],
        10: [4, 3, 3, 3, 2],
        11: [4, 3, 3, 3, 2, 1],
        12: [4, 3, 3, 3, 2, 1],
        13: [4, 3, 3, 3, 2, 1, 1],
        14: [4, 3, 3, 3, 2, 1, 1],
        15: [4, 3, 3, 3, 2, 1, 1, 1],
        16: [4, 3, 3, 3, 2, 1, 1, 1],
        17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
        18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
        19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
        20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
      },
      cantripsByLevel: {
        1: 2,
        4: 3,
        10: 4,
      },
    },
    features: [
      {
        level: 1,
        name: 'Druidic',
        text: 'You know Druidic, the secret language of druids, and can leave hidden messages that others cannot find without magic.',
      },
      {
        level: 1,
        name: 'Spellcasting',
        text: 'Drawing on the divine essence of nature, you can cast druid spells. Wisdom is your spellcasting ability.',
      },
      {
        level: 2,
        name: 'Wild Shape',
        text: 'As an action, you can magically assume the shape of a beast you have seen before, twice per short or long rest.',
      },
      {
        level: 2,
        name: 'Druid Circle',
        text: 'Choose a circle that shapes your druidic practice.',
      },
      {
        level: 18,
        name: 'Timeless Body',
        text: 'You age more slowly: for every 10 years that pass, your body ages only 1 year.',
      },
      {
        level: 18,
        name: 'Beast Spells',
        text: 'You can cast many of your druid spells in any shape you assume with Wild Shape.',
      },
      {
        level: 20,
        name: 'Archdruid',
        text: 'You can use Wild Shape an unlimited number of times, and ignore verbal and somatic components of your druid spells while transformed.',
      },
    ],
  },
  {
    id: 'fighter',
    name: 'Fighter',
    asiLevels: [4, 6, 8, 12, 14, 16, 19],
    hitDie: 10,
    subclassLabel: 'Martial Archetype',
    subclasses: [
      {
        id: 'champion',
        name: 'Champion',
        summary: 'Raw physical power honed to deadly perfection.',
        features: [
          {
            level: 3,
            name: 'Improved Critical',
            text: 'Your weapon attacks score a critical hit on a roll of 19 or 20.',
          },
          {
            level: 7,
            name: 'Remarkable Athlete',
            text: 'Add half your proficiency bonus, rounded up, to any Strength, Dexterity or Constitution check that does not already use it. Your running long jump increases by a number of feet equal to your Strength modifier.',
          },
          {
            level: 10,
            name: 'Additional Fighting Style',
            text: 'You take a second Fighting Style.',
            picks: [FIGHTING_STYLE_PICK('champion-second', FIGHTER_STYLES)],
          },
          {
            level: 15,
            name: 'Superior Critical',
            text: 'Your weapon attacks score a critical hit on a roll of 18-20.',
          },
          {
            level: 18,
            name: 'Survivor',
            text: 'At the start of each of your turns, regain hit points equal to 5 + your Constitution modifier if you have no more than half your hit points left and are not at 0.',
          },
        ],
      },
      {
        id: 'battle-master',
        name: 'Battle Master',
        summary: 'Techniques and tactics learned as much as drilled.',
        features: [
          {
            level: 3,
            name: 'Combat Superiority',
            text: 'You have four superiority dice (d8), regained on a short or long rest. Your manoeuvre save DC is 8 + your proficiency bonus + your Strength or Dexterity modifier.',
            resource: {
              name: 'Superiority Dice',
              total: 4,
              resets: 'short',
            },
            picks: [MANEUVER_PICK('battle-master-3', 3)],
          },
          {
            level: 3,
            name: 'Student of War',
            text: 'You gain proficiency with one type of artisan’s tools of your choice.',
            picks: [
              {
                id: 'battle-master-tools',
                kind: 'tool',
                label: 'One type of artisan’s tools',
                count: 1,
                options: [...ARTISAN_TOOLS],
                open: true,
              },
            ],
          },
          {
            level: 7,
            name: 'Know Your Enemy',
            text: 'Study a creature for one minute outside combat to learn how its Strength, Dexterity, Constitution, AC, current hit points, total levels or class levels compare to your own.',
          },
          {
            level: 7,
            name: 'Additional Manoeuvres (7th)',
            text: 'You learn two more manoeuvres, and gain a fifth superiority die.',
            resource: {
              name: 'Superiority Dice',
              total: 5,
              resets: 'short',
            },
            picks: [MANEUVER_PICK('battle-master-7', 2)],
          },
          {
            level: 10,
            name: 'Improved Combat Superiority',
            text: 'Your superiority dice turn into d10s.',
            picks: [MANEUVER_PICK('battle-master-10', 2)],
          },
          {
            level: 15,
            name: 'Relentless',
            text: 'When you roll initiative and have no superiority dice left, you regain one. You also gain a sixth superiority die and learn two more manoeuvres.',
            resource: {
              name: 'Superiority Dice',
              total: 6,
              resets: 'short',
            },
            picks: [MANEUVER_PICK('battle-master-15', 2)],
          },
          {
            level: 18,
            name: 'Improved Combat Superiority (d12)',
            text: 'Your superiority dice turn into d12s.',
          },
        ],
      },
      {
        id: 'eldritch-knight',
        name: 'Eldritch Knight',
        summary: 'A warrior who studies a narrow band of arcane magic.',
        // No `spells` rows: srd.test.ts refuses subclass spell tables for a
        // class with no `spellcasting` block, and giving Fighter one would
        // claim a full progression this third-caster does not have. The spells
        // are the player's to record on the sheet, as the feature text says.
        features: [
          {
            level: 3,
            name: 'Spellcasting',
            text: 'You learn three cantrips and two 1st-level spells from the wizard list, mostly abjuration and evocation. Intelligence is your spellcasting ability.',
          },
          {
            level: 3,
            name: 'Weapon Bond',
            text: 'Ritually bond with up to two weapons. A bonded weapon cannot be disarmed and can be summoned to your hand as a bonus action.',
          },
          {
            level: 7,
            name: 'War Magic',
            text: 'When you use your action to cast a cantrip, you can make one weapon attack as a bonus action.',
          },
          {
            level: 10,
            name: 'Eldritch Strike',
            text: 'When you hit a creature with a weapon attack, it has disadvantage on its next saving throw against a spell you cast before the end of your next turn.',
          },
          {
            level: 15,
            name: 'Arcane Charge',
            text: 'When you use Action Surge you can teleport up to 30 feet to an unoccupied space you can see.',
          },
          {
            level: 18,
            name: 'Improved War Magic',
            text: 'When you use your action to cast a spell, you can make one weapon attack as a bonus action.',
          },
        ],
      },
    ],
    saves: ['str', 'con'],
    abilityPriority: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
    skillChoices: {
      id: 'fighter-skills',
      kind: 'skill',
      label: 'Choose two skills',
      count: 2,
      options: [
        'acrobatics',
        'animal-handling',
        'athletics',
        'history',
        'insight',
        'intimidation',
        'perception',
        'survival',
      ],
    },
    grant: {
      armor: ['light', 'medium', 'heavy', 'shields'],
      weapons: ['simple', 'martial'],
    },
    equipment: [
      {
        id: 'fighter-armor',
        label: 'Armor',
        options: [
          {
            label: 'Chain mail',
            grant: { items: [{ text: 'Chain mail', weight: 55 }] },
          },
          {
            label: 'Leather armor, longbow and 20 arrows',
            grant: {
              items: [
                { text: 'Leather armor', weight: 10 },
                { text: 'Longbow', weight: 2 },
                { text: 'Arrows', qty: 20, weight: 0.05 },
              ],
            },
          },
        ],
      },
      {
        id: 'fighter-weapon',
        label: 'Weapons',
        options: [
          {
            label: 'A martial weapon and a shield',
            grant: {
              items: [{ text: 'Shield', weight: 6 }],
              picks: [
                {
                  id: 'fighter-martial-single',
                  kind: 'weapon',
                  label: 'Martial weapon',
                  count: 1,
                  options: [
                    'Battleaxe',
                    'Greatsword',
                    'Halberd',
                    'Longsword',
                    'Maul',
                    'Rapier',
                    'Warhammer',
                  ],
                  open: true,
                },
              ],
            },
          },
          {
            label: 'Two martial weapons',
            grant: {
              picks: [
                {
                  id: 'fighter-martial-pair',
                  kind: 'weapon',
                  label: 'Two martial weapons',
                  count: 2,
                  options: [
                    'Battleaxe',
                    'Greatsword',
                    'Halberd',
                    'Longsword',
                    'Maul',
                    'Rapier',
                    'Shortsword',
                    'Warhammer',
                  ],
                  open: true,
                },
              ],
            },
          },
        ],
      },
      {
        id: 'fighter-ranged',
        label: 'Ranged option',
        options: [
          {
            label: 'A light crossbow and 20 bolts',
            grant: {
              items: [
                { text: 'Light crossbow', weight: 5 },
                { text: 'Crossbow bolts', qty: 20, weight: 0.075, fits: null },
              ],
            },
          },
          {
            label: 'Two handaxes',
            grant: { items: [{ text: 'Handaxe', qty: 2, weight: 2 }] },
          },
        ],
      },
      {
        id: 'fighter-pack',
        label: 'Pack',
        options: [
          {
            label: 'A dungeoneer’s pack',
            grant: { items: [PACKS.dungeoneer] },
          },
          { label: 'An explorer’s pack', grant: { items: [PACKS.explorer] } },
        ],
      },
    ],
    features: [
      {
        level: 1,
        name: 'Fighting Style',
        text: 'You adopt a particular style of fighting as your speciality.',
        picks: [FIGHTING_STYLE_PICK('fighter', FIGHTER_STYLES)],
      },
      {
        level: 1,
        name: 'Second Wind',
        text: 'On your turn you can use a bonus action to regain hit points equal to 1d10 + your fighter level. Once per short or long rest.',
      },
      {
        level: 2,
        name: 'Action Surge',
        text: 'On your turn you can take one additional action. Once per short or long rest.',
        resource: { name: 'Action Surge', total: 1, resets: 'short' },
      },
      {
        level: 3,
        name: 'Martial Archetype',
        text: 'Choose an archetype that reflects the style and technique you have honed.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        text: 'You can attack twice, rather than once, whenever you take the Attack action on your turn.',
      },
      {
        level: 9,
        name: 'Indomitable',
        text: 'You can reroll a saving throw you fail, and must use the new roll. Once per long rest.',
        resource: { name: 'Indomitable', total: 1, resets: 'long' },
      },
      // The upgrades are their own rows rather than a clause inside the row
      // above. `featuresGained` de-dupes on `level:name`, so a second "Extra
      // Attack" at 11 is a distinct feature the wizard grants at the right
      // level — where prose in the level-5 row scrolled past unread and left
      // the sheet claiming one extra attack at 20th.
      {
        level: 11,
        name: 'Extra Attack (2)',
        text: 'You can attack three times whenever you take the Attack action on your turn.',
      },
      {
        level: 13,
        name: 'Indomitable (2)',
        text: 'You can use Indomitable twice per long rest.',
        resource: { name: 'Indomitable', total: 2, resets: 'long' },
      },
      {
        level: 17,
        name: 'Action Surge (2)',
        text: 'You can use Action Surge twice per short or long rest, though only once on the same turn.',
        resource: { name: 'Action Surge', total: 2, resets: 'short' },
      },
      {
        level: 17,
        name: 'Indomitable (3)',
        text: 'You can use Indomitable three times per long rest.',
        resource: { name: 'Indomitable', total: 3, resets: 'long' },
      },
      {
        level: 20,
        name: 'Extra Attack (3)',
        text: 'You can attack four times whenever you take the Attack action on your turn.',
      },
    ],
  },
  {
    id: 'monk',
    name: 'Monk',
    asiLevels: [4, 8, 12, 16, 19],
    hitDie: 8,
    subclassLabel: 'Monastic Tradition',
    subclasses: [
      {
        id: 'way-of-the-open-hand',
        name: 'Way of the Open Hand',
        features: [],
      },
      { id: 'way-of-shadow', name: 'Way of Shadow', features: [] },
      {
        id: 'way-of-the-four-elements',
        name: 'Way of the Four Elements',
        features: [],
      },
    ],
    saves: ['str', 'dex'],
    unarmoredDefense: 'wis',
    abilityPriority: ['dex', 'wis', 'con', 'str', 'cha', 'int'],
    skillChoices: {
      id: 'monk-skills',
      kind: 'skill',
      label: 'Choose two skills',
      count: 2,
      options: [
        'acrobatics',
        'athletics',
        'history',
        'insight',
        'religion',
        'stealth',
      ],
    },
    grant: {
      weapons: ['simple', 'shortsword'],
      items: [{ text: 'Dart', qty: 10, weight: 0.25 }],
      picks: [
        {
          id: 'monk-tool-or-instrument',
          kind: 'tool',
          label: 'One artisan’s tool or musical instrument',
          count: 1,
          options: [
            'Smith’s tools',
            'Brewer’s supplies',
            'Calligrapher’s supplies',
            'Carpenter’s tools',
            'Painter’s supplies',
            'Potter’s tools',
            'Flute',
            'Lute',
            'Lyre',
            'Drum',
          ],
          open: true,
        },
      ],
    },
    equipment: [
      {
        id: 'monk-weapon',
        label: 'Weapon',
        options: [
          {
            label: 'A shortsword',
            grant: { items: [{ text: 'Shortsword', weight: 2 }] },
          },
          {
            label: 'Any simple weapon',
            grant: {
              picks: [
                {
                  id: 'monk-simple-choice',
                  kind: 'weapon',
                  label: 'Simple weapon',
                  count: 1,
                  options: ['Club', 'Dagger', 'Quarterstaff', 'Spear'],
                  open: true,
                },
              ],
            },
          },
        ],
      },
      {
        id: 'monk-pack',
        label: 'Pack',
        options: [
          {
            label: 'A dungeoneer’s pack',
            grant: { items: [PACKS.dungeoneer] },
          },
          { label: 'An explorer’s pack', grant: { items: [PACKS.explorer] } },
        ],
      },
    ],
    features: [
      {
        level: 1,
        name: 'Unarmored Defense',
        text: 'While wearing no armor and not wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.',
      },
      {
        level: 1,
        name: 'Martial Arts',
        text: 'Your unarmed strikes and monk weapons use a d4 martial arts die, you may use Dexterity in place of Strength for them, and you can make an unarmed strike as a bonus action when you attack.',
      },
      {
        level: 2,
        name: 'Ki',
        text: 'You have a pool of ki points equal to your monk level, fuelling Flurry of Blows, Patient Defense and Step of the Wind.',
      },
      {
        level: 2,
        name: 'Unarmored Movement',
        text: 'Your speed increases by 10 feet while unarmoured, rising further as you level.',
      },
      {
        level: 3,
        name: 'Monastic Tradition',
        text: 'Choose a tradition to which you commit yourself.',
      },
      {
        level: 3,
        name: 'Deflect Missiles',
        text: 'You can use your reaction to deflect or catch a missile when hit by a ranged weapon attack.',
      },
      {
        level: 4,
        name: 'Slow Fall',
        text: 'You can use your reaction when you fall to reduce the damage by five times your monk level.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        text: 'You can attack twice whenever you take the Attack action on your turn.',
      },
      {
        level: 5,
        name: 'Stunning Strike',
        text: 'When you hit with a melee weapon attack, you can spend 1 ki point to attempt to stun the target.',
      },
      {
        level: 6,
        name: 'Ki-Empowered Strikes',
        text: 'Your unarmed strikes count as magical for overcoming resistance to nonmagical attacks.',
      },
      {
        level: 7,
        name: 'Evasion',
        text: 'When subjected to an effect allowing a Dexterity save for half damage, you take none on a success and half on a failure.',
      },
      {
        level: 7,
        name: 'Stillness of Mind',
        text: 'You can use your action to end one effect on yourself that is causing you to be charmed or frightened.',
      },
      {
        level: 10,
        name: 'Purity of Body',
        text: 'You are immune to disease and poison.',
      },
      {
        level: 13,
        name: 'Tongue of the Sun and Moon',
        text: 'You understand all spoken languages, and any creature that can understand a language can understand you.',
      },
      {
        level: 14,
        name: 'Diamond Soul',
        text: 'You gain proficiency in all saving throws, and can spend 1 ki to reroll a failed save.',
      },
      {
        level: 15,
        name: 'Timeless Body',
        text: 'You no longer suffer the frailty of old age and can’t be aged magically.',
      },
      {
        level: 18,
        name: 'Empty Body',
        text: 'You can spend 4 ki to become invisible for 1 minute, with resistance to all damage but force.',
      },
      {
        level: 20,
        name: 'Perfect Self',
        text: 'When you roll initiative with no ki points remaining, you regain 4.',
      },
    ],
  },
  {
    id: 'paladin',
    name: 'Paladin',
    asiLevels: [4, 8, 12, 16, 19],
    hitDie: 10,
    subclassLabel: 'Sacred Oath',
    subclasses: [
      { id: 'oath-of-devotion', name: 'Oath of Devotion', features: [] },
      {
        id: 'oath-of-the-ancients',
        name: 'Oath of the Ancients',
        features: [],
      },
      { id: 'oath-of-vengeance', name: 'Oath of Vengeance', features: [] },
    ],
    saves: ['wis', 'cha'],
    abilityPriority: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
    skillChoices: {
      id: 'paladin-skills',
      kind: 'skill',
      label: 'Choose two skills',
      count: 2,
      options: [
        'athletics',
        'insight',
        'intimidation',
        'medicine',
        'persuasion',
        'religion',
      ],
    },
    grant: {
      armor: ['light', 'medium', 'heavy', 'shields'],
      weapons: ['simple', 'martial'],
      items: [
        { text: 'Chain mail', weight: 55 },
        { text: 'Holy symbol', weight: 1 },
      ],
    },
    equipment: [
      {
        id: 'paladin-weapon',
        label: 'Weapons',
        options: [
          {
            label: 'A martial weapon and a shield',
            grant: {
              items: [{ text: 'Shield', weight: 6 }],
              picks: [
                {
                  id: 'paladin-martial-single',
                  kind: 'weapon',
                  label: 'Martial weapon',
                  count: 1,
                  options: [
                    'Battleaxe',
                    'Greatsword',
                    'Longsword',
                    'Maul',
                    'Warhammer',
                  ],
                  open: true,
                },
              ],
            },
          },
          {
            label: 'Two martial weapons',
            grant: {
              picks: [
                {
                  id: 'paladin-martial-pair',
                  kind: 'weapon',
                  label: 'Two martial weapons',
                  count: 2,
                  options: [
                    'Battleaxe',
                    'Greatsword',
                    'Longsword',
                    'Maul',
                    'Warhammer',
                  ],
                  open: true,
                },
              ],
            },
          },
        ],
      },
      {
        id: 'paladin-secondary',
        label: 'Secondary weapon',
        options: [
          {
            label: 'Five javelins',
            grant: { items: [{ text: 'Javelin', qty: 5, weight: 2 }] },
          },
          {
            label: 'Any simple melee weapon',
            grant: {
              picks: [
                {
                  id: 'paladin-simple-choice',
                  kind: 'weapon',
                  label: 'Simple melee weapon',
                  count: 1,
                  options: ['Club', 'Dagger', 'Mace', 'Quarterstaff', 'Spear'],
                  open: true,
                },
              ],
            },
          },
        ],
      },
      {
        id: 'paladin-pack',
        label: 'Pack',
        options: [
          { label: 'A priest’s pack', grant: { items: [PACKS.priest] } },
          { label: 'An explorer’s pack', grant: { items: [PACKS.explorer] } },
        ],
      },
    ],
    features: [
      {
        level: 1,
        name: 'Divine Sense',
        text: 'As an action you know the location of any celestial, fiend or undead within 60 feet that is not behind total cover. Uses equal to 1 + your Charisma modifier per long rest.',
      },
      {
        level: 1,
        name: 'Lay on Hands',
        text: 'You have a pool of healing power equal to 5 × your paladin level. As an action you can touch a creature and restore hit points from the pool, or expend 5 points to cure a disease or neutralise a poison.',
      },
      {
        level: 2,
        name: 'Fighting Style',
        text: 'You adopt a style of fighting as your speciality.',
        picks: [FIGHTING_STYLE_PICK('paladin', PALADIN_STYLES)],
      },
      {
        level: 2,
        name: 'Spellcasting',
        text: 'You have learned to draw on divine magic through meditation and prayer.',
      },
      {
        level: 2,
        name: 'Divine Smite',
        text: 'When you hit with a melee weapon attack, you can expend a spell slot to deal extra radiant damage.',
      },
      {
        level: 3,
        name: 'Divine Health',
        text: 'The divine magic flowing through you makes you immune to disease.',
      },
      {
        level: 3,
        name: 'Sacred Oath',
        text: 'You swear the oath that binds you as a paladin forever.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        text: 'You can attack twice whenever you take the Attack action on your turn.',
      },
      {
        level: 6,
        name: 'Aura of Protection',
        text: 'You and friendly creatures within 10 feet add your Charisma modifier to saving throws. 30 feet at 18th level.',
      },
      {
        level: 10,
        name: 'Aura of Courage',
        text: 'You and friendly creatures within 10 feet can’t be frightened while you are conscious.',
      },
      {
        level: 11,
        name: 'Improved Divine Smite',
        text: 'Your melee weapon attacks deal an extra 1d8 radiant damage.',
      },
      {
        level: 14,
        name: 'Cleansing Touch',
        text: 'You can use your action to end one spell on yourself or a willing creature you touch.',
      },
    ],
  },
  {
    id: 'ranger',
    name: 'Ranger',
    asiLevels: [4, 8, 12, 16, 19],
    hitDie: 10,
    subclassLabel: 'Ranger Archetype',
    subclasses: [
      { id: 'hunter', name: 'Hunter', features: [] },
      { id: 'beast-master', name: 'Beast Master', features: [] },
    ],
    saves: ['str', 'dex'],
    abilityPriority: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    skillChoices: {
      id: 'ranger-skills',
      kind: 'skill',
      label: 'Choose three skills',
      count: 3,
      options: [
        'animal-handling',
        'athletics',
        'insight',
        'investigation',
        'nature',
        'perception',
        'stealth',
        'survival',
      ],
    },
    grant: {
      armor: ['light', 'medium', 'shields'],
      weapons: ['simple', 'martial'],
      items: [
        { text: 'Longbow', weight: 2 },
        { text: 'Arrows', qty: 20, weight: 0.05 },
      ],
    },
    equipment: [
      {
        id: 'ranger-armor',
        label: 'Armor',
        options: [
          {
            label: 'Scale mail',
            grant: { items: [{ text: 'Scale mail', weight: 45 }] },
          },
          {
            label: 'Leather armor',
            grant: { items: [{ text: 'Leather armor', weight: 10 }] },
          },
        ],
      },
      {
        id: 'ranger-weapon',
        label: 'Melee weapons',
        options: [
          {
            label: 'Two shortswords',
            grant: { items: [{ text: 'Shortsword', qty: 2, weight: 2 }] },
          },
          {
            label: 'Two simple melee weapons',
            grant: {
              picks: [
                {
                  id: 'ranger-simple-pair',
                  kind: 'weapon',
                  label: 'Two simple melee weapons',
                  count: 2,
                  options: [
                    'Club',
                    'Dagger',
                    'Handaxe',
                    'Mace',
                    'Quarterstaff',
                    'Spear',
                  ],
                  open: true,
                },
              ],
            },
          },
        ],
      },
      {
        id: 'ranger-pack',
        label: 'Pack',
        options: [
          {
            label: 'A dungeoneer’s pack',
            grant: { items: [PACKS.dungeoneer] },
          },
          { label: 'An explorer’s pack', grant: { items: [PACKS.explorer] } },
        ],
      },
    ],
    features: [
      {
        level: 1,
        name: 'Favored Enemy',
        text: 'Choose a type of favoured enemy. You have advantage on Survival checks to track them and Intelligence checks to recall information about them, and you learn one language they speak.',
      },
      {
        level: 1,
        name: 'Natural Explorer',
        text: 'Choose a favoured terrain. Difficult terrain doesn’t slow your group, you can’t become lost except by magic, and you remain alert to danger even while tracking or foraging.',
      },
      {
        level: 2,
        name: 'Fighting Style',
        text: 'You adopt a style of fighting as your speciality.',
        picks: [FIGHTING_STYLE_PICK('ranger', RANGER_STYLES)],
      },
      {
        level: 2,
        name: 'Spellcasting',
        text: 'You have learned to use the magical essence of nature to cast spells.',
      },
      {
        level: 3,
        name: 'Ranger Archetype',
        text: 'Choose an archetype that you strive to emulate.',
      },
      {
        level: 3,
        name: 'Primeval Awareness',
        text: 'You can expend a spell slot to sense whether certain creature types are present within a mile.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        text: 'You can attack twice whenever you take the Attack action on your turn.',
      },
      {
        level: 8,
        name: 'Land’s Stride',
        text: 'Moving through nonmagical difficult terrain costs you no extra movement.',
      },
      {
        level: 10,
        name: 'Hide in Plain Sight',
        text: 'You can spend 1 minute creating camouflage, gaining a bonus to Stealth checks while you remain motionless against it.',
      },
      {
        level: 14,
        name: 'Vanish',
        text: 'You can Hide as a bonus action, and can’t be tracked by nonmagical means.',
      },
      {
        level: 18,
        name: 'Feral Senses',
        text: 'You gain preternatural senses that help you fight creatures you can’t see.',
      },
      {
        level: 20,
        name: 'Foe Slayer',
        text: 'Once on each of your turns, you can add your Wisdom modifier to the attack or damage roll against a favoured enemy.',
      },
    ],
  },
  {
    id: 'rogue',
    name: 'Rogue',
    asiLevels: [4, 8, 10, 12, 16, 19],
    hitDie: 8,
    subclassLabel: 'Roguish Archetype',
    subclasses: [
      { id: 'thief', name: 'Thief', features: [] },
      { id: 'assassin', name: 'Assassin', features: [] },
      { id: 'arcane-trickster', name: 'Arcane Trickster', features: [] },
    ],
    saves: ['dex', 'int'],
    abilityPriority: ['dex', 'con', 'wis', 'cha', 'int', 'str'],
    skillChoices: {
      id: 'rogue-skills',
      kind: 'skill',
      label: 'Choose four skills',
      count: 4,
      options: [
        'acrobatics',
        'athletics',
        'deception',
        'insight',
        'intimidation',
        'investigation',
        'perception',
        'performance',
        'persuasion',
        'sleight-of-hand',
        'stealth',
      ],
    },
    grant: {
      armor: ['light'],
      weapons: ['simple', 'hand crossbow', 'longsword', 'rapier', 'shortsword'],
      tools: ['Thieves’ tools'],
      items: [
        { text: 'Leather armor', weight: 10 },
        { text: 'Dagger', qty: 2, weight: 1 },
        { text: 'Thieves’ tools', weight: 1 },
      ],
      picks: [
        {
          /**
           * The eleven mirror `skillChoices.options` on purpose: they are the
           * *ceiling* on what this class could ever double, and the wizard
           * narrows them to the skills the character actually has via
           * `eligibleExpertise`. Authored rather than derived because
           * `PickList.options` is table data srd.test.ts validates — a pick
           * whose options were computed would be a table the test still passes
           * on while the UI shows something else.
           *
           * Skills only. The SRD also offers "one skill and thieves' tools",
           * but `Character.expertise` is filtered to skill ids on write
           * (`buildCharacter`) and on read (the parser), and the sheet renders
           * expertise as a marker on a skill row — a tool would round-trip
           * through the frontmatter and then render nowhere. A second
           * tool-expertise list plus a sheet row for it is a rules engine's
           * worth of machinery for one sentence; the feature text below still
           * says the option exists, and `Thieves' tools` is already granted
           * above, so a player who wants it writes it in.
           */
          id: 'rogue-expertise',
          kind: 'expertise',
          label: 'Expertise in two of your skill proficiencies',
          count: 2,
          options: [
            'acrobatics',
            'athletics',
            'deception',
            'insight',
            'intimidation',
            'investigation',
            'perception',
            'performance',
            'persuasion',
            'sleight-of-hand',
            'stealth',
          ],
        },
      ],
    },
    equipment: [
      {
        id: 'rogue-weapon-1',
        label: 'Primary weapon',
        options: [
          {
            label: 'A rapier',
            grant: { items: [{ text: 'Rapier', weight: 2 }] },
          },
          {
            label: 'A shortsword',
            grant: { items: [{ text: 'Shortsword', weight: 2 }] },
          },
        ],
      },
      {
        id: 'rogue-weapon-2',
        label: 'Secondary weapon',
        options: [
          {
            label: 'A shortbow and 20 arrows',
            grant: {
              items: [
                { text: 'Shortbow', weight: 2 },
                { text: 'Arrows', qty: 20, weight: 0.05 },
              ],
            },
          },
          {
            label: 'A shortsword',
            grant: { items: [{ text: 'Shortsword', weight: 2 }] },
          },
        ],
      },
      {
        id: 'rogue-pack',
        label: 'Pack',
        options: [
          { label: 'A burglar’s pack', grant: { items: [PACKS.burglar] } },
          {
            label: 'A dungeoneer’s pack',
            grant: { items: [PACKS.dungeoneer] },
          },
          { label: 'An explorer’s pack', grant: { items: [PACKS.explorer] } },
        ],
      },
    ],
    features: [
      {
        level: 1,
        name: 'Expertise',
        text: 'Choose two of your skill proficiencies, or one skill and thieves’ tools. Your proficiency bonus is doubled for any ability check you make using them.',
      },
      {
        level: 1,
        name: 'Sneak Attack',
        text: 'Once per turn, deal an extra 1d6 damage to one creature you hit with an attack if you have advantage, or if another enemy of the target is within 5 feet of it. The attack must use a finesse or ranged weapon.',
      },
      {
        level: 1,
        name: 'Thieves’ Cant',
        text: 'You know thieves’ cant, a secret mix of dialect, jargon and code that lets you hide messages in seemingly normal conversation.',
      },
      {
        level: 2,
        name: 'Cunning Action',
        text: 'You can take a bonus action on each of your turns to Dash, Disengage or Hide.',
      },
      {
        level: 3,
        name: 'Roguish Archetype',
        text: 'Choose an archetype that you emulate in your rogue abilities.',
      },
      {
        level: 5,
        name: 'Uncanny Dodge',
        text: 'When an attacker you can see hits you, you can use your reaction to halve the damage.',
      },
      {
        level: 7,
        name: 'Evasion',
        text: 'When subjected to an effect allowing a Dexterity save for half damage, you take none on a success and half on a failure.',
      },
      {
        level: 11,
        name: 'Reliable Talent',
        text: 'Whenever you make an ability check that lets you add your proficiency bonus, treat a d20 roll of 9 or lower as a 10.',
      },
      {
        level: 14,
        name: 'Blindsense',
        text: 'You are aware of the location of any hidden or invisible creature within 10 feet.',
      },
      {
        level: 15,
        name: 'Slippery Mind',
        text: 'You gain proficiency in Wisdom saving throws.',
      },
      {
        level: 18,
        name: 'Elusive',
        text: 'No attack roll has advantage against you while you aren’t incapacitated.',
      },
      {
        level: 20,
        name: 'Stroke of Luck',
        text: 'You can turn a missed attack into a hit, or a failed ability check into a 20. Once per short or long rest.',
      },
    ],
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    asiLevels: [4, 8, 12, 16, 19],
    hitDie: 6,
    subclassLabel: 'Sorcerous Origin',
    subclasses: [
      { id: 'draconic-bloodline', name: 'Draconic Bloodline', features: [] },
      { id: 'wild-magic', name: 'Wild Magic', features: [] },
    ],
    saves: ['con', 'cha'],
    subclassAtLevel1: true,
    subclassLevel: 1,
    abilityPriority: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
    skillChoices: {
      id: 'sorcerer-skills',
      kind: 'skill',
      label: 'Choose two skills',
      count: 2,
      options: [
        'arcana',
        'deception',
        'insight',
        'intimidation',
        'persuasion',
        'religion',
      ],
    },
    grant: {
      weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'],
      items: [{ text: 'Dagger', qty: 2, weight: 1 }],
    },
    equipment: [
      {
        id: 'sorcerer-weapon',
        label: 'Weapon',
        options: [
          {
            label: 'A light crossbow and 20 bolts',
            grant: {
              items: [
                { text: 'Light crossbow', weight: 5 },
                { text: 'Crossbow bolts', qty: 20, weight: 0.075, fits: null },
              ],
            },
          },
          {
            label: 'Any simple weapon',
            grant: {
              picks: [
                {
                  id: 'sorcerer-simple-choice',
                  kind: 'weapon',
                  label: 'Simple weapon',
                  count: 1,
                  options: ['Club', 'Dagger', 'Mace', 'Quarterstaff', 'Spear'],
                  open: true,
                },
              ],
            },
          },
        ],
      },
      {
        id: 'sorcerer-focus',
        label: 'Spellcasting focus',
        options: [
          {
            label: 'A component pouch',
            grant: { items: [{ text: 'Component pouch', weight: 2 }] },
          },
          {
            label: 'An arcane focus',
            grant: { items: [{ text: 'Arcane focus', weight: 1 }] },
          },
        ],
      },
      {
        id: 'sorcerer-pack',
        label: 'Pack',
        options: [
          {
            label: 'A dungeoneer’s pack',
            grant: { items: [PACKS.dungeoneer] },
          },
          { label: 'An explorer’s pack', grant: { items: [PACKS.explorer] } },
        ],
      },
    ],
    spellcasting: {
      ability: 'cha',
      slotsAtLevel1: 2,
      cantripsKnown: 4,
      spellsKnown: 2,
      prepares: false,
      listLabel: 'Sorcerer spells',
      slotsByLevel: {
        1: [2],
        2: [3],
        3: [4, 2],
        4: [4, 3],
        5: [4, 3, 2],
        6: [4, 3, 3],
        7: [4, 3, 3, 1],
        8: [4, 3, 3, 2],
        9: [4, 3, 3, 3, 1],
        10: [4, 3, 3, 3, 2],
        11: [4, 3, 3, 3, 2, 1],
        12: [4, 3, 3, 3, 2, 1],
        13: [4, 3, 3, 3, 2, 1, 1],
        14: [4, 3, 3, 3, 2, 1, 1],
        15: [4, 3, 3, 3, 2, 1, 1, 1],
        16: [4, 3, 3, 3, 2, 1, 1, 1],
        17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
        18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
        19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
        20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
      },
      cantripsByLevel: {
        1: 4,
        4: 5,
        10: 6,
      },
    },
    features: [
      {
        level: 1,
        name: 'Spellcasting',
        text: 'An event in your past left an indelible mark on you, infusing you with arcane magic. Charisma is your spellcasting ability.',
      },
      {
        level: 1,
        name: 'Sorcerous Origin',
        text: 'Choose a sorcerous origin describing the source of your innate magical power, which grants you features at 1st level.',
      },
      {
        level: 2,
        name: 'Font of Magic',
        text: 'You have sorcery points equal to your sorcerer level, which you can convert into spell slots and back.',
      },
      {
        level: 3,
        name: 'Metamagic',
        text: 'You can twist your spells with two Metamagic options; a third at 10th level and a fourth at 17th.',
      },
      {
        level: 20,
        name: 'Sorcerous Restoration',
        text: 'You regain 4 expended sorcery points when you finish a short rest.',
      },
    ],
  },
  {
    id: 'warlock',
    name: 'Warlock',
    asiLevels: [4, 8, 12, 16, 19],
    hitDie: 8,
    subclassLabel: 'Otherworldly Patron',
    subclasses: [
      { id: 'the-archfey', name: 'The Archfey', features: [] },
      { id: 'the-fiend', name: 'The Fiend', features: [] },
      { id: 'the-great-old-one', name: 'The Great Old One', features: [] },
    ],
    saves: ['wis', 'cha'],
    subclassAtLevel1: true,
    subclassLevel: 1,
    abilityPriority: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
    skillChoices: {
      id: 'warlock-skills',
      kind: 'skill',
      label: 'Choose two skills',
      count: 2,
      options: [
        'arcana',
        'deception',
        'history',
        'intimidation',
        'investigation',
        'nature',
        'religion',
      ],
    },
    grant: {
      armor: ['light'],
      weapons: ['simple'],
      items: [
        { text: 'Leather armor', weight: 10 },
        { text: 'Dagger', qty: 2, weight: 1 },
      ],
    },
    equipment: [
      {
        id: 'warlock-weapon',
        label: 'Weapon',
        options: [
          {
            label: 'A light crossbow and 20 bolts',
            grant: {
              items: [
                { text: 'Light crossbow', weight: 5 },
                { text: 'Crossbow bolts', qty: 20, weight: 0.075, fits: null },
              ],
            },
          },
          {
            label: 'Any simple weapon',
            grant: {
              picks: [
                {
                  id: 'warlock-simple-choice',
                  kind: 'weapon',
                  label: 'Simple weapon',
                  count: 1,
                  options: ['Club', 'Dagger', 'Mace', 'Quarterstaff', 'Spear'],
                  open: true,
                },
              ],
            },
          },
        ],
      },
      {
        id: 'warlock-focus',
        label: 'Spellcasting focus',
        options: [
          {
            label: 'A component pouch',
            grant: { items: [{ text: 'Component pouch', weight: 2 }] },
          },
          {
            label: 'An arcane focus',
            grant: { items: [{ text: 'Arcane focus', weight: 1 }] },
          },
        ],
      },
      {
        id: 'warlock-pack',
        label: 'Pack',
        options: [
          { label: 'A scholar’s pack', grant: { items: [PACKS.scholar] } },
          {
            label: 'A dungeoneer’s pack',
            grant: { items: [PACKS.dungeoneer] },
          },
        ],
      },
    ],
    spellcasting: {
      ability: 'cha',
      // Warlock slots are Pact Magic — few, but always at the highest level
      // and refreshed on a short rest. At level 1 that is one 1st-level slot.
      slotsAtLevel1: 1,
      cantripsKnown: 2,
      spellsKnown: 2,
      prepares: false,
      listLabel: 'Warlock spells',
      slotsByLevel: {
        1: [1],
        2: [2],
        3: [0, 2],
        4: [0, 2],
        5: [0, 0, 2],
        6: [0, 0, 2],
        7: [0, 0, 0, 2],
        8: [0, 0, 0, 2],
        9: [0, 0, 0, 0, 2],
        10: [0, 0, 0, 0, 2],
        11: [0, 0, 0, 0, 3],
        12: [0, 0, 0, 0, 3],
        13: [0, 0, 0, 0, 3],
        14: [0, 0, 0, 0, 3],
        15: [0, 0, 0, 0, 3],
        16: [0, 0, 0, 0, 3],
        17: [0, 0, 0, 0, 4],
        18: [0, 0, 0, 0, 4],
        19: [0, 0, 0, 0, 4],
        20: [0, 0, 0, 0, 4],
      },
      cantripsByLevel: {
        1: 2,
        4: 3,
        10: 4,
      },
    },
    features: [
      {
        level: 1,
        name: 'Otherworldly Patron',
        text: 'You have struck a bargain with an otherworldly being, which grants you features at 1st level and as you gain levels.',
      },
      {
        level: 1,
        name: 'Pact Magic',
        text: 'Your arcane research and the magic bestowed by your patron let you cast spells. Your slots are all of the same level and you regain them on a short or long rest. Charisma is your spellcasting ability.',
      },
      {
        level: 2,
        name: 'Eldritch Invocations',
        text: 'You learn two invocations of your choice, gaining more and being able to replace them as you level.',
      },
      {
        level: 3,
        name: 'Pact Boon',
        text: 'Your patron bestows a gift: the Pact of the Chain, Blade or Tome.',
      },
      {
        level: 11,
        name: 'Mystic Arcanum',
        text: 'You gain a 6th-level spell you can cast once per long rest; a 7th at 13th level, an 8th at 15th, a 9th at 17th.',
      },
      {
        level: 20,
        name: 'Eldritch Master',
        text: 'You can entreat your patron to regain all expended spell slots. Once per long rest.',
      },
    ],
  },
  {
    id: 'wizard',
    name: 'Wizard',
    asiLevels: [4, 8, 12, 16, 19],
    hitDie: 6,
    subclassLabel: 'Arcane Tradition',
    subclasses: [
      {
        id: 'school-of-abjuration',
        name: 'School of Abjuration',
        features: [],
      },
      {
        id: 'school-of-conjuration',
        name: 'School of Conjuration',
        features: [],
      },
      {
        id: 'school-of-divination',
        name: 'School of Divination',
        features: [],
      },
      {
        id: 'school-of-enchantment',
        name: 'School of Enchantment',
        features: [],
      },
      { id: 'school-of-evocation', name: 'School of Evocation', features: [] },
      { id: 'school-of-illusion', name: 'School of Illusion', features: [] },
      {
        id: 'school-of-necromancy',
        name: 'School of Necromancy',
        features: [],
      },
      {
        id: 'school-of-transmutation',
        name: 'School of Transmutation',
        features: [],
      },
    ],
    saves: ['int', 'wis'],
    // A wizard picks their school at 2, not 3. `subclassAtLevel1` had no way to
    // say that, so an Evocation Wizard used to get Sculpt Spells a level late.
    subclassLevel: 2,
    abilityPriority: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
    skillChoices: {
      id: 'wizard-skills',
      kind: 'skill',
      label: 'Choose two skills',
      count: 2,
      options: [
        'arcana',
        'history',
        'insight',
        'investigation',
        'medicine',
        'religion',
      ],
    },
    grant: {
      weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'],
      items: [{ text: 'Spellbook', weight: 3 }],
    },
    equipment: [
      {
        id: 'wizard-weapon',
        label: 'Weapon',
        options: [
          {
            label: 'A quarterstaff',
            grant: { items: [{ text: 'Quarterstaff', weight: 4 }] },
          },
          {
            label: 'A dagger',
            grant: { items: [{ text: 'Dagger', weight: 1 }] },
          },
        ],
      },
      {
        id: 'wizard-focus',
        label: 'Spellcasting focus',
        options: [
          {
            label: 'A component pouch',
            grant: { items: [{ text: 'Component pouch', weight: 2 }] },
          },
          {
            label: 'An arcane focus',
            grant: { items: [{ text: 'Arcane focus', weight: 1 }] },
          },
        ],
      },
      {
        id: 'wizard-pack',
        label: 'Pack',
        options: [
          { label: 'A scholar’s pack', grant: { items: [PACKS.scholar] } },
          { label: 'An explorer’s pack', grant: { items: [PACKS.explorer] } },
        ],
      },
    ],
    spellcasting: {
      ability: 'int',
      slotsAtLevel1: 2,
      cantripsKnown: 3,
      // A wizard's spellbook starts with six 1st-level spells; they prepare
      // from it daily.
      spellsKnown: 6,
      prepares: true,
      listLabel: 'Wizard spells',
      slotsByLevel: {
        1: [2],
        2: [3],
        3: [4, 2],
        4: [4, 3],
        5: [4, 3, 2],
        6: [4, 3, 3],
        7: [4, 3, 3, 1],
        8: [4, 3, 3, 2],
        9: [4, 3, 3, 3, 1],
        10: [4, 3, 3, 3, 2],
        11: [4, 3, 3, 3, 2, 1],
        12: [4, 3, 3, 3, 2, 1],
        13: [4, 3, 3, 3, 2, 1, 1],
        14: [4, 3, 3, 3, 2, 1, 1],
        15: [4, 3, 3, 3, 2, 1, 1, 1],
        16: [4, 3, 3, 3, 2, 1, 1, 1],
        17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
        18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
        19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
        20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
      },
      cantripsByLevel: {
        1: 3,
        4: 4,
        10: 5,
      },
    },
    features: [
      {
        level: 1,
        name: 'Spellcasting',
        text: 'As a student of arcane magic, you have a spellbook containing spells that show the first glimmerings of your true power. Intelligence is your spellcasting ability.',
      },
      {
        level: 1,
        name: 'Arcane Recovery',
        text: 'Once per day when you finish a short rest, you can recover expended spell slots with a combined level equal to or less than half your wizard level, rounded up.',
      },
      {
        level: 2,
        name: 'Arcane Tradition',
        text: 'You choose an arcane tradition, shaping your practice of magic.',
      },
      {
        level: 18,
        name: 'Spell Mastery',
        text: 'Choose a 1st-level and a 2nd-level spell you can cast at will, at their lowest level, without expending a slot.',
      },
      {
        level: 20,
        name: 'Signature Spells',
        text: 'Choose two 3rd-level spells. You can cast each once without expending a slot, and regain them on a short rest.',
      },
    ],
  },
]
