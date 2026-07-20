/**
 * Copy node_modules/electron/dist to .electron-dist without default_app.asar.
 *
 * electron-builder normally extracts Electron and then unlinks
 * default_app.asar — corporate antivirus holds fresh .asar files open, which
 * makes that unlink fail (EBUSY). Handing electron-builder a pre-cleaned
 * dist via `electronDist` sidesteps the unlink entirely.
 */
import fs from 'node:fs'
import path from 'node:path'

const src = path.resolve('node_modules/electron/dist')
const out = path.resolve('.electron-dist')

// Prune old build output. Corporate endpoint security (MDE) kernel-holds each
// freshly built app.asar — sometimes for hours — so deletes of past builds can
// fail with EBUSY/EPERM. Every build writes to its own unique directory (see
// build-installer.mjs), so a held leftover never blocks the next build: prune
// what we can, skip what's still held, and it gets collected on a later run.
const releaseDir = path.resolve('dist-release')
if (fs.existsSync(releaseDir)) {
  for (const entry of fs.readdirSync(releaseDir)) {
    try {
      fs.rmSync(path.join(releaseDir, entry), { recursive: true, force: true })
    } catch {
      console.warn(
        `[prepare-electron-dist] ${entry} still held by endpoint security — skipped`,
      )
    }
  }
}

fs.rmSync(out, { recursive: true, force: true })
fs.cpSync(src, out, { recursive: true })
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true })
console.log(`[prepare-electron-dist] ready: ${out}`)
