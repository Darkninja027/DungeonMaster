import { execFile } from 'node:child_process'
import log from 'electron-log'

/**
 * Windows Firewall rules for LAN hosting.
 *
 * WHY THIS EXISTS. The HTTP server binds every interface correctly and the
 * beacon shouts on every real adapter, and a guest still cannot connect if
 * Windows is dropping the inbound packets. Nothing in this repo ever created a
 * rule: the installer is `oneClick` and per-user, so it never had the elevation
 * to add one, and the app relied entirely on the DM happening to click "Allow"
 * on the Windows prompt. Deny it once — or be on a managed machine that denies
 * it by policy — and a block rule persists silently forever.
 *
 * That failure is invisible from the DM's own machine, because loopback is
 * exempt from the firewall. Hosting and joining yourself works perfectly while
 * every other machine times out.
 *
 * THE ONLY PRIVILEGED OPERATION IS ADDING THE RULE. Checking is an ordinary
 * read that needs no elevation, so the panel can always tell the DM where they
 * stand; `ensure` is the one call that raises UAC, and the user can refuse it.
 * It therefore reports what happened rather than assuming success — a button
 * that lies about having fixed something is worse than no button.
 *
 * SCOPE. `profile=private` only. A table is a LAN affordance and this must
 * never punch a hole on a public network. Adding a rule is also idempotent
 * here: `ensure` removes any rule of the same name first, so repeated clicks
 * cannot pile up duplicates.
 */

/** Rule names. Stable — `ensure` deletes by name before adding. */
const TCP_RULE = 'DungeonMaster LAN'
const UDP_RULE = 'DungeonMaster LAN Discovery'

/** The beacon's fixed discovery port; mirrors PORT in beacon.ts. */
const BEACON_PORT = 7778

export interface FirewallState {
  /** False on any non-Windows platform, where there is nothing to do. */
  applicable: boolean
  /** Whether both rules were found. Null when the check itself failed. */
  present: boolean | null
  /** Why the check could not answer, when present is null. */
  error?: string
}

export interface FirewallResult {
  ok: boolean
  /** True when the user dismissed the UAC prompt — not an error to shout about. */
  cancelled: boolean
  message: string
}

function run(
  file: string,
  args: Array<string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout: 20_000 },
      (err, stdout, stderr) => {
        const raw = (err as { code?: unknown } | null)?.code
        const code = typeof raw === 'number' ? raw : err ? 1 : 0
        resolve({ code, stdout: String(stdout), stderr: String(stderr) })
      },
    )
  })
}

/** Whether one named rule exists. Read-only; no elevation required. */
async function hasRule(name: string): Promise<boolean> {
  const { code, stdout } = await run('netsh', [
    'advfirewall',
    'firewall',
    'show',
    'rule',
    `name=${name}`,
  ])
  // netsh exits non-zero and prints "No rules match the specified criteria."
  if (code !== 0) return false
  return !/no rules match/i.test(stdout)
}

/**
 * Whether the inbound rules are in place.
 *
 * Deliberately distinguishes "absent" from "could not tell": netsh may be
 * missing or restricted, and reporting a confident "not configured" in that
 * case would send the DM chasing a problem they may not have.
 */
export async function firewallState(): Promise<FirewallState> {
  if (process.platform !== 'win32') {
    return { applicable: false, present: null }
  }
  try {
    const [tcp, udp] = await Promise.all([
      hasRule(TCP_RULE),
      hasRule(UDP_RULE),
    ])
    return { applicable: true, present: tcp && udp }
  } catch (err) {
    return {
      applicable: true,
      present: null,
      error: err instanceof Error ? err.message : 'could not check',
    }
  }
}

/** The netsh commands, for a DM who would rather paste them themselves. */
export function firewallCommands(port: number): Array<string> {
  const tcp =
    `netsh advfirewall firewall add rule name="${TCP_RULE}" ` +
    `dir=in action=allow protocol=TCP localport=${port} profile=private`
  const udp =
    `netsh advfirewall firewall add rule name="${UDP_RULE}" ` +
    `dir=in action=allow protocol=UDP localport=${BEACON_PORT} profile=private`
  return [tcp, udp]
}

/**
 * Add the inbound rules, raising one UAC prompt.
 *
 * Elevation goes through PowerShell's `Start-Process -Verb RunAs`, which is the
 * only way to elevate from a non-elevated process on Windows. Both rules are
 * added by a single elevated shell so the DM sees ONE prompt rather than four.
 *
 * A cancelled prompt surfaces as exit code 1 with "canceled by the user" on
 * stderr, and is reported as cancellation rather than failure: the DM chose
 * that, and the panel still has the copy-and-paste commands to offer.
 */
export async function ensureFirewall(port: number): Promise<FirewallResult> {
  if (process.platform !== 'win32') {
    return {
      ok: true,
      cancelled: false,
      message: 'No firewall changes are needed on this platform.',
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, cancelled: false, message: 'Invalid port.' }
  }

  // Delete-then-add keeps repeated clicks idempotent. `delete` on a missing
  // rule is a harmless non-zero exit, so every statement is chained with ';'
  // rather than '&&'.
  const inner = [
    `netsh advfirewall firewall delete rule name='${TCP_RULE}'`,
    `netsh advfirewall firewall delete rule name='${UDP_RULE}'`,
    `netsh advfirewall firewall add rule name='${TCP_RULE}' dir=in action=allow protocol=TCP localport=${port} profile=private`,
    `netsh advfirewall firewall add rule name='${UDP_RULE}' dir=in action=allow protocol=UDP localport=${BEACON_PORT} profile=private`,
  ].join('; ')

  // -Wait so this resolves only once the elevated shell has finished, and the
  // state check below reflects reality rather than a race.
  const script =
    `Start-Process -FilePath powershell -Verb RunAs -Wait -WindowStyle Hidden ` +
    `-ArgumentList '-NoProfile','-NonInteractive','-Command',"${inner}"`

  const { code, stderr } = await run('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ])

  if (code !== 0) {
    const cancelled = /canceled by the user|cancelled by the user/i.test(stderr)
    log.warn(`[firewall] elevation failed (code ${code}): ${stderr.trim()}`)
    return {
      cancelled,
      ok: false,
      message: cancelled
        ? 'The Windows permission prompt was dismissed, so nothing changed.'
        : 'Could not add the firewall rules. You can run the commands yourself instead.',
    }
  }

  // Trust the check, not the exit code: the elevated shell can succeed while
  // netsh inside it refuses.
  const state = await firewallState()
  if (state.present === false) {
    log.warn('[firewall] elevated command ran but the rules are still absent')
    return {
      ok: false,
      cancelled: false,
      message:
        'The rules did not stick — your machine may be managed by IT policy.',
    }
  }
  log.info(`[firewall] inbound rules added for TCP ${port} and UDP ${BEACON_PORT}`)
  return {
    ok: true,
    cancelled: false,
    message: 'Windows will now let your players reach this table.',
  }
}
