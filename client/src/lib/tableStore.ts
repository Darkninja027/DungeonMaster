import { useSyncExternalStore } from 'react'
import { api } from './api'
import { mergeRoll } from './rollLog'
import type { Seat, TableInfo } from './api'
import type { RollEntry } from './rollLog'

/**
 * The DM side of a hosted LAN session: is a table running, on what code and
 * address, and who is sitting at it.
 *
 * Module-level store + useSyncExternalStore, the same idiom as sessionStore and
 * rollLog. Nothing here is persisted: a table lasts as long as the app is
 * hosting, and a room code that outlived a restart would be a code the server
 * no longer honours.
 *
 * "Seat" rather than "player" throughout — see lib/worldMode.ts and
 * lib/api.ts, where that word already means two other things.
 */

export interface TableStatus {
  hosting: boolean
  info: TableInfo | null
}

let status: TableStatus = { hosting: false, info: null }
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function setStatus(next: TableStatus) {
  status = next
  notify()
}

/** Whether the IPC bridge exists — false in unit tests. */
const bridged = () => typeof window !== 'undefined' && Boolean(window.dmApi)

export async function startHosting(worldId: string): Promise<TableInfo> {
  const info = await api.table.host(worldId)
  setStatus({ hosting: true, info })
  return info
}

/**
 * Let a waiting remote guest in, or turn them away.
 *
 * The seat is minted in main, not here: the renderer only names the ticket, so
 * a compromised or buggy window cannot invent a seat.
 */
export async function answerJoin(
  ticket: string,
  approve: boolean,
): Promise<void> {
  await api.table.approve(ticket, approve)
  await refreshTable()
}

/** Take whatever is on the table down. */
export async function clearShown(): Promise<void> {
  await api.table.clear()
}

export async function stopHosting(): Promise<void> {
  await api.table.stop()
  setStatus({ hosting: false, info: null })
}

/**
 * Re-read the host's own view of the table. Called on mount so a window opened
 * after hosting began still shows the code — the same replay-on-load bargain
 * lastUpdateStatus makes in electron/main/index.ts.
 */
export async function refreshTable(): Promise<void> {
  if (!bridged()) return
  try {
    const info = await api.table.info()
    setStatus({ hosting: info !== null, info })
  } catch {
    // Not hosting, or main is not ready. Either way the panel shows "offline".
  }
}

export function useTable(): TableStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => status,
  )
}

export function useSeats(): Array<Seat> {
  return useTable().info?.seats ?? []
}

if (bridged()) {
  // Seats change when a guest joins, leaves or claims a character. The payload
  // carries no port or addresses, so the existing ones are kept.
  api.table.onSeats((next) => {
    setStatus({
      hosting: true,
      info: status.info
        ? {
            ...status.info,
            code: next.code,
            seats: next.seats,
            shown: next.shown,
          }
        : null,
    })
  })

  // Someone remote is waiting to be let in. The payload is the whole queue
  // rather than a delta, so a window that missed an earlier push still shows
  // the right list.
  api.table.onJoinRequest((waiting) => {
    setStatus({
      hosting: status.hosting,
      info: status.info ? { ...status.info, waiting } : null,
    })
  })

  // A guest's roll is a roll like any other: it goes in the same shared log the
  // DM's own rolls do. mergeRoll rather than logRoll, or the host would
  // re-broadcast a roll back to the table it just came from.
  api.table.onRoll((entry: RollEntry) => mergeRoll(entry))
}
