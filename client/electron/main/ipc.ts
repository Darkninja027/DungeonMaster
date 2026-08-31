import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { addRecentWorld, readConfig, removeRecentWorld } from './recents'
import { ensureVault, findVault, isVaultPath } from './vault'
import {
  atomicWrite,
  countArticles,
  createArticle,
  createFolder,
  duplicateArticle,
  encodeWorldId,
  getArticle,
  initWorld,
  isWorldFolder,
  moveArticle,
  moveFolder,
  readTree,
  readWorldMeta,
  renameArticle,
  renameFolder,
  updateArticle,
  worldRoot,
  writeWorldMeta,
} from './worldStore'
import { GUIDE_CONTENT, GUIDE_FILENAME } from './guideArticle'
import type { WorldSummary } from './worldStore'
import {
  findMentions,
  listCharacters,
  listTags,
  queryArticles,
  searchRanked,
  searchWorld,
} from './search'
import type { ArticleQuery } from './search'
import {
  countImagesIn,
  createImageFolder,
  deleteImage,
  deleteImageFolder,
  listImageTree,
  moveImage,
  moveImageFolder,
  renameImage,
  renameImageFolder,
  revealImage,
  uploadImage,
} from './images'
import { readSession, readViews, writeSession, writeViews } from './session'
import {
  WORLD_SETTINGS_FILE,
  migrateWorldFolder,
  readWorldSettings,
  seedWorldSettings,
  writeWorldSettings,
} from './worldSettings'
import { readHomebrew, writeHomebrew } from './homebrew'
import { noteSelfWrite, startWatching, stopWatching } from './watcher'
import {
  closeAllPlayerWindows,
  closePlayerWindow,
  pushToPlayerWindow,
  showPlayerWindow,
} from './playerWindow'
import {
  buildIndex,
  dropIndex,
  noteDelete,
  noteWrite,
  refreshIndex,
} from './indexer'
import { nameError, resolveInWorld } from './sanitize'
import {
  clearLibrary,
  getLibrary,
  importMarkdownFolder,
  restoreBundledFolder,
  setLibrary,
} from './library'
import type { LibraryFolder } from './library'

function worldSummary(root: string): WorldSummary {
  return {
    id: encodeWorldId(root),
    ...readWorldMeta(root),
    articleCount: countArticles(root),
  }
}

/**
 * Give a freshly created or newly adopted world its settings file, so the folder
 * is complete before anyone opens it in Obsidian. Called here rather than from
 * initWorld to keep worldStore.ts from importing worldSettings.ts, which imports
 * it back for atomicWrite.
 *
 * Never fatal: a world the user can't write to still opens, and readWorldSettings
 * serves the seed from memory. Skipped if a file is already there — including a
 * corrupt one, which is a hand edit to preserve, not to clobber.
 */
function scaffoldSettings(root: string): void {
  try {
    if (fs.existsSync(path.join(root, WORLD_SETTINGS_FILE))) return
    seedWorldSettings(root)
  } catch {
    // read-only folder or a race with another window — the getter copes.
  }
}

/**
 * Drop the user guide into a brand-new world, so the first thing in an empty
 * world is something worth reading.
 *
 * Only for worlds this app creates: adopting an existing folder (an Obsidian
 * vault, say) must not scatter files into it, and a world that has been opened
 * before is the user's to curate — deleting the guide has to stick.
 *
 * Never fatal, like scaffoldSettings: a world that can't take the file is still
 * a perfectly good world. Skipped if a Guide.md is already there rather than
 * clobbering whatever the user has under that name.
 */
function scaffoldGuide(root: string): void {
  try {
    const abs = path.join(root, GUIDE_FILENAME)
    if (fs.existsSync(abs)) return
    atomicWrite(abs, GUIDE_CONTENT)
  } catch {
    // read-only folder or a race with another window — not worth failing over.
  }
}

/**
 * Fold a legacy world.json into worldSettings.json on open, sending the leftover
 * to the Recycle Bin like every other delete in this app. Cheap (an existsSync)
 * once a world has been migrated, so it's safe on every open — but deliberately
 * not called from worlds:list, which runs on every home-screen render and must
 * not write.
 */
function migrateWorld(root: string): void {
  migrateWorldFolder(root, (abs) => {
    void trash(abs)
  })
}

