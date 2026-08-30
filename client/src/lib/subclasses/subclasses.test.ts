import { describe, expect, it } from 'vitest'

import { SRD_CLASS_KITS } from '../srd'
import {
  SRD_TABLES,
  castsAtLevel1,
  findKit,
  isBareSubclass,
  spellcastingFor,
  subclassLevelOf,
} from '../tables'
import {
  PUBLISHED_SUBCLASSES,
  publishedSubclassesFor,
} from './publishedSubclasses'

/**
 * The published tier's own invariants. `srd.test.ts`'s two walkers iterate
 * `SRD_TABLES.kits`, which folds this tier in, so the shape checks — pick ids,
 * skill ids, `featureText` completeness — already cover these entries. That
 * dependency is worth knowing: those walkers read the raw `SRD_CLASS_KITS` for
 * a long time, and while they did, nothing here was shape-checked at all.
 *
 * What they cannot see is the thing this file exists for: the boundary between
 * what is SRD 5.1 and what is not.
 */
const published = Object.entries(PUBLISHED_SUBCLASSES).flatMap(
  ([className, subs]) => subs.map((sub) => ({ className, sub })),
)

describe('published subclasses', () => {
  it('name a class the tables actually ship', () => {
    // A typo'd class name is silent: `withPublishedSubclasses` finds no kit and
    // the whole entry vanishes rather than erroring.
    for (const className of Object.keys(PUBLISHED_SUBCLASSES)) {
      expect(
        findKit(SRD_CLASS_KITS, className),
        `no class named "${className}"`,
      ).toBeDefined()
    }
  })

  it('are slugified and uniquely identified', () => {
    const seen = new Set<string>()
    for (const { className, sub } of published) {
      const slug = sub.name
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      expect(sub.id, `${className}/${sub.name}`).toBe(slug)
      expect(seen.has(sub.id), `duplicate id "${sub.id}"`).toBe(false)
      seen.add(sub.id)
    }
  })

  it('carry something worth having', () => {
    // A bare entry here would be indistinguishable from the stub it overlays,
    // and `layerSubclasses` would skip it — a silent no-op.
    for (const { className, sub } of published) {
      expect(isBareSubclass(sub), `${className}/${sub.name} is bare`).toBe(
        false,
      )
      expect(sub.summary, `${className}/${sub.name}`).toBeTruthy()
    }
  })

  it('never shadow an SRD subclass that already has content', () => {
    // Overlaying a *stub* is the entire point. Overlaying a subclass that
    // `lib/srd/` authored would silently replace licensed content with ours.
    for (const { className, sub } of published) {
      const kit = findKit(SRD_CLASS_KITS, className)!
      const clash = kit.subclasses.find(
        (s) => s.name.toLowerCase() === sub.name.toLowerCase(),
      )
      if (!clash) continue
      expect(
        isBareSubclass(clash),
        `${className}/${sub.name} shadows an authored SRD subclass`,
      ).toBe(true)
    }
  })

  it('sit at or above the level their class picks a subclass', () => {
    for (const { className, sub } of published) {
      const at = subclassLevelOf(findKit(SRD_CLASS_KITS, className))
      for (const feature of sub.features) {
        expect(
          feature.level,
          `${className}/${sub.name}/${feature.name}`,
        ).toBeGreaterThanOrEqual(at)
        expect(feature.level).toBeLessThanOrEqual(20)
      }
    }
  })

  it('do not repeat a feature name at the same level', () => {
    for (const { className, sub } of published) {
      const seen = new Set<string>()
      for (const f of sub.features) {
        const key = `${f.level}:${f.name.toLowerCase()}`
        expect(seen.has(key), `${className}/${sub.name}: ${key}`).toBe(false)
        seen.add(key)
      }
    }
  })

  it('reach the merged tables the app actually reads', () => {
    // The tier has to be folded into `SRD_TABLES` as well as `mergeTables` —
    // wiring only one leaves half the app disagreeing with the other half.
    for (const { className, sub } of published) {
      const merged = findKit(SRD_TABLES.kits, className)
      const found = merged?.subclasses.find((s) => s.name === sub.name)
      expect(
        found,
        `${className}/${sub.name} missing from SRD_TABLES`,
      ).toBeDefined()
      expect(found?.features.length).toBe(sub.features.length)
    }
  })

  it('leave a class with no published subclasses alone', () => {
    // Warlock, and it is the last one — its patron spell lists are "added to
    // your spell list" rather than always prepared, which is a mechanism
    // question and its own pass. The Wizard held this spot until its eight
    // schools landed, so if the Warlock is ever authored this assertion has
    // nowhere left to point and should become a homebrew-only fixture.
    expect(publishedSubclassesFor('Warlock')).toEqual([])
    expect(publishedSubclassesFor('Not A Class')).toEqual([])
  })

  it('match their class name case-insensitively', () => {
    expect(publishedSubclassesFor('barbarian').length).toBeGreaterThan(0)
    expect(publishedSubclassesFor('  Bard  ').length).toBeGreaterThan(0)
  })
})

