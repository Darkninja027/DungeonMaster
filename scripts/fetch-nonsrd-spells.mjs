/**
 * Fetches spell pages from dnd5e.wikidot.com for spells that are NOT in the
 * SRD 5.1 export, and writes them as DungeonMaster spell articles.
 *
 * By default it writes straight into the SRD spell folder, so one import gets
 * you the complete list. Every file it writes carries `srd: false` in its
 * frontmatter, which is what tells the two sets apart once merged.
 *
 * ── Licensing ─────────────────────────────────────────────────────────────
 * Unlike the SRD content in seed-import-fixtures.mjs, these spells are NOT
 * released under CC-BY. They come from the Player's Handbook, Xanathar's
 * Guide, Tasha's Cauldron, Fizban's Treasury and Unearthed Arcana, and are
 * Wizards of the Coast's copyrighted material. This script is a personal-use
 * convenience for content you own.
 *
 * Merging them into the SRD folder means that folder is NO LONGER safe to
 * redistribute — the CC-BY licence covers only the 319 SRD spells. A
 * NOTICE.txt saying so is written alongside. To keep a publishable folder,
 * pass an explicit out-dir instead.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Run:  node scripts/fetch-nonsrd-spells.mjs <names-file>            (merge)
 *       node scripts/fetch-nonsrd-spells.mjs <names-file> <out-dir>  (separate)
 *       node scripts/fetch-nonsrd-spells.mjs <names-file> --resume
 *
 * Pages are cached under scripts/.cache/spells/ so re-runs cost nothing.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const cacheDir = path.join(here, '.cache', 'spells')
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const namesFile = positional[0]
// Default: merge into the SRD spell folder so a user imports once.
const outDir =
  positional[1] ?? path.join(os.homedir(), 'Desktop', 'DM Spells 5e')
const resume = process.argv.includes('--resume')

if (!namesFile) {
  console.error('usage: node scripts/fetch-nonsrd-spells.mjs <names-file> [out-dir]')
  process.exit(1)
}

const NOTICE = `SOME OF THE SPELLS IN THIS FOLDER ARE NOT SRD CONTENT.

Files whose frontmatter says "srd: false" are from the Player's
Handbook, Xanathar's Guide to Everything, Tasha's Cauldron of
Everything, Fizban's Treasury of Dragons and Unearthed Arcana, and
remain the copyrighted material of Wizards of the Coast LLC. They are
reproduced here for personal use with content you own.

The CC-BY licence in LICENSE.txt covers ONLY the SRD 5.1 spells (those
without "srd: false"). Because this folder now mixes the two, it is
NOT safe to redistribute as a whole.

Non-SRD text retrieved from dnd5e.wikidot.com.
`

/** nameError rejects these, so strip them the same way the SRD seeder does. */
function safeTitle(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\[\[|\]\]|#/g, '')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim()
}

/** "Bigby's Hand" -> "spell:bigbys-hand" */
function slugFor(name) {
  return (
    'spell:' +
    name
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  )
}

function cachePath(name) {
  return path.join(cacheDir, slugFor(name).replace('spell:', '') + '.html')
}

