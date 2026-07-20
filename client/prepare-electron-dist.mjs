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

fs.rmSync(out, { recursive: true, force: true })
fs.cpSync(src, out, { recursive: true })
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true })
console.log(`[prepare-electron-dist] ready: ${out}`)