describe('the cleric domains', () => {
  // A cleric picks at level 1, so these are the first subclasses that have to
  // work at *creation* rather than only at level-up. All seven are checked
  // together because they were authored together and the split between the
  // SRD one and the six published ones is invisible from the merged tables.
  const cleric = findKit(SRD_TABLES.kits, 'Cleric')
  const DOMAINS = [
    'Knowledge Domain',
    'Life Domain',
    'Light Domain',
    'Nature Domain',
    'Tempest Domain',
    'Trickery Domain',
    'War Domain',
  ]

  it('all seven carry features and a domain spell table', () => {
    for (const name of DOMAINS) {
      const sub = cleric?.subclasses.find((s) => s.name === name)
      expect(sub, name).toBeDefined()
      expect(sub?.features.length, name).toBeGreaterThan(0)
      expect(sub?.spells?.length, name).toBe(5)
    }
  })

  it('grant their domain spells at 1, 3, 5, 7 and 9', () => {
    // The shape 5e uses for every domain. A row at the wrong character level
    // is silent — it just arrives on the wrong level-up.
    for (const name of DOMAINS) {
      const sub = cleric?.subclasses.find((s) => s.name === name)
      expect(
        sub?.spells?.map((row) => row.grantedAt),
        name,
      ).toEqual([1, 3, 5, 7, 9])
      // Spell level tracks character level: 1st-level spells at 1, 2nd at 3.
      expect(
        sub?.spells?.map((row) => row.level),
        name,
      ).toEqual([1, 2, 3, 4, 5])
      for (const row of sub?.spells ?? []) {
        expect(row.names.length, name + ' at ' + row.grantedAt).toBe(2)
      }
    }
  })

  it('each offer a Channel Divinity option at 2nd', () => {
    // The class grants the counter at 2; the domain is what it is spent on.
    for (const name of DOMAINS) {
      const sub = cleric?.subclasses.find((s) => s.name === name)
      const at2 = sub?.features.filter((f) => f.level === 2) ?? []
      expect(
        at2.some((f) => f.name.startsWith('Channel Divinity')),
        name,
      ).toBe(true)
    }
  })

  it('never author a counter of their own', () => {
    // Channel Divinity is the cleric's counter and only three fit on a sheet.
    // A domain adding a second would crowd it out for that domain alone.
    for (const name of DOMAINS) {
      const sub = cleric?.subclasses.find((s) => s.name === name)
      for (const f of sub?.features ?? []) {
        expect(f.resource, name + '/' + f.name).toBeUndefined()
      }
    }
  })

  it('scale Divine Strike as its own row rather than prose', () => {
    // Every domain that has it upgrades at 14. Folded into the level-8 text it
    // would be prose the level-up wizard cannot grant.
    for (const name of DOMAINS) {
      const sub = cleric?.subclasses.find((s) => s.name === name)
      const has8 = sub?.features.some(
        (f) => f.level === 8 && f.name === 'Divine Strike',
      )
      if (!has8) continue
      expect(
        sub?.features.some(
          (f) => f.level === 14 && f.name.startsWith('Divine Strike'),
        ),
        name,
      ).toBe(true)
    }
  })
})

