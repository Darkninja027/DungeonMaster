/**
 * Subclasses from the published 5e books, as built-ins for the wizard.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE
 *
 * This file is **not** SRD 5.1 and is deliberately outside `lib/srd/`. The
 * header of `lib/srd/index.ts` promises that only SRD content appears there and
 * that Player's Handbook material the SRD omits is "not ours to ship" — a
 * promise that stays true only if subclasses from the wider books live here
 * instead, under their own provenance rather than that folder's CC BY 4.0
 * attribution. Same split, same reason, as `lib/feats/publishedFeats.ts` and
 * `lib/races/publishedRaces.ts`.
 *
 * The line matters more here than it looks. SRD 5.1 ships exactly **one**
 * subclass per class — Berserker, Champion, Thief, College of Lore, Life
 * Domain, and so on. Every other archetype in `classKits.ts` is a *name only*,
 * seeded so a player who picks it still gets a working sheet, and a name is not
 * the thing the licence is about. The moment one gains features and rules
 * reminders it is content, and content from the PHB belongs here.
 *
 * What belongs here is a **name, its mechanical grants and one-line reminders
 * in our own words**, the same editor affordance the SRD tables are. Rules text
 * is never reproduced.
 *
 * Sources: Player's Handbook (Path of the Totem Warrior, College of Valor).
 * ---------------------------------------------------------------------------
 *
 * Authoring rules are the SRD tables' rules, and `srd.test.ts` enforces them
 * over this list too: `id` is the slugified name and never reaches disk, skills
 * are kebab ids, feature levels sit at or above the class's `subclassLevelOf`,
 * and pick ids share one global keyspace with every other table.
 *
 * Keyed by **class name**, matched case-insensitively, because a subclass has
 * no meaning apart from the class that offers it — see `layerSubclasses` in
 * lib/tables.ts, which overlays these onto the kit's own list by name.
 */

import type { PickList, SubclassInfo } from '../srd/types'

/**
 * The Totem Warrior's spirit animals, and the one place in these tables where a
 * repeated pick's *text* changes with the level it is taken at.
 *
 * A Battle Master's manoeuvres are one flat table because Riposte means the
 * same thing whenever you learn it. A totem does not: Bear grants resistance at
 * 3rd, carrying capacity at 6th and a fear aura at 14th, so the table is keyed
 * by level first and the factory reads the slice for the level it is building.
 *
 * 5e lets you choose a *different* animal at each of the three levels, or the
 * same one — the book is explicit about it. That is why these picks are `open`;
 * see the note on the factory below.
 */
const TOTEM_TEXT: Record<number, Record<string, string>> = {
  3: {
    Bear: 'While raging you have resistance to every kind of damage except psychic.',
    Eagle:
      'While raging and wearing no heavy armour, other creatures have disadvantage on opportunity attacks against you, and you can Dash as a bonus action.',
    Wolf: 'While raging, your allies have advantage on melee attacks against any hostile creature within 5 feet of you.',
  },
  6: {
    Bear: 'Your carrying capacity doubles, and you have advantage on Strength checks to push, pull, lift or break objects.',
    Eagle:
      'You gain darkvision out to 60 feet, and can see up to a mile away with no difficulty picking out fine detail.',
    Wolf: 'You can track other creatures at a fast pace, and move stealthily at a normal pace.',
  },
  14: {
    Bear: 'While raging, any creature within 5 feet that attacks someone other than you makes a Wisdom save or has disadvantage on the roll.',
    Eagle:
      'While raging you can fly for one turn as a bonus action, falling if you end your turn in the air.',
    Wolf: 'While raging you can use a bonus action to knock a Large or smaller creature prone when you hit it with a melee attack.',
  },
}

/**
 * One totem choice, at the level it is made.
 *
 * A factory for the same reason `MANEUVER_PICK` is one: the archetype poses
 * this question three times and pick ids share one global keyspace, so the
 * owner carries the level — `totem-warrior-3`, `-6`, `-14`.
 *
 * **`open` on purpose, and load-bearing.** The book ships three animals, and
 * `spentElsewhere` greys out any option already on the sheet under this same
 * `featureLabel`. Closed, a 14th-level Totem Warrior would have exactly one
 * answer left and the third "choice" would be a formality. Open, the three are
 * offered as chips and an Elk, Tiger or something invented at the table can be
 * typed instead — the usual bargain here, and the same reason a homebrew race
 * round-trips. A typed answer lands as a bare named row, which
 * `applyFeaturePick` already does correctly.
 *
 * The cost of `open` is that two srd.test invariants skip these picks — the
 * option-count check and, more importantly, `featureText` completeness. The
 * text above is therefore checked by a test of its own.
 *
 * **The label differs per level, and that is not cosmetic.** `spentElsewhere`
 * matches what is already on the sheet by the row name a pick *would* write, and
 * `applyFeaturePick` de-dupes on the same string. One shared "Totem Spirit"
 * label would therefore grey out Bear at 6th for a character who took Bear at
 * 3rd — and if the player chose it anyway, the level-6 benefit would be silently
 * swallowed as a duplicate row. Taking the same animal twice is legal and
 * common, so each level writes its own row: "Totem Spirit: Bear" at 3rd,
 * "Aspect of the Beast: Bear" at 6th.
 */