async function pickDirectory(title: string): Promise<string | null> {
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(win, {
    title,
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled || result.filePaths.length === 0
    ? null
    : result.filePaths[0]
}

async function trash(abs: string) {
  noteSelfWrite(abs)
  await shell.trashItem(abs)
}

export function registerIpcHandlers() {
  // Worlds ------------------------------------------------------------------
  // The vault is a real world and belongs in recents — reopening it from the
  // sidebar's world list should work — but the home screen gives it its own
  // section, so it is filtered out here to avoid listing it twice.
  ipcMain.handle('worlds:list', () =>
    readConfig()
      .recentWorlds.filter((p) => isWorldFolder(p) && !isVaultPath(p))
      .map(worldSummary),
  )

  ipcMain.handle('worlds:pickAndOpen', async () => {
    const dir = await pickDirectory('Open a world folder')
    if (!dir) return null
    // A plain folder becomes a world by dropping a worldSettings.json into it.
    if (!isWorldFolder(dir)) {
      initWorld(dir, path.basename(dir), '')
    }
    migrateWorld(dir)
    scaffoldSettings(dir)
    addRecentWorld(dir)
    return worldSummary(dir)
  })

  ipcMain.handle(
    'worlds:create',
    async (_e, input: { name: string; description?: string }) => {
      const error = nameError(input.name)
      if (error) throw new Error(error)
      const parent = await pickDirectory(
        'Choose where to create the world folder',
      )
      if (!parent) return null
      const dir = path.join(parent, input.name.trim())
      if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
        throw new Error(`"${dir}" already exists and is not empty.`)
      }
      initWorld(dir, input.name.trim(), input.description ?? '')
      scaffoldSettings(dir)
      scaffoldGuide(dir)
      addRecentWorld(dir)
      return worldSummary(dir)
    },
  )

  // Also a migration point: a world opened from recents never passes through
  // worlds:pickAndOpen.
  ipcMain.handle('worlds:get', (_e, { worldId }: { worldId: string }) => {
    const root = worldRoot(worldId)
    migrateWorld(root)
    return worldSummary(root)
  })

  ipcMain.handle(
    'worlds:update',
    (
      _e,
      {
        worldId,
        name,
        description,
      }: { worldId: string; name: string; description?: string },
    ) => {
      const root = worldRoot(worldId)
      const meta = readWorldMeta(root)
      writeWorldMeta(root, {
        ...meta,
        name: name.trim() || meta.name,
        description: description ?? '',
      })
    },
  )

  // Only forgets the world in the recents list — never touches the folder.
  ipcMain.handle('worlds:remove', (_e, { worldId }: { worldId: string }) => {
    removeRecentWorld(worldRoot(worldId))
  })

  ipcMain.handle('worlds:tree', (_e, { worldId }: { worldId: string }) =>
    readTree(worldRoot(worldId)),
  )

  ipcMain.handle(
    'worlds:search',
    (_e, { worldId, query }: { worldId: string; query: string }) =>
      searchWorld(worldId, query),
  )

  ipcMain.handle(
    'worlds:query',
    (_e, { worldId, query }: { worldId: string; query?: ArticleQuery }) =>
      queryArticles(worldId, query ?? {}),
  )

  // Ranked search for the command palette — scored and sorted before capping.
  ipcMain.handle(
    'worlds:searchRanked',
    (
      _e,
      {
        worldId,
        query,
        limit,
      }: { worldId: string; query: string; limit?: number },
    ) => searchRanked(worldId, query, limit),
  )

  ipcMain.handle('worlds:tags', (_e, { worldId }: { worldId: string }) =>
    listTags(worldId),
  )

  // Watch the open world for EXTERNAL edits (Obsidian, git, Dropbox…) and
  // push debounced change batches to the renderer. App writes are suppressed
  // via the self-write ledger in watcher.ts.
  ipcMain.handle('worlds:watch', (e, { worldId }: { worldId: string }) => {
    const sender = e.sender
    startWatching(worldRoot(worldId), worldId, (batch) => {
      // External edits invalidate the index before the renderer refetches.
      // Fire-and-forget: the batch is already pushed to the renderer, which
      // refetches; the rebuild just refreshes the search index in the
      // background and must not block the watcher callback.
      //
      // Only article changes can affect the index, so an images-only or
      // settings-only batch skips it — the index holds neither.
      if (batch.treeChanged || batch.articleIds.length > 0) {
        void refreshIndex(worldId)
      }
      if (!sender.isDestroyed()) sender.send('world:changed', batch)
    })
    return buildIndex(worldId)
  })

  ipcMain.handle('worlds:unwatch', () => {
    stopWatching()
    dropIndex()
  })

  // Folders -----------------------------------------------------------------
  ipcMain.handle(
    'folders:create',
    (
      _e,
      input: { worldId: string; parentFolderId?: string | null; name: string },
    ) => createFolder(input),
  )

  ipcMain.handle(
    'folders:rename',
    (
      _e,
      {
        worldId,
        folderId,
        name,
      }: { worldId: string; folderId: string; name: string },
    ) => {
      // Await: the rename queues behind any in-flight world mutation, and the
      // index must be rebuilt from the post-rename tree.
      return renameFolder(worldId, folderId, name).then(
        () => refreshIndex(worldId), // article ids under the folder changed
      )
    },
  )

  ipcMain.handle(
    'folders:move',
    (
      _e,
      {
        worldId,
        folderId,
        parentFolderId,
      }: { worldId: string; folderId: string; parentFolderId: string | null },
    ) => {
      return moveFolder(worldId, folderId, parentFolderId).then(() =>
        refreshIndex(worldId),
      )
    },
  )

  ipcMain.handle(
    'folders:delete',
    async (
      _e,
      { worldId, folderId }: { worldId: string; folderId: string },
    ) => {
      const abs = resolveInWorld(worldRoot(worldId), folderId)
      if (fs.existsSync(abs)) await trash(abs)
      await refreshIndex(worldId)
    },
  )

  // Articles ----------------------------------------------------------------
  ipcMain.handle(
    'articles:get',
    (_e, { worldId, articleId }: { worldId: string; articleId: string }) =>
      getArticle(worldId, articleId),
  )

  ipcMain.handle(
    'articles:create',
    (
      _e,
      input: {
        worldId: string
        folderId?: string | null
        title: string
        content?: string
      },
    ) => {
      const article = createArticle(input)
      noteWrite(article)
      return article
    },
  )

  ipcMain.handle(
    'articles:update',
    async (
      _e,
      {
        worldId,
        articleId,
        title,
        content,
      }: { worldId: string; articleId: string; title: string; content: string },
    ) => {
      const article = await updateArticle(worldId, articleId, {
        title,
        content,
      })
      // A title change rewrites [[links]] world-wide — rebuild instead.
      if (article.id !== articleId) await refreshIndex(worldId)
      else noteWrite(article)
      return article
    },
  )

  ipcMain.handle(
    'articles:rename',
    async (
      _e,
      {
        worldId,
        articleId,
        title,
      }: { worldId: string; articleId: string; title: string },
    ) => {
      const article = await renameArticle(worldId, articleId, title)
      await refreshIndex(worldId)
      return article
    },
  )

  ipcMain.handle(
    'articles:duplicate',
    (_e, { worldId, articleId }: { worldId: string; articleId: string }) => {
      const article = duplicateArticle(worldId, articleId)
      noteWrite(article)
      return article
    },
  )

  ipcMain.handle(
    'articles:move',
    async (
      _e,
      {
        worldId,
        articleId,
        folderId,
      }: { worldId: string; articleId: string; folderId: string | null },
    ) => {
      await moveArticle(worldId, articleId, folderId)
      return refreshIndex(worldId) // the article's id (its path) changed
    },
  )

  ipcMain.handle(
    'articles:delete',
    async (
      _e,
      { worldId, articleId }: { worldId: string; articleId: string },
    ) => {
      const abs = resolveInWorld(worldRoot(worldId), articleId + '.md')
      if (fs.existsSync(abs)) await trash(abs)
      noteDelete(worldId, articleId)
    },
  )

  ipcMain.handle(
    'articles:mentions',
    (_e, { worldId, articleId }: { worldId: string; articleId: string }) =>
      findMentions(worldId, articleId),
  )

  // Images ------------------------------------------------------------------
  ipcMain.handle('images:tree', (_e, { worldId }: { worldId: string }) =>
    listImageTree(worldId),
  )

  ipcMain.handle(
    'images:upload',
    (
      _e,
      {
        worldId,
        fileName,
        bytes,
        folderId,
      }: {
        worldId: string
        fileName: string
        bytes: ArrayBuffer
        folderId?: string | null
      },
    ) => uploadImage(worldId, fileName, bytes, folderId ?? null),
  )

  ipcMain.handle(
    'images:delete',
    (_e, { worldId, imageId }: { worldId: string; imageId: string }) =>
      deleteImage(worldId, imageId),
  )

  // The four handlers below repoint _images/ references across the world, so
  // article bodies change on disk — refresh the search index like folders:rename.
  ipcMain.handle(
    'images:rename',
    async (
      _e,
      {
        worldId,
        imageId,
        name,
      }: { worldId: string; imageId: string; name: string },
    ) => {
      const info = await renameImage(worldId, imageId, name)
      await refreshIndex(worldId)
      return info
    },
  )

  ipcMain.handle(
    'images:move',
    async (
      _e,
      {
        worldId,
        imageId,
        folderId,
      }: { worldId: string; imageId: string; folderId: string | null },
    ) => {
      const info = await moveImage(worldId, imageId, folderId)
      await refreshIndex(worldId)
      return info
    },
  )

  ipcMain.handle(
    'images:createFolder',
    (
      _e,
      {
        worldId,
        parentFolderId,
        name,
      }: { worldId: string; parentFolderId?: string | null; name: string },
    ) => createImageFolder(worldId, parentFolderId ?? null, name),
  )

  ipcMain.handle(
    'images:renameFolder',
    async (
      _e,
      {
        worldId,
        folderId,
        name,
      }: { worldId: string; folderId: string; name: string },
    ) => {
      const result = await renameImageFolder(worldId, folderId, name)
      await refreshIndex(worldId)
      return result
    },
  )

  ipcMain.handle(
    'images:moveFolder',
    async (
      _e,
      {
        worldId,
        folderId,
        parentFolderId,
      }: { worldId: string; folderId: string; parentFolderId: string | null },
    ) => {
      const result = await moveImageFolder(worldId, folderId, parentFolderId)
      await refreshIndex(worldId)
      return result
    },
  )

  ipcMain.handle(
    'images:deleteFolder',
    (_e, { worldId, folderId }: { worldId: string; folderId: string }) =>
      deleteImageFolder(worldId, folderId),
  )

  ipcMain.handle(
    'images:countIn',
    (_e, { worldId, folderId }: { worldId: string; folderId: string }) =>
      countImagesIn(worldId, folderId),
  )

  ipcMain.handle(
    'images:reveal',
    (_e, { worldId, imageId }: { worldId: string; imageId: string }) =>
      revealImage(worldId, imageId),
  )

  // Characters ----------------------------------------------------------------
  ipcMain.handle('characters:list', (_e, { worldId }: { worldId: string }) =>
    listCharacters(worldId),
  )

  // Reveal ------------------------------------------------------------------
  // One channel for every file-backed entity, because they all are files:
  // articles (and the characters/spells/monsters that are just articles) pass
  // `<articleId>.md`, folders pass the folder id, and a world passes nothing.
  ipcMain.handle(
    'shell:reveal',
    (_e, { worldId, relPath }: { worldId: string; relPath?: string }) => {
      const root = worldRoot(worldId)
      const abs = resolveInWorld(root, relPath ?? '')
      // Without this the file manager opens on nothing when the file was
      // renamed or deleted outside the app and the renderer is still stale.
      if (!fs.existsSync(abs)) {
        throw new Error(
          'That file is no longer on disk — it may have been moved or renamed.',
        )
      }
      // showItemInFolder selects the item inside its parent; the world root has
      // no parent worth showing, so open that folder itself instead.
      if (abs === root) void shell.openPath(abs)
      else shell.showItemInFolder(abs)
    },
  )

  // Session (initiative tracker) ---------------------------------------------
  ipcMain.handle('session:get', (_e, { worldId }: { worldId: string }) =>
    readSession(worldId),
  )

  ipcMain.handle(
    'session:set',
    (_e, { worldId, state }: { worldId: string; state: unknown }) =>
      writeSession(worldId, state),
  )

  // Saved Smart Views -------------------------------------------------------
  ipcMain.handle('views:get', (_e, { worldId }: { worldId: string }) =>
    readViews(worldId),
  )

  ipcMain.handle(
    'views:set',
    (_e, { worldId, state }: { worldId: string; state: unknown }) =>
      writeViews(worldId, state),
  )

  // Per-world settings (the class/subclass list) ------------------------------
  // The getter scaffolds the file for worlds that predate the feature; the
  // renderer owns the tolerant parse, so this returns the raw JSON.
  ipcMain.handle('worldSettings:get', (_e, { worldId }: { worldId: string }) =>
    readWorldSettings(worldId),
  )

  ipcMain.handle(
    'worldSettings:set',
    (_e, { worldId, state }: { worldId: string; state: unknown }) =>
      writeWorldSettings(worldId, state),
  )

  // Global homebrew -----------------------------------------------------------
  // App-level rather than per-world: a race you invent once is offered in every
  // world. Same split as world settings — the renderer owns the tolerant parse,
  // so these move raw JSON.
  ipcMain.handle('homebrew:get', () => readHomebrew())

  ipcMain.handle('homebrew:set', (_e, { state }: { state: unknown }) =>
    writeHomebrew(state),
  )

  // Global library ------------------------------------------------------------
  // The personal character vault. `get` never creates, so the home screen can
  // ask without conjuring a folder for someone who has never used the feature.
  ipcMain.handle('vault:get', () => findVault())
  ipcMain.handle('vault:ensure', () => ensureVault())

  ipcMain.handle('library:get', () => getLibrary())

  ipcMain.handle('library:pick', async () => {
    const dir = await pickDirectory('Choose a folder for your global library')
    return dir ? setLibrary(dir) : null
  })

  ipcMain.handle('library:forget', () => clearLibrary())

  // Picks and imports in one round-trip, so the renderer never handles a disk
  // path — it has no business knowing one, and can't be trusted with one.
  ipcMain.handle(
    'library:import',
    async (_e, { target }: { target: unknown }) => {
      const folder = libraryFolder(target)
      // No "choose a library first" gate: importMarkdownFolder creates the
      // default one, so the only thing to ask about is what to import.
      const dir = await pickDirectory(
        `Choose a folder of markdown files to import as ${folder.toLowerCase()}`,
      )
      if (!dir) return null
      return importMarkdownFolder(dir, folder)
    },
  )

  // No picker: the source is the content shipped inside the app, so there is
  // nothing to ask. Missing entries are topped up and existing ones left alone.
  ipcMain.handle(
    'library:restore',
    async (_e, { target }: { target: unknown }) =>
      restoreBundledFolder(libraryFolder(target)),
  )

  // Player window -----------------------------------------------------------
  // A second, chrome-free window showing one article to the table. Unrelated
  // to WorldMode's 'player' (src/lib/worldMode.ts).
  ipcMain.handle(
    'player:show',
    (_e, { worldId, articleId }: { worldId: string; articleId: string }) => {
      // The id only ever rides in a URL hash, but resolve it anyway so a bad
      // world fails here rather than in a window that has already opened —
      // every handler funnels through the path guard.
      resolveInWorld(worldRoot(worldId), `${articleId}.md`)
      showPlayerWindow(worldId, articleId)
    },
  )

  ipcMain.handle(
    'player:close',
    (_e, { worldId, articleId }: { worldId: string; articleId: string }) =>
      closePlayerWindow(worldId, articleId),
  )

  ipcMain.handle('player:closeAll', () => closeAllPlayerWindows())

  // Content relay only — touches no disk. The file watcher cannot do this:
  // app writes go through noteSelfWrite and are dropped by watcher.ts, so a
  // DM typing in the DM window is invisible to it.
  ipcMain.handle(
    'player:push',
    (
      _e,
      payload: {
        worldId: string
        articleId: string
        content: string
        title: string
      },
    ) => pushToPlayerWindow(payload),
  )
}

/**
 * Narrow a renderer-supplied library folder.
 *
 * `target` arrives as unknown deliberately: it crosses IPC, so the renderer's
 * type is a claim, not a guarantee. Every library handler narrows here before
 * the value reaches disk.
 */
function libraryFolder(target: unknown): LibraryFolder {
  if (target !== 'Monsters' && target !== 'Spells') {
    throw new Error(`Unknown library folder: ${String(target)}`)
  }
  return target
}