describe('the monastic traditions', () => {
  // A monk picks at 3rd, and all three traditions live in the published tier —
  // Way of the Open Hand is the SRD-licensed one, but the kit only ever seeded
  // it as a name, so its features are PHB content like the other two. The
  // pinned "authored in lib/srd" list below therefore has no Monk entry.
  const monk = findKit(SRD_TABLES.kits, 'Monk')
  const TRADITIONS = [
    'Way of the Open Hand',
    'Way of Shadow',
    'Way of the Four Elements',
  ]

  const tradition = (name: string) =>
    monk?.subclasses.find((s) => s.name === name)

  it('all three carry features', () => {
    for (const name of TRADITIONS) {
      expect(
        tradition(name),
        name + ' missing from the merged tables',
      ).toBeDefined()
      expect(tradition(name)!.features.length, name).toBeGreaterThan(0)
    }
  })

  it('sit at exactly the levels a monk gains tradition features', () => {
    // 3/6/11/17 for all three. The transcription tripwire: a feature quietly
    // authored at 14 because another class works that way would be granted a
    // level late and nothing else would notice.
    for (const name of TRADITIONS) {
      const levels = [
        ...new Set((tradition(name)?.features ?? []).map((f) => f.level)),
      ].sort((a, b) => a - b)
      expect(levels, name).toEqual([3, 6, 11, 17])
    }
  })

  it('never author a counter of their own', () => {
    // Ki is the monk's counter and this pass put it on the kit, which had none
    // at all — every tradition spends ki, so without a class row those features
    // referenced a resource the sheet had never heard of. A tradition adding
    // its own would spend the sheet's three rows for that tradition alone.
    for (const name of TRADITIONS) {
      for (const f of tradition(name)?.features ?? []) {
        expect(f.resource, `${name} / ${f.name}`).toBeUndefined()
      }
    }
  })

  it('carry no spells, since a monk casts nothing', () => {
    // Way of Shadow knows minor illusion and casts four spells with ki, and
    // none of it is authored as spell data. A monk has no `spellcasting` block,
    // so the sheet has no ability, DC or slots to hold a spell honestly.
    //
    // `sub.spells` would fail an srd.test invariant outright (it requires a
    // `spellcasting` block). `grant.spells` would not — it would apply through
    // `applyFeatGrants` and land on the sheet. Until this pass it also arrived
    // silently, since the spells step never opens for a non-caster and used to
    // be the only place granted spells were shown. That hole is closed, but the
    // data stays out for the reason above, and this is what pins it.
    for (const name of TRADITIONS) {
      expect(tradition(name)?.spells, name).toBeUndefined()
      expect(tradition(name)?.grant?.spells, name).toBeUndefined()
    }
  })

  it('offer the elemental disciplines with complete text, both ways', () => {
    // This test is the ONLY thing checking this data. The discipline picks are
    // `open` so a discipline from a book this app does not ship can be typed,
    // and srd.test.ts skips an open pick for both the option-count rule and
    // `featureText` completeness — so a typo'd option would lose its text and
    // land as a bare row on the sheet with a fully green suite.
    const four = tradition('Way of the Four Elements')
    const picks = (four?.features ?? []).flatMap((f) => f.picks ?? [])
    expect(picks.length).toBe(4)

    for (const pick of picks) {
      expect(
        pick.id,
        'ids carry the level so they stay globally unique',
      ).toMatch(/^four-elements-(3|6|11|17)-discipline$/)
      expect(pick.open, `${pick.id} must stay open`).toBe(true)
      expect(pick.count, pick.id).toBe(1)
      expect(pick.featureLabel, pick.id).toBeTruthy()
      expect(new Set(pick.options).size, `${pick.id} repeats an option`).toBe(
        pick.options.length,
      )

      // Forwards: every offered discipline has text.
      for (const option of pick.options) {
        expect(
          pick.featureText?.[option],
          `${pick.id} offers "${option}" with no text`,
        ).toBeTruthy()
      }
    }

    // Backwards, which the completeness check above cannot see: a text entry
    // keyed to a name no level offers is dead weight and invisible — the usual
    // shape of a typo, where the misspelt option loses its text and the correct
    // spelling sits unused beside it.
    const offered = new Set(picks.flatMap((p) => p.options))
    const widest = picks.find((p) => p.id.includes('-17-'))!
    for (const key of Object.keys(widest.featureText ?? {})) {
      if (key === 'Elemental Attunement') continue // always known, never offered
      expect(offered.has(key), `text for "${key}", which no level offers`).toBe(
        true,
      )
    }
  })

  it('open the discipline list up as the monk levels', () => {
    // The prerequisite is modelled by narrowing the options per level rather
    // than by any runtime gate, so this is what proves the gating happened at
    // all — four identical lists would pass every other check here.
    const four = tradition('Way of the Four Elements')
    const at = (level: number) =>
      (four?.features ?? []).find((f) => f.level === level)?.picks?.[0]
        ?.options ?? []

    for (const [lower, higher] of [
      [3, 6],
      [6, 11],
      [11, 17],
    ]) {
      expect(at(lower).length, `${lower} vs ${higher}`).toBeLessThan(
        at(higher).length,
      )
      for (const option of at(lower)) {
        expect(at(higher), `${option} lost at ${higher}`).toContain(option)
      }
    }
  })

  it('gate Eternal Mountain Defense at 17th, per errata', () => {
    // The PHB's first printing said 11th and official errata moved it to 17th,
    // so most sources online — and most memories of this subclass — have it
    // wrong. Its own test, because "correcting" it back to 11 is the single
    // most likely wrong edit to this table.
    const four = tradition('Way of the Four Elements')
    const at = (level: number) =>
      (four?.features ?? []).find((f) => f.level === level)?.picks?.[0]
        ?.options ?? []

    expect(at(11)).not.toContain('Eternal Mountain Defense')
    expect(at(17)).toContain('Eternal Mountain Defense')
  })
})

