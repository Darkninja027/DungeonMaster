import { protocol } from 'electron'

// world://<worldKey>/_images/<file> — scoped, read-only access to world images.
// Must be registered before app ready.
export function registerWorldProtocol() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'world',
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
    },
  ])
}

// Called after app ready.
export function handleWorldProtocol() {
  protocol.handle('world', () => new Response('Not found', { status: 404 }))
}
