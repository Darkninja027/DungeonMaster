/**
 * Level 1 starting kits for the twelve SRD 5.1 classes (CC BY 4.0 — see
 * ./index.ts).
 *
 * A kit is keyed by *name* against the world's own class list, never the other
 * way round: `useClasses(worldId)` decides which classes exist and what hit die
 * each has, and this file only fills in a starting kit for the names it
 * recognises. A homebrew class gets no kit, and the wizard says so plainly
 * rather than pretending.
 *
 * Level 1 only, by design. No per-level feature tables, no slot progression —
 * see the header of lib/classes.ts. Features listed here are the ones gained at
 * 1st level; the sheet takes it from there.
 *
 * Ranger and Paladin have no `spellcasting` block because they gain spells at
 * 2nd level, which is correct for a level 1 build.
 */

import { PACKS } from './equipment'
import type { ClassKit } from './types'

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
        name: 'Rage',
        text: 'In battle you fight with primal ferocity. As a bonus action you enter a rage for up to 1 minute: advantage on Strength checks and saves, a bonus to melee damage, and resistance to bludgeoning, piercing and slashing damage. Twice per long rest at 1st level.',
      },
      {
        name: 'Unarmored Defense',
        text: 'While wearing no armor, your AC equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit.',
      },
    ],
  },
  {
    id: 'bard',
    name: 'Bard',
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
    },
    features: [
      {
        name: 'Bardic Inspiration',
        text: 'As a bonus action, give one creature within 60 feet a d6 they can add to one ability check, attack roll or saving throw within the next 10 minutes. Uses equal to your Charisma modifier, regained on a long rest.',
      },
      {
        name: 'Spellcasting',
        text: 'You have learned to untangle and reshape the fabric of reality in harmony with your music. Charisma is your spellcasting ability.',
      },
    ],
  },
  {
    id: 'cleric',
    name: 'Cleric',
    saves: ['wis', 'cha'],
    subclassAtLevel1: true,
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
    },
    features: [
      {
        name: 'Spellcasting',
        text: 'As a conduit for divine power, you can cast cleric spells. You prepare a number of them each day equal to your Wisdom modifier + your cleric level.',
      },
      {
        name: 'Divine Domain',
        text: 'You choose a domain related to your deity, granting you domain spells and other features at 1st level.',
      },
    ],
  },
  {
    id: 'druid',
    name: 'Druid',
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
    },
    features: [
      {
        name: 'Druidic',
        text: 'You know Druidic, the secret language of druids, and can leave hidden messages that others cannot find without magic.',
      },
      {
        name: 'Spellcasting',
        text: 'Drawing on the divine essence of nature, you can cast druid spells. Wisdom is your spellcasting ability.',
      },
    ],
  },
  {
    id: 'fighter',
    name: 'Fighter',
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
        name: 'Fighting Style',
        text: 'You adopt a particular style of fighting as your speciality — Archery, Defense, Duelling, Great Weapon Fighting, Protection or Two-Weapon Fighting.',
      },
      {
        name: 'Second Wind',
        text: 'On your turn you can use a bonus action to regain hit points equal to 1d10 + your fighter level. Once per short or long rest.',
      },
    ],
  },
  {
    id: 'monk',
    name: 'Monk',
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
        name: 'Unarmored Defense',
        text: 'While wearing no armor and not wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.',
      },
      {
        name: 'Martial Arts',
        text: 'Your unarmed strikes and monk weapons use a d4 martial arts die, you may use Dexterity in place of Strength for them, and you can make an unarmed strike as a bonus action when you attack.',
      },
    ],
  },
  {
    id: 'paladin',
    name: 'Paladin',
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
        name: 'Divine Sense',
        text: 'As an action you know the location of any celestial, fiend or undead within 60 feet that is not behind total cover. Uses equal to 1 + your Charisma modifier per long rest.',
      },
      {
        name: 'Lay on Hands',
        text: 'You have a pool of healing power equal to 5 × your paladin level. As an action you can touch a creature and restore hit points from the pool, or expend 5 points to cure a disease or neutralise a poison.',
      },
    ],
  },
  {
    id: 'ranger',
    name: 'Ranger',
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
        name: 'Favored Enemy',
        text: 'Choose a type of favoured enemy. You have advantage on Survival checks to track them and Intelligence checks to recall information about them, and you learn one language they speak.',
      },
      {
        name: 'Natural Explorer',
        text: 'Choose a favoured terrain. Difficult terrain doesn’t slow your group, you can’t become lost except by magic, and you remain alert to danger even while tracking or foraging.',
      },
    ],
  },
  {
    id: 'rogue',
    name: 'Rogue',
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
        name: 'Expertise',
        text: 'Choose two of your skill proficiencies, or one skill and thieves’ tools. Your proficiency bonus is doubled for any ability check you make using them.',
      },
      {
        name: 'Sneak Attack',
        text: 'Once per turn, deal an extra 1d6 damage to one creature you hit with an attack if you have advantage, or if another enemy of the target is within 5 feet of it. The attack must use a finesse or ranged weapon.',
      },
      {
        name: 'Thieves’ Cant',
        text: 'You know thieves’ cant, a secret mix of dialect, jargon and code that lets you hide messages in seemingly normal conversation.',
      },
    ],
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    saves: ['con', 'cha'],
    subclassAtLevel1: true,
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
    },
    features: [
      {
        name: 'Spellcasting',
        text: 'An event in your past left an indelible mark on you, infusing you with arcane magic. Charisma is your spellcasting ability.',
      },
      {
        name: 'Sorcerous Origin',
        text: 'Choose a sorcerous origin describing the source of your innate magical power, which grants you features at 1st level.',
      },
    ],
  },
  {
    id: 'warlock',
    name: 'Warlock',
    saves: ['wis', 'cha'],
    subclassAtLevel1: true,
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
    },
    features: [
      {
        name: 'Otherworldly Patron',
        text: 'You have struck a bargain with an otherworldly being, which grants you features at 1st level and as you gain levels.',
      },
      {
        name: 'Pact Magic',
        text: 'Your arcane research and the magic bestowed by your patron let you cast spells. Your slots are all of the same level and you regain them on a short or long rest. Charisma is your spellcasting ability.',
      },
    ],
  },
  {
    id: 'wizard',
    name: 'Wizard',
    saves: ['int', 'wis'],
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
    },
    features: [
      {
        name: 'Spellcasting',
        text: 'As a student of arcane magic, you have a spellbook containing spells that show the first glimmerings of your true power. Intelligence is your spellcasting ability.',
      },
      {
        name: 'Arcane Recovery',
        text: 'Once per day when you finish a short rest, you can recover expended spell slots with a combined level equal to or less than half your wizard level, rounded up.',
      },
    ],
  },
]