describe('the paladin oaths', () => {
  // A paladin picks at 3rd, so unlike the domains and the origins these reach
  // the sheet only through level-up. All three were authored together in the
  // published tier: SRD 5.1 licenses Oath of Devotion, but the kit only ever
  // seeded it as a name, so its features are PHB content like the other two.
  const paladin = findKit(SRD_TABLES.kits, 'Paladin')
  const OATHS = [
    'Oath of Devotion',
    'Oath of the Ancients',
    'Oath of Vengeance',
  ]

  const oath = (name: string) =>
    paladin?.subclasses.find((s) => s.name === name)

  it('all three carry features', () => {
    for (const name of OATHS) {
      expect(oath(name), name + ' missing from the merged tables').toBeDefined()
      expect(oath(name)!.features.length, name).toBeGreaterThan(0)
    }
  })

  it('grant two Channel Divinity options at 3rd, as separate rows', () => {
    // Two rows rather than one naming both: `featuresGained` de-dupes on
    // `level:name`, so a single row would be one indistinguishable feature on
    // the sheet. Distinct names are also what stops the same-level duplicate
    // check above rejecting them.
    for (const name of OATHS) {
      const cd = (oath(name)?.features ?? []).filter(
        (f) => f.level === 3 && f.name.startsWith('Channel Divinity'),
      )
      expect(cd.length, name).toBe(2)
      expect(new Set(cd.map((f) => f.name)).size, name).toBe(2)
    }
  })

  it('never author a counter of their own', () => {
    // Channel Divinity is the paladin's counter and this pass put it on the
    // kit, which had none at all. An oath adding a second would spend the
    // sheet's three rows for that oath alone — the same division the cleric
    // domains keep.
    for (const name of OATHS) {
      for (const f of oath(name)?.features ?? []) {
        expect(f.resource, name + '/' + f.name).toBeUndefined()
      }
    }
  })

  it('grant their oath spells at 3, 5, 9, 13 and 17', () => {
    // Not a domain's 1/3/5/7/9: a paladin swears at 3rd and their slots lag a
    // full caster's, so each pair lands near the level it can first be cast.
    // A row at the wrong character level is silent — it just arrives on the
    // wrong level-up.
    for (const name of OATHS) {
      const spells = oath(name)?.spells
      expect(spells?.length, name).toBe(5)
      expect(
        spells?.map((r) => r.grantedAt),
        name,
      ).toEqual([3, 5, 9, 13, 17])
      expect(
        spells?.map((r) => r.level),
        name,
      ).toEqual([1, 2, 3, 4, 5])
      for (const row of spells ?? []) {
        expect(row.names.length, `${name} at ${row.grantedAt}`).toBe(2)
      }
    }
  })

  it('have somewhere to cast them from', () => {
    // The invariant that blocked these for a whole pass, asserted from the
    // other side: `srd.test.ts` requires `spellcastingFor` be defined for any
    // subclass carrying spells, and a Paladin had no block at all. If the
    // half-caster table is ever removed, this fails here with a message about
    // oaths rather than only in the srd suite.
    for (const name of OATHS) {
      expect(spellcastingFor(paladin, name), name).toBeDefined()
    }
    // ...but still not at level 1, which is what kept the block out.
    expect(castsAtLevel1(paladin)).toBe(false)
  })

  it('sit at the levels a paladin actually gains oath features', () => {
    // 3, 7, 15 and 20 — nothing at 1 or 2, which `subclassLevelOf` would
    // reject anyway, and nothing invented in between.
    for (const name of OATHS) {
      const levels = [
        ...new Set((oath(name)?.features ?? []).map((f) => f.level)),
      ].sort((a, b) => a - b)
      expect(levels, name).toEqual([3, 7, 15, 20])
    }
  })
})

