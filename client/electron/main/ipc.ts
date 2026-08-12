import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { addRecentWorld, readConfig, removeRecentWorld } from './recents'
import {
  countArticles,
  createArticle,
  createFolder,
  duplicateArticle,
  encodeWorldId,
  getArticle,
  initWorld,
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
import type { WorldSummary } from './worldStore'
import {
  findMentions,
  listCharacters,
  queryArticles,
  searchWorld,
} from './search'
import type { ArticleQuery } from './search'
import { deleteImage, listImages, uploadImage } from './images'
import { readSession, readViews, writeSession, writeViews } from './session'
import {
  WORLD_SETTINGS_FILE,
  readWorldSettings,
  seedWorldSettings,
  writeWorldSettings,
} from './worldSettings'
import { noteSelfWrite, startWatching, stopWatching } from './watcher'
import {
  buildIndex,
  dropIndex,
  noteDelete,
  noteWrite,
  refreshIndex,
} from './indexer'
import { nameError, resolveInWorld } from './sanitize'

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
  ipcMain.handle('worlds:list', () =>
    readConfig()
      .recentWorlds.filter((p) => fs.existsSync(path.join(p, 'world.json')))
      .map(worldSummary),
  )

  ipcMain.handle('worlds:pickAndOpen', async () => {
    const dir = await pickDirectory('Open a world folder')
    if (!dir) return null
    // A plain folder becomes a world by dropping a world.json into it.
    if (!fs.existsSync(path.join(dir, 'world.json'))) {
      initWorld(dir, path.basename(dir), '')
    }
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
      addRecentWorld(dir)
      return worldSummary(dir)
    },
  )

  ipcMain.handle('worlds:get', (_e, { worldId }: { worldId: string }) =>
    worldSummary(worldRoot(worldId)),
  )

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
      renameFolder(worldId, folderId, name)
      return refreshIndex(worldId) // article ids under the folder changed
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
      moveFolder(worldId, folderId, parentFolderId)
      return refreshIndex(worldId)
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
    (
      _e,
      {
        worldId,
        articleId,
        folderId,
      }: { worldId: string; articleId: string; folderId: string | null },
    ) => {
      moveArticle(worldId, articleId, folderId)
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
  ipcMain.handle('images:list', (_e, { worldId }: { worldId: string }) =>
    listImages(worldId),
  )

  ipcMain.handle(
    'images:upload',
    (
      _e,
      {
        worldId,
        fileName,
        bytes,
      }: { worldId: string; fileName: string; bytes: ArrayBuffer },
    ) => uploadImage(worldId, fileName, bytes),
  )

  ipcMain.handle(
    'images:delete',
    (_e, { worldId, imageId }: { worldId: string; imageId: string }) =>
      deleteImage(worldId, imageId),
  )

  // Characters ----------------------------------------------------------------
  ipcMain.handle('characters:list', (_e, { worldId }: { worldId: string }) =>
    listCharacters(worldId),
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
}
