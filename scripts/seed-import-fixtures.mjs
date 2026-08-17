/**
 * Writes flat, importable folders to the Desktop for DungeonMaster's global
 * library — one pair per SRD edition, so a user can take either or both:
 *
 *   Desktop/DM Bestiary 5e     -> Monsters  (SRD 5.1, the 2014 ruleset)
 *   Desktop/DM Spells 5e       -> Spells
 *   Desktop/DM Bestiary 5.5e   -> Monsters  (SRD 5.2, the 2024 ruleset)
 *   Desktop/DM Spells 5.5e     -> Spells
 *
 * 2024 files are named "<Name> 5.5e.md" so both editions can live in one
 * library without colliding — the panel row shows the suffix, while the
 * statblock card keeps the clean name (the row reads the filename, the card
 * reads the `name:` line inside the fence).
 *
 * Content comes from the open5e API. Both editions are SRD under CC-BY-4.0,
 * but open5e also serves third-party books (Tome of Beasts and friends) under
 * different licences, so the document filter is load-bearing, not a
 * convenience. A LICENSE.txt with the attribution is written alongside each.
 *
 * The 5e folders also carry files the importer must *skip*, so a run exercises
 * the reject paths and not just the happy one. --clean omits them.
 *
 * Run:  node scripts/seed-import-fixtures.mjs
 *       node scripts/seed-import-fixtures.mjs --clean     (distributable)
 *       node scripts/seed-import-fixtures.mjs --offline   (cache only)
 *       node scripts/seed-import-fixtures.mjs --only 5.5e (one edition)
 *
 * Responses are cached under scripts/.cache/ so re-runs need no network.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const cacheDir = path.join(here, '.cache')
const desktop = path.join(os.homedir(), 'Desktop')
const offline = process.argv.includes('--offline')
// --clean omits the deliberate reject fixtures (.obsidian/, a '#' name, a
// dotfile). Those exist to exercise the importer's skip paths; a folder being
// zipped for distribution wants the SRD content and nothing else.
const clean = process.argv.includes('--clean')
const onlyArg = process.argv[process.argv.indexOf('--only') + 1]
const only = process.argv.includes('--only') ? onlyArg : null

/**
 * The two editions. They come from different API versions with genuinely
 * different schemas, so each carries its own fetch shape and converters.
 */
const EDITIONS = [
  {
    id: '5e',
    label: 'SRD 5.1 (2014)',
    srdVersion: '5.1',
    // v1: flat fields, filtered by document__slug.
    api: 'https://api.open5e.com/v1',
    filter: 'document__slug=wotc-srd',
    creatures: 'monsters',
    /** No suffix: 2014 is the default, and clean names keep [[links]] working. */
    suffix: '',
    bestiary: path.join(desktop, 'DM Bestiary 5e'),
    spells: path.join(desktop, 'DM Spells 5e'),
    /** Reject fixtures only on this edition — one copy is enough to test with. */
    withRejects: true,
  },
  {
    id: '5.5e',
    label: 'SRD 5.2 (2024)',
    srdVersion: '5.2',
    // v2: nested objects, filtered by document__key, creatures not monsters.
    api: 'https://api.open5e.com/v2',
    filter: 'document__key=srd-2024',
    creatures: 'creatures',
    suffix: ' 5.5e',
    bestiary: path.join(desktop, 'DM Bestiary 5.5e'),
    spells: path.join(desktop, 'DM Spells 5.5e'),
    withRejects: false,
  },
]

const attribution = (edition) =>
  `Monster and spell text is from the System Reference Document ${edition.srdVersion}
("SRD ${edition.srdVersion}") by Wizards of the Coast LLC, available under the
Creative Commons Attribution 4.0 International License:
https://creativecommons.org/licenses/by/4.0/legalcode

Retrieved via the open5e API (https://open5e.com) filtered to
${edition.filter}.

Intended for import into DungeonMaster's global library. Not
bundled with the application.
`

/** A 1x1 transparent PNG — enough to prove the world:// portrait path works. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function write(root, relPath, contents) {
  const abs = path.join(root, ...relPath.split('/'))
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, contents)
}

/**
 * Every page of an open5e endpoint, cached to disk. The API pages at 100, so
 * this is a handful of round-trips per endpoint.
 */