describe('the sorcerous origins', () => {
  // A sorcerer picks at level 1, like a cleric, so these reach the sheet
  // through creation as well as level-up.
  const sorcerer = findKit(SRD_TABLES.kits, 'Sorcerer')
  const ORIGINS = ['Draconic Bloodline', 'Wild Magic']

  it('both carry features', () => {
    for (const name of ORIGINS) {
      const sub = sorcerer?.subclasses.find((x) => x.name === name)
      expect(sub, `${name} missing from the merged tables`).toBeDefined()
      expect(sub!.features.length, `${name} has no features`).toBeGreaterThan(0)
    }
  })

  it('offer the draconic ancestry as a closed pick with complete text', () => {
    // Closed rather than open, unlike a totem: the five damage types are the
    // whole list, and the choice is made once so nothing greys out. Closed
    // means `srd.test.ts` checks featureText completeness for it — but only
    // because its walkers read the merged tables, so assert it here too.
    const sub = sorcerer?.subclasses.find(
      (x) => x.name === 'Draconic Bloodline',
    )
    const pick = sub?.features
      .flatMap((f) => f.picks ?? [])
      .find((p) => p.id === 'draconic-bloodline-ancestor')
    expect(pick, 'the ancestry pick is missing').toBeDefined()
    expect(pick!.open).toBeFalsy()
    expect(pick!.count).toBe(1)
    expect(pick!.options).toEqual([
      'Acid',
      'Cold',
      'Fire',
      'Lightning',
      'Poison',
    ])
    for (const option of pick!.options) {
      expect(pick!.featureText?.[option], `${option} has no text`).toBeTruthy()
    }
    // The label prefixes the row it writes, so it must be there.
    expect(pick!.featureLabel).toBeTruthy()
  })

  it('give Draconic Resilience its hit points and nothing it cannot compute', () => {
    const sub = sorcerer?.subclasses.find(
      (x) => x.name === 'Draconic Bloodline',
    )
    expect(sub?.grant?.hpPerLevel).toBe(1)
    // Deliberately absent: the feature *replaces* 10 + Dex with 13 + Dex while
    // unarmoured, and `acBonus` is additive — any value here would be wrong the
    // moment the character wears armour. See the note on the grant.
    expect(sub?.grant?.acBonus).toBeUndefined()
  })

  it('never author a counter of their own', () => {
    // Sorcery Points is the class's counter, granted at 2nd by the kit. Same
    // division the cleric domains keep with Channel Divinity.
    for (const name of ORIGINS) {
      const sub = sorcerer?.subclasses.find((x) => x.name === name)
      for (const f of sub?.features ?? []) {
        expect(
          f.resource,
          `${name}/${f.name} authors a counter`,
        ).toBeUndefined()
      }
    }
  })

  it('leave the Wild Magic surge table as prose', () => {
    // A d100 of effects this app does not model and is not ours to reproduce.
    // No grant and no picks is the honest shape, not an incomplete one.
    const sub = sorcerer?.subclasses.find((x) => x.name === 'Wild Magic')
    expect(sub?.grant).toBeUndefined()
    expect(sub?.features.flatMap((f) => f.picks ?? [])).toEqual([])
  })
})

