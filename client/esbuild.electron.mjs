import esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: watch ? 'inline' : false,
}

const builds = [
  esbuild.context({
    ...common,
    entryPoints: ['electron/main/index.ts'],
    // .cjs because package.json is "type": "module"
    outfile: 'dist-electron/main/index.cjs',
  }),
  esbuild.context({
    ...common,
    entryPoints: ['electron/preload/index.ts'],
    outfile: 'dist-electron/preload/index.cjs',
  }),
]

const contexts = await Promise.all(builds)

if (watch) {
  await Promise.all(contexts.map((c) => c.watch()))
  console.log('[esbuild] watching electron main + preload...')
} else {
  await Promise.all(contexts.map((c) => c.rebuild()))
  await Promise.all(contexts.map((c) => c.dispose()))
  console.log('[esbuild] built electron main + preload')
}