async function fetchPage(name) {
  const cache = cachePath(name)
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8')
  const url = `https://dnd5e.wikidot.com/${slugFor(name)}`
  const res = await fetch(url, {
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

const LEVELS = {
  cantrip: 0, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4,
  '5th': 5, '6th': 6, '7th': 7, '8th': 8, '9th': 9,
}

/**
 * Parse a wikidot spell page. The content sits in #page-content as a run of
 * <p> blocks: an italic "Level N school (ritual)" line, then bolded field
 * labels, then the description.
 */
function parseSpell(html, name) {
  const m = html.match(/<div id="page-content">([\s\S]*?)<div class="page-tags">/)
  // Cut at the first <script>: wikidot injects ad config after the spell text,
  // and stripping tags would otherwise leave raw JS in the description.
  const body = (m ? m[1] : html).split(/<script/i)[0]
  const text = strip(body)

  // Labels are bolded and end with either ":" or "." depending on the field
  // ("**Casting Time:** 1 action" vs "**Spell Lists.** Wizard").
  const field = (label) => {
    const re = new RegExp(`\\*\\*${label}[:.]?\\*\\*\\s*([^\\n]+)`, 'i')
    const hit = text.match(re)
    return hit ? hit[1].trim() : null
  }

  // "*3rd-level evocation*" / "*Evocation cantrip*" / "*1st-level (ritual)*"
  let level = null
  let school = null
  let ritual = /\(ritual\)/i.test(text)
  const lvl = text.match(/\*([^*\n]*?(?:cantrip|level)[^*\n]*)\*/i)
  if (lvl) {
    const line = lvl[1].toLowerCase()
    if (line.includes('cantrip')) {
      level = 0
      school = (line.match(/([a-z]+)\s+cantrip/) ?? [])[1] ?? null
    } else {
      const n = line.match(/(cantrip|1st|2nd|3rd|4th|5th|6th|7th|8th|9th)/)
      level = n ? LEVELS[n[1]] : null
      school = (line.match(/level\s+([a-z]+)/) ?? [])[1] ?? null
    }
  }

  const duration = field('Duration')
  const desc = (() => {
    // Everything after the last labelled field is the description.
    const labels = ['Casting Time', 'Range', 'Components', 'Duration']
    let idx = -1
    for (const l of labels) {
      const i = text.toLowerCase().lastIndexOf(`**${l.toLowerCase()}`)
      if (i > idx) idx = i
    }
    if (idx < 0) return text
    const after = text.slice(idx)
    const nl = after.indexOf('\n')
    return nl < 0 ? '' : after.slice(nl + 1).trim()
  })()

  const spellLists = field('Spell Lists') ?? field('Classes')

  // "Spell Lists." is wikidot's own trailing footer, not spell text — drop it
  // before splitting, or it ends up inside the At Higher Levels paragraph.
  // The trailing "*" lines are the remains of an <em> that wraps the footer
  // and, on many pages, the At Higher Levels paragraph too.
  const descNoFooter = desc
    .replace(/\n?\*?\*?\*Spell Lists[:.]?\*\*[^\n]*/i, '')
    .replace(/^\s*\*\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // "At Higher Levels." is conventionally the last paragraph.
  let higher = null
  let main = descNoFooter
  const hl = descNoFooter.match(/\*\*At Higher Levels\.?\*\*\s*\*?\s*([\s\S]*)$/i)
  if (hl) {
    higher = hl[1].replace(/^\*\s*/, '').replace(/\s*\*\s*$/, '').trim()
    main = descNoFooter.slice(0, hl.index).trim()
  }
  // Orphaned <em> markers can sit on either side of the split.
  const tidy = (s) =>
    s
      .replace(/^\s*\*\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  main = tidy(main)
  higher = higher ? tidy(higher) : null

  return {
    name,
    level,
    school: school ?? '',
    ritual,
    castingTime: field('Casting Time') ?? '—',
    range: field('Range') ?? '—',
    components: field('Components') ?? '—',
    duration: duration ?? '—',
    concentration: /concentration/i.test(duration ?? ''),
    // The label sits inside an <em> on some pages, so a leading "*" survives
    // the markdown conversion.
    classes: spellLists
      ? strip(spellLists).replace(/^[*\s]+/, '').replace(/\s+/g, ' ').trim()
      : '',
    desc: main,
    higher,
  }
}

function article(s) {
  // Matches the SRD seeder's wording: "Cantrip evocation" reads wrong, the
  // books say "Evocation cantrip".
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
${s.higher ? `\n**At Higher Levels.** ${s.higher}\n` : ''}`
}

// ---------------------------------------------------------------------------

const names = fs
  .readFileSync(namesFile, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'NOTICE.txt'), NOTICE)

let ok = 0
const failed = []
const suspect = []

for (const [i, name] of names.entries()) {
  const title = safeTitle(name)
  const dest = path.join(outDir, `${title}.md`)
  if (resume && fs.existsSync(dest)) { ok++; continue }
  process.stdout.write(`  [${i + 1}/${names.length}] ${name}${' '.repeat(30)}\r`)
  try {
    const html = await fetchPage(name)
    const spell = parseSpell(html, name)
    if (spell.level === null || !spell.desc) {
      suspect.push(`${name} (level=${spell.level}, desc=${spell.desc.length} chars)`)
    }
    fs.writeFileSync(dest, article(spell))
    ok++
  } catch (error) {
    failed.push(`${name}: ${error.message}`)
  }
  // Be polite to a fan wiki: only sleep on an actual network hit.
  if (!fs.existsSync(cachePath(name))) await new Promise((r) => setTimeout(r, 250))
}

console.log(`\n\nwrote ${ok}/${names.length} into ${outDir}`)
if (suspect.length) {
  console.log(`\n${suspect.length} parsed but look thin — check these:`)
  for (const s of suspect.slice(0, 20)) console.log(`  ${s}`)
}
if (failed.length) {
  console.log(`\n${failed.length} failed:`)
  for (const f of failed.slice(0, 30)) console.log(`  ${f}`)
}