describe('the ranger conclaves', () => {
  // A ranger picks at 3rd. The kit declares no `subclassLevel` and the default
  // of 3 agrees with its own `Ranger Archetype` row, so unlike the Druid and
  // the Wizard there was nothing to correct before authoring.
  const ranger = findKit(SRD_TABLES.kits, 'Ranger')
  const ARCHETYPES = ['Hunter', 'Beast Master']
  const arch = (name: string) => ranger?.subclasses.find((x) => x.name === name)

  it('both carry features', () => {
    for (const name of ARCHETYPES) {
      const sub = arch(name)
      expect(sub, `${name} missing from the merged tables`).toBeDefined()
      expect(sub!.features.length, `${name} has no features`).toBeGreaterThan(0)
    }
  })

  it('sit at exactly the levels a ranger gains archetype features', () => {
    // 3/7/11/15 for both, and nothing invented in between. A row quietly
    // authored at 14 because a paladin's oaths work that way would be granted
    // a level late and nothing else here would notice.
    for (const name of ARCHETYPES) {
      const levels = [
        ...new Set((arch(name)?.features ?? []).map((f) => f.level)),
      ].sort((a, b) => a - b)
      expect(levels, name).toEqual([3, 7, 11, 15])
    }
  })

  it('carry no conclave spells, because the PHB gives them none', () => {
    // The one that matters, and it contradicts the handoff that commissioned
    // this pass. NEXT-CLASS-PROMPT.md says "the Ranger's conclaves can carry
    // `spells` because the half-caster pass gave it a real casting table" —
    // true of the *mechanism* and false of the *book*. A conclave spell list
    // is a Xanathar's feature (Gloom Stalker, Horizon Walker, Monster Slayer);
    // Hunter and Beast Master have none at all.
    //
    // Nothing else would catch an invented one. `srd.test.ts`'s "only
    // spellcasting classes grant bonus spells" requires `spellcastingFor(kit,
    // sub)` be *defined* — and for a Ranger it now is, so a fabricated table
    // would sail through green and hand the character free always-prepared
    // spells at 3/5/9/13/17.
    for (const name of ARCHETYPES) {
      expect(arch(name)?.spells, name).toBeUndefined()
      expect(arch(name)?.grant?.spells, name).toBeUndefined()
    }
  })

  it('have somewhere to cast from all the same', () => {
    // Asserted from the other side, as the oaths do: the half-caster table is
    // real, which is *why* the absence above is a data decision rather than a
    // mechanism limit. If that table is ever removed, this fails here.
    for (const name of ARCHETYPES) {
      expect(spellcastingFor(ranger, name), name).toBeDefined()
    }
    // ...but not at 1st, which is what keeps a level-1 ranger out of a spells
    // step at creation.
    expect(castsAtLevel1(ranger)).toBe(false)
  })

  it('never author a counter of their own — and neither does the class', () => {
    // Stronger than the same-named test on the domains, the oaths and the
    // traditions. Those read "the class has a counter, the subclass must not
    // compete". A Ranger has *no* counter at either tier, and that is correct:
    // Primeval Awareness spends a spell slot, which `Character.spellSlots`
    // already tracks; Foe Slayer is a once-per-turn rule with no pool and no
    // `resets` value that means anything; and a Beast Master's companion hit
    // points are 4 x the ranger level, a scaling number, which the rules here
    // are explicit is not a counter. Do not read this absence as an oversight.
    for (const name of ARCHETYPES) {
      for (const f of arch(name)?.features ?? []) {
        expect(
          f.resource,
          `${name}/${f.name} authors a counter`,
        ).toBeUndefined()
      }
    }
    for (const f of ranger?.features ?? []) {
      expect(f.resource, `Ranger/${f.name} authors a counter`).toBeUndefined()
    }
  })

  it('offer the Hunter’s four menus as closed picks with complete text', () => {
    // Closed rather than open, like the draconic ancestry and unlike a totem:
    // each list is the whole menu the PHB offers, and each is chosen once.
    //
    // `srd.test.ts`'s `featureText` completeness check does reach these — its
    // `allPickLists()` walks the *merged* tables — but its sibling, the
    // "repeatable feature pick offers enough" rule, does not: that one still
    // iterates the raw `SRD_CLASS_KITS`, so the published tier is invisible to
    // it. The option counts are asserted here instead.
    const picks = (arch('Hunter')?.features ?? []).flatMap((f) => f.picks ?? [])
    expect(picks.map((p) => p.id)).toEqual([
      'hunter-3-prey',
      'hunter-7-tactics',
      'hunter-11-multiattack',
      'hunter-15-defense',
    ])
    for (const pick of picks) {
      expect(pick.kind, pick.id).toBe('feature')
      expect(pick.open, `${pick.id} must stay closed`).toBeFalsy()
      expect(pick.count, pick.id).toBe(1)
      expect(pick.options.length, pick.id).toBeGreaterThanOrEqual(pick.count)
      expect(new Set(pick.options).size, `${pick.id} repeats an option`).toBe(
        pick.options.length,
      )
      // The label prefixes the row this writes, so it has to be there.
      expect(pick.featureLabel, `${pick.id} has no label`).toBeTruthy()
      for (const option of pick.options) {
        expect(
          pick.featureText?.[option],
          `${pick.id} offers "${option}" with no text`,
        ).toBeTruthy()
      }
      // And backwards: a text entry no level offers is a typo's usual shape.
      for (const key of Object.keys(pick.featureText ?? {})) {
        expect(
          pick.options.includes(key),
          `${pick.id} has text for "${key}", which it does not offer`,
        ).toBe(true)
      }
    }
  })

  it('keeps the Hunter’s four option lists disjoint', () => {
    // The property the whole design rests on, and worth pinning because it is
    // what makes the label question moot. `grantedAlreadyAt` greys an option
    // two ways — by a row already on the sheet under the label a pick would
    // write, and by a sibling pick's answer in the same level-up, the latter
    // matching the raw option string across every `feature` pick regardless of
    // label. Neither can fire while no option appears in two lists. If a future
    // edit ever put Evasion in two of these, a 3 -> 15 jump would start greying
    // it and this fails first.
    const picks = (arch('Hunter')?.features ?? []).flatMap((f) => f.picks ?? [])
    const all = picks.flatMap((p) => p.options)
    expect(new Set(all).size, 'an option appears in two Hunter lists').toBe(
      all.length,
    )
    // And the labels are distinct, so the rows read as the book's own feature
    // names rather than four identically-prefixed lines.
    expect(new Set(picks.map((p) => p.featureLabel)).size).toBe(4)
  })

  it('leaves the Beast Master’s companion as prose', () => {
    // There is no companion model on `Character` — no field for a second
    // creature's AC, hit points or attacks — so a grant would describe the
    // ranger instead of the beast, and a pick would write "Ranger's Companion:
    // Wolf" carrying none of the wolf. No grant and no picks is the honest
    // shape, the same call the Wild Magic surge table got.
    const sub = arch('Beast Master')
    expect(sub?.grant).toBeUndefined()
    expect(sub?.features.flatMap((f) => f.picks ?? [])).toEqual([])
  })
})

