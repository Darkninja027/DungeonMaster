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
 * Sources: Player's Handbook (Path of the Totem Warrior, College of Valor,
 * the six non-Life cleric domains, Circle of the Moon, Draconic Bloodline and
 * Wild Magic, the three monastic traditions, the three paladin oaths, both
 * ranger conclaves, the eight wizard schools and the three warlock patrons).
 * ---------------------------------------------------------------------------
 *
 * Authoring rules are the SRD tables' rules, and `srd.test.ts` enforces them
 * over this list too: `id` is the slugified name and never reaches disk, skills
 * are kebab ids, feature levels sit at or above the class's `subclassLevelOf`,
 * and pick ids share one global keyspace with every other table.
 *
 * That last sentence is only true because the walkers in `srd.test.ts` read
 * `SRD_TABLES.kits` — the *merged* tables — rather than `SRD_CLASS_KITS`. They
 * read the raw array once, and this whole tier went unchecked: pick ids outside
 * the uniqueness keyspace, skill ids unvalidated, `featureText` completeness
 * never asserted. If you ever narrow those walkers back, everything below stops
 * being covered and nothing fails to tell you.
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
 * The Way of the Four Elements' disciplines, and the mirror image of the totem
 * table above.
 *
 * A totem's *text* varies by level and its option list does not — Bear means
 * three different things at 3rd, 6th and 14th. A discipline is the opposite:
 * the text is fixed (Water Whip means one thing whenever you learn it) while
 * the *options* open up with level, because several disciplines are gated
 * behind 6th, 11th or 17th. So this table is flat and `DISCIPLINES_AT` below
 * carries the level.
 */
const ELEMENTAL_DISCIPLINES: Record<string, string> = {
  'Elemental Attunement':
    'A free minor display of elemental control within 30 feet — snuff a flame, chill an object, or shape a handful of earth or mist.',
  'Fangs of the Fire Snake':
    'Spend 1 ki as you attack to wreathe your strikes in flame, adding 10 feet of reach and dealing fire damage; 1 more ki adds extra fire damage on a hit.',
  'Fist of Four Thunders': 'Spend 2 ki to cast thunderwave.',
  'Fist of Unbroken Air':
    'Spend 2 ki to strike at 30 feet for bludgeoning damage, with more ki adding to it, and push or knock the target prone.',
  'Rush of the Gale Spirits': 'Spend 2 ki to cast gust of wind.',
  'Shape the Flowing River':
    'Spend 1 ki to reshape ice or water in a 30-foot area, raising or flattening the terrain.',
  'Sweeping Cinder Strike': 'Spend 2 ki to cast burning hands.',
  'Water Whip':
    'Spend 2 ki to lash a target at 30 feet for bludgeoning damage, with more ki adding to it, and pull it or knock it prone.',
  'Clench of the North Wind': 'Spend 3 ki to cast hold person.',
  'Gong of the Summit': 'Spend 3 ki to cast shatter.',
  'Flames of the Phoenix': 'Spend 4 ki to cast fireball.',
  'Mist Stance': 'Spend 4 ki to cast gaseous form on yourself.',
  'Ride the Wind': 'Spend 4 ki to cast fly on yourself.',
  'Breath of Winter': 'Spend 6 ki to cast cone of cold.',
  'Eternal Mountain Defense': 'Spend 5 ki to cast stoneskin on yourself.',
  'River of Hungry Flame': 'Spend 5 ki to cast wall of fire.',
  'Wave of Rolling Earth': 'Spend 6 ki to cast wall of stone.',
}

/**
 * Which disciplines are legal at each level a monk learns one.
 *
 * Cumulative and deliberately duplicated rather than computed: the prerequisite
 * is authored data, and a table you can read straight down is worth more here
 * than four lines of spread syntax.
 *
 * **Eternal Mountain Defense is 17th, not 11th.** The PHB's first printing said
 * 11th and official errata moved it to 17th, so a majority of the sources you
 * will find online — and most memories of this subclass — have it wrong. If a
 * future pass "corrects" it back to 11, the test in subclasses.test.ts is what
 * should stop them.
 */
const DISCIPLINES_AT: Record<number, Array<string>> = {
  3: [
    'Fangs of the Fire Snake',
    'Fist of Four Thunders',
    'Fist of Unbroken Air',
    'Rush of the Gale Spirits',
    'Shape the Flowing River',
    'Sweeping Cinder Strike',
    'Water Whip',
  ],
  6: [
    'Fangs of the Fire Snake',
    'Fist of Four Thunders',
    'Fist of Unbroken Air',
    'Rush of the Gale Spirits',
    'Shape the Flowing River',
    'Sweeping Cinder Strike',
    'Water Whip',
    'Clench of the North Wind',
    'Gong of the Summit',
  ],
  11: [
    'Fangs of the Fire Snake',
    'Fist of Four Thunders',
    'Fist of Unbroken Air',
    'Rush of the Gale Spirits',
    'Shape the Flowing River',
    'Sweeping Cinder Strike',
    'Water Whip',
    'Clench of the North Wind',
    'Gong of the Summit',
    'Flames of the Phoenix',
    'Mist Stance',
    'Ride the Wind',
  ],
  17: [
    'Fangs of the Fire Snake',
    'Fist of Four Thunders',
    'Fist of Unbroken Air',
    'Rush of the Gale Spirits',
    'Shape the Flowing River',
    'Sweeping Cinder Strike',
    'Water Whip',
    'Clench of the North Wind',
    'Gong of the Summit',
    'Flames of the Phoenix',
    'Mist Stance',
    'Ride the Wind',
    'Breath of Winter',
    'Eternal Mountain Defense',
    'River of Hungry Flame',
    'Wave of Rolling Earth',
  ],
}

/**
 * One elemental discipline choice, at the level it is made.
 *
 * A factory for the same reason `TOTEM_PICK` and `MANEUVER_PICK` are: the
 * archetype poses this question four times and pick ids share one global
 * keyspace, so the owner carries the level — `four-elements-3-discipline`,
 * `-6-`, `-11-`, `-17-`.
 *
 * **`open` on purpose.** Seventeen disciplines is a long list and Tasha's added
 * more, so a table this app does not ship should still be typeable. A typed
 * answer lands as a bare named row, which `applyFeaturePick` already handles.
 * The cost is that two srd.test invariants skip an open pick — the option-count
 * check and `featureText` completeness — so `subclasses.test.ts` checks both by
 * hand, in both directions. That test is the only thing covering this data.
 *
 * **The label is shared across levels, and that inverts the totem rule.** A
 * totem may legally be taken twice, so one shared label would wrongly grey out
 * Bear at 6th for a character who took Bear at 3rd — hence its per-level
 * labels. A discipline may *not* be taken twice, so here the shared label is
 * not merely safe but load-bearing: `grantedAlreadyAt` matches what is already
 * on the sheet by the row name a pick would write, so one
 * "Elemental Discipline: Water Whip" is exactly what greys Water Whip out at
 * every later level. Battle Master's manoeuvres are the precedent.
 */
