/**
 * Feats from the published 5e books, as built-ins for the wizards.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE
 *
 * This file is **not** SRD 5.1 and is deliberately outside `lib/srd/`. SRD 5.1
 * contains no feat list at all, so nothing here could live under that folder's
 * CC BY 4.0 attribution — see the header of `lib/srd/index.ts`, which promises
 * that only SRD content appears there, and `lib/srd/feats.ts`, which stays
 * empty because that promise is true.
 *
 * What ships here is a **list of names with their mechanical grants** — the
 * same thing a player writes on a character sheet by hand, and the same kind of
 * editor affordance the SRD tables are. Rules text is not reproduced: a
 * `summary` is a one-line reminder of what the feat does, in our own words, so
 * the wizard's list is navigable. A feat whose effect is a combat rule this app
 * does not compute (Lucky, Sentinel, Great Weapon Master) carries `grant: {}`
 * and nothing more, which is correct rather than incomplete.
 *
 * Sources: Player's Handbook, Xanathar's Guide to Everything, Tasha's Cauldron
 * of Everything, Fizban's Treasury of Dragons, Bigby's Glory of the Giants and
 * Monsters of the Multiverse. Deliberately absent: Planescape, Strixhaven,
 * Dragonlance, Plane Shift, Unearthed Arcana and community homebrew.
 * ---------------------------------------------------------------------------
 *
 * Authoring rules, all of which `srd.test.ts` enforces:
 *
 * - `id` is the slugified name and never reaches disk — `Character.feats`
 *   stores the display name, so a feat this table drops still round-trips.
 * - Skills are kebab ids (`animal-handling`), armor is `light|medium|heavy|
 *   shields`, weapons are `simple|martial` or a lowercase weapon name.
 * - Pick ids are `<feat-id>-<what>` and share one global keyspace with every
 *   race, background and kit pick.
 * - `prerequisite` is free text, shown to the player and **never checked**.
 * - `traits`, `items` and `currency` are omitted on purpose: `applyFeatGrants`
 *   in `lib/levelUp.ts` drops all three, so they would appear at level 1 and
 *   silently vanish at every level-up — worse than not being there.
 *
 * **Half-feats that let you choose the ability** (Resilient, Skill Expert,
 * Telepathic…) cannot say so: `asi` is a fixed record. Each takes the ability
 * it is most often built around and says "of your choice" in its summary; the
 * sheet is hand-editable, which is the whole point of the free-text rule.
 */

import { ALL_LANGUAGES, ARTISAN_TOOLS, GAMING_SETS } from '../srd/equipment'
import type { FeatInfo } from '../srd/types'

/** Every skill id, for the feats whose list is "any of your choice". */
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

/** Tool-ish options for the "a skill *or* a tool" feats. */
const ALL_TOOLS = [...ARTISAN_TOOLS, ...GAMING_SETS, 'Thieves’ tools']