describe('the arcane traditions', () => {
  // A wizard picks at **2nd**, and `subclassLevel: 2` was already declared on
  // the kit with a comment explaining the bug that put it there — checked
  // before authoring per the Druid's lesson, and this time there was nothing
  // to fix. All eight schools live in the published tier including School of
  // Evocation, which SRD 5.1 licenses: the kit only ever seeded it as a name.
  const wizard = findKit(SRD_TABLES.kits, 'Wizard')
  const SCHOOLS = [
    'School of Abjuration',
    'School of Conjuration',
    'School of Divination',
    'School of Enchantment',
    'School of Evocation',
    'School of Illusion',
    'School of Necromancy',
    'School of Transmutation',
  ]
  const school = (name: string) =>
    wizard?.subclasses.find((s) => s.name === name)

  it('all eight carry features, and no ninth goes unauthored', () => {
    expect(SCHOOLS.length).toBe(8)
    for (const name of SCHOOLS) {
      expect(
        school(name),
        `${name} missing from the merged tables`,
      ).toBeDefined()
      expect(school(name)!.features.length, name).toBeGreaterThan(0)
    }
    // Asserted from the other side too: a school added to the kit later and
    // never authored here would otherwise sit bare and nothing would say so.
    expect(
      (wizard?.subclasses ?? []).map((s) => s.name).sort(),
      'the kit offers a school this block does not cover',
    ).toEqual([...SCHOOLS].sort())
  })

  it('sit at exactly the levels a wizard gains school features', () => {
    // 2/6/10/14 for all eight, verified school by school rather than assumed
    // uniform — the Monk pass's lesson about numbers written from memory. A
    // row quietly authored at 3 because most classes work that way would be
    // granted a level late and nothing else here would notice.
    for (const name of SCHOOLS) {
      const levels = [
        ...new Set((school(name)?.features ?? []).map((f) => f.level)),
      ].sort((a, b) => a - b)
      expect(levels, name).toEqual([2, 6, 10, 14])
    }
  })

  it('give every school two features at 2nd — a Savant and one more', () => {
    // The test above passes with a school missing its Savant, because it reads
    // the level *set* and 2 appears either way. A wizard school is five
    // features across four levels, and the doubled 2nd is the shape that goes
    // wrong silently.
    for (const name of SCHOOLS) {
      const features = school(name)?.features ?? []
      expect(features.length, name).toBe(5)
      const at2 = features.filter((f) => f.level === 2)
      expect(at2.length, `${name} at 2nd`).toBe(2)
      expect(
        at2.filter((f) => f.name.endsWith('Savant')).length,
        `${name} has no Savant`,
      ).toBe(1)
      for (const level of [6, 10, 14]) {
        expect(
          features.filter((f) => f.level === level).length,
          `${name} at ${level}`,
        ).toBe(1)
      }
    }
  })

  it('carry no school spells, because the PHB gives them none', () => {
    // The one that matters most in this block, and the trap is live here in a
    // way it was not even for the Ranger. A wizard school has no bonus spell
    // list in any PHB school — that is a domain/oath/circle mechanism.
    //
    // Nothing else would catch a fabricated one. `srd.test.ts`'s "only
    // spellcasting classes grant bonus spells" asks that `spellcastingFor(kit,
    // sub)` be *defined*, and for a Wizard it always is: the class carries its
    // own Intelligence block. So an invented table would pass a fully green
    // suite and hand the character free always-prepared rows, which
    // `preparedCount` exempts from `preparedLimit` outright.
    //
    // `grant.spells` is checked too, and it is the sneakier half: it would not
    // trip that invariant at all, and `applyFeatGrants` would apply it.
    for (const name of SCHOOLS) {
      expect(school(name)?.spells, name).toBeUndefined()
      expect(school(name)?.grant?.spells, name).toBeUndefined()
    }
  })

  it('carry no grant at all, and that is the finding', () => {
    // Absence with reasons, so it does not read as unfinished. Arcane Ward is
    // a second hit-point pool with its own maximum and `Grant` has only
    // `hpPerLevel`, which raises *the character's* max hp — the wrong number
    // for the wrong entity, the Lay on Hands call. Spell Resistance's
    // "resistance to the damage of spells" names a source, not a type, so
    // `grant.resistances` would fail `srd.test.ts`'s DAMAGE_TYPES check and
    // deserves to. And the spellbook additions — animate dead, polymorph — are
    // not `Grant.spells`, whose doc comment is explicit that those are cast
    // once per long rest without a slot.
    for (const name of SCHOOLS) {
      expect(school(name)?.grant, name).toBeUndefined()
    }
  })

  it('never author a counter of their own', () => {
    // Arcane Recovery is the wizard's counter and it is on the *class*, added
    // in the same pass that authored these. Only three fit a sheet, and the
    // schools' once-per-rest features are one-shot rules their text carries.
    for (const name of SCHOOLS) {
      for (const f of school(name)?.features ?? []) {
        expect(
          f.resource,
          `${name}/${f.name} authors a counter`,
        ).toBeUndefined()
      }
    }
  })

  it('have somewhere to cast from, at 1st unlike a half caster', () => {
    // Asserted from the other side as the oaths and conclaves do: the block is
    // real, which is *why* the absence of school spells above is a data
    // decision rather than a mechanism limit.
    for (const name of SCHOOLS) {
      expect(spellcastingFor(wizard, name), name).toBeDefined()
    }
    // Note the sign flips versus the Paladin and Ranger blocks, which assert
    // false here. A wizard is a full caster and casts from 1st, so a level-1
    // wizard *does* get a spells step at creation. Do not "fix" this to match.
    expect(castsAtLevel1(wizard)).toBe(true)
  })

  it('scale Portent as its own row rather than prose', () => {
    // The only scaling pair in the eight. Folded into the level-2 text as
    // "three dice at 14th" it would be prose the level-up wizard cannot grant,
    // the same failure the Cleric's Divine Strike test guards.
    const div = school('School of Divination')
    expect(
      div?.features.some((f) => f.level === 2 && f.name === 'Portent'),
    ).toBe(true)
    expect(
      div?.features.some((f) => f.level === 14 && f.name === 'Greater Portent'),
    ).toBe(true)
  })

  it('offer the transmuter’s stone as the one and only pick', () => {
    // Zero picks across seven schools is deliberate: a wizard's school
    // features are passive modifiers to how spells behave, not menus. The
    // stone is the exception because its choice *persists* until the wizard
    // changes it, so it is real sheet state.
    const picks = SCHOOLS.flatMap((name) =>
      (school(name)?.features ?? []).flatMap((f) => f.picks ?? []),
    )
    expect(picks.map((p) => p.id)).toEqual(['school-of-transmutation-6-stone'])

    const pick = picks[0]
    expect(pick.kind).toBe('feature')
    expect(pick.open, 'the stone must stay closed').toBeFalsy()
    expect(pick.count).toBe(1)
    expect(pick.featureLabel).toBeTruthy()
    expect(new Set(pick.options).size).toBe(pick.options.length)
    for (const option of pick.options) {
      expect(pick.featureText?.[option], `no text for "${option}"`).toBeTruthy()
    }
    // And backwards: a text entry the pick does not offer is a typo's usual
    // shape, and the completeness check above cannot see it.
    for (const key of Object.keys(pick.featureText ?? {})) {
      expect(
        pick.options.includes(key),
        `text for "${key}", which the stone does not offer`,
      ).toBe(true)
    }
    // No `featureGrant` on any option. Speed +10 and the resistance are
    // numbers the sheet holds, but the stone is transferable and its benefit
    // rechooseable, so either written permanently onto this character would be
    // wrong the moment it changes hands. Draconic Resilience's absent
    // `acBonus` is the precedent.
    expect(pick.featureGrant).toBeUndefined()
  })

  it('leave The Third Eye’s four benefits as prose', () => {
    // The near-miss, pinned because it is the likeliest wrong future edit in
    // this key. It reads exactly like the stone — four named options — but the
    // choice is re-made after every short rest, while a `feature` pick writes
    // one permanent row to `Character.features`. That row would assert the
    // character has darkvision forever, false an hour later.
    const eye = school('School of Divination')?.features.find(
      (f) => f.level === 10,
    )
    expect(eye?.name).toBe('The Third Eye')
    expect(eye?.picks).toBeUndefined()
  })
})