function ELEMENT_PICK(owner: string, level: number): PickList {
  return {
    id: `${owner}-${level}-discipline`,
    kind: 'feature',
    label: 'Choose an elemental discipline',
    count: 1,
    options: DISCIPLINES_AT[level],
    open: true,
    featureLabel: 'Elemental Discipline',
    featureText: ELEMENTAL_DISCIPLINES,
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
   * A druid picks their circle at **2nd** level, not 3rd — the kit says so via
   * `subclassLevel: 2`, so these features may sit at 2. Circle of the Land is
   * the SRD one and is authored in `lib/srd/classKits.ts` instead.
   */
  Druid: [
    {
      id: 'circle-of-the-moon',
      name: 'Circle of the Moon',
      summary: 'Wild shape as a weapon, and shapes that fight back.',
      features: [
        {
          level: 2,
          name: 'Combat Wild Shape',
          text: 'You can use Wild Shape as a bonus action, and while transformed you can spend a spell slot as a bonus action to regain 1d8 hit points per level of the slot.',
        },
        {
          level: 2,
          name: 'Circle Forms',
          text: 'You can transform into a beast with a challenge rating as high as 1, ignoring the Max CR column of the Beast Shapes table.',
        },
        {
          // Its own row rather than a clause in the level-2 prose: de-dupe is
          // keyed on `level:name`, so an upgrade the wizard should grant at 6
          // has to be a feature at 6. Same rule as Extra Attack (2).
          level: 6,
          name: 'Circle Forms (CR)',
          text: 'The maximum challenge rating of your beast forms becomes your druid level divided by 3, rounded down.',
        },
        {
          level: 6,
          name: 'Primal Strike',
          text: 'Your attacks in beast form count as magical for overcoming resistance and immunity to nonmagical attacks.',
        },
        {
          level: 10,
          name: 'Elemental Wild Shape',
          text: 'You can expend two uses of Wild Shape at once to transform into an air, earth, fire or water elemental.',
        },
        {
          level: 14,
          name: 'Thousand Forms',
          text: 'You can cast alter self at will.',
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
  /**
   * Both sorcerous origins. SRD 5.1 licenses Draconic Bloodline as the
   * Sorcerer's one archetype, but `classKits.ts` seeds it as a *name only* and
   * that is where it stays — a name is not what the licence is about, and the
   * features below are PHB content, so they belong here with the rest.
   *
   * A sorcerer picks at **level 1**, like a cleric, so these reach the sheet
   * through creation as well as level-up: the level-1 grant and the Dragon
   * Ancestor pick are offered in the wizard's Class step.
   *
   * Neither origin has a `resource`. Sorcery Points is the *class's* counter,
   * granted at 2nd by the Sorcerer kit — the same division the cleric domains
   * keep with Channel Divinity.
   */
  Sorcerer: [
    {
      id: 'draconic-bloodline',
      name: 'Draconic Bloodline',
      summary: 'A dragon somewhere in the blood, surfacing as scale and flame.',
      /**
       * Draconic Resilience is what actually lands, and it lands here rather
       * than on the level-1 feature row because `ClassFeatureInfo` has no
       * `grant` — the row below is the reminder.
       *
       * `hpPerLevel: 1` is exact: the feature reads "your hit point maximum
       * increases by 1 and increases by 1 again whenever you gain a level".
       *
       * `acBonus` is **not** exact and is deliberately omitted. The feature
       * sets AC to 13 + Dexterity while wearing no armour, which is a *floor
       * that replaces* the usual 10 + Dex, not a bonus added to it. `acBonus`
       * is additive, so any number here would be wrong the moment the
       * character puts on armour — +3 on top of a breastplate is a lie the
       * sheet would tell silently. The text says what the number cannot, and
       * the player sets AC themselves, which is the same call `flexibleAsi`
       * and Bardic Inspiration's total make: a figure a player corrects once
       * beats a wrong one computed forever.
       */
      grant: { hpPerLevel: 1 },
      features: [
        {
          level: 1,
          name: 'Dragon Ancestor',
          text: 'Choose a dragon as your ancestor. You can speak Draconic, and double your proficiency bonus on Charisma checks when dealing with dragons.',
          picks: [
            {
              // Closed: the five damage types are the whole list 5e offers,
              // and unlike a totem this choice is made once and never again,
              // so nothing greys out and no factory is needed.
              id: 'draconic-bloodline-ancestor',
              kind: 'feature',
              label: 'Choose your draconic ancestry',
              count: 1,
              options: ['Acid', 'Cold', 'Fire', 'Lightning', 'Poison'],
              featureLabel: 'Draconic Ancestry',
              featureText: {
                Acid: 'Black or copper ancestry. Your Dragon Ancestor damage type is acid.',
                Cold: 'Silver or white ancestry. Your Dragon Ancestor damage type is cold.',
                Fire: 'Brass, gold or red ancestry. Your Dragon Ancestor damage type is fire.',
                Lightning:
                  'Blue or bronze ancestry. Your Dragon Ancestor damage type is lightning.',
                Poison:
                  'Green ancestry. Your Dragon Ancestor damage type is poison.',
              },
            },
          ],
        },
        {
          level: 1,
          name: 'Draconic Resilience',
          text: 'Your hit point maximum increases by 1 per sorcerer level. Parts of you are scaled, and while you wear no armour your AC is 13 + your Dexterity modifier — set it on the sheet, as it replaces the usual calculation rather than adding to it.',
        },
        {
          level: 6,
          name: 'Elemental Affinity',
          text: 'When you cast a spell dealing your ancestry’s damage type, add your Charisma modifier to one damage roll. You can spend a sorcery point to gain resistance to that type for an hour.',
        },
        {
          level: 14,
          name: 'Dragon Wings',
          text: 'As a bonus action, sprout wings and gain a flying speed equal to your walking speed until you dismiss them.',
        },
        {
          level: 18,
          name: 'Draconic Presence',
          text: 'Spend 5 sorcery points to radiate awe or fear for a minute; creatures within 60 feet are charmed or frightened unless they succeed on a Wisdom save.',
        },
      ],
    },
    {
      id: 'wild-magic',
      name: 'Wild Magic',
      summary: 'Raw chaos as a birthright, and it does not always behave.',
      // No `grant` and no `picks`. The surge table is a d100 of effects this
      // app does not model and is not ours to reproduce, and the feature it
      // hangs off grants no number the sheet holds — so it stays a reminder,
      // which is honest rather than incomplete. Tides of Chaos is likewise not
      // a `resource`: it refreshes when the DM decides to trigger a surge, not
      // on a rest, and `resets` has no value for that.
      features: [
        {
          level: 1,
          name: 'Wild Magic Surge',
          text: 'Once per turn, the DM may have you roll a d20 after you cast a sorcerer spell of 1st level or higher; on a 1, roll on the Wild Magic Surge table.',
        },
        {
          level: 1,
          name: 'Tides of Chaos',
          text: 'Gain advantage on one attack roll, ability check or saving throw. You regain the use when the DM has you roll on the Wild Magic Surge table.',
        },
        {
          level: 6,
          name: 'Bend Luck',
          text: 'Spend 2 sorcery points as a reaction to add or subtract 1d4 from another creature’s attack roll, ability check or saving throw.',
        },
        {
          level: 14,
          name: 'Controlled Chaos',
          text: 'When you roll on the Wild Magic Surge table, roll twice and choose either result.',
        },
        {
          level: 18,
          name: 'Spell Bombardment',
          text: 'When you roll the highest possible number on a damage die for a spell, roll that die again and add it to the damage.',
        },
      ],
    },
  ],
  /**
   * The three PHB oaths. SRD 5.1 licenses Oath of Devotion, but `classKits.ts`
   * only ever seeded it as a *name* — the licence is about the features, and
   * once written those are the PHB's text in our own words. So all three sit
   * here together under this file's provenance, the same call the Sorcerer pass
   * made for Draconic Bloodline, and a reader sees the class whole.
   *
   * A paladin picks at **3rd level** — the kit declares no `subclassLevel`, and
   * the default of 3 agrees with its own `Sacred Oath` row, so unlike the Druid
   * and the Wizard there was nothing to correct. Every feature below sits at 3,
   * 7, 15 or 20.
   *
   * Two things these deliberately do not carry.
   *
   * **No `resource`.** Channel Divinity is the *class's* counter, and this pass
   * added it to the Paladin kit, which had none at all. Each oath spends the
   * same uses, so its options are feature rows rather than a second counter —
   * the same division the cleric domains keep.
   *
   * **`spells` is the oath table**, and it arrives at 3/5/9/13/17 rather than a
   * domain's 1/3/5/7/9 — a paladin swears at 3rd and their slots lag a full
   * caster's, so each pair lands near the level they can first be cast. Always
   * prepared and exempt from the prepared limit, exactly as a domain's are.
   *
   * These could not be authored at first: a Paladin had no `spellcasting`
   * block, and `srd.test.ts` requires `spellcastingFor(kit, sub)` be defined
   * for any subclass carrying spells. The half-caster pass gave both half
   * casters a real table starting at 2nd, which unblocked this — see
   * `castsAtLevel1` in lib/tables.ts for why the block is safe to add without
   * handing a level-1 paladin a spells step.
   */
  Paladin: [
    {
      id: 'oath-of-devotion',
      name: 'Oath of Devotion',
      summary:
        'The knight’s oath: honesty, courage and duty, kept in the open.',
      // `grantedAt` is the *character* level and `level` the *spell*
      // level; they are different numbers and conflating them is the
      // easy mistake here.
      spells: [
        {
          grantedAt: 3,
          level: 1,
          names: ['Protection from Evil and Good', 'Sanctuary'],
        },
        {
          grantedAt: 5,
          level: 2,
          names: ['Lesser Restoration', 'Zone of Truth'],
        },
        { grantedAt: 9, level: 3, names: ['Beacon of Hope', 'Dispel Magic'] },
        {
          grantedAt: 13,
          level: 4,
          names: ['Freedom of Movement', 'Guardian of Faith'],
        },
        { grantedAt: 17, level: 5, names: ['Commune', 'Flame Strike'] },
      ],
      features: [
        {
          // Two Channel Divinity options at 3rd, as two rows rather than one.
          // `featuresGained` de-dupes on `level:name`, so a single row naming
          // both would be one feature the player cannot tell apart on the
          // sheet — and two rows sharing a name at one level is rejected
          // outright by subclasses.test.ts.
          level: 3,
          name: 'Channel Divinity: Sacred Weapon',
          text: 'Spend a use to add your Charisma modifier to attack rolls with one weapon for a minute. The weapon emits bright light and counts as magical.',
        },
        {
          level: 3,
          name: 'Channel Divinity: Turn the Unholy',
          text: 'Spend a use to force each fiend and undead within 30 feet to make a Wisdom save or be turned for a minute.',
        },
        {
          level: 3,
          name: 'Oath Spells',
          text: 'You always have your oath spells prepared, and they do not count against the number of spells you can prepare.',
        },
        {
          level: 7,
          name: 'Aura of Devotion',
          text: 'You and friendly creatures within 10 feet cannot be charmed while you are conscious. The range grows to 30 feet at 18th level.',
        },
        {
          level: 15,
          name: 'Purity of Spirit',
          text: 'You are always under the effect of a protection from evil and good spell.',
        },
        {
          level: 20,
          name: 'Holy Nimbus',
          text: 'As an action, become wreathed in sunlight for a minute: enemies starting their turn within 30 feet take radiant damage, and you have advantage on saves against spells cast by fiends and undead. Once per long rest.',
        },
      ],
    },
    {
      id: 'oath-of-the-ancients',
      name: 'Oath of the Ancients',
      summary: 'Light, life and laughter, defended against the long dark.',
      spells: [
        {
          grantedAt: 3,
          level: 1,
          names: ['Ensnaring Strike', 'Speak with Animals'],
        },
        { grantedAt: 5, level: 2, names: ['Moonbeam', 'Misty Step'] },
        {
          grantedAt: 9,
          level: 3,
          names: ['Plant Growth', 'Protection from Energy'],
        },
        { grantedAt: 13, level: 4, names: ['Ice Storm', 'Stoneskin'] },
        {
          grantedAt: 17,
          level: 5,
          names: ['Commune with Nature', 'Tree Stride'],
        },
      ],
      features: [
        {
          level: 3,
          name: 'Channel Divinity: Nature’s Wrath',
          text: 'Spend a use to ensnare a creature within 10 feet in spectral vines. It is restrained until it succeeds on a Strength or Dexterity save.',
        },
        {
          level: 3,
          name: 'Channel Divinity: Turn the Faithless',
          text: 'Spend a use to force each fey and fiend within 30 feet to make a Wisdom save or be turned for a minute. A disguised creature has its true form revealed.',
        },
        {
          level: 3,
          name: 'Oath Spells',
          text: 'You always have your oath spells prepared, and they do not count against the number of spells you can prepare.',
        },
        {
          level: 7,
          name: 'Aura of Warding',
          text: 'You and friendly creatures within 10 feet have resistance to damage from spells. The range grows to 30 feet at 18th level.',
        },
        {
          level: 15,
          name: 'Undying Sentinel',
          text: 'When you would drop to 0 hit points and are not killed outright, you drop to 1 instead, once per long rest. You also stop ageing visibly.',
        },
        {
          level: 20,
          name: 'Elder Champion',
          text: 'As an action, assume an ancient form for a minute: regain hit points each turn, cast oath spells as a bonus action, and enemies within 10 feet have disadvantage on saves against your spells. Once per long rest.',
        },
      ],
    },
    {
      id: 'oath-of-vengeance',
      name: 'Oath of Vengeance',
      summary:
        'Punishment for the great wrong, whatever it costs the punisher.',
      spells: [
        { grantedAt: 3, level: 1, names: ['Bane', 'Hunter’s Mark'] },
        { grantedAt: 5, level: 2, names: ['Hold Person', 'Misty Step'] },
        { grantedAt: 9, level: 3, names: ['Haste', 'Protection from Energy'] },
        { grantedAt: 13, level: 4, names: ['Banishment', 'Dimension Door'] },
        { grantedAt: 17, level: 5, names: ['Hold Monster', 'Scrying'] },
      ],
      features: [
        {
          level: 3,
          name: 'Channel Divinity: Abjure Enemy',
          text: 'Spend a use to force one creature within 60 feet to make a Wisdom save or be frightened and slowed for a minute.',
        },
        {
          level: 3,
          name: 'Channel Divinity: Vow of Enmity',
          text: 'Spend a use to gain advantage on attack rolls against one creature within 10 feet for a minute, or until it drops.',
        },
        {
          level: 3,
          name: 'Oath Spells',
          text: 'You always have your oath spells prepared, and they do not count against the number of spells you can prepare.',
        },
        {
          level: 7,
          name: 'Relentless Avenger',
          text: 'When you hit a creature with an opportunity attack, you can move up to half your speed as part of the same reaction, without provoking.',
        },
        {
          level: 15,
          name: 'Soul of Vengeance',
          text: 'When a creature under your Vow of Enmity makes an attack, you can use your reaction to make a melee weapon attack against it.',
        },
        {
          level: 20,
          name: 'Avenging Angel',
          text: 'As an action, sprout wings and gain a flying speed for an hour, and enemies starting their turn within 30 feet must save or be frightened. Once per long rest.',
        },
      ],
    },
  ],
  // All three monastic traditions, chosen at 3rd and gaining features at
  // 3/6/11/17.
  //
  // Way of the Open Hand is the SRD-licensed one and is here anyway, following
  // the Sorcerer's Draconic Bloodline: `classKits.ts` only ever seeded it as a
  // *name*, and the licence is about the features rather than the name — so
  // once written they are the PHB's text in our words and sit beside the other
  // two under this file's provenance. All three kit stubs stay bare and the
  // pinned list in subclasses.test.ts needs no entry.
  //
  // None of them authors a `resource`. Every tradition spends ki, and Ki is the
  // *class's* counter — added to the kit in this same pass, since a subclass
  // resource does not close a class's gap.
  Monk: [
    {
      id: 'way-of-the-open-hand',
      name: 'Way of the Open Hand',
      summary:
        'The art of unarmed combat taken to its end: a hand that redirects, topples and finally stops a heart.',
      features: [
        {
          level: 3,
          name: 'Open Hand Technique',
          text: 'When you hit with Flurry of Blows, you can knock the target prone, push it 15 feet, or deny it reactions until the end of your next turn.',
        },
        {
          level: 6,
          name: 'Wholeness of Body',
          text: 'As an action you can heal yourself for three times your monk level, once per long rest.',
          // Not a counter. The number is a pool of hit points scaling with
          // level rather than a use count, and nothing recomputes a `total`
          // once it is on a sheet — the same call Lay on Hands got.
        },
        {
          level: 11,
          name: 'Tranquility',
          text: 'You end a long rest under a sanctuary effect that lasts until your next long rest or until you attack.',
        },
        {
          level: 17,
          name: 'Quivering Palm',
          text: 'Spend 3 ki when you hit with an unarmed strike to set up lethal vibrations you can end with an action, forcing a Constitution save.',
        },
      ],
    },
    {
      id: 'way-of-shadow',
      name: 'Way of Shadow',
      summary:
        'Ki spent on darkness and silence, and a monk who steps from one shadow into another.',
      features: [
        {
          level: 3,
          name: 'Shadow Arts',
          text: 'You know the minor illusion cantrip, and can spend 2 ki to cast darkness, darkvision, pass without trace or silence without material components.',
          // Minor illusion is deliberately *not* authored as
          // `grant: { spells: [...] }`, and this is the reason.
          //
          // A monk has no `spellcasting` block on the class or the subclass, so
          // the sheet has no spell ability, no save DC and no slots. Handing it
          // a cantrip row states something the app cannot compute — worse than
          // prose, which at least promises nothing.
          //
          // It would also have arrived quietly until this pass: `levelUpSteps`
          // opens the spells step only when slots, cantrips known or spells
          // known change, all of which read a `spellcasting` block, so for a
          // monk it never opens — and the spells step used to be the only place
          // `plan.spellsGranted` was rendered. `LevelUpSummary` shows granted
          // spells now, so the hole is closed, but the reasoning above stands
          // on its own: do not "fix" this into a grant.
        },
        {
          level: 6,
          name: 'Shadow Step',
          text: 'In dim light or darkness you can teleport 60 feet to another shadowed space as a bonus action, with advantage on your next melee attack.',
        },
        {
          level: 11,
          name: 'Cloak of Shadows',
          text: 'In dim light or darkness you can become invisible as an action until you attack, cast a spell, or enter light.',
        },
        {
          level: 17,
          name: 'Opportunist',
          text: 'When a creature within 5 feet is hit by someone else, you can use your reaction to strike it.',
        },
      ],
    },
    {
      id: 'way-of-the-four-elements',
      name: 'Way of the Four Elements',
      summary:
        'Ki bent outward into the elements themselves, one hard-won discipline at a time.',
      features: [
        {
          level: 3,
          name: 'Disciple of the Elements',
          text: 'You know the Elemental Attunement discipline, and learn one more of your choice. You can swap a discipline you know whenever you learn a new one.',
          // Elemental Attunement is stated here rather than modelled as a
          // second pick slot: the book gives it to you, so offering it as a
          // "choice" with one answer would be a click that decides nothing.
          picks: [ELEMENT_PICK('four-elements', 3)],
        },
        {
          // Three more rows rather than one whose prose mentions the later
          // levels: `featuresGained` de-dupes on `level:name`, so each needs a
          // distinct name, and each carries its own pick.
          level: 6,
          name: 'Elemental Discipline (6th)',
          text: 'You learn one additional elemental discipline, now including those requiring 6th level.',
          picks: [ELEMENT_PICK('four-elements', 6)],
        },
        {
          level: 11,
          name: 'Elemental Discipline (11th)',
          text: 'You learn one additional elemental discipline, now including those requiring 11th level.',
          picks: [ELEMENT_PICK('four-elements', 11)],
        },
        {
          level: 17,
          name: 'Elemental Discipline (17th)',
          text: 'You learn one additional elemental discipline, with the whole list open to you.',
          picks: [ELEMENT_PICK('four-elements', 17)],
        },
      ],
    },
  ],

  /*
    The Ranger's two conclaves, and the class where the handoff's own advice
    needed correcting.

    **No `spells`, on either.** NEXT-CLASS-PROMPT.md reasoned that "the
    Ranger's conclaves can carry `spells` because the half-caster pass gave it
    a real casting table" — true of the *mechanism* and false of the *book*.
    The PHB gives Hunter and Beast Master no bonus spells at all; a conclave
    spell list is a Xanathar's feature (Gloom Stalker, Horizon Walker, Monster
    Slayer), which is not a source this file draws on. The field is absent
    rather than `[]`, because absence says "there is no table" while an empty
    array says "there is one and nobody filled it in".

    Nothing would have caught a fabricated one. `srd.test.ts`'s "only
    spellcasting classes grant bonus spells" only asks that
    `spellcastingFor(kit, sub)` be *defined*, and for a Ranger it now is — so
    an invented table would pass a green suite and quietly hand the character
    free always-prepared spells. `subclasses.test.ts` pins the absence instead.

    **No `resource`, here or on the kit.** Unlike the Monk's Ki, the Paladin's
    Channel Divinity and the Sorcerer's Sorcery Points, a Ranger has no
    class-level counter to close alongside this pass, because there is no
    honest candidate: Primeval Awareness spends a *spell slot*, which
    `Character.spellSlots` already tracks; Foe Slayer is a once-per-turn rule
    with no pool; and the companion's hit points are 4 x the ranger level, a
    scaling number rather than a use count. The absence is a finding, not an
    oversight — see the test that pins it.
  */
  Ranger: [
    {
      id: 'hunter',
      name: 'Hunter',
      summary:
        'A specialist in the hunt, choosing a new edge at each turn of skill.',
      /*
        Four menus at 3/7/11/15, each a **closed** `kind: 'feature'` pick with
        `count: 1`. Closed rather than open, like the draconic ancestry: each
        list is the whole menu the PHB offers, so `srd.test.ts` keeps checking
        `featureText` completeness and option uniqueness, which `open` would
        forfeit.

        No factory, unlike the totems and the elemental disciplines. Those pose
        *one* question repeatedly from *one* table; the Hunter poses four
        different questions from four **disjoint** tables, so a factory would
        be ceremony around four literals with nothing shared.

        The `featureLabel`s differ per level for **readability, not because the
        totem rule forces it** — and the distinction matters if you ever edit
        this. That rule exists because a totem may be taken twice, and its
        mirror on the Four Elements exists because a discipline may not. Both
        are about an option appearing in more than one list. No option here
        appears twice, so neither greying path in `grantedAlreadyAt` can fire
        and the label cannot change behaviour. It is therefore a naming
        decision, and the book's own four feature names are what a player will
        look for: "Hunter's Prey: Colossus Slayer", not "Hunter: Volley".

        No `featureGrant` anywhere, and that is correct rather than incomplete
        — every option is a combat rule this app does not model. Multiattack
        Defense in particular is *not* an `acBonus`: its +4 applies only
        against one creature's remaining attacks that turn, so any static value
        would be wrong the moment nothing had hit you, the same trap Draconic
        Resilience's deliberately absent `acBonus` documents.
      */
      features: [
        {
          level: 3,
          name: 'Hunter’s Prey',
          text: 'Choose one way to press your advantage in a fight.',
          picks: [
            {
              id: 'hunter-3-prey',
              kind: 'feature',
              label: 'Choose your hunter’s prey',
              count: 1,
              options: ['Colossus Slayer', 'Giant Killer', 'Horde Breaker'],
              featureLabel: 'Hunter’s Prey',
              featureText: {
                'Colossus Slayer':
                  'Once on each of your turns, a weapon hit against a creature already below its hit point maximum deals an extra 1d8 damage.',
                'Giant Killer':
                  'When a Large or larger creature within 5 feet hits or misses you, you can use your reaction to attack it.',
                'Horde Breaker':
                  'Once on each of your turns, you can make a second attack against a different creature within 5 feet of the first.',
              },
            },
          ],
        },
        {
          level: 7,
          name: 'Defensive Tactics',
          text: 'Choose one way to weather being outnumbered or outmatched.',
          picks: [
            {
              id: 'hunter-7-tactics',
              kind: 'feature',
              label: 'Choose a defensive tactic',
              count: 1,
              options: [
                'Escape the Horde',
                'Multiattack Defense',
                'Steel Will',
              ],
              featureLabel: 'Defensive Tactics',
              featureText: {
                'Escape the Horde':
                  'Opportunity attacks against you are made with disadvantage.',
                'Multiattack Defense':
                  'When a creature hits you with an attack, you gain a +4 bonus to AC against that creature’s remaining attacks for the rest of the turn.',
                'Steel Will':
                  'You have advantage on saving throws against being frightened.',
              },
            },
          ],
        },
        {
          level: 11,
          name: 'Multiattack',
          text: 'Choose one way to strike at more than one enemy at a time.',
          picks: [
            {
              id: 'hunter-11-multiattack',
              kind: 'feature',
              label: 'Choose a multiattack',
              count: 1,
              options: ['Volley', 'Whirlwind Attack'],
              featureLabel: 'Multiattack',
              featureText: {
                Volley:
                  'As an action, make a ranged attack against any number of creatures within 10 feet of a point you can see, expending ammunition for each.',
                'Whirlwind Attack':
                  'As an action, make a melee attack against any number of creatures within 5 feet of you.',
              },
            },
          ],
        },
        {
          level: 15,
          name: 'Superior Hunter’s Defense',
          text: 'Choose one way to turn an enemy’s attack aside.',
          picks: [
            {
              id: 'hunter-15-defense',
              kind: 'feature',
              label: 'Choose a superior defence',
              count: 1,
              options: ['Evasion', 'Stand Against the Tide', 'Uncanny Dodge'],
              featureLabel: 'Superior Hunter’s Defense',
              featureText: {
                // Evasion shares a name with the Rogue's and the Monk's, and
                // Uncanny Dodge with the Rogue's. Different kits, so they
                // never share a sheet — and the label prefix keeps this row
                // distinct in any case.
                Evasion:
                  'When you succeed on a Dexterity save against an effect dealing half damage on a success, you take none instead, and only half if you fail.',
                'Stand Against the Tide':
                  'When a hostile creature misses you with a melee attack, you can use your reaction to force it to repeat that attack against another creature of your choice.',
                'Uncanny Dodge':
                  'When an attacker you can see hits you, you can use your reaction to halve the damage.',
              },
            },
          ],
        },
      ],
    },
    {
      id: 'beast-master',
      name: 'Beast Master',
      summary: 'A bond with one beast, fighting at your side and at your word.',
      /*
        No `grant` and no `picks`, deliberately.

        Every one of these features is about a *second creature*, and
        `Character` has no companion model at all — no field on the sheet,
        none in `types.ts`. The beast's AC, its hit points at four times your
        ranger level, its proficiency bonus and its attacks have nowhere to
        land that would not be describing the ranger instead. That is not an
        approximation the way Bardic Inspiration's suggested total is; it is
        the wrong entity.

        A `kind: 'feature'` pick offering a list of beasts was considered and
        rejected for the same reason: it writes a row reading "Ranger's
        Companion: Wolf" into `Character.features` and carries none of the
        wolf, which is a label impersonating a statblock. The app already has
        an honest home for one, and the text below points there.

        The precedent is Wild Magic's surge table and Way of Shadow's minor
        illusion: a reminder is honest, an incomplete grant is not.
      */
      features: [
        {
          level: 3,
          name: 'Ranger’s Companion',
          text: 'You gain a beast companion of challenge rating 1/4 or lower that acts on your initiative and obeys your commands. It adds your proficiency bonus to its AC, attack rolls, damage rolls, and to any saving throw and skill it is proficient in, and its hit points equal four times your ranger level. Keep its statblock in your bestiary — this sheet tracks you, not it.',
        },
        {
          level: 7,
          name: 'Exceptional Training',
          text: 'On any of your turns when your companion does not attack, you can use a bonus action to command it to Dash, Disengage, Dodge or Help. Its attacks also count as magical for overcoming resistance and immunity to nonmagical attacks.',
        },
        {
          level: 11,
          name: 'Bestial Fury',
          text: 'Your companion makes two attacks, rather than one, whenever you command it to attack.',
        },
        {
          level: 15,
          name: 'Share Spells',
          text: 'When you cast a spell targeting yourself, you can also affect your companion if it is within 30 feet of you.',
        },
      ],
    },
  ],
  /*
    A wizard picks their school at **2nd**, and the kit's `subclassLevel: 2`
    already declared it — checked before authoring, per the Druid's lesson, and
    unlike the Druid there was nothing to fix.

    All eight schools live here, **including School of Evocation**, which SRD
    5.1 licenses. Same call as Draconic Bloodline and Way of the Open Hand:
    `classKits.ts` only ever seeded it as a *name*, and the licence is about the
    features, so once written they are the PHB's content restated in our words.
    All eight kit stubs stay bare and the pinned list in `subclasses.test.ts`
    needed no entry.

    Three absences, all deliberate, all pinned by tests — because a reader
    otherwise sees eight schools carrying nothing but prose and reads it as
    unfinished:

    **No `spells` on any school.** The PHB gives a wizard school no bonus spell
    list at all; that is a domain/oath/circle mechanism. Nothing would catch an
    invented one: `srd.test.ts`'s "only spellcasting classes grant bonus
    spells" asks only that `spellcastingFor(kit, sub)` be *defined*, and for a
    Wizard it is (the class's own Intelligence block), so a fabricated table
    would sail through a green suite and hand the character free
    always-prepared spells exempt from `preparedLimit`. This is the Ranger's
    trap with the safety catch already off.

    **No `grant` on any school.** Every candidate was checked and each fails
    honestly. Arcane Ward is a second hit-point pool with its own maximum —
    `Grant` has `hpPerLevel`, which raises *the character's* max hp, the wrong
    number for the wrong entity. Spell Resistance's "resistance to the damage
    of spells" is not a `DAMAGE_TYPES` id and `srd.test.ts` would reject it:
    spell damage is a source, not a type. Undead Thralls, Shapechanger and
    Improved Minor Illusion add spells to the *spellbook*, which is not
    `Grant.spells` — whose doc comment is explicit that those are cast once per
    long rest without a slot. `spellbook.perLevel` is this repo's own
    acknowledged inert field and wiring it is its own job.

    **No `resource` on any school.** Arcane Recovery is the class's counter,
    added to the kit in this same pass. The schools' once-per-rest features
    (Illusory Self, Benign Transposition, Hypnotic Gaze) are one-shot rules the
    text carries; only three counters fit a sheet and the class's own comes
    first.

    Exactly one pick in the whole key, on Transmutation, with the reasoning for
    where that line fell written on it.
  */
  Wizard: [
    {
      id: 'school-of-abjuration',
      name: 'School of Abjuration',
      summary:
        'Wards and dispellings, and a shell of your own magic that takes the hit before you do.',
      features: [
        {
          level: 2,
          name: 'Abjuration Savant',
          text: 'Copying an abjuration spell into your spellbook costs half the usual gold and half the usual time.',
        },
        {
          level: 2,
          name: 'Arcane Ward',
          // No grant, and no counter. The ward is a *second* hit point pool
          // with its own maximum, and `Character` holds one hp pool and one
          // `resources` row shape — neither can say this. It also refreshes
          // from casting rather than from a rest, which no `resets` value
          // expresses. Lay on Hands and the Beast Master's companion are the
          // precedents: a pool that scales is not a counter, and a number
          // describing something else is not this character's number.
          text: 'Casting an abjuration spell of 1st level or higher raises a ward that absorbs damage before you take it. Its maximum is twice your wizard level plus your Intelligence modifier, and further abjurations restore it.',
        },
        {
          level: 6,
          name: 'Projected Ward',
          text: 'As a reaction, your Arcane Ward can absorb damage aimed at a creature within 30 feet instead of you.',
        },
        {
          level: 10,
          name: 'Improved Abjuration',
          text: 'Add your proficiency bonus to the ability check an abjuration spell calls for, as counterspell and dispel magic do.',
        },
        {
          level: 14,
          name: 'Spell Resistance',
          // Not `grant: { resistances: [...] }`. "Resistance to the damage of
          // spells" names a source, not a damage type, and `resistances` is
          // validated against the closed `DAMAGE_TYPES` list — so it cannot be
          // authored, and should not be.
          text: 'You have advantage on saving throws against spells, and resistance to the damage they deal.',
        },
      ],
    },
    {
      id: 'school-of-conjuration',
      name: 'School of Conjuration',
      summary:
        'Calling objects and creatures out of nothing, and stepping through the gap yourself.',
      features: [
        {
          level: 2,
          name: 'Conjuration Savant',
          text: 'Copying a conjuration spell into your spellbook costs half the usual gold and half the usual time.',
        },
        {
          level: 2,
          name: 'Minor Conjuration',
          text: 'Conjure a small inanimate object you have seen; it lasts an hour, or until it takes damage or you conjure another.',
        },
        {
          level: 6,
          // "Benign Transposition", not "Transportation". dnd5e.wikidot.com —
          // the source used for the rest of this table — has the latter, and
          // so do a number of sites quoting it. The PHB prints Transposition,
          // which is also what the feature does: you may swap places with a
          // willing creature. A wrong feature name is silent everywhere here.
          name: 'Benign Transposition',
          text: 'Teleport up to 30 feet to a space you can see, or swap places with a willing Small or Medium creature standing there.',
        },
        {
          level: 10,
          name: 'Focused Conjuration',
          text: 'Damage can never break your concentration on a conjuration spell.',
        },
        {
          level: 14,
          name: 'Durable Summons',
          text: 'Any creature you summon or create with a conjuration spell starts with 30 temporary hit points.',
        },
      ],
    },
    {
      id: 'school-of-divination',
      name: 'School of Divination',
      summary:
        'Glimpses of what is coming, written down and spent when they matter most.',
      features: [
        {
          level: 2,
          name: 'Divination Savant',
          text: 'Copying a divination spell into your spellbook costs half the usual gold and half the usual time.',
        },
        {
          level: 2,
          name: 'Portent',
          // Not a counter: the dice are recorded and replaced after each long
          // rest rather than ticked off a total, and the *values rolled* are
          // the point, which a `total`/`used` pair cannot hold. The upgrade to
          // three dice is its own row at 14, never a clause here.
          text: 'After a long rest, roll two d20s and record them. You can replace an attack roll, saving throw or ability check made by you or a creature you can see with one of those rolls.',
        },
        {
          level: 6,
          name: 'Expert Divination',
          text: 'Casting a divination spell of 2nd level or higher regains one expended slot of lower level.',
        },
        {
          level: 10,
          name: 'The Third Eye',
          // The near-miss, and deliberately prose. It names four options, but
          // the choice is re-made after **every short rest**, while a
          // `kind: 'feature'` pick writes one permanent row to
          // `Character.features` — which would assert the character has
          // darkvision forever, false an hour later. Same argument as Draconic
          // Resilience's absent `acBonus`: a value wrong under a condition the
          // field cannot express. This is the likeliest wrong future edit
          // here, which is why a test pins it.
          text: 'After a short or long rest, gain one of: darkvision 60 feet, ethereal sight 60 feet, the ability to read any language, or see invisibility out to 10 feet.',
        },
        {
          level: 14,
          name: 'Greater Portent',
          text: 'You roll three d20s for Portent rather than two.',
        },
      ],
    },
    {
      id: 'school-of-enchantment',
      name: 'School of Enchantment',
      summary: 'Charm and compulsion, and the memory of neither.',
      features: [
        {
          level: 2,
          name: 'Enchantment Savant',
          text: 'Copying an enchantment spell into your spellbook costs half the usual gold and half the usual time.',
        },
        {
          level: 2,
          name: 'Hypnotic Gaze',
          text: 'As an action, charm a creature within 5 feet on a failed Wisdom save, leaving it incapacitated and its speed 0 while you hold its gaze.',
        },
        {
          level: 6,
          name: 'Instinctive Charm',
          text: 'As a reaction to being attacked by a creature within 30 feet, redirect the attack to another target on a failed Wisdom save.',
        },
        {
          level: 10,
          name: 'Split Enchantment',
          text: 'An enchantment spell of 1st level or higher that targets only one creature can target a second.',
        },
        {
          level: 14,
          name: 'Alter Memories',
          text: 'A creature you charm is unaware of it, and you can take from it up to your Charisma modifier in hours of memory.',
        },
      ],
    },
    {
      id: 'school-of-evocation',
      name: 'School of Evocation',
      summary:
        'Fire, lightning and cold shaped precisely enough to spare the people standing in them.',
      features: [
        {
          level: 2,
          name: 'Evocation Savant',
          text: 'Copying an evocation spell into your spellbook costs half the usual gold and half the usual time.',
        },
        {
          level: 2,
          name: 'Sculpt Spells',
          text: 'When you cast an evocation spell that affects others, choose 1 + the spell’s level of them to automatically succeed and take no damage.',
        },
        {
          level: 6,
          name: 'Potent Cantrip',
          text: 'A creature that succeeds on its save against your damaging cantrip still takes half damage.',
        },
        {
          level: 10,
          name: 'Empowered Evocation',
          // A separate feature from Potent Cantrip rather than an upgrade of
          // it, so an ordinary row rather than a scaling pair.
          text: 'Add your Intelligence modifier to one damage roll of any wizard evocation spell you cast.',
        },
        {
          level: 14,
          name: 'Overchannel',
          text: 'Deal maximum damage with a wizard spell of 1st to 5th level; using it again before a long rest costs you escalating necrotic damage no resistance prevents.',
        },
      ],
    },
    {
      id: 'school-of-illusion',
      name: 'School of Illusion',
      summary:
        'Images held so steadily that a piece of one can be made briefly real.',
      features: [
        {
          level: 2,
          name: 'Illusion Savant',
          text: 'Copying an illusion spell into your spellbook costs half the usual gold and half the usual time.',
        },
        {
          level: 2,
          name: 'Improved Minor Illusion',
          // The minor illusion cantrip stays prose rather than `grant.spells`,
          // matching Way of Shadow. The feature's substance is that your
          // casting of it does *more*, which a spell row cannot say.
          text: 'You know minor illusion, and can create both a sound and an image with a single casting of it.',
        },
        {
          level: 6,
          name: 'Malleable Illusions',
          text: 'As an action, change the nature of an illusion you cast that lasts a minute or longer.',
        },
        {
          level: 10,
          name: 'Illusory Self',
          text: 'As a reaction to being hit, interpose an illusory duplicate so the attack misses instead. Returns on a short or long rest.',
        },
        {
          level: 14,
          name: 'Illusory Reality',
          text: 'As a bonus action, make one inanimate, nonmagical object from your illusion real for a minute. It cannot deal damage.',
        },
      ],
    },
    {
      id: 'school-of-necromancy',
      name: 'School of Necromancy',
      summary:
        'The line between living and dead treated as a door rather than a wall.',
      features: [
        {
          level: 2,
          name: 'Necromancy Savant',
          text: 'Copying a necromancy spell into your spellbook costs half the usual gold and half the usual time.',
        },
        {
          level: 2,
          name: 'Grim Harvest',
          // Scales with the *spell* cast rather than with character level, so
          // it is one row and never gains an upgrade row.
          text: 'Killing a creature with a spell heals you for twice that spell’s level, or three times it for a necromancy spell.',
        },
        {
          level: 6,
          name: 'Undead Thralls',
          // The animate dead this adds is a **spellbook** addition, not
          // `grant.spells` — see the block comment above. The thralls' bonus
          // hit points and damage describe the undead rather than the wizard,
          // which is the Beast Master companion's problem exactly.
          text: 'Animate dead joins your spellbook, raises one extra corpse, and the undead you create with it are tougher and hit harder.',
        },
        {
          level: 10,
          name: 'Inured to Undeath',
          text: 'You have resistance to necrotic damage, and your hit point maximum cannot be reduced.',
        },
        {
          level: 14,
          name: 'Command Undead',
          text: 'Bend an undead creature within 60 feet to your will on a failed Charisma save; the more intelligent it is, the better it resists.',
        },
      ],
    },
    {
      id: 'school-of-transmutation',
      name: 'School of Transmutation',
      summary:
        'Matter treated as provisional: wood to iron, self to beast, age undone.',
      features: [
        {
          level: 2,
          name: 'Transmutation Savant',
          text: 'Copying a transmutation spell into your spellbook costs half the usual gold and half the usual time.',
        },
        {
          level: 2,
          name: 'Minor Alchemy',
          text: 'Over ten minutes of concentration, change one nonmagical object between wood, stone, iron, copper and silver for an hour.',
        },
        {
          level: 6,
          name: 'Transmuter’s Stone',
          text: 'Spend eight hours to make a stone granting one benefit while carried; you can change which whenever you cast a transmutation spell.',
          // The **only** pick in the whole Wizard key, and the one genuinely
          // marginal call in this pass. Every other school feature is a
          // passive modifier to how spells behave and poses no question at
          // all — zero picks across seven schools is a finding, not a gap.
          //
          // This one earns a row because, unlike The Third Eye's four benefits
          // above, the stone's choice *persists* until the wizard deliberately
          // changes it. "Which benefit is my stone set to" is real sheet state.
          //
          // Closed, like the draconic ancestry and the Hunter's four: this is
          // the whole menu the PHB offers, and closed keeps `srd.test.ts`'s
          // `featureText` completeness and option-count checks live, which
          // `open` would forfeit. It appears exactly once, so the per-level
          // `featureLabel` question the totems raise is moot here.
          //
          // And **no `featureGrant` on any option**, deliberately. Two of the
          // four land on numbers the sheet holds — speed +10 and a damage
          // resistance — but the stone is transferable and its benefit
          // rechooseable, so writing either permanently onto this character
          // would be wrong the moment it is handed over or switched. Same call
          // as Draconic Resilience's absent `acBonus` and Multiattack
          // Defense's absent +4.
          picks: [
            {
              id: 'school-of-transmutation-6-stone',
              kind: 'feature',
              label: 'Choose your transmuter’s stone benefit',
              count: 1,
              options: [
                'Darkvision',
                'Increased Speed',
                'Constitution Saves',
                'Damage Resistance',
              ],
              featureLabel: 'Transmuter’s Stone',
              featureText: {
                Darkvision: 'The stone’s bearer has darkvision out to 60 feet.',
                'Increased Speed':
                  'The stone’s bearer gains 10 feet of speed while unencumbered.',
                'Constitution Saves':
                  'The stone’s bearer is proficient in Constitution saving throws.',
                'Damage Resistance':
                  'The stone’s bearer has resistance to acid, cold, fire, lightning or thunder damage, chosen when the stone is made.',
              },
            },
          ],
        },
        {
          level: 10,
          name: 'Shapechanger',
          // Polymorph is another spellbook addition rather than `grant.spells`
          // — see the block comment above.
          text: 'Polymorph joins your spellbook, and you can cast it on yourself without a slot to become a beast of challenge rating 1 or lower. Returns on a short or long rest.',
        },
        {
          level: 14,
          name: 'Master Transmuter',
          text: 'Destroy your stone to transform an object, end all a creature’s curses and diseases, restore the recently dead to life, or shed 3d10 years.',
        },
      ],
    },
  ],

  /**
   * The three PHB patrons.
   *
   * Their expanded spell lists are `expandedSpells`, **not** `spells`, and that
   * distinction is why the Warlock was the last class authored here. A domain,
   * oath or circle spell is handed over always-prepared; a patron's list is
   * merely *added to the list you may learn from*, and the warlock still spends
   * one of their two-at-first spells known to take one. Authored as `spells`, a
   * 1st-level Fiend warlock would be handed burning hands and command free, on
   * top of the two they choose — doubling the scarcest resource the class has.
   * Nothing applies `expandedSpells`; the pickers merely offer it.
   *
   * Levels are **1/6/10/14** on all three, verified against WotC's own errata
   * PDF rather than assumed: no warlock feature was ever moved by errata, so
   * the Eternal Mountain Defense trap the Monk pass hit does not exist here.
   * The same check caught two contaminated sources — dnd5e.wikidot lists
   * Tasha's Pact of the Talisman and a UA boon among the PHB three, and one
   * result carried a homebrew "Revised Great Old One" spell list.
   *
   * No `grant` and no `picks` on any patron. Fiendish Resilience is a
   * resistance *rechosen after every rest*, so a permanent `grant.resistances`
   * would be a lie an hour later — the Wizard's Third Eye call. The rest are
   * combat rules this app does not model. No `resource` either: the class
   * gained one (Mystic Arcanum) in `classKits.ts` instead.
   */
  Warlock: [
    {
      id: 'the-archfey',
      name: 'The Archfey',
      summary:
        'A bargain struck with a lord or lady of the Feywild, paid in glamour, terror and the charm that hides both.',
      expandedSpells: {
        1: ['Faerie Fire', 'Sleep'],
        2: ['Calm Emotions', 'Phantasmal Force'],
        3: ['Blink', 'Plant Growth'],
        4: ['Dominate Beast', 'Greater Invisibility'],
        5: ['Dominate Person', 'Seeming'],
      },
      features: [
        {
          level: 1,
          name: 'Fey Presence',
          text: 'As an action, every creature in a 10-foot cube around you makes a Wisdom save or is charmed or frightened — your choice for all of them — until the end of your next turn. Once per short or long rest.',
        },
        {
          level: 6,
          name: 'Misty Escape',
          text: 'As a reaction to taking damage, turn invisible and teleport up to 60 feet, staying unseen until your next turn starts or you attack or cast. Once per short or long rest.',
        },
        {
          level: 10,
          name: 'Beguiling Defenses',
          text: 'You cannot be charmed, and a creature that tries is charmed by you for a minute instead, taking psychic damage each turn until it or the charm ends.',
        },
        {
          level: 14,
          name: 'Dark Delirium',
          text: 'As an action, one creature within 60 feet makes a Wisdom save or is charmed or frightened for a minute while it perceives only an illusory realm. Once per long rest.',
        },
      ],
    },
    {
      id: 'the-fiend',
      name: 'The Fiend',
      summary:
        'A pact with something from the lower planes, which pays well and always in the currency of other people’s ruin.',
      expandedSpells: {
        1: ['Burning Hands', 'Command'],
        2: ['Blindness/Deafness', 'Scorching Ray'],
        3: ['Fireball', 'Stinking Cloud'],
        4: ['Fire Shield', 'Wall of Fire'],
        5: ['Flame Strike', 'Hallow'],
      },
      features: [
        {
          level: 1,
          name: 'Dark One’s Blessing',
          text: 'When you drop a hostile creature to 0 hit points, you gain temporary hit points equal to your Charisma modifier plus your warlock level.',
        },
        {
          level: 6,
          name: 'Dark One’s Own Luck',
          text: 'Add a d10 to one ability check or saving throw, after rolling but before the outcome is known. Once per short or long rest.',
        },
        {
          level: 10,
          name: 'Fiendish Resilience',
          text: 'After each rest, choose one damage type to resist until you choose another. Magical and silvered weapons ignore it.',
        },
        {
          level: 14,
          name: 'Hurl Through Hell',
          text: 'Once per long rest, when you hit a creature, hurl it through the lower planes; it returns at the end of your next turn having taken 10d10 psychic damage, unless it is a fiend.',
        },
      ],
    },
    {
      id: 'the-great-old-one',
      name: 'The Great Old One',
      summary:
        'A mind out in the dark noticed you, and the deal may not have been struck with anything that knows you exist.',
      expandedSpells: {
        1: ['Dissonant Whispers', 'Tasha’s Hideous Laughter'],
        2: ['Detect Thoughts', 'Phantasmal Force'],
        3: ['Clairvoyance', 'Sending'],
        4: ['Dominate Beast', 'Evard’s Black Tentacles'],
        5: ['Dominate Person', 'Telekinesis'],
      },
      features: [
        {
          level: 1,
          // One-way, and worth being careful about: you speak *to* a creature
          // and it cannot answer. The 2024 rewrite made this two-way, so most
          // summaries online now describe a feature this one is not.
          name: 'Awakened Mind',
          text: 'You can speak telepathically to any creature you can see within 30 feet. It need share no language with you, but must understand at least one — and it cannot reply this way.',
        },
        {
          level: 6,
          name: 'Entropic Ward',
          text: 'As a reaction, impose disadvantage on an attack against you; if it misses, your next attack on that creature before the end of your next turn has advantage. Once per short or long rest.',
        },
        {
          level: 10,
          name: 'Thought Shield',
          text: 'Your thoughts cannot be read, you resist psychic damage, and a creature dealing you psychic damage takes the same amount itself.',
        },
        {
          level: 14,
          name: 'Create Thrall',
          text: 'Touch an incapacitated humanoid to charm it with no save until remove curse or the condition ends it, and speak telepathically with it anywhere on your plane.',
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
