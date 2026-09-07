// Launch TWO Electron instances against the dev server, so a LAN session can be
// tested on one machine: instance A hosts a table, instance B joins it.
//
// Two things make this work, and both are needed:
//
//   DM_ALLOW_SECOND_INSTANCE=1  — the app normally hands focus to the running
//     copy and quits (see electron/main/index.ts).
//   --user-data-dir             — a separate userData folder per instance.
//     Sharing one means both fight over config.json, the recents list and the
//     global library, which looks like data corruption rather than a test rig.
//
// The guest instance gets its own empty userData on purpose: a guest needs no
// world of its own, and starting from nothing is exactly what a player's first
// run looks like.
//
// Usage:  npm run dev:vite   (in one terminal)
//         node run-two.mjs   (in another)
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import electron from 'electron'

// The dev server may be bound to IPv6 loopback only (Vite on Windows often is:
// netstat shows [::1]:4280 and nothing on 127.0.0.1). Electron resolves
// "localhost" to IPv4 and then refuses the connection, so the URL is
// overridable and defaults to whichever loopback is actually listening.
const DEV_URL = process.env.DM_DEV_URL ?? 'http://localhost:4280'

const base = path.join(os.tmpdir(), 'dm-two')
fs.mkdirSync(base, { recursive: true })

const children = []

function launch(label, dirName) {
  const userData = path.join(base, dirName)
  fs.mkdirSync(userData, { recursive: true })

  const env = {
    ...process.env,
    VITE_DEV_SERVER_URL: DEV_URL,
    DM_ALLOW_SECOND_INSTANCE: '1',
  }
  // VS Code's terminal injects this; it makes Electron boot as plain Node and
  // the main process crashes on protocol registration. Same fix as
  // run-electron.mjs — cross-env cannot unset it, so delete it.
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawn(electron, ['.', `--user-data-dir=${userData}`], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const tag = (stream, prefix) => {
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      for (const line of chunk.split('\n')) {
        if (line.trim()) console.log(`[${label}${prefix}] ${line}`)
      }
    })
  }
  tag(child.stdout, '')
  tag(child.stderr, ':err')
  child.on('close', (code) => console.log(`[${label}] exited (${code})`))
  children.push(child)
  return child
}

console.log(`userData under ${base}`)
launch('DM', 'dm')
// Stagger so the two windows do not land exactly on top of each other, and so
// the logs interleave readably on startup.
setTimeout(() => launch('GUEST', 'guest'), 1500)

const stop = () => {
  for (const child of children) child.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
