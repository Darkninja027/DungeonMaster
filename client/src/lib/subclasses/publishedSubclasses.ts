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
}

/** The published subclasses for one class, or none. Name in, empty out. */
export function publishedSubclassesFor(className: string): Array<SubclassInfo> {
  const key = className.trim().toLowerCase()
  for (const [name, subs] of Object.entries(PUBLISHED_SUBCLASSES)) {
    if (name.trim().toLowerCase() === key) return subs
  }
  return []
}
