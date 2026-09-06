/**
 * What the renderer needs to say about a remote address.
 *
 * Pure and covered, the same split table.ts follows on the main side. These
 * duplicate two small predicates that also exist in electron/main/table.ts, and
 * that is deliberate: main and the renderer share no module graph, and the
 * alternative — an IPC round trip to classify a string the renderer is already
 * holding — costs more than forty lines of arithmetic. The main-side copy is
 * the one that gates access; this one only decides what to render.
 */

/** The CGNAT range Tailscale allocates from (100.64.0.0/10). */
export function isTailscaleAddress(raw: string): boolean {
  const parts = raw.trim().split('.')
  if (parts.length !== 4) return false
  const n = parts.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : Number.NaN))
  if (n.some((x) => Number.isNaN(x) || x > 255)) return false
  return n[0] === 100 && n[1] >= 64 && n[1] <= 127
}

/** Whether a hostname is on this machine or a private network. */
export function isPrivateHost(host: string): boolean {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  if (!h) return false
  if (h === 'localhost' || h.endsWith('.local')) return true
  if (h === '::1') return true
  if (h.includes(':')) return /^f[cd][0-9a-f]{0,2}:/.test(h)
  const parts = h.split('.')
  if (parts.length !== 4) return false
  const n = parts.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : Number.NaN))
  if (n.some((x) => Number.isNaN(x) || x > 255)) return false
  const [a, b] = n
  if (a === 10 || a === 127) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  return a === 100 && b >= 64 && b <= 127
}

/**
 * The warning to show beside a configured remote address, or null if there is
 * nothing to say.
 *
 * There is no way to make plain http over the open internet safe, so the honest
 * thing is to say so where the DM is looking rather than bury it in a docs
 * page. Suppressed for https, which is encrypted, and for a Tailscale or
 * private address, which is encrypted at the network layer — warning about
 * those would train people to ignore the warning that matters.
 */
export function remoteWarning(origin: string): string | null {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return 'That address does not look right — check it in Settings, Table.'
  }
  if (url.protocol === 'https:') return null
  if (isPrivateHost(url.hostname)) return null
  return 'This connection is not encrypted. Anyone between you and your players can read what you show them. Tailscale fixes this.'
}
