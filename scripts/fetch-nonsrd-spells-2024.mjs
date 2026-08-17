/**
 * Fetches 2024-ruleset spell pages from dnd2024.wikidot.com for spells that
 * are NOT in the SRD 5.2 export, and writes them as DungeonMaster articles
 * with the same " 5.5e" filename suffix the SRD 5.2 seeder uses.
 *
 * The 2024 wiki differs from dnd5e.wikidot.com enough to need its own parser:
 *   - a "Source:" line (used here to skip non-PHB supplements by default)
 *   - "Level 5 Evocation (Artificer, Sorcerer, Wizard)" — level, school and
 *     classes on one line, rather than an italic subtitle plus a Spell Lists
 *     footer
 *   - plain "Casting Time:" labels rather than bolded ones
 *   - "Using a Higher-Level Spell Slot." rather than "At Higher Levels."
 *   - slugs spell an apostrophe as "-s-" (bigby-s-hand, not bigbys-hand), so
 *     this takes a name<TAB>slug file rather than deriving the URL
 *
 * ── Licensing ─────────────────────────────────────────────────────────────
 * These spells are NOT SRD content and are not CC-BY. They are Wizards of the
 * Coast's copyrighted material, reproduced for personal use with books you
 * own. Merging them into the SRD folder means that folder is no longer safe
 * to redistribute; a NOTICE.txt saying so is written alongside.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Run:  node scripts/fetch-nonsrd-spells-2024.mjs <name-slug-tsv> [out-dir]
 *       --all      include supplements, not just the Player's Handbook
 *       --resume   skip spells already written
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const cacheDir = path.join(here, '.cache', 'spells-2024')
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const tsvFile = positional[0]
const outDir =
  positional[1] ?? path.join(os.homedir(), 'Desktop', 'DM Spells 5.5e')
const resume = process.argv.includes('--resume')
const includeAll = process.argv.includes('--all')

if (!tsvFile) {
  console.error(
    'usage: node scripts/fetch-nonsrd-spells-2024.mjs <name-slug-tsv> [out-dir]',
  )
  process.exit(1)
}

/** Filename suffix, matching the SRD 5.2 seeder so both editions coexist. */
const SUFFIX = ' 5.5e'

const NOTICE = `SOME OF THE SPELLS IN THIS FOLDER ARE NOT SRD CONTENT.

Files whose frontmatter says "srd: false" are from the 2024 Player's
Handbook and later supplements, and remain the copyrighted material of
Wizards of the Coast LLC. They are reproduced here for personal use
with content you own.

The CC-BY licence in LICENSE.txt covers ONLY the SRD 5.2 spells (those
without "srd: false"). Because this folder now mixes the two, it is
NOT safe to redistribute as a whole.

Non-SRD text retrieved from dnd2024.wikidot.com.
`

function safeTitle(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\[\[|\]\]|#/g, '')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim()
}

