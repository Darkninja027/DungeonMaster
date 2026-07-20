/**
 * Run electron-builder with a unique per-build output directory.
 *
 * Corporate endpoint security (Defender for Endpoint) kernel-holds each fresh
 * app.asar/installer, sometimes for hours, so overwriting or cleaning the
 * previous build's output fails with EBUSY. Writing every build to its own
 * timestamped folder means no build ever touches a held file; stale folders
 * are pruned best-effort by prepare-electron-dist.mjs once they unlock.
 *
 * Usage: node build-installer.mjs [extra electron-builder args, e.g. --publish always]
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '_')
  .slice(0, 19)
const outDir = path.join('dist-release', `b-${stamp}`)

const args = [
  'electron-builder',
  `-c.directories.output=${outDir}`,
  ...process.argv.slice(2),
]

console.log(`[build-installer] output: ${outDir}`)
const result = spawnSync('npx', args, { stdio: 'inherit', shell: true })

if ((result.status ?? 1) === 0) {
  console.log(`\n[build-installer] artifacts in: ${path.resolve(outDir)}`)
}
process.exit(result.status ?? 1)
