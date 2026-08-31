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

/** A scored search hit for the command palette. */
export interface RankedResult {
  id: string
  folderId: string | null
  title: string
  snippet: string
  /** Frontmatter `type`, lowercased. Characters route to their sheet, not the editor. */
  type: string | null
  score: number
  /** [start, end) offsets into `title` for the characters that matched. */
  matchRanges: Array<[number, number]>
}

/** A tag and how many articles carry it. */
export interface TagCount {
  tag: string
  count: number
}

export interface MentionResult {
  id: string
  title: string
}

/** A frontmatter query for Smart Views and the encounter builder's pickers. */
export interface ArticleQuery {
  /** `type: <value>` frontmatter equality (case-insensitive). */
  type?: string
  /** Every tag must be present in the article's `tags` array. */
  tags?: Array<string>
  /** Arbitrary scalar frontmatter equality (case-insensitive). */
  fields?: Record<string, string>
}

export interface ArticleRef {
  id: string
  folderId: string | null
  title: string
  /**
   * Frontmatter `cr` / `xp` when the article declares them, so a bestiary list
   * can show challenge ratings without fetching every article's full text.
   * Null when absent — fall back to parseStatBlock on the article itself.
   */
  cr: string | null
  xp: number | null
  /**
   * Frontmatter `level` / `school` / `classes`, carried for the same reason as
   * `cr`/`xp`: the spell pickers filter on them without reading every article.
   * `classes` accepts a YAML array or a comma-separated scalar. Null when the
   * article doesn't declare them — which is what any non-spell looks like.
   */
  level: number | null
  school: string | null
  classes: Array<string> | null
}

/** A saved Smart View: a named frontmatter query, persisted to .dm/views.json. */
export interface SavedView {
  id: string
  name: string
  query: ArticleQuery
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
  /** '/'-separated path relative to _images/ — 'Maps/City/tavern.png'. */
  id: string
  /** Basename only — 'tavern.png'. */
  fileName: string
  /** Containing image folder id; null = the _images root. */
  folderId: string | null
  contentType: string
  sizeBytes: number
  uploadedAt: string
  url: string
  /** Portable disk path — '_images/Maps/City/tavern.png'. */
  relPath: string
  /** The same, per-segment percent-encoded. Use this in markdown. */
  encodedRelPath: string
}

/** A folder under _images/. Mirrors FolderNode; ids are _images-relative. */
export interface ImageFolder {
  id: string
  parentFolderId: string | null
  name: string
}

export interface ImageTree {
  folders: Array<ImageFolder>
  images: Array<ImageInfo>
}

/** The two folders the global library is scaffolded with — the import targets. */
export type LibraryFolder = 'Monsters' | 'Spells'

/**
 * The global library folder, shared by every world. It's a real world folder,
 * so `worldId` works anywhere the app takes one — tree, articles, reveal, and
 * world:// image URLs all resolve against it unchanged.
 */
export interface LibraryInfo {
  worldId: string
  path: string
  /** False when the folder has been moved, deleted, or is on a drive that's away. */
  available: boolean
}

/**
 * The personal character vault — a world folder holding characters that aren't
 * tied to a campaign. Same shape as LibraryInfo: both are app-wide folders
 * addressed by a normal worldId.
 */
export interface VaultInfo {
  worldId: string
  path: string
  /** False when the folder has been moved, deleted, or is on a drive that's away. */
  available: boolean
}

export interface ImportSkip {
  /** Path relative to the folder the user picked. */
  file: string
  reason: string
}

export interface ImportSummary {
  copied: number
  skipped: Array<ImportSkip>
  /** True when the import hit its file cap and stopped early. */
  truncated: boolean
}

/**
 * Electron wraps every main-process throw as
 * `Error invoking remote method 'x:y': Error: <real message>`. Strip that here
 * so the message we wrote in the main process is what the user actually reads.
 */
/** What the DM window relays to a player window on every edit. */
export interface PlayerContent {
  worldId: string
  articleId: string
  content: string
  title: string
}

