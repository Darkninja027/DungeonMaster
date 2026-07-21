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
      refreshIndex(worldId)
      if (!sender.isDestroyed()) sender.send('world:changed', batch)
    })
    buildIndex(worldId)
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
      refreshIndex(worldId) // article ids under the folder changed
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
      refreshIndex(worldId)
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
      refreshIndex(worldId)
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
    (
      _e,
      {
        worldId,
        articleId,
        title,
        content,
      }: { worldId: string; articleId: string; title: string; content: string },
    ) => {
      const article = updateArticle(worldId, articleId, { title, content })
      // A title change rewrites [[links]] world-wide — rebuild instead.
      if (article.id !== articleId) refreshIndex(worldId)
      else noteWrite(article)
      return article
    },
  )

  ipcMain.handle(
    'articles:rename',
    (
      _e,
      {
        worldId,
        articleId,
        title,
      }: { worldId: string; articleId: string; title: string },
    ) => {
      const article = renameArticle(worldId, articleId, title)
      refreshIndex(worldId)
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
      refreshIndex(worldId) // the article's id (its path) changed
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
}