async function fetchAll(edition, endpoint) {
  const cache = path.join(cacheDir, `${edition.id}-${endpoint}.json`)
  if (fs.existsSync(cache)) {
    console.log(`  using cached ${edition.id} ${endpoint}`)
    return JSON.parse(fs.readFileSync(cache, 'utf8'))
  }
  if (offline) throw new Error(`--offline but no cache at ${cache}`)

  const results = []
  let url = `${edition.api}/${endpoint}/?${edition.filter}&limit=100`
  while (url) {
    process.stdout.write(`  fetching ${edition.id} ${endpoint} (${results.length})\r`)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`${endpoint}: HTTP ${response.status} from ${url}`)
    }
    const page = await response.json()
    results.push(...page.results)
    url = page.next
  }
  console.log(`  fetched ${edition.id} ${endpoint} (${results.length})    `)
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(cache, JSON.stringify(results))
  return results
}

/** nameError rejects these, so strip them rather than seeding known-bad files. */
function safeTitle(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\[\[|\]\]|#/g, '')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim()
}

const XP_BY_CR = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700,
  '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000,
  '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
}

function speedLine(speed) {
  if (!speed || typeof speed !== 'object') return null
  const parts = Object.entries(speed)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => (k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`))
  return parts.length ? parts.join(', ') : null
}

/** Named blocks (traits, actions) as markdown prose with rollable dice intact. */
function proseSection(heading, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return ''
  const body = entries
    .map((e) => `**${e.name}.** ${String(e.desc ?? '').trim()}`)
    .join('\n\n')
  return heading ? `\n\n### ${heading}\n\n${body}` : `\n\n${body}`
}

/**
 * Assemble the article from already-normalised parts, so both API versions
 * produce byte-identical structure and only the extraction differs.
 *
 * `name` is the clean creature name even when the file is suffixed: the panel
 * row reads the filename, the card header reads this line.
 */
function buildMonsterArticle({ name, subtitle, imageName, ac, hp, speed, cr, xp, abilities, extras, prose }) {
  const fields = [
    `name: ${name}`,
    subtitle ? `subtitle: ${subtitle}` : null,
    imageName ? `image: _images/${imageName}` : null,
    ac ? `ac: ${ac}` : null,
    hp ? `hp: ${hp}` : null,
    speed ? `speed: ${speed}` : null,
    `cr: "${cr}"`,
    xp != null ? `xp: ${xp}` : null,
    `str: ${abilities.str}`,
    `dex: ${abilities.dex}`,
    `con: ${abilities.con}`,
    `int: ${abilities.int}`,
    `wis: ${abilities.wis}`,
    `cha: ${abilities.cha}`,
    ...extras,
  ].filter(Boolean)

  return `---
type: monster
tags: []
cr: "${cr}"
${xp != null ? `xp: ${xp}\n` : ''}---

\`\`\`statblock
${fields.join('\n')}
---
${prose.trim()}
\`\`\`
`
}

/**
 * One monster as an article: `type: monster` frontmatter so the encounter
 * builder can see it, then a ```statblock fence in the app's own key: value
 * format (see parseStatBlockCard in src/lib/statblock.ts).
 */
function monsterArticle(m, imageName) {
  const cr = String(m.challenge_rating ?? '').trim()
  const xp = XP_BY_CR[cr] ?? null
  const subtitle = [
    [m.size, m.type].filter(Boolean).join(' '),
    m.subtype ? `(${m.subtype})` : '',
    m.alignment ? `, ${m.alignment}` : '',
  ]
    .join('')
    .trim()

  const extras = [
    m.skills && Object.keys(m.skills).length
      ? `skills: ${Object.entries(m.skills).map(([k, v]) => `${k} +${v}`).join(', ')}`
      : null,
    m.damage_resistances ? `resistances: ${m.damage_resistances}` : null,
    m.damage_immunities ? `immunities: ${m.damage_immunities}` : null,
    m.condition_immunities ? `condition immunities: ${m.condition_immunities}` : null,
    m.senses ? `senses: ${m.senses}` : null,
    m.languages ? `languages: ${m.languages}` : null,
  ].filter(Boolean)

  const prose =
    proseSection(null, m.special_abilities) +
    proseSection('Actions', m.actions) +
    proseSection('Bonus Actions', m.bonus_actions) +
    proseSection('Reactions', m.reactions) +
    proseSection('Legendary Actions', m.legendary_actions)

  return buildMonsterArticle({
    name: m.name,
    subtitle,
    imageName,
    ac: `${m.armor_class}${m.armor_desc ? ` (${m.armor_desc})` : ''}`,
    hp: `${m.hit_points}${m.hit_dice ? ` (${m.hit_dice})` : ''}`,
    speed: speedLine(m.speed),
    cr,
    xp,
    abilities: {
      str: m.strength,
      dex: m.dexterity,
      con: m.constitution,
      int: m.intelligence,
      wis: m.wisdom,
      cha: m.charisma,
    },
    extras,
    prose,
  })
}

// --- SRD 5.2 (open5e v2) ---------------------------------------------------
// Different shape entirely: size/type/school are nested objects, abilities come
// as one object, traits live in `actions` tagged by action_type, and languages
// arrive as {as_string, data}.

const ACTION_HEADINGS = [
  ['TRAIT', null],
  ['ACTION', 'Actions'],
  ['BONUS_ACTION', 'Bonus Actions'],
  ['REACTION', 'Reactions'],
  ['LEGENDARY_ACTION', 'Legendary Actions'],
]

function speedLine2(speed) {
  if (!speed || typeof speed !== 'object') return null
  const parts = Object.entries(speed)
    .filter(([k, v]) => typeof v === 'number' && k !== 'unit')
    .map(([k, v]) => (k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`))
  return parts.length ? parts.join(', ') : null
}

/** "senses" is assembled from separate range fields in v2. */
function sensesLine(c) {
  const parts = [
    c.blindsight_range ? `blindsight ${c.blindsight_range} ft.` : null,
    c.darkvision_range ? `darkvision ${c.darkvision_range} ft.` : null,
    c.tremorsense_range ? `tremorsense ${c.tremorsense_range} ft.` : null,
    c.truesight_range ? `truesight ${c.truesight_range} ft.` : null,
    c.passive_perception ? `passive Perception ${c.passive_perception}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function monsterArticle2(c, imageName) {
  const cr = String(c.challenge_rating ?? '').trim()
  // v2 gives real XP rather than making us derive it from CR.
  const xp = c.experience_points ?? XP_BY_CR[cr] ?? null
  const subtitle = [
    [c.size?.name, c.type?.name].filter(Boolean).join(' '),
    c.alignment ? `, ${c.alignment}` : '',
  ]
    .join('')
    .trim()

  const a = c.ability_scores ?? {}
  const skills = c.skill_bonuses ?? {}
  const resist = c.resistances_and_immunities ?? {}

  const extras = [
    Object.keys(skills).length
      ? `skills: ${Object.entries(skills).map(([k, v]) => `${k} +${v}`).join(', ')}`
      : null,
    resist.damage_resistances_display
      ? `resistances: ${resist.damage_resistances_display}`
      : null,
    resist.damage_immunities_display
      ? `immunities: ${resist.damage_immunities_display}`
      : null,
    resist.condition_immunities_display
      ? `condition immunities: ${resist.condition_immunities_display}`
      : null,
    sensesLine(c) ? `senses: ${sensesLine(c)}` : null,
    c.languages?.as_string ? `languages: ${c.languages.as_string}` : null,
  ].filter(Boolean)

  const actions = Array.isArray(c.actions) ? c.actions : []
  const prose = ACTION_HEADINGS.map(([type, heading]) =>
    proseSection(
      heading,
      actions.filter((x) => x.action_type === type),
    ),
  ).join('')

  return buildMonsterArticle({
    name: c.name,
    subtitle,
    imageName,
    ac: `${c.armor_class}${c.armor_detail ? ` (${c.armor_detail})` : ''}`,
    hp: `${c.hit_points}${c.hit_dice ? ` (${c.hit_dice})` : ''}`,
    speed: speedLine2(c.speed),
    cr,
    xp,
    abilities: {
      str: a.strength,
      dex: a.dexterity,
      con: a.constitution,
      int: a.intelligence,
      wis: a.wisdom,
      cha: a.charisma,
    },
    extras,
    prose,
  })
}

/** v2 spells: components are booleans, classes an array, level a number. */
function spellArticle2(s) {
  const level = s.level ?? 0
  const levelLabel = level === 0 ? 'Cantrip' : `Level ${level}`
  const school = String(s.school?.name ?? '').toLowerCase()
  const components = [
    s.verbal ? 'V' : null,
    s.somatic ? 'S' : null,
    s.material ? 'M' : null,
  ]
    .filter(Boolean)
    .join(', ')
  const classes = (s.classes ?? []).map((x) => x.name).join(', ')
  const duration = `${s.concentration ? 'Concentration, ' : ''}${s.duration ?? '—'}`

  return `---
type: spell
level: ${level}
school: ${school}
classes: ${classes}
---

# ${s.name}

*${levelLabel} ${school}${s.ritual ? ' (ritual)' : ''}*

| | |
| --- | --- |
| **Casting Time** | ${s.casting_time ?? '—'} |
| **Range** | ${s.range_text ?? '—'} |
| **Components** | ${components || '—'}${s.material_specified ? ` (${s.material_specified})` : ''} |
| **Duration** | ${duration} |

${String(s.desc ?? '').trim()}
${s.higher_level ? `\n**At Higher Levels.** ${String(s.higher_level).trim()}\n` : ''}`
}

/** One spell as an article, mirroring the app's own spell template. */
function spellArticle(s) {
  const level = s.level_int ?? 0
  const levelLabel = level === 0 ? 'Cantrip' : `Level ${level}`
  return `---
type: spell
level: ${level}
school: ${String(s.school ?? '').toLowerCase()}
classes: ${s.dnd_class ?? ''}
---

# ${s.name}

*${levelLabel} ${String(s.school ?? '').toLowerCase()}${s.ritual === 'yes' ? ' (ritual)' : ''}*

| | |
| --- | --- |
| **Casting Time** | ${s.casting_time ?? '—'} |
| **Range** | ${s.range ?? '—'} |
| **Components** | ${s.components ?? '—'}${s.material ? ` (${s.material})` : ''} |
| **Duration** | ${s.concentration === 'yes' ? 'Concentration, ' : ''}${s.duration ?? '—'} |

${String(s.desc ?? '').trim()}
${s.higher_level ? `\n**At Higher Levels.** ${String(s.higher_level).trim()}\n` : ''}`
}

// ---------------------------------------------------------------------------

const selected = only ? EDITIONS.filter((e) => e.id === only) : EDITIONS
if (selected.length === 0) {
  console.error(
    `Unknown --only "${only}". Valid: ${EDITIONS.map((e) => e.id).join(', ')}`,
  )
  process.exit(1)
}

// Guard against the easy mistake: choosing a fixture folder as the library
// itself. The app would scaffold Monsters/ and Spells/ *inside* the source, and
// the next import would then copy those back in — inflating the count and
// making the importer look buggy when it isn't. Ask for a reseed instead.
for (const edition of selected) {
  for (const [label, dir] of [
    ['bestiary', edition.bestiary],
    ['spells', edition.spells],
  ]) {
    if (fs.existsSync(path.join(dir, 'worldSettings.json'))) {
      console.error(
        `\n${dir}\nhas been used as the global library itself (it contains worldSettings.json).\n` +
          `Point the library at a different folder, delete this one, and re-run.\n` +
          `Seeding would otherwise mix imported copies back into the ${label} source.\n`,
      )
      process.exit(1)
    }
  }
}

console.log('Seeding DungeonMaster SRD folders...')

const report = []

for (const edition of selected) {
  const isV2 = edition.id === '5.5e'
  const [creatures, spellList] = await Promise.all([
    fetchAll(edition, edition.creatures),
    fetchAll(edition, 'spells'),
  ])

  // --- bestiary ------------------------------------------------------------
  fs.rmSync(edition.bestiary, { recursive: true, force: true })

  let monsterCount = 0
  const usedMonsters = new Set()
  for (const m of creatures) {
    const title = safeTitle(m.name)
    if (!title) continue
    // Flat, and suffixed per edition so both can share one library folder.
    // The suffix is on the FILENAME only — the statblock `name:` stays clean,
    // so the panel row reads "Owlbear 5.5e" while the card header reads
    // "OWLBEAR".
    const rel = `${title}${edition.suffix}.md`
    if (usedMonsters.has(rel.toLowerCase())) continue
    usedMonsters.add(rel.toLowerCase())
    // Give one well-known creature a portrait to exercise the world:// path.
    const image = title === 'Owlbear' ? 'owlbear.png' : null
    write(
      edition.bestiary,
      rel,
      isV2 ? monsterArticle2(m, image) : monsterArticle(m, image),
    )
    monsterCount++
  }

  write(edition.bestiary, 'LICENSE.txt', attribution(edition))

  // Files the importer must skip — one edition carries them, which is enough
  // to exercise the reject paths.
  if (!clean && edition.withRejects) {
    // Dot-directory: skipped wholesale, never even reported.
    write(
      edition.bestiary,
      '.obsidian/workspace.json',
      JSON.stringify({ main: { id: 'fixture' } }, null, 2),
    )
    // nameError rejects '#' (it breaks wiki-links). Reported with a reason.
    write(
      edition.bestiary,
      'Goblin #2.md',
      '---\ntype: monster\n---\n\nA duplicate draft. This file should be skipped on import.\n',
    )
    // nameError rejects a leading dot. Reported with a reason.
    write(
      edition.bestiary,
      '.hidden-draft.md',
      '---\ntype: monster\n---\n\nAn unfinished draft. This file should be skipped on import.\n',
    )
  }

  // The Owlbear statblock references this, so dropping it would ship a broken
  // image. The importer walks *.md only, so it does NOT come across on import —
  // copy it into <library>/_images/ by hand to check the world:// path.
  fs.mkdirSync(path.join(edition.bestiary, '_images'), { recursive: true })
  fs.writeFileSync(
    path.join(edition.bestiary, '_images', 'owlbear.png'),
    Buffer.from(PNG_BASE64, 'base64'),
  )

  // --- spells --------------------------------------------------------------
  fs.rmSync(edition.spells, { recursive: true, force: true })

  let spellCount = 0
  const usedSpells = new Set()
  for (const s of spellList) {
    const title = safeTitle(s.name)
    if (!title) continue
    const rel = `${title}${edition.suffix}.md`
    if (usedSpells.has(rel.toLowerCase())) continue
    usedSpells.add(rel.toLowerCase())
    write(edition.spells, rel, isV2 ? spellArticle2(s) : spellArticle(s))
    spellCount++
  }

  write(edition.spells, 'LICENSE.txt', attribution(edition))

  const rejects = !clean && edition.withRejects ? 2 : 0
  report.push({ edition, monsterCount, spellCount, rejects })
}

console.log(`\nSeeded${clean ? ' [--clean]' : ''} — flat folders, ready to zip:\n`)
for (const r of report) {
  console.log(`  ${r.edition.label}${r.edition.suffix ? `   files suffixed "${r.edition.suffix.trim()}"` : ''}`)
  console.log(`    ${r.edition.bestiary}`)
  console.log(`      ${r.monsterCount} monsters` + (r.rejects ? `  + ${r.rejects} reject fixtures` : ''))
  console.log(`    ${r.edition.spells}`)
  console.log(`      ${r.spellCount} spells`)
  console.log(
    `    expected import:  ${r.monsterCount} copied / ${r.rejects} skipped` +
      `    ${r.spellCount} copied / 0 skipped\n`,
  )
}
console.log(`CR and spell level live in each file's frontmatter, so nothing is lost by
flattening — the app groups on frontmatter, not folders.

Importing both editions is safe: 5.5e filenames carry the suffix, so nothing
collides, and each row is labelled in the panel.
${clean ? '' : '\nRe-run with --clean for distributable folders (SRD content only).\n'}`)
