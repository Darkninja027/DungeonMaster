import { createFileRoute } from '@tanstack/react-router'
import { GuestTable } from '#/components/guest/GuestTable'

/**
 * Join someone else's table over the LAN.
 *
 * A top-level sibling of `worlds/` for the same reason `player/` and `popout/`
 * are: WorldLayout's chrome, watcher and search index must never mount here.
 * More fundamentally, a guest has NO world folder — worldRoot() throws on a
 * world id that names a directory this machine does not have — so every route
 * under worlds/$worldId is unusable here by construction. A guest renders
 * purely from what the host pushes.
 */
export const Route = createFileRoute('/join/')({
  component: JoinPage,
})

function JoinPage() {
  return <GuestTable />
}
