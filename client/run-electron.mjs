// Launch Electron for local dev.
//
// Some host environments (notably VS Code's integrated terminal) inject
// ELECTRON_RUN_AS_NODE=1 into the environment. That flag makes the Electron
// binary boot as a plain Node runtime, so require("electron") returns the npm
// launcher shim (a string) instead of the real API — and the main process
// crashes on `protocol.registerSchemesAsPrivileged` with
// "Cannot read properties of undefined". cross-env can only set the var to "",
// which Electron still treats as truthy, so we must DELETE it before spawning.
import { spawn } from 'node:child_process'
import electron from 'electron'

const env = { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:4280' }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electron, ['.'], { stdio: 'inherit', env })
child.on('close', (code) => process.exit(code ?? 1))
