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
 * Ranger and Paladin are **half casters**: they have a `spellcasting` block
 * whose `slotsByLevel` starts at 2 and whose `slotsAtLevel1` is 0, because they
 * gain spells at 2nd level. They had no block at all for a long time, which
 * kept them from casting at any level and blocked oath and conclave spells
 * outright — a subclass may only carry `spells` if something casts them. What
 * makes the block safe is `castsAtLevel1` in lib/tables.ts: the creation wizard
 * asks it, rather than asking whether a block exists, so a level 1 build still
 * skips the spells step.
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
        summary: 'Rage as unchecked fury, paid for in exhaustion.',
        features: [
          {
            level: 3,
            name: 'Frenzy',
            // No `resource`: Frenzy costs a level of exhaustion, which the
            // sheet tracks in its own field, not a counter with a `used`.
            text: 'You can go into a frenzy when you rage, making a single melee weapon attack as a bonus action on each of your turns. When your rage ends you gain one level of exhaustion.',
          },
          {
            level: 6,
            name: 'Mindless Rage',
            text: 'You cannot be charmed or frightened while raging, and a charm or fear effect already on you is suspended for the duration.',
          },
          {
            level: 10,
            name: 'Intimidating Presence',
            text: 'Action to frighten a creature within 30 feet unless it succeeds on a Wisdom save against a DC of 8 + your proficiency bonus + your Charisma modifier. You can repeat it on later turns to extend the effect.',
          },
          {
            level: 14,
            name: 'Retaliation',
            text: 'When a creature within 5 feet damages you, you can use your reaction to make a melee weapon attack against it.',
          },
        ],
      },
      {
        id: 'path-of-the-totem-warrior',
        name: 'Path of the Totem Warrior',
        // A PHB archetype, not SRD 5.1: the name is seeded here so a player who
        // picks it gets a working sheet, and its features live in
        // lib/subclasses/publishedSubclasses.ts. See that file's header.
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
        text: 'In battle you fight with primal ferocity. As a bonus action you enter a rage for up to 1 minute: advantage on Strength checks and saves, +2 damage on melee attacks using Strength, and resistance to bludgeoning, piercing and slashing damage. The damage bonus rises to +3 at 9th level and +4 at 16th.',
        resource: { name: 'Rage', total: 2, resets: 'long' },
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
      // The rage count grows on its own schedule, and each step is its own row
      // for the reason the Fighter's Indomitable is: `resourcesOffered` raises
      // a counter already on the sheet only when a feature at *this* level
      // names it, so "four times at 6th" folded into the prose above would
      // never reach the player's Rage row. Level 20's unlimited rages are the
      // one step with no row — `total` is a number, and there is no honest
      // value for "no limit", so Primal Champion says it in words instead.
      {
        level: 3,
        name: 'Rage (3/day)',
        text: 'You can rage three times per long rest.',
        resource: { name: 'Rage', total: 3, resets: 'long' },
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
        level: 6,
        name: 'Rage (4/day)',
        text: 'You can rage four times per long rest.',
        resource: { name: 'Rage', total: 4, resets: 'long' },
      },
      {
        level: 7,
        name: 'Feral Instinct',
        text: 'Advantage on initiative rolls, and you can act normally on a surprise round if you enter your rage first.',
      },
      {
        level: 9,
        name: 'Brutal Critical',
        text: 'Roll one additional weapon damage die on a critical hit.',
      },
      {
        level: 11,
        name: 'Relentless Rage',
        text: 'If you drop to 0 hit points while raging and don’t die outright, you can make a DC 10 Constitution save to drop to 1 instead.',
      },
      {
        level: 12,
        name: 'Rage (5/day)',
        text: 'You can rage five times per long rest.',
        resource: { name: 'Rage', total: 5, resets: 'long' },
      },
      // The upgrades are their own rows rather than a clause in the level-9
      // text. `featuresGained` de-dupes on `level:name`, so a second Brutal
      // Critical at 13 is a distinct feature granted at the right level, where
      // prose in the earlier row scrolled past unread.
      {
        level: 13,
        name: 'Brutal Critical (2 dice)',
        text: 'Roll two additional weapon damage dice on a critical hit.',
      },
      {
        level: 15,
        name: 'Persistent Rage',
        text: 'Your rage ends early only if you fall unconscious or choose to end it.',
      },
      {
        level: 17,
        name: 'Brutal Critical (3 dice)',
        text: 'Roll three additional weapon damage dice on a critical hit.',
      },
      {
        level: 17,
        name: 'Rage (6/day)',
        text: 'You can rage six times per long rest.',
        resource: { name: 'Rage', total: 6, resets: 'long' },
      },
      {
        level: 18,
        name: 'Indomitable Might',
        text: 'If your total for a Strength check is less than your Strength score, use the score instead.',
      },
      {
        level: 20,
        name: 'Primal Champion',
        text: 'Your Strength and Constitution increase by 4, to a maximum of 24. You can rage as many times as you like — your Rage counter no longer limits you.',
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
      {
        id: 'college-of-lore',
        name: 'College of Lore',
        summary: 'Knowledge gathered everywhere, and used as a weapon.',
        features: [
          {
            level: 3,
            name: 'Bonus Proficiencies',
            text: 'You gain proficiency with three skills of your choice.',
            picks: [
              {
                // The file's first `kind: 'skill'` pick on a feature rather
                // than a class's `skillChoices`. Every skill is offered because
                // the book says "three skills of your choice" without
                // qualification — unlike an expertise pick, which is bounded by
                // what the character is already proficient in.
                id: 'college-of-lore-3-skills',
                kind: 'skill',
                label: 'Three skills of your choice',
                count: 3,
                options: ALL_SKILLS,
              },
            ],
          },
          {
            level: 3,
            name: 'Cutting Words',
            text: 'When a creature within 60 feet makes an attack, ability check or damage roll, you can use your reaction to spend a Bardic Inspiration die and subtract it from the roll.',
          },
          {
            level: 6,
            name: 'Additional Magical Secrets',
            // Two spells from any list, and they are *known* rather than
            // prepared — a Bard is not a preparer. Left as prose rather than a
            // `kind: 'spell'` pick because the spells step already asks how
            // many spells this level grants, and a pick here would ask the
            // same question twice with no way to reconcile the two answers.
            text: 'You learn two spells from any class’s spell list. They count as bard spells for you and do not count against the number of bard spells you know.',
          },
          {
            level: 14,
            name: 'Peerless Skill',
            text: 'When you make an ability check, you can spend a Bardic Inspiration die and add it to the roll.',
          },
        ],
      },
      {
        id: 'college-of-valor',
        name: 'College of Valor',
        // A PHB archetype, not SRD 5.1: the name is seeded here so a player who
        // picks it gets a working sheet, and its features live in
        // lib/subclasses/publishedSubclasses.ts. See that file's header.
        features: [],
      },
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
      spellsKnownByLevel: {
        1: 4,
        2: 5,
        3: 6,
        4: 7,
        5: 8,
        6: 9,
        7: 10,
        8: 11,
        9: 12,
        10: 14,
        11: 15,
        13: 16,
        14: 18,
        15: 19,
        17: 20,
        18: 22,
      },
    },
    features: [
      {
        // The one counter here whose total the table genuinely does not know:
        // it is the Charisma modifier, not a number the book prints. The
        // suggestion is 3 — a +3 Charisma is what a Bard starts with under
        // every ability method this app offers — and the step puts the number
        // in an editable box beside the row, which is exactly the bargain
        // `Character.resources` documents. Better a figure the player corrects
        // once than a feature that never reaches the sheet.
        level: 1,
        name: 'Bardic Inspiration',
        text: 'As a bonus action, give one creature within 60 feet a d6 they can add to one ability check, attack roll or saving throw within the next 10 minutes. You have a number of uses equal to your Charisma modifier, regained on a long rest.',
        resource: { name: 'Bardic Inspiration', total: 3, resets: 'long' },
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
        // Reaches the eighteen skill rows via `skillBonus`. The bare ability
        // checks the text also covers have no row on the sheet, so the prose
        // stays broader than what computes — see `HalfProficiency`.
        halfProficiency: 'all',
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
        // A real pick rather than prose, for the reason CLAUDE.md gives: the
        // sheet has a field for the answer (`Character.expertise`, which
        // `skillBonus` doubles), so recording the click is not a lie. The
        // options are every skill because a Bard chooses their three freely;
        // `eligibleExpertiseAt` narrows this to what the character actually
        // has when the step renders.
        level: 3,
        name: 'Expertise',
        text: 'Choose two of your skill proficiencies. Your proficiency bonus is doubled for any ability check you make using them.',
        picks: [
          {
            id: 'bard-expertise-3',
            kind: 'expertise',
            label: 'Expertise in two of your skill proficiencies',
            count: 2,
            options: ALL_SKILLS,
          },
        ],
      },
      {
        level: 5,
        name: 'Font of Inspiration',
        // The reset changes from long to short here, and `resourcesOffered`
        // gates purely on `total` — an offer whose number is unchanged is
        // dropped, so this cannot reach the sheet as a tracker update. The row
        // says so instead, and the player edits the counter they already have.
        text: 'You regain all expended Bardic Inspiration uses on a short or long rest, not just a long one. Change your Bardic Inspiration tracker to reset on a short rest.',
      },
      // The die's own rows, for the reason every other upgrade here has one:
      // "a d8 at 5th" inside the level-1 text is prose the level-up wizard
      // cannot grant, and the Battle Master's superiority dice already scale
      // this way. The die is not a `resource` — it has no `used` count; the
      // counter beside it is the uses.
      {
        level: 5,
        name: 'Bardic Inspiration (d8)',
        text: 'Your Bardic Inspiration die becomes a d8.',
      },
      {
        level: 6,
        name: 'Countercharm',
        text: 'As an action, you can start a performance that gives allies within 30 feet advantage on saves against being frightened or charmed.',
      },
      {
        level: 10,
        name: 'Bardic Inspiration (d10)',
        text: 'Your Bardic Inspiration die becomes a d10.',
      },
      {
        level: 10,
        name: 'Expertise (2)',
        text: 'Choose two more of your skill proficiencies. Your proficiency bonus is doubled for any ability check you make using them.',
        picks: [
          {
            // Its own id: pick ids are one global keyspace, and this is a
            // different question asked at a different level. `grantedAlreadyAt`
            // greys out anything doubled at 3rd rather than removing it.
            id: 'bard-expertise-10',
            kind: 'expertise',
            label: 'Expertise in two more of your skill proficiencies',
            count: 2,
            options: ALL_SKILLS,
          },
        ],
      },
      {
        level: 10,
        name: 'Magical Secrets',
        // Three separate rows rather than "two more at 14th and 18th" in this
        // one's prose: de-dupe is keyed on `level:name`, so each is a distinct
        // feature the wizard grants at the right level, where prose in the
        // level-10 row scrolls past unread.
        text: 'Learn two spells from any class’s spell list. They count as bard spells for you and do not count against the number you know.',
      },
      {
        level: 14,
        name: 'Magical Secrets (2)',
        text: 'Learn two more spells from any class’s spell list, on the same terms.',
      },
      {
        level: 15,
        name: 'Bardic Inspiration (d12)',
        text: 'Your Bardic Inspiration die becomes a d12.',
      },
      {
        level: 18,
        name: 'Magical Secrets (3)',
        text: 'Learn two more spells from any class’s spell list, on the same terms.',
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
      {
        id: 'life-domain',
        name: 'Life Domain',
        summary: 'Healing and the vigour of the living, channelled.',
        // Bonus Proficiency's actual effect. On the subclass rather than the
        // level-1 feature row because `ClassFeatureInfo` has no `grant` — the
        // row is the reminder, this is what lands. The Cleric already grants
        // light, medium and shields, so `heavy` is a real addition.
        grant: { armor: ['heavy'] },
        // The domain table. `grantedAt` is the *character* level and `level`
        // the *spell* level: two different numbers, and conflating them is the
        // easy mistake here.
        spells: [
          { grantedAt: 1, level: 1, names: ['Bless', 'Cure Wounds'] },
          {
            grantedAt: 3,
            level: 2,
            names: ['Lesser Restoration', 'Spiritual Weapon'],
          },
          { grantedAt: 5, level: 3, names: ['Beacon of Hope', 'Revivify'] },
          {
            grantedAt: 7,
            level: 4,
            names: ['Death Ward', 'Guardian of Faith'],
          },
          {
            grantedAt: 9,
            level: 5,
            names: ['Mass Cure Wounds', 'Raise Dead'],
          },
        ],
        features: [
          {
            level: 1,
            name: 'Bonus Proficiency',
            text: 'You gain proficiency with heavy armour.',
          },
          {
            level: 1,
            name: 'Disciple of Life',
            text: 'Whenever you restore hit points with a spell of 1st level or higher, the creature regains an extra 2 + the spell’s level.',
          },
          {
            level: 2,
            name: 'Channel Divinity: Preserve Life',
            text: 'You restore hit points equal to five times your cleric level, divided as you choose among creatures within 30 feet, up to half a creature’s maximum each.',
          },
          {
            level: 6,
            name: 'Blessed Healer',
            text: 'When you heal someone else with a spell of 1st level or higher, you regain hit points equal to 2 + the spell’s level.',
          },
          {
            level: 8,
            name: 'Divine Strike',
            text: 'Once on each of your turns, a weapon hit deals an extra 1d8 radiant damage.',
          },
          {
            // Its own row rather than a clause in the level-8 prose: de-dupe
            // is keyed on `level:name`, so this is a feature the wizard grants
            // at 14 where prose in the earlier row scrolls past unread.
            level: 14,
            name: 'Divine Strike (2d8)',
            text: 'Your Divine Strike damage rises to 2d8.',
          },
          {
            level: 17,
            name: 'Supreme Healing',
            text: 'When you would roll dice to restore hit points with a spell, use the highest number possible for each die instead.',
          },
        ],
      },
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
        // A real counter, and the class's only one: Channel Divinity is what a
        // cleric actually spends. The uses were prose here — "twice at 6th,
        // three times at 18th" — which the level-up wizard cannot grant, so
        // each step is its own row, the way the Battle Master's superiority
        // dice and the Bard's inspiration die already scale.
        level: 2,
        name: 'Channel Divinity',
        text: 'You can channel divine energy to fuel magical effects, expending a use and regaining it on a short or long rest. Your domain grants its own options.',
        resource: { name: 'Channel Divinity', total: 1, resets: 'short' },
      },
      {
        level: 6,
        name: 'Channel Divinity (2/rest)',
        text: 'You can use Channel Divinity twice between rests.',
        resource: { name: 'Channel Divinity', total: 2, resets: 'short' },
      },
      {
        level: 18,
        name: 'Channel Divinity (3/rest)',
        text: 'You can use Channel Divinity three times between rests.',
        resource: { name: 'Channel Divinity', total: 3, resets: 'short' },
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
      {
        id: 'circle-of-the-land',
        name: 'Circle of the Land',
        summary: 'A druid of one landscape, and the magic it lends.',
        features: [
          {
            level: 2,
            name: 'Bonus Cantrip',
            text: 'You learn one additional druid cantrip of your choice.',
          },
          {
            level: 2,
            name: 'Natural Recovery',
            text: 'During a short rest you can recover expended spell slots with a combined level up to half your druid level, rounded up. None may be 6th level or higher. Once per long rest.',
          },
          {
            // The terrain is a real pick because the *choice* is what the sheet
            // can hold — it lands as a feature row naming the land the druid is
            // bound to. The spells it unlocks stay in the option's text rather
            // than in `spells`: that field is one flat table and has no way to
            // branch on a pick's answer, so eight terrains cannot live there.
            // Prose that promises nothing beats a table that would silently
            // grant the wrong land's magic.
            level: 3,
            name: 'Circle Spells',
            text: 'Choose a land you are connected to. You gain its circle spells at 3rd, 5th, 7th and 9th level. They are always prepared and do not count against the number of spells you can prepare.',
            picks: [
              {
                id: 'circle-of-the-land-3-terrain',
                kind: 'feature',
                label: 'Your land',
                count: 1,
                options: [
                  'Arctic',
                  'Coast',
                  'Desert',
                  'Forest',
                  'Grassland',
                  'Mountain',
                  'Swamp',
                  'Underdark',
                ],
                featureLabel: 'Land',
                featureText: {
                  Arctic:
                    'Circle spells: hold person and spike growth at 3rd, sleet storm and slow at 5th, freedom of movement and ice storm at 7th, commune with nature and cone of cold at 9th.',
                  Coast:
                    'Circle spells: mirror image and misty step at 3rd, water breathing and water walk at 5th, control water and freedom of movement at 7th, conjure elemental and scrying at 9th.',
                  Desert:
                    'Circle spells: blur and silence at 3rd, create food and water and protection from energy at 5th, blight and hallucinatory terrain at 7th, insect plague and wall of stone at 9th.',
                  Forest:
                    'Circle spells: barkskin and spider climb at 3rd, call lightning and plant growth at 5th, divination and freedom of movement at 7th, commune with nature and tree stride at 9th.',
                  Grassland:
                    'Circle spells: invisibility and pass without trace at 3rd, daylight and haste at 5th, divination and freedom of movement at 7th, dream and insect plague at 9th.',
                  Mountain:
                    'Circle spells: spider climb and spike growth at 3rd, lightning bolt and meld into stone at 5th, stone shape and stoneskin at 7th, passwall and wall of stone at 9th.',
                  Swamp:
                    'Circle spells: darkness and Melf’s acid arrow at 3rd, water walk and stinking cloud at 5th, freedom of movement and locate creature at 7th, insect plague and scrying at 9th.',
                  Underdark:
                    'Circle spells: spider climb and web at 3rd, gaseous form and stinking cloud at 5th, greater invisibility and stone shape at 7th, cloudkill and insect plague at 9th.',
                },
              },
            ],
          },
          {
            level: 6,
            name: 'Land’s Stride',
            text: 'Moving through nonmagical difficult terrain costs you no extra movement, and you can pass through nonmagical plants without being slowed or damaged by them.',
          },
          {
            level: 10,
            name: 'Nature’s Ward',
            text: 'You cannot be charmed or frightened by elementals or fey, and you are immune to poison and disease.',
          },
          {
            level: 14,
            name: 'Nature’s Sanctuary',
            text: 'A beast or plant that tries to attack you must make a Wisdom save against your spell save DC or choose a different target.',
          },
        ],
      },
      { id: 'circle-of-the-moon', name: 'Circle of the Moon', features: [] },
    ],
    saves: ['int', 'wis'],
    // A druid picks their circle at 2, not 3 — the `Druid Circle` feature row
    // below has always said so, but with no `subclassLevel` the default of 3
    // won, so the level-up wizard asked a level late and a legitimate level-2
    // circle feature failed `subclasses.test.ts`. Same miss the Wizard had.
    subclassLevel: 2,
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
        // A real counter, and the class's only one: Wild Shape is what a druid
        // spends. The uses were prose — "twice per short or long rest" — which
        // the level-up wizard cannot grant, so a druid's sheet had nothing to
        // tick. The number never changes with level, so this is the single row
        // it needs; Archdruid's "unlimited" at 20 stays prose because `total`
        // is a number, exactly as the Barbarian's Rage leaves it.
        level: 2,
        name: 'Wild Shape',
        text: 'As an action, you can magically assume the shape of a beast you have seen before. You revert on a short or long rest, or when you drop to 0 hit points.',
        resource: { name: 'Wild Shape', total: 2, resets: 'short' },
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
            // Rounds *up* and covers only STR/DEX/CON, which is why
            // `HalfProficiency` is a mode rather than a boolean. The long-jump
            // half is prose: the sheet has no jump distance to raise.
            halfProficiency: 'physical',
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
        /**
         * The Fighter's third caster, on the same footing as the Arcane
         * Trickster.
         *
         * This was prose for a long time and the comment here explained why:
         * a `spells` table needs a `spellcasting` block, and putting one on the
         * Fighter kit would have claimed a full progression for every Champion.
         * `SubclassInfo.spellcasting` is the answer to exactly that, so the
         * reasoning is spent and the table is real.
         *
         * Keyed by character level, so it starts at 3. Three cantrips rather
         * than the Trickster's two, and none of them fixed — there is no
         * Mage Hand equivalent here, so no `grant`.
         *
         * Still no `spells` rows: those are the always-prepared domain and oath
         * tables, which is a different thing from a spells-known caster.
         */
        spellcasting: {
          ability: 'int',
          // Nothing at level 1 — this table begins where the archetype does.
          slotsAtLevel1: 0,
          cantripsKnown: 2,
          spellsKnown: 3,
          prepares: false,
          listLabel: 'Wizard spells',
          slotsByLevel: {
            3: [2],
            4: [3],
            7: [4, 2],
            10: [4, 3],
            13: [4, 3, 2],
            16: [4, 3, 3],
            19: [4, 3, 3, 1],
            20: [4, 3, 3, 1],
          },
          cantripsByLevel: { 3: 2, 10: 3 },
          spellsKnownByLevel: {
            3: 3,
            4: 4,
            7: 5,
            8: 6,
            10: 7,
            11: 8,
            13: 9,
            14: 10,
            16: 11,
            19: 12,
            20: 13,
          },
        },
        features: [
          {
            level: 3,
            name: 'Spellcasting',
            text: 'You learn two wizard cantrips and three 1st-level wizard spells, two of them abjuration or evocation. Intelligence is your spellcasting ability, and your save DC is 8 + your proficiency bonus + your Intelligence modifier.',
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
    // Declared rather than inferred, though 3 is also the default. Two classes
    // have shipped bugs from exactly this omission: the Wizard and the Druid
    // both left it out while their own `... School` / `... Circle` feature row
    // sat at 2, so `subclassLevelOf` returned 3 and their subclass features
    // could not be authored at the level the class actually grants them. A
    // monk's Monastic Tradition row does sit at 3, so nothing is wrong here —
    // but a value that is only coincidentally right is one edit from being
    // silently wrong, and this costs a line.
    subclassLevel: 3,
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
        text: 'You have a pool of ki points equal to your monk level, fuelling Flurry of Blows, Patient Defense and Step of the Wind. You regain them all on a short or long rest. The counter starts at 2 and rises by one per level — raise it on the sheet as you go.',
        // The counter the whole class spends, and it was prose until now: a
        // monk's sheet had nothing to tick while Stunning Strike, Diamond Soul
        // and Empty Body all told them to spend it.
        //
        // Same shape as the Sorcerer's Font of Magic — `total` is the monk
        // *level*, which no static table can track, and `resourcesOffered`
        // gates on `total` changing, so a row per level would be nineteen
        // offers of the same counter. Ship the value at the granting level,
        // say so in the text, let the player edit the box.
        //
        // `resets: 'short'`, unlike Sorcery Points' `'long'` — ki comes back on
        // a short rest, and copying that precedent wholesale gets it wrong.
        resource: { name: 'Ki', total: 2, resets: 'short' },
      },
      {
        level: 2,
        name: 'Unarmored Movement',
        text: 'Your speed increases by 10 feet while you are wearing no armour and wielding no shield.',
        // The bonus cannot ride `Grant.speedBonus`: `ClassFeatureInfo` has no
        // `grant` field at all — only `SubclassInfo` and `ClassKit` do — so
        // there is nowhere on a class feature to hang one. It is prose plus its
        // own rows below, the same call the Barbarian's rage damage makes.
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
      // The martial arts die and unarmored movement each scale four times, and
      // both were a clause of prose on their level-1/2 row. Neither is a
      // counter — a die size and a speed bonus have no `used` count, the same
      // call the Bardic Inspiration die and the Barbarian's rage damage make —
      // but a scaling number is not prose either. De-dupe is keyed on
      // `level:name`, so each upgrade needs its own name to be granted at all.
      {
        level: 5,
        name: 'Martial Arts (d6)',
        text: 'Your martial arts die becomes a d6.',
      },
      {
        level: 6,
        name: 'Ki-Empowered Strikes',
        text: 'Your unarmed strikes count as magical for overcoming resistance to nonmagical attacks.',
      },
      {
        level: 6,
        name: 'Unarmored Movement (+15 ft)',
        text: 'Your unarmoured speed bonus rises to 15 feet.',
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
        level: 9,
        name: 'Unarmored Movement (Improvement)',
        text: 'You can move along vertical surfaces and across liquids on your turn without falling during the move.',
      },
      {
        level: 10,
        name: 'Purity of Body',
        text: 'You are immune to disease and poison.',
      },
      {
        level: 10,
        name: 'Unarmored Movement (+20 ft)',
        text: 'Your unarmoured speed bonus rises to 20 feet.',
      },
      {
        level: 11,
        name: 'Martial Arts (d8)',
        text: 'Your martial arts die becomes a d8.',
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
        level: 14,
        name: 'Unarmored Movement (+25 ft)',
        text: 'Your unarmoured speed bonus rises to 25 feet.',
      },
      {
        level: 15,
        name: 'Timeless Body',
        text: 'You no longer suffer the frailty of old age and can’t be aged magically.',
      },
      {
        level: 17,
        name: 'Martial Arts (d10)',
        text: 'Your martial arts die becomes a d10.',
      },
      {
        level: 18,
        name: 'Empty Body',
        text: 'You can spend 4 ki to become invisible for 1 minute, with resistance to all damage but force.',
      },
      {
        level: 18,
        name: 'Unarmored Movement (+30 ft)',
        text: 'Your unarmoured speed bonus rises to 30 feet.',
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
    /*
      A half caster: nothing at 1st, spells from 2nd. `slotsByLevel` therefore
      starts at 2 and `slotsAtLevel1` is 0 — the same convention a third caster
      uses, and the reason `castsAtLevel1` exists rather than the creation
      wizard asking whether this block is present. Without that predicate a
      level-1 paladin was shown a spells step offering nothing, which is why
      this block could not simply be added and the class could not cast at all.

      `prepares: true` — a paladin prepares from the whole paladin list rather
      than knowing a fixed set, so there is no `spellsKnownByLevel` here.
    */
    spellcasting: {
      ability: 'cha',
      slotsAtLevel1: 0,
      cantripsKnown: 0,
      spellsKnown: 0,
      prepares: true,
      listLabel: 'Paladin spells',
      slotsByLevel: {
        2: [2],
        3: [3],
        5: [4, 2],
        7: [4, 3],
        9: [4, 3, 2],
        11: [4, 3, 3],
        13: [4, 3, 3, 1],
        15: [4, 3, 3, 2],
        17: [4, 3, 3, 3, 1],
        19: [4, 3, 3, 3, 2],
      },
    },
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
        // A counter whose total the table genuinely does not know: it is
        // 1 + the Charisma modifier, not a number the book prints. Same bargain
        // as the Bard's inspiration — ship the figure a paladin starts with
        // under every ability method here and let the player correct it.
        //
        // A level-1 counter is delivered by `buildCharacter` at creation, not
        // by `resourcesOffered` — that only looks at the levels being *gained*,
        // and nobody ever gains the level they started at. Both this and the
        // Bard's inspiration were inert until creation learned to apply them.
        level: 1,
        name: 'Divine Sense',
        text: 'As an action you know the location of any celestial, fiend or undead within 60 feet that is not behind total cover. Uses equal to 1 + your Charisma modifier per long rest.',
        resource: { name: 'Divine Sense', total: 3, resets: 'long' },
      },
      {
        // Deliberately *not* a counter, and the clearest case in the file for
        // why. `resource.total` is a use count the player spends upward from
        // zero; Lay on Hands is a pool of hit points equal to 5 × the paladin
        // level, so it changes at every single level and nothing in this app
        // recomputes a total once it is on a sheet — see the doc on
        // `CharacterResource`. A row offered at twenty consecutive level-ups
        // would be noise, and stale the moment it was accepted. The pool is
        // arithmetic the player can do; the prose is the honest shape.
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
        // The class's counter, and it was missing outright: every oath grants
        // Channel Divinity options at 3rd, so without this row those features
        // would spend a resource the sheet has never heard of. The Cleric's
        // equivalent needs three rows because its uses scale at 6 and 18; a
        // paladin's never does, so one row says everything.
        level: 3,
        name: 'Channel Divinity',
        text: 'Your oath grants you the ability to channel divine energy, expending a use and regaining it on a short or long rest. Your oath determines the options available to you.',
        resource: { name: 'Channel Divinity', total: 1, resets: 'short' },
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
    /*
      The other half caster, on the same slot table as the Paladin and for the
      same reasons — see that block. It differs in two ways: Wisdom rather than
      Charisma, and a ranger *knows* a fixed set of spells rather than preparing
      from the list, so `prepares` is false and `spellsKnownByLevel` carries the
      count. Both tables are keyed by character level and start at 2.
    */
    spellcasting: {
      ability: 'wis',
      slotsAtLevel1: 0,
      cantripsKnown: 0,
      spellsKnown: 0,
      prepares: false,
      listLabel: 'Ranger spells',
      slotsByLevel: {
        2: [2],
        3: [3],
        5: [4, 2],
        7: [4, 3],
        9: [4, 3, 2],
        11: [4, 3, 3],
        13: [4, 3, 3, 1],
        15: [4, 3, 3, 2],
        17: [4, 3, 3, 3, 1],
        19: [4, 3, 3, 3, 2],
      },
      spellsKnownByLevel: {
        2: 2,
        3: 3,
        5: 4,
        7: 5,
        9: 6,
        11: 7,
        13: 8,
        15: 9,
        17: 10,
        19: 11,
      },
    },
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
      {
        id: 'thief',
        name: 'Thief',
        summary: 'Speed and stealth turned to burglary and quick hands.',
        features: [
          {
            level: 3,
            name: 'Fast Hands',
            text: 'You can use the bonus action from Cunning Action to make a Sleight of Hand check, use your thieves’ tools to disarm a trap or open a lock, or take the Use an Object action.',
          },
          {
            level: 3,
            name: 'Second-Story Work',
            text: 'Climbing costs you no extra movement, and your running jump distance increases by a number of feet equal to your Dexterity modifier.',
          },
          {
            level: 9,
            name: 'Supreme Sneak',
            text: 'You have advantage on a Stealth check on any turn you move no more than half your speed.',
          },
          {
            level: 13,
            name: 'Use Magic Device',
            text: 'You ignore all class, race and level requirements on the use of magic items.',
          },
          {
            level: 17,
            name: 'Thief’s Reflexes',
            text: 'You take two turns during the first round of any combat, the second at your initiative minus 10. You lose this if you are surprised.',
          },
        ],
      },
      {
        id: 'assassin',
        name: 'Assassin',
        summary: 'Disguise, poison and a lethal opening strike.',
        // Bonus Proficiencies is the rare subclass `grant` — two tools the sheet
        // has a real field for, the same shape Life Domain's heavy armour uses.
        // Its feature row below is the reminder; the grant is what lands.
        grant: { tools: ['Disguise kit', 'Poisoner’s kit'] },
        features: [
          {
            level: 3,
            name: 'Bonus Proficiencies',
            text: 'You gain proficiency with the disguise kit and the poisoner’s kit.',
          },
          {
            level: 3,
            name: 'Assassinate',
            text: 'You have advantage on attack rolls against any creature that has not yet taken a turn. Any hit you score against a surprised creature is a critical hit.',
          },
          {
            level: 9,
            name: 'Infiltration Expertise',
            text: 'You can spend 25 gp and seven days to establish a false identity, complete with documentation and acquaintances.',
          },
          {
            level: 13,
            name: 'Impostor',
            text: 'You can mimic the speech, writing and behaviour of another person after studying them for three hours.',
          },
          {
            level: 17,
            name: 'Death Strike',
            text: 'When you attack and hit a surprised creature, it makes a Constitution save against 8 + your Dexterity modifier + your proficiency bonus, or takes double damage.',
          },
        ],
      },
      {
        id: 'arcane-trickster',
        name: 'Arcane Trickster',
        summary: 'Enchantment and illusion in service of theft and mischief.',
        /**
         * Mage Hand is the one cantrip that is not a choice — the book's
         * "Mage Hand + 2" is three cantrips of which one is fixed. It rides
         * here rather than on the level-3 feature because `ClassFeatureInfo`
         * has no `grant`, and rather than as a pick because a question with a
         * single answer is not a question. `cantripsKnown: 2` below counts only
         * the chosen ones, which is what the wizard actually asks for.
         *
         * Applied on the level-up that chooses the archetype, which is level 3
         * — exactly when the book grants it.
         */
        grant: { spells: [{ name: 'Mage Hand', level: 0 }] },
        /**
         * The one archetype in this file that casts, and the reason
         * `SubclassInfo.spellcasting` exists.
         *
         * It cannot live on the Rogue kit: a class-level block would give every
         * Thief a spell step at level 1 and claim a progression a Rogue does not
         * have. Keyed by *character* level like every other table here, so it
         * starts at 3 — the level the archetype is chosen — rather than at 1.
         * `spellcastingFor` prefers this over the class's, and `slotsAtLevel`
         * reads it through that.
         *
         * No `spells` rows: those are the always-prepared domain and oath
         * tables, which is a different thing entirely from a spells-known
         * caster. What an Arcane Trickster knows is theirs to choose.
         */
        spellcasting: {
          ability: 'int',
          // Nothing at level 1 — this table begins where the archetype does.
          slotsAtLevel1: 0,
          // "Mage Hand + 2" in the book: three cantrips, but one of them is
          // fixed. Only the chosen ones are counted here, because that is what
          // the wizard asks the player to pick — Mage Hand itself rides in on
          // the level-3 feature's `grant` below, so it lands on the sheet
          // without occupying a choice the player does not actually have.
          cantripsKnown: 2,
          spellsKnown: 3,
          prepares: false,
          listLabel: 'Wizard spells',
          slotsByLevel: {
            3: [2],
            4: [3],
            7: [4, 2],
            10: [4, 3],
            13: [4, 3, 2],
            16: [4, 3, 3],
            19: [4, 3, 3, 1],
            20: [4, 3, 3, 1],
          },
          cantripsByLevel: { 3: 2, 10: 3 },
          spellsKnownByLevel: {
            3: 3,
            4: 4,
            7: 5,
            8: 6,
            10: 7,
            11: 8,
            13: 9,
            14: 10,
            16: 11,
            19: 12,
            20: 13,
          },
        },
        features: [
          {
            level: 3,
            name: 'Spellcasting',
            text: 'You learn Mage Hand and two other wizard cantrips, and three 1st-level wizard spells, two of them enchantment or illusion. Intelligence is your spellcasting ability, and your save DC is 8 + your proficiency bonus + your Intelligence modifier.',
          },
          {
            level: 3,
            name: 'Mage Hand Legerdemain',
            text: 'Your mage hand is invisible, and you can use it to stow or retrieve an object, pick a lock or disarm a trap at range, using your Sleight of Hand check.',
          },
          {
            level: 9,
            name: 'Magical Ambush',
            text: 'If you are hidden from a creature when you cast a spell on it, it has disadvantage on any saving throw against that spell this turn.',
          },
          {
            level: 13,
            name: 'Versatile Trickster',
            text: 'As a bonus action you can use your mage hand to distract a creature, gaining advantage on attack rolls against it this turn.',
          },
          {
            level: 17,
            name: 'Spell Thief',
            text: 'When a creature casts a spell targeting you, you can use your reaction to force a save; on a failure you steal the spell, casting it once, and the creature cannot cast it for 8 hours. Once per long rest.',
            resource: { name: 'Spell Thief', total: 1, resets: 'long' },
          },
        ],
      },
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
        // The second Expertise, which the kit did not have: a levelling Rogue
        // got the level-1 pick and then silently never got this one. Its own
        // pick id, because ids are one global keyspace and the level-1 pick is
        // a different question asked at a different time.
        level: 6,
        name: 'Expertise (2)',
        text: 'Choose two more of your skill proficiencies, or one skill and thieves’ tools. Your proficiency bonus is doubled for any ability check you make using them.',
        picks: [
          {
            id: 'rogue-expertise-6',
            kind: 'expertise',
            label: 'Expertise in two more of your skill proficiencies',
            count: 2,
            // The class's ceiling, as at level 1. `eligibleExpertiseAt` narrows
            // it to what this character is actually proficient in, and anything
            // already doubled is greyed rather than removed.
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
      spellsKnownByLevel: {
        1: 2,
        2: 3,
        3: 4,
        4: 5,
        5: 6,
        6: 7,
        7: 8,
        8: 9,
        9: 10,
        10: 11,
        11: 12,
        13: 13,
        15: 14,
        17: 15,
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
        text: 'You have sorcery points equal to your sorcerer level, which you can convert into spell slots and back. The counter starts at 2 and rises by one per level — raise it on the sheet as you go.',
        // The counter the class is built around spending, and it was prose
        // until now: a sorcerer's sheet had nothing to tick.
        //
        // `total` is the sorcerer *level*, which no static table can track —
        // `resource` is a fixed number offered once at the level that grants
        // it, and `resourcesOffered` gates on `total` changing, so a row per
        // level would be twenty offers of the same counter. Same call Bardic
        // Inspiration makes for the Charisma modifier: ship the value at the
        // granting level, say so in the text, and let the player edit the box.
        // A figure corrected once beats a feature that never reaches the sheet.
        resource: { name: 'Sorcery Points', total: 2, resets: 'long' },
      },
      {
        // Three rows rather than one whose prose mentions the upgrades — the
        // same call Brutal Critical, Magical Secrets and Divine Strike (2d8)
        // make. De-dupe is keyed on `level:name`, so distinct names at
        // distinct levels each get granted; folded into the level-3 text, the
        // 10th and 17th options are prose that scrolls past unread.
        //
        // Which options are chosen stays prose deliberately: a metamagic pick
        // would need `Character` to have a field for the answer, and it has
        // none — as a `kind: 'other'` pick `applyPicks` would record the click
        // and then discard it, which is worse than a reminder.
        level: 3,
        name: 'Metamagic',
        text: 'You gain two Metamagic options of your choice, and can use only one per spell unless stated otherwise.',
      },
      {
        level: 10,
        name: 'Metamagic (3rd option)',
        text: 'You learn a third Metamagic option of your choice.',
      },
      {
        level: 17,
        name: 'Metamagic (4th option)',
        text: 'You learn a fourth Metamagic option of your choice.',
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
      spellsKnownByLevel: {
        1: 2,
        2: 3,
        3: 4,
        4: 5,
        5: 6,
        6: 7,
        7: 8,
        8: 9,
        9: 10,
        11: 11,
        13: 12,
        15: 13,
        17: 14,
        19: 15,
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
        // The Wizard's only counter, and the class had none at all until this
        // was added. The use count is one; what scales is the *size* of the
        // recovery (slots totalling half your wizard level), which is a scaling
        // number rather than a use count and stays in the text — the same call
        // Lay on Hands and the Barbarian's unlimited rage got.
        //
        // `resets: 'long'`, deliberately not 'short'. The feature is triggered
        // by a short rest but refreshed by the day, and 'short' would tell the
        // sheet a wizard gets it back every hour. Ki is 'short' and Sorcery
        // Points 'long'; copying either wholesale gets this one wrong and no
        // existing test would catch it.
        //
        // Level 1, so it reaches the sheet through `buildCharacter`, which
        // *applies* level-1 counters, rather than `resourcesOffered`, which
        // only ever looks at levels being gained.
        resource: { name: 'Arcane Recovery', total: 1, resets: 'long' },
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