function TOTEM_PICK(
  owner: string,
  level: number,
  featureLabel: string,
): PickList {
  return {
    id: `${owner}-totem`,
    kind: 'feature',
    label: 'Choose a totem spirit',
    count: 1,
    options: Object.keys(TOTEM_TEXT[level]),
    open: true,
    featureLabel,
    featureText: TOTEM_TEXT[level],
  }
}

/**
 * Subclasses the published books add, by class name.
 *
 * A class absent from this record simply has none, which is the ordinary case.
 * Nothing here may collide by name with an SRD subclass that already carries
 * content — `layerSubclasses` would silently replace it. Colliding with a
 * name-only *stub* is the entire point: that is how a seeded name gains its
 * features. `subclasses.test.ts` asserts both.
 */
export const PUBLISHED_SUBCLASSES: Record<string, Array<SubclassInfo>> = {
  Barbarian: [
    {
      id: 'path-of-the-totem-warrior',
      name: 'Path of the Totem Warrior',
      summary: 'A spirit animal’s gifts, chosen anew as you grow.',
      features: [
        {
          level: 3,
          name: 'Spirit Seeker',
          text: 'You can cast beast sense and speak with animals as rituals.',
        },
        {
          level: 3,
          name: 'Totem Spirit',
          // Bear's resistance applies *while raging* only, which `resistances`
          // on the sheet cannot say — so no `featureGrant` here. The row is
          // the reminder, the same bargain Archery's absent grant strikes.
          text: 'Choose a spirit animal and gain its benefit. Your choice need not be the same at each level that offers one.',
          picks: [TOTEM_PICK('totem-warrior-3', 3, 'Totem Spirit')],
        },
        {
          level: 6,
          name: 'Aspect of the Beast',
          text: 'Choose a spirit animal — the same one or a different one — and gain a further benefit from it.',
          picks: [TOTEM_PICK('totem-warrior-6', 6, 'Aspect of the Beast')],
        },
        {
          level: 10,
          name: 'Spirit Walker',
          text: 'You can cast commune with nature as a ritual, and your spirit animal appears to deliver the answer.',
        },
        {
          level: 14,
          name: 'Totemic Attunement',
          text: 'Choose a spirit animal once more for a final benefit while you rage.',
          picks: [TOTEM_PICK('totem-warrior-14', 14, 'Totemic Attunement')],
        },
      ],
    },
  ],
  Bard: [
    {
      id: 'college-of-valor',
      name: 'College of Valor',
      summary: 'Songs of the fallen, sung from inside the fight.',
      // The rare subclass `grant`, and the case `SubclassInfo.grant`'s own doc
      // comment names: proficiencies the sheet has real fields for. The feature
      // row below is the reminder; this is what lands.
      grant: {
        armor: ['medium', 'shields'],
        weapons: ['martial'],
      },
      features: [
        {
          level: 3,
          name: 'Bonus Proficiencies',
          text: 'You gain proficiency with medium armour, shields and martial weapons.',
        },
        {
          level: 3,
          name: 'Combat Inspiration',
          text: 'A creature holding your Bardic Inspiration die can add it to a weapon’s damage roll, or to their AC against one attack.',
        },
        {
          level: 6,
          name: 'Extra Attack',
          text: 'You can attack twice, instead of once, whenever you take the Attack action on your turn.',
        },
        {
          level: 14,
          name: 'Battle Magic',
          text: 'After casting a spell with your action, you can make one weapon attack as a bonus action.',
        },
      ],
    },
  ],
  /**
   * The six PHB domains. Life Domain is the SRD one and is authored in
   * `lib/srd/classKits.ts` instead — see the provenance header above.
   *
   * A cleric picks at **level 1**, so unlike every other subclass in this file
   * these reach the sheet through creation as well as level-up: their level-1
   * grants and picks are offered in the wizard's Class step.
   *
   * Channel Divinity is the *class's* counter, granted at 2nd by the Cleric
   * kit. Each domain adds its own option at 2, and some another at 6 — those
   * are feature rows rather than extra counters, because they spend the same
   * uses. Only three counters fit on a sheet.
   */
  Cleric: [
    {
      id: 'knowledge-domain',
      name: 'Knowledge Domain',
      summary: 'Learning as devotion, and secrets as a kind of power.',
      // Blessings of Knowledge doubles proficiency in two skills, which is
      // exactly what `Character.expertise` models and `skillBonus` already
      // computes — so it is a real pick rather than prose. The options are the
      // four the domain names, not every skill; `eligibleExpertise` narrows
      // them again at render to the ones the character actually has.
      grant: {
        picks: [
          {
            id: 'knowledge-domain-expertise',
            kind: 'expertise',
            label: 'Expertise in two of Arcana, History, Nature or Religion',
            count: 2,
            options: ['arcana', 'history', 'nature', 'religion'],
          },
        ],
      },
      spells: [
        { grantedAt: 1, level: 1, names: ['Command', 'Identify'] },
        { grantedAt: 3, level: 2, names: ['Augury', 'Suggestion'] },
        { grantedAt: 5, level: 3, names: ['Nondetection', 'Speak with Dead'] },
        { grantedAt: 7, level: 4, names: ['Arcane Eye', 'Confusion'] },
        { grantedAt: 9, level: 5, names: ['Legend Lore', 'Scrying'] },
      ],
      features: [
        {
          level: 1,
          name: 'Blessings of Knowledge',
          text: 'You learn two languages of your choice, and gain proficiency with two skills from Arcana, History, Nature or Religion. Your proficiency bonus is doubled for checks with them.',
        },
        {
          level: 2,
          name: 'Channel Divinity: Knowledge of the Ages',
          text: 'Spend a use to gain proficiency with one skill or tool of your choice for 10 minutes.',
        },
        {
          level: 6,
          name: 'Channel Divinity: Read Thoughts',
          text: 'Spend a use to read a creature’s surface thoughts within 60 feet for one minute, and optionally cast suggestion on it without a slot.',
        },
        {
          level: 8,
          name: 'Potent Spellcasting',
          text: 'Add your Wisdom modifier to the damage you deal with any cleric cantrip.',
        },
        {
          level: 17,
          name: 'Visions of the Past',
          text: 'After a minute of concentration, you can see visions of an object’s recent owners or of events in the surrounding area.',
        },
      ],
    },
    {
      id: 'light-domain',
      name: 'Light Domain',
      summary: 'Fire and radiance held against the dark.',
      // Bonus Cantrip is a fixed spell handed over once — `grant.spells`, not a
      // domain-table row, and level 0 because a cantrip is level 0.
      grant: { spells: [{ name: 'Light', level: 0 }] },
      spells: [
        { grantedAt: 1, level: 1, names: ['Burning Hands', 'Faerie Fire'] },
        { grantedAt: 3, level: 2, names: ['Flaming Sphere', 'Scorching Ray'] },
        { grantedAt: 5, level: 3, names: ['Daylight', 'Fireball'] },
        {
          grantedAt: 7,
          level: 4,
          names: ['Guardian of Faith', 'Wall of Fire'],
        },
        { grantedAt: 9, level: 5, names: ['Flame Strike', 'Scrying'] },
      ],
      features: [
        {
          level: 1,
          name: 'Bonus Cantrip',
          text: 'You learn the light cantrip if you do not already know it. It does not count against your cantrips known.',
        },
        {
          level: 1,
          name: 'Warding Flare',
          text: 'As a reaction, impose disadvantage on an attack roll against you. Usable a number of times equal to your Wisdom modifier, regained on a long rest.',
        },
        {
          level: 2,
          name: 'Channel Divinity: Radiance of the Dawn',
          text: 'Spend a use to dispel magical darkness nearby and deal radiant damage to hostile creatures within 30 feet, halved on a successful Constitution save.',
        },
        {
          level: 6,
          name: 'Improved Flare',
          text: 'You can use Warding Flare to protect another creature within 30 feet, not just yourself.',
        },
        {
          level: 8,
          name: 'Potent Spellcasting',
          text: 'Add your Wisdom modifier to the damage you deal with any cleric cantrip.',
        },
        {
          level: 17,
          name: 'Corona of Light',
          text: 'As an action, emit sunlight for a minute. Creatures in it have disadvantage on saves against your radiant and fire spells.',
        },
      ],
    },
    {
      id: 'nature-domain',
      name: 'Nature Domain',
      summary: 'A priest of the wild, at home among beast and root.',
      // Two level-1 features granting two different things, and one place to
      // put them: `ClassFeatureInfo` has no `grant`, so the armour and the
      // skill choice both ride the subclass's single grant. The rows below are
      // the reminders.
      grant: {
        armor: ['heavy'],
        picks: [
          {
            id: 'nature-domain-skill',
            kind: 'skill',
            label: 'One skill from Animal Handling, Nature or Survival',
            count: 1,
            options: ['animal-handling', 'nature', 'survival'],
          },
        ],
      },
      spells: [
        {
          grantedAt: 1,
          level: 1,
          names: ['Animal Friendship', 'Speak with Animals'],
        },
        { grantedAt: 3, level: 2, names: ['Barkskin', 'Spike Growth'] },
        { grantedAt: 5, level: 3, names: ['Plant Growth', 'Wind Wall'] },
        { grantedAt: 7, level: 4, names: ['Dominate Beast', 'Grasping Vine'] },
        { grantedAt: 9, level: 5, names: ['Insect Plague', 'Tree Stride'] },
      ],
      features: [
        {
          level: 1,
          name: 'Acolyte of Nature',
          text: 'You learn one druid cantrip of your choice, and gain proficiency in one of Animal Handling, Nature or Survival.',
        },
        {
          level: 1,
          name: 'Bonus Proficiency',
          text: 'You gain proficiency with heavy armour.',
        },
        {
          level: 2,
          name: 'Channel Divinity: Charm Animals and Plants',
          text: 'Spend a use to charm beasts and plants within 30 feet that fail a Wisdom save, for one minute or until damaged.',
        },
        {
          level: 6,
          name: 'Dampen Elements',
          text: 'As a reaction, grant yourself or a creature within 30 feet resistance to acid, cold, fire, lightning or thunder damage.',
        },
        {
          level: 8,
          name: 'Divine Strike',
          text: 'Once on each of your turns, a weapon hit deals an extra 1d8 cold, fire or lightning damage.',
        },
        {
          level: 14,
          name: 'Divine Strike (2d8)',
          text: 'Your Divine Strike damage rises to 2d8.',
        },
        {
          level: 17,
          name: 'Master of Nature',
          text: 'You can command creatures charmed by your Channel Divinity as a bonus action, dictating what they do on their next turn.',
        },
      ],
    },
    {
      id: 'tempest-domain',
      name: 'Tempest Domain',
      summary: 'Thunder, lightning, and the wrath behind them.',
      grant: { armor: ['heavy'], weapons: ['martial'] },
      spells: [
        { grantedAt: 1, level: 1, names: ['Fog Cloud', 'Thunderwave'] },
        { grantedAt: 3, level: 2, names: ['Gust of Wind', 'Shatter'] },
        { grantedAt: 5, level: 3, names: ['Call Lightning', 'Sleet Storm'] },
        { grantedAt: 7, level: 4, names: ['Control Water', 'Ice Storm'] },
        {
          grantedAt: 9,
          level: 5,
          names: ['Destructive Wave', 'Insect Plague'],
        },
      ],
      features: [
        {
          level: 1,
          name: 'Bonus Proficiencies',
          text: 'You gain proficiency with martial weapons and heavy armour.',
        },
        {
          level: 1,
          name: 'Wrath of the Storm',
          text: 'As a reaction when a creature within 5 feet hits you, deal lightning or thunder damage, halved on a successful Dexterity save. Usable a number of times equal to your Wisdom modifier per long rest.',
        },
        {
          level: 2,
          name: 'Channel Divinity: Destructive Wrath',
          text: 'Spend a use to deal maximum damage instead of rolling, for one instance of lightning or thunder damage.',
        },
        {
          level: 6,
          name: 'Thunderbolt Strike',
          text: 'When you deal lightning damage to a Large or smaller creature, you can push it up to 10 feet away.',
        },
        {
          level: 8,
          name: 'Divine Strike',
          text: 'Once on each of your turns, a weapon hit deals an extra 1d8 thunder damage.',
        },
        {
          level: 14,
          name: 'Divine Strike (2d8)',
          text: 'Your Divine Strike damage rises to 2d8.',
        },
        {
          level: 17,
          name: 'Stormborn',
          text: 'You have a flying speed equal to your walking speed while not underground or indoors.',
        },
      ],
    },
    {
      id: 'trickery-domain',
      name: 'Trickery Domain',
      summary: 'Mischief and misdirection in a god’s service.',
      spells: [
        { grantedAt: 1, level: 1, names: ['Charm Person', 'Disguise Self'] },
        {
          grantedAt: 3,
          level: 2,
          names: ['Mirror Image', 'Pass without Trace'],
        },
        { grantedAt: 5, level: 3, names: ['Blink', 'Dispel Magic'] },
        { grantedAt: 7, level: 4, names: ['Dimension Door', 'Polymorph'] },
        {
          grantedAt: 9,
          level: 5,
          names: ['Dominate Person', 'Modify Memory'],
        },
      ],
      features: [
        {
          level: 1,
          name: 'Blessing of the Trickster',
          text: 'You can touch a willing creature to give it advantage on Stealth checks for an hour.',
        },
        {
          level: 2,
          name: 'Channel Divinity: Invoke Duplicity',
          text: 'Spend a use to create an illusory double of yourself for a minute, gaining advantage on attacks against creatures within 5 feet of it.',
        },
        {
          level: 6,
          name: 'Channel Divinity: Cloak of Shadows',
          text: 'Spend a use to become invisible until the end of your next turn, or until you attack or cast a spell.',
        },
        {
          level: 8,
          name: 'Divine Strike',
          text: 'Once on each of your turns, a weapon hit deals an extra 1d8 poison damage.',
        },
        {
          level: 14,
          name: 'Divine Strike (2d8)',
          text: 'Your Divine Strike damage rises to 2d8.',
        },
        {
          level: 17,
          name: 'Improved Duplicity',
          text: 'Invoke Duplicity creates up to four duplicates instead of one, and you can move any number of them on your turn.',
        },
      ],
    },
    {
      id: 'war-domain',
      name: 'War Domain',
      summary: 'A cleric who fights, and blesses the fighting.',
      grant: { armor: ['heavy'], weapons: ['martial'] },
      spells: [
        { grantedAt: 1, level: 1, names: ['Divine Favor', 'Shield of Faith'] },
        { grantedAt: 3, level: 2, names: ['Magic Weapon', 'Spiritual Weapon'] },
        {
          grantedAt: 5,
          level: 3,
          names: ['Crusader’s Mantle', 'Spirit Guardians'],
        },
        {
          grantedAt: 7,
          level: 4,
          names: ['Freedom of Movement', 'Stoneskin'],
        },
        { grantedAt: 9, level: 5, names: ['Flame Strike', 'Hold Monster'] },
      ],
      features: [
        {
          level: 1,
          name: 'Bonus Proficiency',
          text: 'You gain proficiency with martial weapons and heavy armour.',
        },
        {
          // Not a `resource`, deliberately. The uses are the Wisdom modifier,
          // which no table knows, and Channel Divinity is the counter a cleric
          // actually spends — only three fit on a sheet, so this stays a row
          // the player reads rather than a second tracker competing with it.
          level: 1,
          name: 'War Priest',
          text: 'When you take the Attack action, you can make one weapon attack as a bonus action. Usable a number of times equal to your Wisdom modifier, regained on a long rest.',
        },
        {
          level: 2,
          name: 'Channel Divinity: Guided Strike',
          text: 'Spend a use to add +10 to an attack roll, after seeing the roll but before knowing the outcome.',
        },
        {
          level: 6,
          name: 'Channel Divinity: War God’s Blessing',
          text: 'As a reaction, spend a use to give a creature within 30 feet +10 to an attack roll.',
        },
        {
          level: 8,
          name: 'Divine Strike',
          text: 'Once on each of your turns, a weapon hit deals an extra 1d8 damage of your weapon’s type.',
        },
        {
          level: 14,
          name: 'Divine Strike (2d8)',
          text: 'Your Divine Strike damage rises to 2d8.',
        },
        {
          level: 17,
          name: 'Avatar of Battle',
          text: 'You have resistance to bludgeoning, piercing and slashing damage from nonmagical attacks.',
        },
      ],
    },
  ],
}

/** The published subclasses for one class, or none. Name in, empty out. */
export function publishedSubclassesFor(className: string): Array<SubclassInfo> {
  const key = className.trim().toLowerCase()
  for (const [name, subs] of Object.entries(PUBLISHED_SUBCLASSES)) {
    if (name.trim().toLowerCase() === key) return subs
  }
  return []
}
