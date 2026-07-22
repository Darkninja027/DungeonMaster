import { parse as parseYaml } from 'yaml'
import { abilityMod } from './character'
import { splitFrontmatter } from './formatMarkdown'

/**
 * Read combat-relevant numbers from a Monster/Creature article so the encounter
 * builder can push it into the initiative tracker. The Monster template
 * (templates.ts) standardizes the block this parses:
 *
 *   | Armor Class | 12 |
 *   | Hit Points | 22 (4d8 + 4) |
 *   | Challenge | 1 (200 XP) |
 *   | STR | DEX | CON | INT | WIS | CHA |
 *   | 10 (+0) | 14 (+2) | ... |
 *
 * Tolerant of hand edits (in the app or in Obsidian): a missing or unparseable
 * row yields null for that field — never a guess. Frontmatter (ac/hp/cr/xp/dex)
 * wins over prose, same convention as spellInfoFromContent in character.ts.
 */

export interface StatBlock {
  ac: number | null
  hp: number | null
  /** Challenge rating as written ("1", "1/2", "5"), for display. */
  cr: string | null
  xp: number | null
  /** DEX modifier, for rolling initiative. */
  dexMod: number | null
}

const CR_XP: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
}

/** XP for a challenge rating; null if the CR isn't on the 5e table. */
export function xpForCr(cr: string): number | null {
  const key = cr.replace(/\s+/g, '')
  return key in CR_XP ? CR_XP[key] : null
}

/** Extract the first integer from a cell like "22 (4d8 + 4)" or "17". */
function leadingInt(cell: string): number | null {
  const m = cell.match(/-?\d+/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/**
 * Find the DEX modifier from the six-ability table. The header row names the
 * abilities in order; the value row holds "14 (+2)" cells. Reads the explicit
 * "(+2)" when present, else derives it from the score.
 */
function parseDexMod(body: string): number | null {
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]
    if (!/\bSTR\b/i.test(header) || !/\bDEX\b/i.test(header)) continue
    const cols = header
      .split('|')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean)
    const dexCol = cols.indexOf('dex')
    if (dexCol < 0) continue
    // The value row is the next non-separator table row.
    for (let j = i + 1; j < lines.length; j++) {
      const row = lines[j]
      if (!row.includes('|')) break
      if (/^[\s|:-]+$/.test(row)) continue // separator row
      const cells = row
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
      const cell = cells[dexCol]
      if (!cell) return null
      const explicit = cell.match(/\(\s*([+-]?\d+)\s*\)/)
      if (explicit) return Number(explicit[1])
      const score = leadingInt(cell)
      return score != null ? abilityMod(score) : null
    }
  }
  return null
}

// --- Rendered stat-block card ----------------------------------------------

export const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type AbilityKey = (typeof ABILITY_ORDER)[number]

export interface StatBlockCard {
  name: string | null
  /** The italic line under the name: "Small humanoid, neutral evil". */
  subtitle: string | null
  /** Portrait image path (e.g. "_images/owlbear.png"), or null. */
  image: string | null
  /** #noframe on the image line — drop the border (for transparent PNGs). */
  imageNoFrame: boolean
  ac: string | null
  hp: string | null
  speed: string | null
  cr: string | null
  xp: number | null
  /** Ability scores 1–30 keyed by str…cha; null if that ability was omitted. */
  abilities: Record<AbilityKey, number | null>
  /** Extra one-line entries (Senses, Languages, Skills…) preserved in order. */
  extras: Array<{ label: string; value: string }>
  /** Free markdown after the fields (Traits/Actions); rendered with dice chips. */
  prose: string
}

/** Keys that map to dedicated card slots rather than the "extras" list. */
const CORE_KEYS = new Set([
  'name',
  'subtitle',
  'size',
  'type',
  'image',
  'ac',
  'hp',
  'speed',
  'cr',
  'xp',
  ...ABILITY_ORDER,
])

/**
 * Normalize whatever the author puts on the `image:` line to a plain path.
 * Accepts a bare path (_images/foo.png) or the markdown the image picker
 * inserts (![alt](_images/foo%20.png)); URL-decodes the path either way.
 */