describe('the SRD boundary', () => {
  it('keeps every published subclass out of lib/srd', () => {
    // The promise in `lib/srd/index.ts` is that only SRD 5.1 content lives
    // there. A published subclass that gained features in `classKits.ts` would
    // break it, and nothing else would notice.
    for (const { className, sub } of published) {
      const kit = findKit(SRD_CLASS_KITS, className)!
      const inSrd = kit.subclasses.find((s) => s.name === sub.name)
      if (!inSrd) continue
      expect(
        inSrd.features.length,
        `${className}/${sub.name} has features in lib/srd/`,
      ).toBe(0)
    }
  })

  it('leaves exactly the SRD subclasses authored in lib/srd', () => {
    // SRD 5.1 licenses one archetype per class. This pins which names carry
    // content in `lib/srd/`, so a future pass cannot quietly author a PHB
    // subclass there — it has to come here instead, or change this list
    // deliberately.
    const authored = SRD_CLASS_KITS.flatMap((kit) =>
      kit.subclasses
        .filter((sub) => !isBareSubclass(sub))
        .map((sub) => `${kit.name}/${sub.name}`),
    ).sort()
    expect(authored).toEqual(
      [
        'Barbarian/Path of the Berserker',
        'Bard/College of Lore',
        'Cleric/Life Domain',
        'Druid/Circle of the Land',
        'Fighter/Champion',
        'Rogue/Thief',
        // Not SRD 5.1, and knowingly here: these four predate the published
        // tier. Battle Master, Eldritch Knight, Assassin and Arcane Trickster
        // are PHB archetypes whose content was authored into `lib/srd/` before
        // the boundary was drawn. Moving them is a follow-up, not a silent
        // change — see NEXT-CLASS-PROMPT.md.
        'Fighter/Battle Master',
        'Fighter/Eldritch Knight',
        'Rogue/Assassin',
        'Rogue/Arcane Trickster',
      ].sort(),
    )
  })
})