export const PUBLISHED_FEATS: Array<FeatInfo> = [
  // ---------------------------------------------------------------------------
  // General feats — Player's Handbook
  // ---------------------------------------------------------------------------
  {
    id: 'actor',
    name: 'Actor',
    summary:
      'Advantage on Deception and Performance when passing as someone else, and you can mimic a voice you have heard. +1 Charisma.',
    asi: { cha: 1 },
    grant: {},
  },
  {
    id: 'alert',
    name: 'Alert',
    summary:
      '+5 to initiative. You can’t be surprised while conscious, and hidden attackers gain no advantage against you.',
    grant: {},
  },
  {
    id: 'athlete',
    name: 'Athlete',
    summary:
      'Stand from prone with 5 feet of movement, climb at full speed, and make a running jump after only 5 feet. +1 Strength or Dexterity.',
    asi: { str: 1 },
    grant: {},
  },
  {
    id: 'charger',
    name: 'Charger',
    summary:
      'After a Dash, a bonus-action attack or shove gains +5 damage or pushes 10 feet.',
    grant: {},
  },
  {
    id: 'crossbow-expert',
    name: 'Crossbow Expert',
    summary:
      'Ignore the loading property, no disadvantage in melee, and a bonus-action hand crossbow shot after an attack.',
    grant: {},
  },
  {
    id: 'defensive-duelist',
    name: 'Defensive Duelist',
    summary:
      'When hit by a melee attack while wielding a finesse weapon, add your proficiency bonus to AC as a reaction.',
    prerequisite: 'Dexterity 13 or higher',
    grant: {},
  },
  {
    id: 'dual-wielder',
    name: 'Dual Wielder',
    summary:
      '+1 AC while wielding two weapons, two-weapon fighting with non-light weapons, and you can draw two weapons at once.',
    grant: {},
  },
  {
    id: 'dungeon-delver',
    name: 'Dungeon Delver',
    summary:
      'Advantage to detect secret doors and on saves against traps, resistance to trap damage, and you can search at full speed.',
    grant: {},
  },
  {
    id: 'durable',
    name: 'Durable',
    summary:
      'When you spend a Hit Die to regain hit points, the minimum is twice your Constitution modifier. +1 Constitution.',
    asi: { con: 1 },
    grant: {},
  },
  {
    id: 'elemental-adept',
    name: 'Elemental Adept',
    summary:
      'Your spells of one damage type ignore resistance to it, and treat any 1 rolled on their damage dice as a 2.',
    prerequisite: 'The ability to cast at least one spell',
    grant: {},
  },
  {
    id: 'grappler',
    name: 'Grappler',
    summary:
      'Advantage on attacks against a creature you are grappling, and you can try to pin one you have grappled.',
    prerequisite: 'Strength 13 or higher',
    grant: {},
  },
  {
    id: 'great-weapon-master',
    name: 'Great Weapon Master',
    summary:
      'On a critical hit or a kill, a bonus-action melee attack. With a heavy weapon you may take −5 to hit for +10 damage.',
    grant: {},
  },
  {
    id: 'healer',
    name: 'Healer',
    summary:
      'A healer’s kit use stabilises and restores 1 hit point, or as an action restores 1d6 + 4 + the target’s Hit Dice.',
    grant: {},
  },
  {
    id: 'heavily-armored',
    name: 'Heavily Armored',
    summary: 'Proficiency with heavy armor, and +1 Strength.',
    prerequisite: 'Proficiency with medium armor',
    asi: { str: 1 },
    grant: { armor: ['heavy'] },
  },
  {
    id: 'heavy-armor-master',
    name: 'Heavy Armor Master',
    summary:
      'While wearing heavy armor, reduce bludgeoning, piercing and slashing damage from non-magical weapons by 3. +1 Strength.',
    prerequisite: 'Proficiency with heavy armor',
    asi: { str: 1 },
    grant: {},
  },
  {
    id: 'inspiring-leader',
    name: 'Inspiring Leader',
    summary:
      'Spend 10 minutes to give up to six allies temporary hit points equal to your level + your Charisma modifier.',
    prerequisite: 'Charisma 13 or higher',
    grant: {},
  },
  {
    id: 'keen-mind',
    name: 'Keen Mind',
    summary:
      'You always know which way is north and the hours until sunrise or sunset, and recall anything from the past month. +1 Intelligence.',
    asi: { int: 1 },
    grant: {},
  },
  {
    id: 'lightly-armored',
    name: 'Lightly Armored',
    summary:
      'Proficiency with light armor, and +1 Strength or Dexterity of your choice.',
    asi: { dex: 1 },
    grant: { armor: ['light'] },
  },
  {
    id: 'linguist',
    name: 'Linguist',
    summary:
      'Three more languages, and you can write ciphers that others cannot break without magic. +1 Intelligence.',
    asi: { int: 1 },
    grant: {
      picks: [
        {
          id: 'linguist-languages',
          kind: 'language',
          label: 'Three languages of your choice',
          count: 3,
          options: [...ALL_LANGUAGES],
          open: true,
        },
      ],
    },
  },
  {
    id: 'lucky',
    name: 'Lucky',
    summary:
      'Three luck points per long rest: reroll an attack, ability check or save, or an attack roll made against you.',
    grant: {},
  },
  {
    id: 'mage-slayer',
    name: 'Mage Slayer',
    summary:
      'React to attack a caster next to you, impose disadvantage on their concentration saves, and gain advantage against spells they cast adjacent to you.',
    grant: {},
  },
  {
    id: 'magic-initiate',
    name: 'Magic Initiate',
    summary:
      'Two cantrips and one 1st-level spell from a class of your choice, castable once per long rest.',
    grant: {
      picks: [
        {
          id: 'magic-initiate-cantrips',
          kind: 'cantrip',
          label: 'Two cantrips from your chosen class',
          count: 2,
          options: [],
          open: true,
        },
        {
          id: 'magic-initiate-spell',
          kind: 'spell',
          label: 'One 1st-level spell from your chosen class',
          count: 1,
          options: [],
          open: true,
        },
      ],
    },
  },
  {
    id: 'martial-adept',
    name: 'Martial Adept',
    summary:
      'Two Battle Master manoeuvres and one superiority die, regained on a short or long rest.',
    grant: {},
  },
  {
    id: 'medium-armor-master',
    name: 'Medium Armor Master',
    summary:
      'Medium armor no longer imposes disadvantage on Stealth, and allows up to +3 Dexterity to AC.',
    prerequisite: 'Proficiency with medium armor',
    grant: {},
  },
  {
    id: 'mobile',
    name: 'Mobile',
    summary:
      '+10 feet of speed, difficult terrain costs nothing when you Dash, and melee attacks provoke no opportunity attack from that target.',
    grant: {},
  },
  {
    id: 'moderately-armored',
    name: 'Moderately Armored',
    summary:
      'Proficiency with medium armor and shields, and +1 Strength or Dexterity of your choice.',
    prerequisite: 'Proficiency with light armor',
    asi: { dex: 1 },
    grant: { armor: ['medium', 'shields'] },
  },
  {
    id: 'mounted-combatant',
    name: 'Mounted Combatant',
    summary:
      'Advantage against unmounted creatures smaller than your mount, and you can redirect attacks aimed at it.',
    grant: {},
  },
  {
    id: 'observant',
    name: 'Observant',
    summary:
      'Read lips, and +5 to passive Perception and passive Investigation. +1 Intelligence or Wisdom of your choice.',
    asi: { wis: 1 },
    grant: {},
  },
  {
    id: 'polearm-master',
    name: 'Polearm Master',
    summary:
      'A bonus-action butt-end attack with a glaive, halberd, quarterstaff or spear, and you threaten creatures entering your reach.',
    grant: {},
  },
  {
    id: 'resilient',
    name: 'Resilient',
    summary:
      'Saving throw proficiency in one ability of your choice, and +1 to it. Constitution is the usual pick.',
    asi: { con: 1 },
    grant: { saves: ['con'] },
  },
  {
    id: 'ritual-caster',
    name: 'Ritual Caster',
    summary:
      'A ritual book with two 1st-level ritual spells from a class of your choice, and you can add more you find.',
    prerequisite: 'Intelligence or Wisdom 13 or higher',
    grant: {
      picks: [
        {
          id: 'ritual-caster-spells',
          kind: 'spell',
          label: 'Two 1st-level ritual spells',
          count: 2,
          options: [],
          open: true,
        },
      ],
    },
  },
  {
    id: 'savage-attacker',
    name: 'Savage Attacker',
    summary:
      'Once per turn, reroll a melee weapon’s damage dice and use either total.',
    grant: {},
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    summary:
      'Opportunity attacks reduce speed to 0, hitting a Disengaging creature, and you can react when a foe attacks someone else.',
    grant: {},
  },
  {
    id: 'sharpshooter',
    name: 'Sharpshooter',
    summary:
      'No disadvantage at long range, ranged attacks ignore cover, and you may take −5 to hit for +10 damage.',
    grant: {},
  },
  {
    id: 'shield-master',
    name: 'Shield Master',
    summary:
      'A bonus-action shove with your shield, +2 on Dexterity saves against effects targeting only you, and a reaction to negate damage.',
    grant: {},
  },
  {
    id: 'skilled',
    name: 'Skilled',
    summary:
      'Proficiency in any three skills or tools of your choice — swap any of the three for a tool by typing it.',
    grant: {
      // One skill pick, not a skill pick plus a tool pick. `applyPicks` routes
      // by `kind`, so a mixed list would file "Smith’s tools" into
      // `Character.skills`; but two picks would make `count` demand three
      // skills *and* a tool, over-granting the feat. A `PickList` cannot say
      // "three drawn from either list", so the pick is `open` and the summary
      // tells the player to type a tool over one of the three.
      picks: [
        {
          id: 'skilled-skills',
          kind: 'skill',
          label: 'Choose three skills (or type a tool instead of one)',
          count: 3,
          options: [...ALL_SKILLS],
          open: true,
        },
      ],
    },
  },
  {
    id: 'skulker',
    name: 'Skulker',
    summary:
      'Hide when lightly obscured, missing does not reveal you, and dim light is no handicap to Perception.',
    prerequisite: 'Dexterity 13 or higher',
    grant: {},
  },
  {
    id: 'spell-sniper',
    name: 'Spell Sniper',
    summary:
      'Double the range of your attack-roll spells, ignore cover with them, and learn one attack cantrip.',
    prerequisite: 'The ability to cast at least one spell',
    grant: {
      picks: [
        {
          id: 'spell-sniper-cantrip',
          kind: 'cantrip',
          label: 'One attack-roll cantrip',
          count: 1,
          options: [],
          open: true,
        },
      ],
    },
  },
  {
    id: 'tavern-brawler',
    name: 'Tavern Brawler',
    summary:
      'Improvised weapon proficiency, d4 unarmed damage, and a bonus-action grapple after you hit. +1 Strength or Constitution.',
    asi: { str: 1 },
    grant: { weapons: ['improvised weapons'] },
  },
  {
    id: 'tough',
    name: 'Tough',
    summary: 'Your hit point maximum increases by 2 per character level.',
    grant: {},
  },
  {
    id: 'war-caster',
    name: 'War Caster',
    summary:
      'Advantage on concentration saves, somatic components with full hands, and a spell as an opportunity attack.',
    prerequisite: 'The ability to cast at least one spell',
    grant: {},
  },
  {
    id: 'weapon-master',
    name: 'Weapon Master',
    summary:
      'Proficiency with four weapons of your choice, and +1 Strength or Dexterity of your choice.',
    asi: { str: 1 },
    grant: {
      picks: [
        {
          id: 'weapon-master-weapons',
          kind: 'weapon',
          label: 'Choose four weapons',
          count: 4,
          options: [],
          open: true,
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // General feats — Xanathar's Guide to Everything
  // ---------------------------------------------------------------------------
  {
    id: 'gunner',
    name: 'Gunner',
    summary:
      'Firearm proficiency, no loading limit, and no disadvantage in melee. +1 Dexterity.',
    asi: { dex: 1 },
    grant: { weapons: ['firearms'] },
  },

  // ---------------------------------------------------------------------------
  // General feats — Tasha's Cauldron of Everything
  // ---------------------------------------------------------------------------
  {
    id: 'artificer-initiate',
    name: 'Artificer Initiate',
    summary:
      'An artificer cantrip and a 1st-level artificer spell once per long rest, plus one set of artisan’s tools.',
    grant: {
      picks: [
        {
          id: 'artificer-initiate-tools',
          kind: 'tool',
          label: 'One set of artisan’s tools',
          count: 1,
          options: [...ARTISAN_TOOLS],
        },
        {
          id: 'artificer-initiate-cantrip',
          kind: 'cantrip',
          label: 'One artificer cantrip',
          count: 1,
          options: [],
          open: true,
        },
        {
          id: 'artificer-initiate-spell',
          kind: 'spell',
          label: 'One 1st-level artificer spell',
          count: 1,
          options: [],
          open: true,
        },
      ],
    },
  },
  {
    id: 'chef',
    name: 'Chef',
    summary:
      'Cook’s utensils, food that grants temporary hit points on a short rest, and treats that restore 1d8. +1 Constitution or Wisdom.',
    asi: { con: 1 },
    grant: { tools: ['Cook’s utensils'] },
  },
  {
    id: 'crusher',
    name: 'Crusher',
    summary:
      'Move a creature 5 feet after bludgeoning damage, and grant advantage against it on a critical. +1 Strength or Constitution.',
    asi: { str: 1 },
    grant: {},
  },
  {
    id: 'eldritch-adept',
    name: 'Eldritch Adept',
    summary: 'One Eldritch Invocation of your choice.',
    prerequisite: 'Spellcasting or Pact Magic feature',
    grant: {},
  },
  {
    id: 'fey-touched',
    name: 'Fey Touched',
    summary:
      'Misty step and one 1st-level divination or enchantment spell, each free once per long rest. +1 Intelligence, Wisdom or Charisma.',
    asi: { wis: 1 },
    grant: {
      picks: [
        {
          id: 'fey-touched-spell',
          kind: 'spell',
          label: 'One 1st-level divination or enchantment spell',
          count: 1,
          options: [],
          open: true,
        },
      ],
    },
  },
  {
    id: 'fighting-initiate',
    name: 'Fighting Initiate',
    summary: 'One Fighting Style of your choice.',
    prerequisite: 'Proficiency with a martial weapon',
    grant: {},
  },
  {
    id: 'metamagic-adept',
    name: 'Metamagic Adept',
    summary:
      'Two Metamagic options and 2 sorcery points, regained on a long rest.',
    prerequisite: 'Spellcasting or Pact Magic feature',
    grant: {},
  },
  {
    id: 'piercer',
    name: 'Piercer',
    summary:
      'Reroll one piercing damage die per turn, and an extra damage die on a critical. +1 Strength or Dexterity.',
    asi: { dex: 1 },
    grant: {},
  },
  {
    id: 'poisoner',
    name: 'Poisoner',
    summary:
      'Poisoner’s kit proficiency, ignore poison resistance, and coat weapons with a potent poison as a bonus action.',
    grant: { tools: ['Poisoner’s kit'] },
  },
  {
    id: 'shadow-touched',
    name: 'Shadow Touched',
    summary:
      'Invisibility and one 1st-level illusion or necromancy spell, each free once per long rest. +1 Intelligence, Wisdom or Charisma.',
    asi: { cha: 1 },
    grant: {
      picks: [
        {
          id: 'shadow-touched-spell',
          kind: 'spell',
          label: 'One 1st-level illusion or necromancy spell',
          count: 1,
          options: [],
          open: true,
        },
      ],
    },
  },
  {
    id: 'skill-expert',
    name: 'Skill Expert',
    summary:
      'One skill proficiency, expertise in another, and +1 to an ability of your choice.',
    asi: { dex: 1 },
    grant: {
      picks: [
        {
          id: 'skill-expert-skill',
          kind: 'skill',
          label: 'One skill proficiency',
          count: 1,
          options: [...ALL_SKILLS],
        },
        {
          id: 'skill-expert-expertise',
          kind: 'skill',
          label: 'Expertise in one skill you are proficient with',
          count: 1,
          options: [...ALL_SKILLS],
        },
      ],
    },
  },
  {
    id: 'slasher',
    name: 'Slasher',
    summary:
      'Reduce a creature’s speed by 10 feet on slashing damage, and impose disadvantage on a critical. +1 Strength or Dexterity.',
    asi: { str: 1 },
    grant: {},
  },
  {
    id: 'telekinetic',
    name: 'Telekinetic',
    summary:
      'Mage hand at will without components, and a bonus-action shove at 30 feet. +1 Intelligence, Wisdom or Charisma.',
    asi: { int: 1 },
    grant: {},
  },
  {
    id: 'telepathic',
    name: 'Telepathic',
    summary:
      'Speak telepathically at 60 feet, and cast detect thoughts once per long rest. +1 Intelligence, Wisdom or Charisma.',
    asi: { int: 1 },
    grant: {},
  },

  // ---------------------------------------------------------------------------
  // General feats — Fizban's Treasury of Dragons
  // ---------------------------------------------------------------------------
  {
    id: 'gift-of-the-chromatic-dragon',
    name: 'Gift of the Chromatic Dragon',
    summary:
      'Imbue a weapon with elemental damage, and react to gain resistance to one of the five chromatic damage types.',
    grant: {},
  },
  {
    id: 'gift-of-the-gem-dragon',
    name: 'Gift of the Gem Dragon',
    summary:
      'A telekinetic reaction that shoves an attacker. +1 Intelligence, Wisdom or Charisma.',
    asi: { int: 1 },
    grant: {},
  },
  {
    id: 'gift-of-the-metallic-dragon',
    name: 'Gift of the Metallic Dragon',
    summary:
      'Cure wounds once per long rest, and a reactive draconic wing shield that grants +2 AC to an ally.',
    grant: {},
  },

  // ---------------------------------------------------------------------------
  // Giant feats — Bigby's Glory of the Giants
  // ---------------------------------------------------------------------------
  {
    id: 'strike-of-the-giants',
    name: 'Strike of the Giants',
    summary:
      'Once per turn add a giant-themed effect to a weapon hit — extra damage plus a rider chosen from six giant kinds.',
    grant: {},
  },
  {
    id: 'ember-of-the-fire-giant',
    name: 'Ember of the Fire Giant',
    summary:
      'Fire resistance and a searing burst that damages and pushes two creatures. +1 Strength, Constitution or Wisdom.',
    prerequisite: 'Strike of the Giants, and 4th level or higher',
    asi: { con: 1 },
    grant: { resistances: ['fire'] },
  },
  {
    id: 'fury-of-the-frost-giant',
    name: 'Fury of the Frost Giant',
    summary:
      'Cold resistance and a frigid retaliation that damages and slows an attacker. +1 Strength, Constitution or Wisdom.',
    prerequisite: 'Strike of the Giants, and 4th level or higher',
    asi: { str: 1 },
    grant: { resistances: ['cold'] },
  },
  {
    id: 'guile-of-the-cloud-giant',
    name: 'Guile of the Cloud Giant',
    summary:
      'Halve incoming damage and teleport 30 feet as a reaction. +1 Strength, Constitution or Charisma.',
    prerequisite: 'Strike of the Giants, and 4th level or higher',
    asi: { cha: 1 },
    grant: {},
  },
  {
    id: 'keenness-of-the-stone-giant',
    name: 'Keenness of the Stone Giant',
    summary:
      'Darkvision to 60 feet and a reactive 30-foot shift that does not provoke. +1 Strength, Constitution or Wisdom.',
    prerequisite: 'Strike of the Giants, and 4th level or higher',
    asi: { wis: 1 },
    grant: {},
  },
  {
    id: 'soul-of-the-storm-giant',
    name: 'Soul of the Storm Giant',
    summary:
      'A storm aura that slows foes, disadvantages attacks against you, and grants lightning resistance. +1 Strength, Wisdom or Charisma.',
    prerequisite: 'Strike of the Giants, and 4th level or higher',
    asi: { wis: 1 },
    grant: { resistances: ['lightning'] },
  },
  {
    id: 'vigor-of-the-hill-giant',
    name: 'Vigor of the Hill Giant',
    summary:
      'A reaction that resists being knocked prone, moved or poisoned. +1 Strength, Constitution or Wisdom.',
    prerequisite: 'Strike of the Giants, and 4th level or higher',
    asi: { con: 1 },
    grant: {},
  },
  {
    id: 'rune-shaper',
    name: 'Rune Shaper',
    summary:
      'Inscribe a giant rune to cast one 1st-level spell from a short list, once per long rest. +1 Intelligence, Wisdom or Charisma.',
    asi: { int: 1 },
    grant: {},
  },

  // ---------------------------------------------------------------------------
  // Racial feats — Xanathar's Guide to Everything and Monsters of the Multiverse
  // ---------------------------------------------------------------------------
  {
    id: 'bountiful-luck',
    name: 'Bountiful Luck',
    summary:
      'When an ally near you rolls a 1, you can let them reroll — but you lose your own Lucky reroll until your next turn.',
    prerequisite: 'Halfling',
    grant: {},
  },
  {
    id: 'dragon-fear',
    name: 'Dragon Fear',
    summary:
      'Your breath weapon can instead frighten nearby creatures. +1 Strength, Constitution or Charisma.',
    prerequisite: 'Dragonborn',
    asi: { cha: 1 },
    grant: {},
  },
  {
    id: 'dragon-hide',
    name: 'Dragon Hide',
    summary:
      'Retractable claws as a natural weapon, and an unarmored AC of 13 + your Dexterity modifier. +1 Strength, Constitution or Charisma.',
    prerequisite: 'Dragonborn',
    asi: { str: 1 },
    grant: {},
  },
  {
    id: 'drow-high-magic',
    name: 'Drow High Magic',
    summary:
      'Detect magic at will, plus levitate and dispel magic once each per long rest.',
    prerequisite: 'Elf (drow)',
    grant: {},
  },
  {
    id: 'dwarven-fortitude',
    name: 'Dwarven Fortitude',
    summary:
      'When you Dodge, you can spend a Hit Die to heal. +1 Constitution.',
    prerequisite: 'Dwarf',
    asi: { con: 1 },
    grant: {},
  },
  {
    id: 'elven-accuracy',
    name: 'Elven Accuracy',
    summary:
      'Reroll one die when you have advantage on a Dexterity, Intelligence, Wisdom or Charisma attack. +1 to one of those four.',
    prerequisite: 'Elf or half-elf',
    asi: { dex: 1 },
    grant: {},
  },
  {
    id: 'fade-away',
    name: 'Fade Away',
    summary:
      'After taking damage, turn invisible until the end of your next turn. +1 Dexterity or Intelligence.',
    prerequisite: 'Gnome',
    asi: { int: 1 },
    grant: {},
  },
  {
    id: 'fey-teleportation',
    name: 'Fey Teleportation',
    summary:
      'Learn Sylvan, cast misty step once per long rest, and gain a cantrip. +1 Intelligence or Charisma.',
    prerequisite: 'Elf (high)',
    asi: { cha: 1 },
    grant: { languages: ['Sylvan'] },
  },
  {
    id: 'flames-of-phlegethos',
    name: 'Flames of Phlegethos',
    summary:
      'Reroll 1s on fire spell damage, and wreathe yourself in flame that burns those who close. +1 Intelligence or Charisma.',
    prerequisite: 'Tiefling',
    asi: { cha: 1 },
    grant: {},
  },
  {
    id: 'infernal-constitution',
    name: 'Infernal Constitution',
    summary:
      'Resistance to cold and poison damage, and advantage on saves against being poisoned. +1 Constitution.',
    prerequisite: 'Tiefling',
    asi: { con: 1 },
    grant: { resistances: ['cold', 'poison'] },
  },
  {
    id: 'orcish-fury',
    name: 'Orcish Fury',
    summary:
      'Extra weapon damage once per rest, and a reactive attack when you use Relentless Endurance. +1 Strength or Constitution.',
    prerequisite: 'Half-orc',
    asi: { str: 1 },
    grant: {},
  },
  {
    id: 'prodigy',
    name: 'Prodigy',
    summary:
      'One skill, one tool and one language, plus expertise in a skill you are proficient with.',
    prerequisite: 'Half-elf, half-orc or human',
    grant: {
      picks: [
        {
          id: 'prodigy-skill',
          kind: 'skill',
          label: 'One skill proficiency',
          count: 1,
          options: [...ALL_SKILLS],
        },
        {
          id: 'prodigy-tool',
          kind: 'tool',
          label: 'One tool proficiency',
          count: 1,
          options: [...ALL_TOOLS],
          open: true,
        },
        {
          id: 'prodigy-language',
          kind: 'language',
          label: 'One language of your choice',
          count: 1,
          options: [...ALL_LANGUAGES],
          open: true,
        },
        {
          id: 'prodigy-expertise',
          kind: 'skill',
          label: 'Expertise in one skill you are proficient with',
          count: 1,
          options: [...ALL_SKILLS],
        },
      ],
    },
  },
  {
    id: 'revenant-blade',
    name: 'Revenant Blade',
    summary:
      'A double-bladed scimitar counts as finesse for you, and +1 AC while wielding one. +1 Strength or Dexterity.',
    prerequisite: 'Elf',
    asi: { dex: 1 },
    grant: {},
  },
  {
    id: 'second-chance',
    name: 'Second Chance',
    summary:
      'Force an attacker to reroll once per rest. +1 Dexterity, Constitution or Charisma.',
    prerequisite: 'Halfling',
    asi: { dex: 1 },
    grant: {},
  },
  {
    id: 'squat-nimbleness',
    name: 'Squat Nimbleness',
    summary:
      '+5 feet of speed, proficiency in Acrobatics or Athletics, and advantage to escape a grapple. +1 Strength or Dexterity.',
    prerequisite: 'Dwarf or a Small race',
    asi: { str: 1 },
    grant: {
      picks: [
        {
          id: 'squat-nimbleness-skill',
          kind: 'skill',
          label: 'Acrobatics or Athletics',
          count: 1,
          options: ['acrobatics', 'athletics'],
        },
      ],
    },
  },
  {
    id: 'svirfneblin-magic',
    name: 'Svirfneblin Magic',
    summary:
      'Nondetection on yourself at will, plus blindness/deafness, blur and disguise self once each per long rest.',
    prerequisite: 'Gnome (deep gnome)',
    grant: {},
  },
  {
    id: 'wood-elf-magic',
    name: 'Wood Elf Magic',
    summary:
      'One druid cantrip, plus longstrider and pass without trace once each per long rest.',
    prerequisite: 'Elf (wood)',
    grant: {
      picks: [
        {
          id: 'wood-elf-magic-cantrip',
          kind: 'cantrip',
          label: 'One druid cantrip',
          count: 1,
          options: [],
          open: true,
        },
      ],
    },
  },
]
