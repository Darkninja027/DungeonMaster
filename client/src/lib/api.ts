/**
 * Data layer for the Electron desktop app. Every call crosses the preload
 * bridge (window.dmApi) into the main process, which reads and writes plain
 * files inside the world folder — no server, no database.
 *
 * Ids are path strings: a world id is an opaque key for the world folder, an
 * article id is its world-relative path without ".md" ("NPCs/Strahd"), and a
 * folder id is its world-relative directory path. null folder = world root.
 */

declare global {
  interface Window {
    dmApi: {
      invoke: <T>(channel: string, args?: unknown) => Promise<T>
      /** Subscribe to a main->renderer event; returns an unsubscribe fn. */
      on: (channel: string, cb: (payload: unknown) => void) => () => void
    }
  }
}

export interface UpdateStatus {
  state: 'checking' | 'available' | 'downloaded' | 'idle' | 'error'
  version?: string
}

export interface WorldSummary {
  id: string
  name: string
  description: string
  createdAt: string
  articleCount: number
}

export interface FolderNode {
  id: string
  parentFolderId: string | null
  name: string
  sortOrder: number
}

export interface ArticleSummary {
  id: string
  folderId: string | null
  title: string
  updatedAt: string
}

export interface WorldTree {
  folders: Array<FolderNode>
  articles: Array<ArticleSummary>
}

export interface Article {
  id: string
  worldId: string
  folderId: string | null
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface SearchResult {
  id: string
  folderId: string | null
  title: string
  snippet: string
}

export interface MentionResult {
  id: string
  title: string
}

/** A combatant row in the initiative tracker. */
export interface Combatant {
  id: string
  name: string
  initiative: number
  hp: number
  maxHp: number | null
  ac: number | null
  note: string
  articleId?: string
}

/** Combat state persisted to .dm/session.json inside the world folder. */
export interface SessionFile {
  version: 1
  combatants: Array<Combatant>
  activeId: string | null
  round: number
}

/** Pushed by the main process when the world folder changes on disk. */
export interface WorldChangeBatch {
  worldId: string
  articleIds: Array<string>
  treeChanged: boolean
  imagesChanged: boolean
}

export interface ImageInfo {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
  url: string
}

function invoke<T>(channel: string, args?: unknown): Promise<T> {
  return window.dmApi.invoke<T>(channel, args)
}

export const api = {
  worlds: {
    list: () => invoke<Array<WorldSummary>>('worlds:list'),
    /** Directory picker; returns null if the user cancels. */
    open: () => invoke<WorldSummary | null>('worlds:pickAndOpen'),
    get: (worldId: string) => invoke<WorldSummary>('worlds:get', { worldId }),
    tree: (worldId: string) => invoke<WorldTree>('worlds:tree', { worldId }),
    search: (worldId: string, query: string) =>
      invoke<Array<SearchResult>>('worlds:search', { worldId, query }),
    /** Directory picker for the parent location; returns null if cancelled. */
    create: (input: { name: string; description?: string }) =>
      invoke<WorldSummary | null>('worlds:create', input),
    update: (worldId: string, input: { name: string; description?: string }) =>
      invoke<void>('worlds:update', { worldId, ...input }),
    /** Removes the world from the recents list only — the folder stays on disk. */
    remove: (worldId: string) => invoke<void>('worlds:remove', { worldId }),
    /** Start watching the world folder for external changes. */
    watch: (worldId: string) => invoke<void>('worlds:watch', { worldId }),
    unwatch: (worldId: string) => invoke<void>('worlds:unwatch', { worldId }),
    /** Subscribe to external-change batches; returns an unsubscribe fn. */
    onChanged: (cb: (batch: WorldChangeBatch) => void) =>
      window.dmApi.on('world:changed', (payload) =>
        cb(payload as WorldChangeBatch),
      ),
  },
  folders: {
    create: (input: {
      worldId: string
      parentFolderId?: string | null
      name: string
    }) => invoke<FolderNode>('folders:create', input),
    rename: (worldId: string, folderId: string, name: string) =>
      invoke<void>('folders:rename', { worldId, folderId, name }),
    move: (worldId: string, folderId: string, parentFolderId: string | null) =>
      invoke<void>('folders:move', { worldId, folderId, parentFolderId }),
    delete: (worldId: string, folderId: string) =>
      invoke<void>('folders:delete', { worldId, folderId }),
  },
  articles: {
    get: (worldId: string, articleId: string) =>
      invoke<Article>('articles:get', { worldId, articleId }),
    mentions: (worldId: string, articleId: string) =>
      invoke<Array<MentionResult>>('articles:mentions', { worldId, articleId }),
    create: (input: {
      worldId: string
      folderId?: string | null
      title: string
      content?: string
    }) => invoke<Article>('articles:create', input),
    update: (
      worldId: string,
      articleId: string,
      input: { title: string; content: string },
    ) => invoke<Article>('articles:update', { worldId, articleId, ...input }),
    /** Rename without touching content; rewrites inbound [[links]] world-wide. */
    rename: (worldId: string, articleId: string, title: string) =>
      invoke<Article>('articles:rename', { worldId, articleId, title }),
    duplicate: (worldId: string, articleId: string) =>
      invoke<Article>('articles:duplicate', { worldId, articleId }),
    move: (worldId: string, articleId: string, folderId: string | null) =>
      invoke<void>('articles:move', { worldId, articleId, folderId }),
    delete: (worldId: string, articleId: string) =>
      invoke<void>('articles:delete', { worldId, articleId }),
  },
  images: {
    list: (worldId: string) =>
      invoke<Array<ImageInfo>>('images:list', { worldId }),
    upload: async (worldId: string, file: File) =>
      invoke<ImageInfo>('images:upload', {
        worldId,
        fileName: file.name,
        bytes: await file.arrayBuffer(),
      }),
    delete: (worldId: string, imageId: string) =>
      invoke<void>('images:delete', { worldId, imageId }),
  },
  session: {
    /** Combat/session state stored in the world folder; null if none saved. */
    get: (worldId: string) =>
      invoke<SessionFile | null>('session:get', { worldId }),
    set: (worldId: string, state: SessionFile) =>
      invoke<void>('session:set', { worldId, state }),
  },
  updates: {
    /** Subscribe to auto-update status; returns an unsubscribe fn. */
    onStatus: (cb: (status: UpdateStatus) => void) =>
      window.dmApi.on('updates:status', (payload) =>
        cb(payload as UpdateStatus),
      ),
    /** Quit and install a downloaded update. */
    quitAndInstall: () => invoke<void>('updates:quitAndInstall'),
  },
}