async function fetchPage(slug) {
  const cache = path.join(cacheDir, `${slug}.html`)
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8')
  // http, not https: the site 301s https -> http and a fetch would loop.
  const res = await fetch(`http://dnd2024.wikidot.com/spell:${slug}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (DungeonMaster local import)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(cache, html)
  return html
}

const strip = (s) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<em>(.*?)<\/em>/gis, '*$1*')
    .replace(/<strong>(.*?)<\/strong>/gis, '**$1**')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const LEVEL_WORDS = {
  cantrip: 0, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4,
  '5th': 5, '6th': 6, '7th': 7, '8th': 8, '9th': 9,
}

function parseSpell(html, name) {
  const m = html.match(/<div id="page-content">([\s\S]*?)<div class="page-tags">/)
  const body = (m ? m[1] : html).split(/<script/i)[0]
  const text = strip(body)

  const line = (label) => {
    const re = new RegExp(`^\\s*\\*{0,2}${label}:?\\*{0,2}\\s*(.+)$`, 'im')
    const hit = text.match(re)
    return hit ? hit[1].trim() : null
  }

  const source = line('Source')

  // "Level 5 Evocation (Artificer, Sorcerer, Wizard)"
  // "Evocation Cantrip (Sorcerer, Wizard)"
  let level = null
  let school = ''
  let classes = ''
  const head =
    text.match(/^\s*\*{0,2}Level\s+(\d)\s+([A-Za-z]+)\s*(?:\(([^)]*)\))?/im) ??
    text.match(/^\s*\*{0,2}([A-Za-z]+)\s+Cantrip\s*(?:\(([^)]*)\))?/im)
  if (head) {
    if (head[0].toLowerCase().includes('cantrip')) {
      level = 0
      school = head[1].toLowerCase()
      classes = (head[2] ?? '').trim()
    } else {
      level = Number(head[1])
      school = head[2].toLowerCase()
      classes = (head[3] ?? '').trim()
    }
  }
  const ritual = /\britual\b/i.test(text.slice(0, 400))

  const castingTime = line('Casting Time') ?? '—'
  const range = line('Range') ?? '—'
  const components = line('Components') ?? '—'
  const duration = line('Duration') ?? '—'

  // Description is everything after the last header line.
  let desc = text
  for (const label of ['Duration', 'Components', 'Range', 'Casting Time']) {
    const re = new RegExp(`^\\s*\\*{0,2}${label}:?\\*{0,2}\\s*.+$`, 'im')
    const hit = text.match(re)
    if (hit) {
      desc = text.slice(hit.index + hit[0].length).trim()
      break
    }
  }

  // 2024 wording; the 2014 books said "At Higher Levels."
  let higher = null
  let main = desc
  const hl = desc.match(
    /\*{0,2}(?:Using a Higher-Level Spell Slot|At Higher Levels)\.?\*{0,2}\s*([\s\S]*)$/i,
  )
  if (hl) {
    higher = hl[1].trim()
    main = desc.slice(0, hl.index).trim()
  }

  const tidy = (s) =>
    s.replace(/^\s*\*\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()

  return {
    name,
    source,
    level,
    school,
    classes,
    ritual,
    castingTime,
    range,
    components,
    duration,
    desc: tidy(main),
    higher: higher ? tidy(higher) : null,
  }
}

function article(s) {
  const subtitle =
    s.level === 0
      ? `${s.school.charAt(0).toUpperCase()}${s.school.slice(1)} cantrip`
      : `Level ${s.level} ${s.school}`
  return `---
type: spell
level: ${s.level ?? 0}
school: ${s.school}
classes: ${s.classes}
srd: false
source: ${s.source ?? 'unknown'}
---

# ${s.name}

*${subtitle}${s.ritual ? ' (ritual)' : ''}*

| | |
| --- | --- |
| **Casting Time** | ${s.castingTime} |
| **Range** | ${s.range} |
| **Components** | ${s.components} |
| **Duration** | ${s.duration} |

${s.desc}
${s.higher ? `\n**Using a Higher-Level Spell Slot.** ${s.higher}\n` : ''}`
}

// ---------------------------------------------------------------------------

const rows = fs
  .readFileSync(tsvFile, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const [name, slug] = l.split('\t')
    return { name, slug }
  })

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'NOTICE.txt'), NOTICE)

let ok = 0
const failed = []
const skipped = []
const suspect = []

for (const [i, row] of rows.entries()) {
  const title = safeTitle(row.name) + SUFFIX
  const dest = path.join(outDir, `${title}.md`)
  if (resume && fs.existsSync(dest)) { ok++; continue }
  process.stdout.write(`  [${i + 1}/${rows.length}] ${row.name}${' '.repeat(30)}\r`)
  const cached = fs.existsSync(path.join(cacheDir, `${row.slug}.html`))
  try {
    const html = await fetchPage(row.slug)
    const spell = parseSpell(html, row.name)
    // The 2024 wiki also hosts later supplements (Forgotten Realms books,
    // UA). Default to the Player's Handbook so a run doesn't quietly pull in
    // material the user may not own.
    if (!includeAll && !/player'?s handbook/i.test(spell.source ?? '')) {
      skipped.push(`${row.name} — ${spell.source ?? 'no source line'}`)
      continue
    }
    if (spell.level === null || !spell.desc) {
      suspect.push(`${row.name} (level=${spell.level}, desc=${spell.desc.length})`)
    }
    fs.writeFileSync(dest, article(spell))
    ok++
  } catch (error) {
    failed.push(`${row.name}: ${error.message}`)
  }
  if (!cached) await new Promise((r) => setTimeout(r, 250))
}

console.log(`\n\nwrote ${ok}/${rows.length} into ${outDir}`)
if (skipped.length) {
  console.log(`\n${skipped.length} skipped (not Player's Handbook — use --all to include):`)
  for (const s of skipped.slice(0, 40)) console.log(`  ${s}`)
}
if (suspect.length) {
  console.log(`\n${suspect.length} parsed but look thin:`)
  for (const s of suspect.slice(0, 20)) console.log(`  ${s}`)
}
if (failed.length) {
  console.log(`\n${failed.length} failed:`)
  for (const f of failed.slice(0, 30)) console.log(`  ${f}`)
}