function invoke<T>(channel: string, args?: unknown): Promise<T> {
  return window.dmApi.invoke<T>(channel, args).catch((cause: unknown) => {
    const raw = cause instanceof Error ? cause.message : String(cause)
    throw new Error(
      raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, ''),
    )
  })
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
    /** Scored search for the command palette — sorted, then capped at `limit`. */
    searchRanked: (worldId: string, query: string, limit?: number) =>
      invoke<Array<RankedResult>>('worlds:searchRanked', {
        worldId,
        query,
        limit,
      }),
    /** Every tag used in the world, with counts, most-used first. */
    tags: (worldId: string) =>
      invoke<Array<TagCount>>('worlds:tags', { worldId }),
    /** Articles whose frontmatter matches the query, sorted by title. */
    query: (worldId: string, query: ArticleQuery) =>
      invoke<Array<ArticleRef>>('worlds:query', { worldId, query }),
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
    /** The whole _images/ tree: nested folders plus every image at any depth. */
    tree: (worldId: string) => invoke<ImageTree>('images:tree', { worldId }),
    /** Upload into `folderId` (null = the _images root). */
    upload: async (
      worldId: string,
      file: File,
      folderId: string | null = null,
    ) =>
      invoke<ImageInfo>('images:upload', {
        worldId,
        fileName: file.name,
        bytes: await file.arrayBuffer(),
        folderId,
      }),
    /** Rename in place; repoints _images/ references world-wide. */
    rename: (worldId: string, imageId: string, name: string) =>
      invoke<ImageInfo>('images:rename', { worldId, imageId, name }),
    /** Move between folders; repoints _images/ references world-wide. */
    move: (worldId: string, imageId: string, folderId: string | null) =>
      invoke<ImageInfo>('images:move', { worldId, imageId, folderId }),
    /** To the Recycle Bin. References are left alone — the author decides. */
    delete: (worldId: string, imageId: string) =>
      invoke<void>('images:delete', { worldId, imageId }),
    createFolder: (input: {
      worldId: string
      parentFolderId?: string | null
      name: string
    }) => invoke<ImageFolder>('images:createFolder', input),
    renameFolder: (worldId: string, folderId: string, name: string) =>
      invoke<{ id: string }>('images:renameFolder', {
        worldId,
        folderId,
        name,
      }),
    moveFolder: (
      worldId: string,
      folderId: string,
      parentFolderId: string | null,
    ) =>
      invoke<{ id: string }>('images:moveFolder', {
        worldId,
        folderId,
        parentFolderId,
      }),
    deleteFolder: (worldId: string, folderId: string) =>
      invoke<void>('images:deleteFolder', { worldId, folderId }),
    /** Images under a folder subtree — for the delete confirmation. */
    countIn: (worldId: string, folderId: string) =>
      invoke<number>('images:countIn', { worldId, folderId }),
    /**
     * Show an image or image folder in the OS file manager. Pass '' for the
     * _images folder itself.
     */
    reveal: (worldId: string, imageId: string) =>
      invoke<void>('images:reveal', { worldId, imageId }),
  },
  characters: {
    /** Articles whose frontmatter declares `type: character`, sorted by title. */
    list: (worldId: string) =>
      invoke<Array<{ id: string; folderId: string | null; title: string }>>(
        'characters:list',
        {
          worldId,
        },
      ),
  },
  session: {
    /** Combat/session state stored in the world folder; null if none saved. */
    get: (worldId: string) =>
      invoke<SessionFile | null>('session:get', { worldId }),
    set: (worldId: string, state: SessionFile) =>
      invoke<void>('session:set', { worldId, state }),
  },
  views: {
    /** Saved Smart Views for this world; null if none saved yet. */
    get: (worldId: string) =>
      invoke<Array<SavedView> | null>('views:get', { worldId }),
    set: (worldId: string, state: Array<SavedView>) =>
      invoke<void>('views:set', { worldId, state }),
  },
  worldSettings: {
    /**
     * Raw worldSettings.json — deliberately `unknown`, because the file is
     * hand-editable and the renderer owns the tolerant parse
     * (lib/worldSettings.ts). null means missing or unparseable.
     */
    get: (worldId: string) => invoke<unknown>('worldSettings:get', { worldId }),
    set: (worldId: string, state: unknown) =>
      invoke<void>('worldSettings:set', { worldId, state }),
  },
  homebrew: {
    /**
     * Raw homebrew.json — `unknown` for the same reason as worldSettings: the
     * file is hand-editable and lib/homebrew.ts owns the tolerant parse. null
     * means missing or unparseable, which reads as "no homebrew yet".
     */
    get: () => invoke<unknown>('homebrew:get'),
    set: (state: unknown) => invoke<void>('homebrew:set', { state }),
  },
  vault: {
    /**
     * The vault, or null if there has never been one. Never creates — the home
     * screen asks on every load and must not conjure a folder for someone who
     * has not used the feature.
     */
    get: () => invoke<VaultInfo | null>('vault:get'),
    /** The vault, creating it on first use. */
    ensure: () => invoke<VaultInfo>('vault:ensure'),
  },

  library: {
    /** The configured global library, or null if the user hasn't chosen one. */
    get: () => invoke<LibraryInfo | null>('library:get'),
    /** Directory picker; scaffolds the folder. Returns null if the user cancels. */
    pick: () => invoke<LibraryInfo | null>('library:pick'),
    /** Forget the library path. The folder itself is left alone. */
    forget: () => invoke<void>('library:forget'),
    /**
     * Pick a folder of markdown and recursively copy it into the library's
     * Monsters or Spells folder. Null if the user cancels the picker.
     */
    import: (target: LibraryFolder) =>
      invoke<ImportSummary | null>('library:import', { target }),
    /**
     * Re-copy the content shipped with the app into one library folder, putting
     * back anything missing. Existing files are left untouched, so edits
     * survive. Null if the build shipped no bundled content.
     */
    restore: (target: LibraryFolder) =>
      invoke<ImportSummary | null>('library:restore', { target }),
  },
  shell: {
    /**
     * Open the OS file manager with this file selected. `relPath` is
     * world-relative: `<articleId>.md` for an article, a folder id for a
     * folder, omitted for the world folder itself.
     */
    reveal: (worldId: string, relPath?: string) =>
      invoke<void>('shell:reveal', { worldId, relPath }),
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
  /**
   * The player window — a second, chrome-free window showing one article to
   * the table. Unrelated to WorldMode's `'player'` (lib/worldMode.ts), which
   * is a per-world chrome setting for someone playing a character.
   */
  player: {
    /** Open a player window for this article, or focus its existing one. */
    show: (worldId: string, articleId: string) =>
      invoke<void>('player:show', { worldId, articleId }),
    close: (worldId: string, articleId: string) =>
      invoke<void>('player:close', { worldId, articleId }),
    /** Close every player window; resolves with how many were open. */
    closeAll: () => invoke<number>('player:closeAll'),
    /**
     * Relay the DM's live editor buffer to the window showing this article.
     * No-ops in the main process if no such window is open, so the caller
     * never has to know whether anyone is watching.
     */
    push: (payload: PlayerContent) => invoke<void>('player:push', payload),
    /** Player window: subscribe to pushed content; returns an unsubscribe fn. */
    onContent: (cb: (payload: PlayerContent) => void) =>
      window.dmApi.on('player:content', (payload) =>
        cb(payload as PlayerContent),
      ),
  },
}
