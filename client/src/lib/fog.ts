/**
 * Fog of war as a packed bitmask over grid cells.
 *
 * One bit per cell, row-major, packed into bytes and base64'd for storage. The
 * encoding is not premature cleverness — it is what keeps a battlemap inside
 * `MAX_STATE_BYTES` (256 KB), and the margin is not close. Measured, as JSON
 * pretty-printed the way `writeWorldJson` stores it:
 *
 *   grid       boolean[][]   ["x,y"] keys   this
 *   100x100        104 KB          42 KB    1.6 KB
 *   200x200        416 KB         186 KB    6.5 KB
 *   300x300        934 KB         431 KB     15 KB
 *   500x500       2592 KB        1227 KB     41 KB
 *
 * So the obvious `boolean[][]` throws at 200x200 and a set of `"x,y"` keys
 * throws by 300x300, while this leaves room for the tokens beside it. That
 * ceiling is the reason fog is per *cell* rather than per pixel: a free-form
 * brush reveal has no such bound.
 *
 * Bit order is row-major from the top-left, MSB-first within each byte, so cell
 * (x, y) is bit `y * cols + x`. Out-of-range cells read as hidden and ignore
 * writes rather than throwing — a grid can be resized under a saved map, and
 * losing the fog is better than refusing to open the world.
 */

/** A fog layer: the grid it was painted on, plus one bit per cell. */
export interface Fog {
  cols: number
  rows: number
  /** Base64 of the packed bits. Empty string means nothing revealed. */
  mask: string
}

export function emptyFog(cols: number, rows: number): Fog {
  return { cols: Math.max(0, cols | 0), rows: Math.max(0, rows | 0), mask: '' }
}

function byteLength(cols: number, rows: number): number {
  return Math.ceil((cols * rows) / 8)
}

/**
 * Decode to a byte array of exactly the right length for the grid.
 *
 * A mask that is too short (an older, smaller grid) is padded with zeroes and a
 * too-long one is truncated, so a resized grid degrades to "less revealed"
 * rather than to an exception.
 */
function unpack(fog: Fog): Uint8Array {
  const need = byteLength(fog.cols, fog.rows)
  const out = new Uint8Array(need)
  if (!fog.mask) return out
  let raw: Uint8Array
  try {
    const bin = atob(fog.mask)
    raw = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) raw[i] = bin.charCodeAt(i)
  } catch {
    return out // hand-edited to something that is not base64
  }
  out.set(raw.subarray(0, need))
  return out
}

function pack(bytes: Uint8Array): string {
  // All-zero packs to the empty string so an untouched map stores nothing.
  if (bytes.every((b) => b === 0)) return ''
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function inRange(fog: Fog, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < fog.cols && y < fog.rows
}

/** True when the players have been shown this cell. */
export function isRevealed(fog: Fog, x: number, y: number): boolean {
  if (!inRange(fog, x, y)) return false
  const bit = y * fog.cols + x
  const byte = unpack(fog)[bit >> 3]
  return ((byte >> (7 - (bit & 7))) & 1) === 1
}

/**
 * Reveal or hide a run of cells, returning a new Fog.
 *
 * Takes a list rather than one cell because every real gesture is a run — a
 * drag across the map, or a whole room at once — and decoding the mask once per
 * cell would be the slow way to do it.
 */
export function setCells(
  fog: Fog,
  cells: Iterable<{ x: number; y: number }>,
  revealed: boolean,
): Fog {
  const bytes = unpack(fog)
  for (const { x, y } of cells) {
    if (!inRange(fog, x, y)) continue
    const bit = y * fog.cols + x
    const mask = 1 << (7 - (bit & 7))
    if (revealed) bytes[bit >> 3] |= mask
    else bytes[bit >> 3] &= ~mask
  }
  return { cols: fog.cols, rows: fog.rows, mask: pack(bytes) }
}

/** Reveal everything — "they walked in with a lantern". */
export function revealAll(fog: Fog): Fog {
  const bytes = new Uint8Array(byteLength(fog.cols, fog.rows)).fill(0xff)
  // Bits past the last cell stay set but are never read; clearing them would
  // only matter if the mask were compared byte-wise, which it is not.
  return { cols: fog.cols, rows: fog.rows, mask: pack(bytes) }
}

/** Hide everything again. */
export function hideAll(fog: Fog): Fog {
  return emptyFog(fog.cols, fog.rows)
}

export function revealedCount(fog: Fog): number {
  const bytes = unpack(fog)
  let n = 0
  for (let bit = 0; bit < fog.cols * fog.rows; bit += 1) {
    if ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1) n += 1
  }
  return n
}

/**
 * Re-fit a fog layer onto a different grid, keeping cells that still exist.
 *
 * Changing the grid size mid-session is an ordinary thing to do — the DM
 * eyeballed the squares and got it wrong — and throwing away every reveal for
 * it would be the kind of silent work-destroying the rest of this app avoids.
 */
export function resizeFog(fog: Fog, cols: number, rows: number): Fog {
  const next = emptyFog(cols, rows)
  if (!fog.mask) return next
  const keep: Array<{ x: number; y: number }> = []
  for (let y = 0; y < Math.min(rows, fog.rows); y += 1) {
    for (let x = 0; x < Math.min(cols, fog.cols); x += 1) {
      if (isRevealed(fog, x, y)) keep.push({ x, y })
    }
  }
  return setCells(next, keep, true)
}

/** Tolerant parse for whatever was on disk. */
export function parseFog(raw: unknown): Fog | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const cols =
    typeof r.cols === 'number' && Number.isFinite(r.cols)
      ? Math.max(0, Math.floor(r.cols))
      : 0
  const rows =
    typeof r.rows === 'number' && Number.isFinite(r.rows)
      ? Math.max(0, Math.floor(r.rows))
      : 0
  if (!cols || !rows) return null
  return { cols, rows, mask: typeof r.mask === 'string' ? r.mask : '' }
}
