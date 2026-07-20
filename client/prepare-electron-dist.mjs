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

/**
 * Remove a leftover build directory, working around corporate antivirus that
 * holds a previous build's app.asar open (EBUSY). We retry a few times to let a
 * transient scan finish, and if the lock persists we rename the directory aside
 * so electron-builder can write a fresh one without ever touching the locked
 * file. Stale `.old-*` dirs are cleaned up on the next run once AV lets go.
 */
function removeStaleBuildDir(dir) {
  if (!fs.existsSync(dir)) return

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      return
    } catch (err) {
      if (err.code !== 'EBUSY' && err.code !== 'EPERM') throw err
      // Busy-wait briefly (sync, since this script is sync) before retrying.
      const until = Date.now() + 1000
      while (Date.now() < until) {
        /* wait for AV to release the handle */
      }
    }
  }

  // Still locked — get it out of the way so the fresh build can proceed.
  const aside = `${dir}.old-${process.pid}`
  try {
    fs.renameSync(dir, aside)
    console.warn(
      `[prepare-electron-dist] ${path.basename(dir)} is locked (antivirus); ` +
        `renamed to ${path.basename(aside)} so the build can continue`,
    )
  } catch {
    throw new Error(
      `[prepare-electron-dist] could not remove or rename ${dir} — a previous ` +
        `build's app.asar is locked (likely antivirus). Close any running app, ` +
        `delete the release folder manually, or reboot, then retry.`,
    )
  }
}

// Clear leftover build output from prior builds (and any `.old-*` dirs the
// antivirus has since released) before electron-builder packages a new one.
// Must match `directories.output` in electron-builder.yml.
const releaseDir = path.resolve('dist-release')
removeStaleBuildDir(path.join(releaseDir, 'win-unpacked'))
if (fs.existsSync(releaseDir)) {
  for (const entry of fs.readdirSync(releaseDir)) {
    if (entry.startsWith('win-unpacked.old-')) {
      fs.rmSync(path.join(releaseDir, entry), { recursive: true, force: true })
    }
  }
}

fs.rmSync(out, { recursive: true, force: true })
fs.cpSync(src, out, { recursive: true })
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true })
console.log(`[prepare-electron-dist] ready: ${out}`)
