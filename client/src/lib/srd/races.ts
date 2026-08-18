/**
 * The nine SRD 5.1 races and their subraces (CC BY 4.0 — see ./index.ts).
 *
 * Only what the SRD actually contains. The PHB has subraces and races this file
 * does not, and they are absent deliberately rather than by oversight: a player
 * who wants a Tiefling variant or a Duergar types the name, and the sheet keeps
 * it. See the header of ./types.ts on why these tables are an affordance and
 * never a filter.
 *
 * Trait text is summarised to a sentence or two. The sheet is a notebook, not a
 * rulebook — enough to remember what the trait does, not a transcription of the
 * whole entry.
 */

import { ALL_LANGUAGES, ARTISAN_TOOLS } from './equipment'
import type { RaceInfo } from './types'

export const SRD_RACES: Array<RaceInfo> = [
  {
    id: 'dwarf',
    name: 'Dwarf',
    summary: 'Stout and hardy, at home in stone and darkness.',
    asi: { con: 2 },
    speed: 25,
    grant: {
      languages: ['Common', 'Dwarvish'],
      weapons: ['battleaxe', 'handaxe', 'light hammer', 'warhammer'],
      resistances: ['poison'],
      traits: [
        {
          name: 'Darkvision',
          text: 'See in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light — in shades of grey.',
        },
        {
          name: 'Dwarven Resilience',
          text: 'Advantage on saving throws against poison, and resistance to poison damage.',
        },
        {
          name: 'Stonecunning',
          text: 'Treat any Intelligence (History) check about stonework as proficient, and double your proficiency bonus.',
        },
      ],
      picks: [
        {
          id: 'dwarf-tools',
          kind: 'tool',
          label: 'Dwarven tool proficiency',
          count: 1,
          options: ['Smith’s tools', 'Brewer’s supplies', 'Mason’s tools'],
        },
      ],
    },
    subraces: [
      {
        id: 'hill-dwarf',
        name: 'Hill Dwarf',
        summary: 'Keen senses and remarkable toughness.',
        asi: { wis: 1 },
        // The one derived-number exception in the whole dataset. See the doc
        // comment on SubraceInfo.hpPerLevel before adding a second.
        hpPerLevel: 1,
        grant: {
          traits: [
            {
              name: 'Dwarven Toughness',
              text: 'Your hit point maximum increases by 1, and by 1 again every time you gain a level.',
            },
          ],
        },
      },
      {
        id: 'mountain-dwarf',
        name: 'Mountain Dwarf',
        summary: 'Strong, and trained to wear armor.',
        asi: { str: 2 },
        grant: {
          armor: ['light', 'medium'],
          traits: [
            {
              name: 'Dwarven Armor Training',
              text: 'Proficiency with light and medium armor.',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'elf',
    name: 'Elf',
    summary: 'Graceful and long-lived, with an otherworldly focus.',
    asi: { dex: 2 },
    speed: 30,
    grant: {
      languages: ['Common', 'Elvish'],
      skills: ['perception'],
      conditionImmunities: ['charmed'],
      traits: [
        {
          name: 'Darkvision',
          text: 'See in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
        },
        {
          name: 'Fey Ancestry',
          text: 'Advantage on saving throws against being charmed, and magic can’t put you to sleep.',
        },
        {
          name: 'Trance',
          text: 'You don’t sleep. You meditate deeply for 4 hours a day and gain the benefit of 8 hours of sleep.',
        },
        {
          name: 'Keen Senses',
          text: 'Proficiency in the Perception skill.',
        },
      ],
    },
    subraces: [
      {
        id: 'high-elf',
        name: 'High Elf',
        summary: 'Keen mind, a wizard cantrip and an extra language.',
        asi: { int: 1 },
        grant: {
          weapons: ['longsword', 'shortsword', 'shortbow', 'longbow'],
          traits: [
            {
              name: 'Elf Weapon Training',
              text: 'Proficiency with the longsword, shortsword, shortbow and longbow.',
            },
            {
              name: 'Cantrip',
              text: 'You know one cantrip of your choice from the wizard spell list. Intelligence is your spellcasting ability for it.',
            },
          ],
          picks: [
            {
              id: 'high-elf-language',
              kind: 'language',
              label: 'Extra language',
              count: 1,
              options: [...ALL_LANGUAGES],
              open: true,
            },
            {
              id: 'high-elf-cantrip',
              kind: 'cantrip',
              label: 'Wizard cantrip',
              count: 1,
              options: [],
              open: true,
            },
          ],
        },
      },
      {
        id: 'wood-elf',
        name: 'Wood Elf',
        summary: 'Fleet-footed, and hard to spot in the wild.',
        asi: { wis: 1 },
        speed: 35,
        grant: {
          weapons: ['longsword', 'shortsword', 'shortbow', 'longbow'],
          traits: [
            {
              name: 'Elf Weapon Training',
              text: 'Proficiency with the longsword, shortsword, shortbow and longbow.',
            },
            {
              name: 'Fleet of Foot',
              text: 'Your base walking speed is 35 feet.',
            },
            {
              name: 'Mask of the Wild',
              text: 'You can attempt to hide even when only lightly obscured by foliage, heavy rain, falling snow, mist or other natural phenomena.',
            },
          ],
        },
      },
      {
        id: 'dark-elf-drow',
        name: 'Dark Elf (Drow)',
        summary:
          'Superior darkvision and innate magic, ill at ease in sunlight.',
        asi: { cha: 1 },
        grant: {
          weapons: ['rapier', 'shortsword', 'hand crossbow'],
          traits: [
            {
              name: 'Superior Darkvision',
              text: 'Your darkvision has a radius of 120 feet.',
            },
            {
              name: 'Sunlight Sensitivity',
              text: 'Disadvantage on attack rolls and on Perception checks relying on sight when you, your target, or what you are looking at is in direct sunlight.',
            },
            {
              name: 'Drow Magic',
              text: 'You know the dancing lights cantrip. At 3rd level you can cast faerie fire once per long rest, and at 5th darkness. Charisma is your spellcasting ability for them.',
            },
            {
              name: 'Drow Weapon Training',
              text: 'Proficiency with rapiers, shortswords and hand crossbows.',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'halfling',
    name: 'Halfling',
    summary: 'Small, nimble and improbably lucky.',
    asi: { dex: 2 },
    speed: 25,
    grant: {
      languages: ['Common', 'Halfling'],
      conditionImmunities: ['frightened'],
      traits: [
        {
          name: 'Lucky',
          text: 'When you roll a 1 on an attack roll, ability check or saving throw, you can reroll the die and must use the new roll.',
        },
        {
          name: 'Brave',
          text: 'Advantage on saving throws against being frightened.',
        },
        {
          name: 'Halfling Nimbleness',
          text: 'You can move through the space of any creature that is of a size larger than yours.',
        },
      ],
    },
    subraces: [
      {
        id: 'lightfoot-halfling',
        name: 'Lightfoot Halfling',
        summary: 'Charming, and easily hidden.',
        asi: { cha: 1 },
        grant: {
          traits: [
            {
              name: 'Naturally Stealthy',
              text: 'You can attempt to hide even when obscured only by a creature that is at least one size larger than you.',
            },
          ],
        },
      },
      {
        id: 'stout-halfling',
        name: 'Stout Halfling',
        summary: 'Hardier than most, with a dwarf’s resilience.',
        asi: { con: 1 },
        grant: {
          resistances: ['poison'],
          traits: [
            {
              name: 'Stout Resilience',
              text: 'Advantage on saving throws against poison, and resistance to poison damage.',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'human',
    name: 'Human',
    summary: 'Versatile and ambitious — a little of everything.',
    asi: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    speed: 30,
    grant: {
      languages: ['Common'],
      picks: [
        {
          id: 'human-language',
          kind: 'language',
          label: 'Extra language',
          count: 1,
          options: [...ALL_LANGUAGES],
          open: true,
        },
      ],
    },
  },
  {
    id: 'variant-human',
    name: 'Variant Human',
    summary: 'Two +1s, a skill and a feat at first level.',
    asi: {},
    speed: 30,
    flexibleAsi: { count: 2, amount: 1 },
    grantsFeat: true,
    grant: {
      languages: ['Common'],
      picks: [
        {
          id: 'variant-human-language',
          kind: 'language',
          label: 'Extra language',
          count: 1,
          options: [...ALL_LANGUAGES],
          open: true,
        },
        {
          id: 'variant-human-skill',
          kind: 'skill',
          label: 'Skill proficiency',
          count: 1,
          options: [
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
          ],
        },
      ],
    },
  },
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    summary: 'Draconic heritage, a breath weapon and matching resistance.',
    asi: { str: 2, cha: 1 },
    speed: 30,
    grant: {
      languages: ['Common', 'Draconic'],
      traits: [
        {
          name: 'Draconic Ancestry',
          text: 'Choose a dragon type. Your breath weapon and damage resistance are determined by the choice.',
        },
        {
          name: 'Breath Weapon',
          text: 'Exhale destructive energy as an action (2d6 in a 15-foot cone or 5-by-30-foot line, DC 8 + CON modifier + proficiency bonus). Once per short or long rest.',
        },
        {
          name: 'Damage Resistance',
          text: 'Resistance to the damage type associated with your draconic ancestry.',
        },
      ],
      picks: [
        {
          id: 'dragonborn-ancestry',
          kind: 'other',
          label: 'Draconic ancestry',
          count: 1,
          options: [
            'Black (acid)',
            'Blue (lightning)',
            'Brass (fire)',
            'Bronze (lightning)',
            'Copper (acid)',
            'Gold (fire)',
            'Green (poison)',
            'Red (fire)',
            'Silver (cold)',
            'White (cold)',
          ],
        },
      ],
    },
  },
  {
    id: 'gnome',
    name: 'Gnome',
    summary: 'Small, bright and hard to fool with magic.',
    asi: { int: 2 },
    speed: 25,
    grant: {
      languages: ['Common', 'Gnomish'],
      traits: [
        {
          name: 'Darkvision',
          text: 'See in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
        },
        {
          name: 'Gnome Cunning',
          text: 'Advantage on all Intelligence, Wisdom and Charisma saving throws against magic.',
        },
      ],
    },
    subraces: [
      {
        id: 'forest-gnome',
        name: 'Forest Gnome',
        summary: 'Nimble, with a knack for illusion and a way with animals.',
        asi: { dex: 1 },
        grant: {
          traits: [
            {
              name: 'Natural Illusionist',
              text: 'You know the minor illusion cantrip. Intelligence is your spellcasting ability for it.',
            },
            {
              name: 'Speak with Small Beasts',
              text: 'Through sound and gesture you can communicate simple ideas with Small or smaller beasts.',
            },
          ],
        },
      },
      {
        id: 'rock-gnome',
        name: 'Rock Gnome',
        summary: 'Tough, and a natural tinkerer.',
        asi: { con: 1 },
        grant: {
          tools: ['Tinker’s tools'],
          traits: [
            {
              name: 'Artificer’s Lore',
              text: 'Add twice your proficiency bonus to any Intelligence (History) check about magic items, alchemical objects or technological devices.',
            },
            {
              name: 'Tinker',
              text: 'Proficiency with tinker’s tools. You can spend 1 hour and 10 gp to construct a Tiny clockwork device.',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'half-elf',
    name: 'Half-Elf',
    summary: 'Charismatic, adaptable, and at home in neither world.',
    asi: { cha: 2 },
    speed: 30,
    // Two +1s to abilities other than Charisma. Same shape as Variant Human's
    // flexible pair, so the UI has one control for both.
    flexibleAsi: { count: 2, amount: 1 },
    grant: {
      languages: ['Common', 'Elvish'],
      conditionImmunities: ['charmed'],
      traits: [
        {
          name: 'Darkvision',
          text: 'See in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
        },
        {
          name: 'Fey Ancestry',
          text: 'Advantage on saving throws against being charmed, and magic can’t put you to sleep.',
        },
        {
          name: 'Skill Versatility',
          text: 'Proficiency in two skills of your choice.',
        },
      ],
      picks: [
        {
          id: 'half-elf-skills',
          kind: 'skill',
          label: 'Skill Versatility — choose two',
          count: 2,
          options: [
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
          ],
        },
        {
          id: 'half-elf-language',
          kind: 'language',
          label: 'Extra language',
          count: 1,
          options: [...ALL_LANGUAGES],
          open: true,
        },
      ],
    },
  },
  {
    id: 'half-orc',
    name: 'Half-Orc',
    summary: 'Powerfully built, and very hard to put down.',
    asi: { str: 2, con: 1 },
    speed: 30,
    grant: {
      languages: ['Common', 'Orc'],
      skills: ['intimidation'],
      traits: [
        {
          name: 'Darkvision',
          text: 'See in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
        },
        {
          name: 'Menacing',
          text: 'Proficiency in the Intimidation skill.',
        },
        {
          name: 'Relentless Endurance',
          text: 'When reduced to 0 hit points but not killed outright, you drop to 1 hit point instead. Once per long rest.',
        },
        {
          name: 'Savage Attacks',
          text: 'On a critical hit with a melee weapon, roll one of the weapon’s damage dice one additional time.',
        },
      ],
    },
  },
  {
    id: 'tiefling',
    name: 'Tiefling',
    summary: 'Infernal blood, innate magic and resistance to fire.',
    asi: { int: 1, cha: 2 },
    speed: 30,
    grant: {
      languages: ['Common', 'Infernal'],
      resistances: ['fire'],
      traits: [
        {
          name: 'Darkvision',
          text: 'See in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
        },
        {
          name: 'Hellish Resistance',
          text: 'Resistance to fire damage.',
        },
        {
          name: 'Infernal Legacy',
          text: 'You know the thaumaturgy cantrip. At 3rd level you can cast hellish rebuke once per long rest, and at 5th darkness. Charisma is your spellcasting ability for them.',
        },
      ],
    },
  },
]

/** Artisan's tools, re-exported for the dwarf tool pick's suggestions. */
export { ARTISAN_TOOLS }
