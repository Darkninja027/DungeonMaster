/**
 * The personal character vault: one folder holding characters that don't belong
 * to any campaign, so "make a character for someone else's game" doesn't start
 * with inventing a world to put it in.
 *
 * It *is* a world folder — same worldSettings.json marker — for the same reason
 * the global library is one: readTree, getArticle, the character routes and the
 * world:// image protocol then all work on it unchanged, keyed by
 * encodeWorldId(root). This module only has to find or create the folder.
 *
 * Unlike the library it *is* added to recents, because it is a place you open
 * and work in rather than reference material. The home screen lists it in its
 * own section instead, and filters it out of the worlds grid so it appears once.
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { encodeWorldId } from './sanitize'
import { initWorld, isWorldFolder } from './worldStore'
import { seedWorldSettingsWithMode } from './worldSettings'
import { addRecentWorld, readVaultRoot, writeVaultRoot } from './recents'

/** The folder name, under the user's Documents. */
export const VAULT_FOLDER = 'My Characters'

const VAULT_DESCRIPTION =
  'Characters that are not tied to a campaign world. Made by DungeonMaster, ' +
  'but an ordinary folder of markdown — move it, sync it, or open it in Obsidian.'

export interface VaultInfo {
  /** encodeWorldId(path) — usable anywhere the app takes a worldId. */
  worldId: string
  path: string
  /** False when the folder has been moved, deleted, or is on a drive that's away. */
  available: boolean
}

function defaultVaultPath(): string {
  // getPath('documents') is the localized Documents folder on Windows and macOS.
  return path.join(app.getPath('documents'), VAULT_FOLDER)
}

/**
 * Where the vault is, without creating anything. Null when there has never been
 * one — the home screen uses this to stay quiet until the feature is used.
 */
export function findVault(): VaultInfo | null {
  const root = readVaultRoot()
  if (!root) return null
  return {
    worldId: encodeWorldId(root),
    path: root,
    available: isWorldFolder(root),
  }
}

/**
 * The vault, creating it on first use.
 *
 * A recorded path that is no longer a world folder is *not* silently replaced:
 * the folder may be on a drive that's away, and quietly starting a second vault
 * would strand the characters in the first. The path is returned with
 * `available: false` so the UI can say so, exactly as the library does.
 */
export function ensureVault(): VaultInfo {
  const existing = findVault()
  if (existing) return existing

  const root = defaultVaultPath()
  // A folder already sitting there — an earlier vault whose config entry was
  // lost, or one the user made — is adopted rather than clobbered.
  if (!isWorldFolder(root)) {
    initWorld(root, VAULT_FOLDER, VAULT_DESCRIPTION)
    // Player mode, so the file states what the folder is — useful to anyone
    // reading it, and correct if the folder is ever opened as an ordinary world
    // (moved out of the vault slot, or opened by an older build).
    //
    // Not load-bearing: useWorldMode forces Player for the vault regardless, so
    // a failure here costs nothing. Non-fatal for the same reason
    // scaffoldSettings is — a vault that can't take the file still works.
    try {
      seedWorldSettingsWithMode(root, 'player')
    } catch {
      // read-only folder or a race with another window — the getter copes.
    }
  }
  writeVaultRoot(root)
  addRecentWorld(root)
  return { worldId: encodeWorldId(root), path: root, available: true }
}

/**
 * True when this path is the vault. The home screen filters the worlds grid
 * with it so the vault isn't listed twice.
 */
export function isVaultPath(absPath: string): boolean {
  const root = readVaultRoot()
  return root !== null && path.resolve(root) === path.resolve(absPath)
}

/** Kept for symmetry with the library; the vault is never seeded with content. */
export function vaultExists(): boolean {
  const root = readVaultRoot()
  return root !== null && fs.existsSync(root)
}