export function extractImagePath(value: string): string {
  const md = value.match(/!\[[^\]]*\]\(([^)]+)\)/)
  const raw = (md ? md[1] : value).trim()
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** A score → "+2" style modifier string for display on the card. */
export function abilityModLabel(score: number): string {
  const mod = abilityMod(score)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

/**
 * Parse the body of a ```statblock fence into a card. The format is friendly
 * `key: value` lines (no fragile tables) with an optional `---` separator, after
 * which everything is free markdown prose:
 *
 *   name: Goblin
 *   size: Small humanoid, neutral evil
 *   ac: 15
 *   hp: 7 (2d6)
 *   str: 8
 *   dex: 14
 *   ---
 *   **Nimble Escape.** ...
 *
 * Tolerant: unknown keys become "extras", missing fields render as blank, and a
 * body with no fields at all just becomes prose. Never throws.
 */
export function parseStatBlockCard(fence: string): StatBlockCard {
  const card: StatBlockCard = {
    name: null,
    subtitle: null,
    image: null,
    imageNoFrame: false,
    ac: null,
    hp: null,
    speed: null,
    cr: null,
    xp: null,
    abilities: {
      str: null,
      dex: null,
      con: null,
      int: null,
      wis: null,
      cha: null,
    },
    extras: [],
    prose: '',
  }

  const lines = fence.replace(/\r\n/g, '\n').split('\n')
  const proseLines: Array<string> = []
  let inProse = false

  for (const line of lines) {
    if (inProse) {
      proseLines.push(line)
      continue
    }
    // An explicit "---" ends the field block; the rest is prose.
    if (line.trim() === '---') {
      inProse = true
      continue
    }
    const m = line.match(/^\s*([A-Za-z][\w ]*?)\s*:\s*(.*)$/)
    if (!m) {
      // First non-field line begins the prose section (keep it and the rest).
      inProse = true
      proseLines.push(line)
      continue
    }
    const key = m[1].trim().toLowerCase()
    const value = m[2].trim()
    if (!value) continue

    if (key === 'name') card.name = value
    else if (key === 'subtitle' || key === 'size' || key === 'type')
      card.subtitle = card.subtitle ? `${card.subtitle}, ${value}` : value
    else if (key === 'image') {
      // #noframe may sit inside the path or trail the whole value (markdown form
      // ![alt](path)#noframe) — check the raw value, then strip any hash options.
      if (/#[\w&,]*noframe/i.test(value)) card.imageNoFrame = true
      const path = extractImagePath(value)
      const hash = path.indexOf('#')
      card.image = hash >= 0 ? path.slice(0, hash) : path
    }
    else if (key === 'ac') card.ac = value
    else if (key === 'hp') card.hp = value
    else if (key === 'speed') card.speed = value
    else if (key === 'cr') {
      card.cr = value.match(/^\d+\/\d+|\d+/)?.[0] ?? value
      // XP from a written "(200 XP)" or the CR table.
      const written = value.match(/\(\s*([\d,]+)\s*XP/i)
      card.xp = written
        ? Number(written[1].replace(/,/g, ''))
        : (xpForCr(card.cr) ?? null)
    } else if ((ABILITY_ORDER as readonly string[]).includes(key)) {
      const n = leadingInt(value)
      if (n != null) card.abilities[key as AbilityKey] = n
    } else if (!CORE_KEYS.has(key)) {
      // Preserve the author's original capitalization for the label.
      card.extras.push({ label: m[1].trim(), value })
    }
  }

  card.prose = proseLines.join('\n').trim()
  return card
}

/** The contents of the first ```statblock fence in an article, or null. */
export function extractStatBlockFence(content: string): string | null {
  const m = content.match(/```statblock[^\n]*\n([\s\S]*?)```/i)
  return m ? m[1] : null
}

export function parseStatBlock(content: string): StatBlock {
  // Prefer the structured card fence if the article uses one — it's the
  // canonical monster format; the table parsing below is the legacy fallback.
  const fence = extractStatBlockFence(content)
  if (fence) {
    const card = parseStatBlockCard(fence)
    const dex = card.abilities.dex
    return {
      ac: leadingInt(card.ac ?? ''),
      hp: leadingInt(card.hp ?? ''),
      cr: card.cr,
      xp: card.xp,
      dexMod: dex != null ? abilityMod(dex) : null,
    }
  }

  const { frontmatter, body } = splitFrontmatter(content)

  const result: StatBlock = {
    ac: null,
    hp: null,
    cr: null,
    xp: null,
    dexMod: null,
  }

  // Frontmatter wins over prose.
  if (frontmatter != null) {
    try {
      const raw = parseYaml(frontmatter) as unknown
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        const r = raw as Record<string, unknown>
        if (typeof r.ac === 'number' && Number.isFinite(r.ac)) result.ac = r.ac
        if (typeof r.hp === 'number' && Number.isFinite(r.hp)) result.hp = r.hp
        if (r.cr != null && (typeof r.cr === 'string' || typeof r.cr === 'number'))
          result.cr = String(r.cr).trim()
        if (typeof r.xp === 'number' && Number.isFinite(r.xp)) result.xp = r.xp
        if (typeof r.dex === 'number' && Number.isFinite(r.dex))
          result.dexMod = abilityMod(r.dex)
      }
    } catch {
      // malformed frontmatter: fall through to prose parsing
    }
  }

  // Prose stat-block rows fill in whatever frontmatter didn't provide.
  if (result.ac == null) {
    const ac = body.match(/\|\s*Armou?r\s*Class\s*\|\s*([^|]+)\|/i)
    if (ac) result.ac = leadingInt(ac[1])
  }
  if (result.hp == null) {
    const hp = body.match(/\|\s*Hit\s*Points\s*\|\s*([^|]+)\|/i)
    if (hp) result.hp = leadingInt(hp[1])
  }
  if (result.cr == null) {
    // "Challenge | 1 (200 XP)" — capture the rating token (int or fraction).
    const cr = body.match(/\|\s*Challenge\s*\|\s*([^|]+)\|/i)
    if (cr) {
      const token = cr[1].trim().match(/^(\d+\/\d+|\d+)/)
      if (token) result.cr = token[1]
      // Prefer the parenthesized XP written next to the CR ("1 (200 XP)").
      if (result.xp == null) {
        const xp = cr[1].match(/\(\s*([\d,]+)\s*XP/i) ?? cr[1].match(/\(\s*([\d,]+)/)
        if (xp) {
          const n = Number(xp[1].replace(/,/g, ''))
          if (Number.isFinite(n)) result.xp = n
        }
      }
    }
  }
  // Fall back to the CR→XP table when XP wasn't written out.
  if (result.xp == null && result.cr != null) {
    result.xp = xpForCr(result.cr)
  }
  if (result.dexMod == null) {
    result.dexMod = parseDexMod(body)
  }

  return result
}
