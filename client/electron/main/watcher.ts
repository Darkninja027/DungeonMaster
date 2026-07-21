import fs from 'node:fs'
import path from 'node:path'

/**
 * Watches the open world folder for EXTERNAL changes (Obsidian, git, Dropbox…)
 * and emits debounced change batches. Electron-free by design — the emit
 * function is injected by ipc.ts — so this module unit-tests under plain node.
 *
 * Echo suppression: every write the app itself makes is announced via
 * noteSelfWrite() first; watcher events for those paths (per-path, short TTL)
 * are dropped so the renderer never refetches its own saves.
 */

export interface ChangeBatch {
  worldId: string
  /** World-relative ids (no .md) of articles that changed. */
  articleIds: Array<string>
  /** A folder or file appeared/vanished/renamed — the tree shape may differ. */
  treeChanged: boolean
  imagesChanged: boolean
}

const DEBOUNCE_MS = 300
const SELF_WRITE_TTL_MS = 2000

interface ActiveWatch {
  root: string
  worldId: string
  watcher: fs.FSWatcher
  emit: (batch: ChangeBatch) => void
  pending: ChangeBatch | null
  timer: ReturnType<typeof setTimeout> | null
}

let active: ActiveWatch | null = null

/** Lowercased absolute path -> suppression expiry. */
const selfWrites = new Map<string, number>()

/** Call before/after every write the app itself makes. */
export function noteSelfWrite(absPath: string): void {
  selfWrites.set(absPath.toLowerCase(), Date.now() + SELF_WRITE_TTL_MS)
  // Keep the ledger from growing unboundedly during long sessions.
  if (selfWrites.size > 512) {
    const now = Date.now()
    for (const [key, expiry] of selfWrites)
      if (expiry < now) selfWrites.delete(key)
  }
}

function isSelfWrite(abs: string): boolean {
  const expiry = selfWrites.get(abs.toLowerCase())
  return expiry !== undefined && expiry >= Date.now()
}

function classify(watch: ActiveWatch, relPath: string): void {
  const rel = relPath.split(path.sep).join('/')
  const base = rel.split('/').pop() ?? rel
  // Atomic-write temp files and dotfiles (.dm/session.json…) are never
  // user-visible content.
  if (base.startsWith('.') || rel.split('/').some((seg) => seg.startsWith('.')))
    return
  if (/\.tmp-\d+$/.test(base)) return
  if (isSelfWrite(path.join(watch.root, relPath))) return

  const batch = (watch.pending ??= {
    worldId: watch.worldId,
    articleIds: [],
    treeChanged: false,
    imagesChanged: false,
  })
  if (rel === '_images' || rel.startsWith('_images/')) {
    batch.imagesChanged = true
  } else if (rel.toLowerCase().endsWith('.md')) {
    const id = rel.slice(0, -3)
    if (!batch.articleIds.includes(id)) batch.articleIds.push(id)
    // A .md event may be a create/delete/rename — the tree may have changed.
    batch.treeChanged = true
  } else {
    // Directories (and anything else) can reshape the tree.
    batch.treeChanged = true
  }

  if (watch.timer) clearTimeout(watch.timer)
  watch.timer = setTimeout(() => flush(watch), DEBOUNCE_MS)
}

function flush(watch: ActiveWatch): void {
  watch.timer = null
  const batch = watch.pending
  watch.pending = null
  if (batch) watch.emit(batch)
}

export function startWatching(
  root: string,
  worldId: string,
  emit: (batch: ChangeBatch) => void,
): void {
  stopWatching()
  let watcher: fs.FSWatcher
  try {
    watcher = fs.watch(root, { recursive: true })
  } catch {
    return // recursive fs.watch unsupported (e.g. Linux) — degrade to no watching
  }
  const watch: ActiveWatch = {
    root,
    worldId,
    watcher,
    emit,
    pending: null,
    timer: null,
  }
  watcher.on('change', (_event, relPath) => {
    if (typeof relPath === 'string' && relPath.length > 0)
      classify(watch, relPath)
  })
  watcher.on('error', () => {
    // The world folder itself vanished or became unreadable; tell the
    // renderer to refetch (its queries will surface the error state).
    if (active === watch) {
      stopWatching()
      emit({ worldId, articleIds: [], treeChanged: true, imagesChanged: false })
    }
  })
  active = watch
}

export function stopWatching(): void {
  if (!active) return
  if (active.timer) clearTimeout(active.timer)
  active.watcher.close()
  active = null
}
