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

export function parseStatBlock(content: string): StatBlock {
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
