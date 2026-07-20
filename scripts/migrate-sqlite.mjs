/**
 * One-time export of the old SQLite database into world folders.
 *
 *   node scripts/migrate-sqlite.mjs --db server/data/dungeonmaster.db --out "C:\Worlds"
 *
 * Read-only against the database; uploads are copied, never moved.
 * Each World becomes <out>/<Name>/ with world.json, Title.md files in real
 * directories, and images in _images/. Image references in article bodies
 * are rewritten from /api/images/{id}/file to relative _images/ paths.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// better-sqlite3 lives in client/node_modules — resolve it from there.
const require = createRequire(new URL('../client/package.json', import.meta.url))
const Database = require('better-sqlite3')

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = path.resolve(repoRoot, getArg('db', 'server/data/dungeonmaster.db'))
const outDir = path.resolve(repoRoot, getArg('out', 'migrated-worlds'))
const uploadsDir = path.join(path.dirname(dbPath), 'uploads')

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`)
  process.exit(1)
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true })
const warnings = []

/** Make a name filesystem-safe. Migration mangles (with a warning) rather than fails. */
function sanitize(name, kind, worldName) {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f#]/g, '-')
    .replace(/\[\[|\]\]/g, '-')
    .replace(/[. ]+$/, '')
    .replace(/^\.+/, '')
    .trim()
  const safe = cleaned || 'Untitled'
  if (safe !== name.trim()) {
    warnings.push(`${worldName}: ${kind} "${name}" renamed to "${safe}" (invalid filename characters)`)
  }
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(safe) ? `${safe}_` : safe
}

/** "Title" -> "Title (2)" until it does not collide (case-insensitive). */
function dedupe(dir, base, ext, kind, worldName) {
  const taken = new Set(
    fs.existsSync(dir) ? fs.readdirSync(dir).map((e) => e.toLowerCase()) : [],
  )
  let name = base + ext
  for (let n = 2; taken.has(name.toLowerCase()); n++) {
    name = `${base} (${n})${ext}`
  }
  if (name !== base + ext) {
    warnings.push(
      `${worldName}: ${kind} "${base}" already existed — saved as "${name}". ` +
        `Wiki-links to the original title now resolve to the other article.`,
    )
  }
  return name
}

const worlds = db.prepare('SELECT Id, Name, Description, CreatedAt FROM Worlds').all()
console.log(`Migrating ${worlds.length} world(s) from ${dbPath}\n  -> ${outDir}\n`)

let totals = { worlds: 0, folders: 0, articles: 0, images: 0 }

for (const world of worlds) {
  const worldName = sanitize(world.Name, 'world', world.Name)
  const rootName = dedupe(outDir, worldName, '', 'world folder', world.Name)
  const root = path.join(outDir, rootName)
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(
    path.join(root, 'world.json'),
    JSON.stringify(
      {
        name: world.Name,
        description: world.Description ?? '',
        createdAt: new Date(world.CreatedAt + 'Z').toISOString(),
      },
      null,
      2,
    ),
  )
  totals.worlds++

  // Folders: resolve parents before children (self-referential table).
  const folders = db
    .prepare('SELECT Id, ParentFolderId, Name FROM Folders WHERE WorldId = ?')
    .all(world.Id)
  const folderPath = new Map() // folder Id -> absolute dir
  let remaining = [...folders]
  while (remaining.length > 0) {
    const next = remaining.filter(
      (f) => f.ParentFolderId == null || folderPath.has(f.ParentFolderId),
    )
    if (next.length === 0) {
      warnings.push(`${world.Name}: ${remaining.length} folder(s) had unresolvable parents; placed at root.`)
      next.push(...remaining.map((f) => ({ ...f, ParentFolderId: null })))
    }
    for (const folder of next) {
      const parentDir = folder.ParentFolderId != null ? folderPath.get(folder.ParentFolderId) : root
      const name = dedupe(
        parentDir,
        sanitize(folder.Name, 'folder', world.Name),
        '',
        'folder',
        world.Name,
      )
      const dir = path.join(parentDir, name)
      fs.mkdirSync(dir, { recursive: true })
      folderPath.set(folder.Id, dir)
      totals.folders++
    }
    remaining = remaining.filter((f) => !folderPath.has(f.Id))
  }

  // Images: copy uploads/{worldId}/{StoredFileName} -> _images/{FileName}.
  const images = db
    .prepare('SELECT Id, FileName, StoredFileName FROM Images WHERE WorldId = ?')
    .all(world.Id)
  const imageName = new Map() // image Id -> final filename in _images/
  if (images.length > 0) {
    const imagesDir = path.join(root, '_images')
    fs.mkdirSync(imagesDir, { recursive: true })
    for (const image of images) {
      const src = path.join(uploadsDir, String(world.Id), image.StoredFileName)
      if (!fs.existsSync(src)) {
        warnings.push(`${world.Name}: image "${image.FileName}" missing on disk (${src}) — skipped.`)
        continue
      }
      const ext = path.extname(image.FileName)
      const stem = sanitize(image.FileName.slice(0, image.FileName.length - ext.length), 'image', world.Name)
      const name = dedupe(imagesDir, stem, ext, 'image', world.Name)
      fs.copyFileSync(src, path.join(imagesDir, name))
      imageName.set(image.Id, name)
      totals.images++
    }
  }

  // Articles: Title.md files with image refs rewritten to relative paths.
  const articles = db
    .prepare('SELECT Id, FolderId, Title, Content FROM Articles WHERE WorldId = ?')
    .all(world.Id)
  for (const article of articles) {
    const dir = article.FolderId != null ? (folderPath.get(article.FolderId) ?? root) : root
    const name = dedupe(dir, sanitize(article.Title, 'article', world.Name), '.md', 'article', world.Name)
    const content = (article.Content ?? '').replace(
      /\/api\/images\/(\d+)\/file/g,
      (match, id) => {
        const file = imageName.get(Number(id))
        if (!file) {
          warnings.push(`${world.Name}: "${article.Title}" references unknown image ${id} — left as-is.`)
          return match
        }
        return `_images/${encodeURIComponent(file)}`
      },
    )
    fs.writeFileSync(path.join(dir, name), content)
    totals.articles++
  }
}

db.close()

console.log(
  `Done: ${totals.worlds} worlds, ${totals.folders} folders, ${totals.articles} articles, ${totals.images} images.`,
)
if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s):`)
  for (const w of warnings) console.log(`  - ${w}`)
} else {
  console.log('No warnings.')
}
