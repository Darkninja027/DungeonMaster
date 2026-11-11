import { BUILT_IN_TEMPLATES } from './templates'
import type { ArticleTemplate } from './templates'

/**
 * The user's layer over the built-in article templates: what is stored in
 * `templates.json`, how it merges with the built-ins, and how the rest of the
 * app reads the result.
 *
 * Two ways in, and the difference matters:
 *
 *  - **Render paths** use `useTemplates()` / `useVisibleTemplates()` from
 *    lib/useTemplates.ts. They re-render when the user saves.
 *  - **Callback paths** use `findTemplate(id)` below, which reads a module-scope
 *    cache synchronously. It is the only option inside a `useMutation` callback,
 *    where no hook is reachable.
 *
 * Never read the cache during render (it is not reactive, and the component
 * will not update when a template is saved); never reach for the hook from a
 * callback (you cannot). Both mistakes are silent, which is why the split is
 * spelled out here and again at each function.
 */

export const TEMPLATE_STORE_VERSION = 1

/** Written into the file as `_comment`, so it explains itself when hand-edited. */
export const TEMPLATE_STORE_COMMENT =
  'Article templates, shared by every world. An entry whose id matches a ' +
  'built-in overrides it — delete the entry to get the built-in back. Any ' +
  'other id is a template of your own. "hidden": true takes a template out of ' +
  'the New-article and Insert menus without deleting it; built-ins can only be ' +
  'hidden, because parts of the app create articles from them by id.'

/**
 * One stored template.
 *
 * **`id` is stored**, which is the one place this file departs from
 * homebrew.json's derive-the-id-from-the-name convention, and it departs for a
 * hard reason: an override has to say *which* built-in it overrides, and
 * `'spell'` is not recoverable from whatever the user retitled it to. A
 * homebrew race's identity genuinely is its name; a template's is not.
 */
export interface StoredTemplate {
  id: string
  name: string
  description: string
  body: string
  type?: string
  hidden?: boolean
}

export interface TemplateStore {
  version: number
  /**
   * The user's layer, in authored order. Entries sharing a built-in id override
   * it in place; the rest append after every built-in.
   */
  templates: Array<StoredTemplate>
}

export const EMPTY_TEMPLATE_STORE: TemplateStore = {
  version: TEMPLATE_STORE_VERSION,
  templates: [],
}

/**
 * The built-in ids, as a set — what every "is this an override?" check and the
 * collision guard ask. Derived from the array so adding a built-in cannot leave
 * this behind.
 */
export const BUILT_IN_IDS: ReadonlySet<string> = new Set(
  BUILT_IN_TEMPLATES.map((t) => t.id),
)

/**
 * A slug for a **new** user template, the same shape as `homebrewId`.
 *
 * `taken` must hold every id already in play — the built-ins *and* the store's
 * own entries. A slug colliding with a built-in would silently become an
 * override of it, so "my own Spell template" would replace the app's and break
 * `findTemplate('spell')`'s contract. Collisions are suffixed instead:
 * `spell`, `spell-2`, `spell-3`.
 *
 * Empty in, `'template'` out — an unnamed template still needs an id, and the
 * settings UI lets a draft be saved before it has been named.
 */
export function templateId(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'template'
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * One stored row, or null when it carries nothing usable.
 *
 * Tolerant field by field, the same contract as `parseHomebrew`: this file is
 * hand-editable, and one malformed entry must never cost the rest of it.
 *
 * Dropped only when it has neither id nor name — with either there is something
 * to key on and something to show. An entry with a name but no id gets one
 * slugged, which is what a hand-written entry looks like.
 */
function parseTemplate(
  raw: unknown,
  taken: Set<string>,
): StoredTemplate | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = str(r.name).trim()
  const rawId = str(r.id).trim().toLowerCase()
  if (rawId === '' && name === '') return null
  const id = rawId !== '' ? rawId : templateId(name, taken)
  const type = str(r.type).trim()
  return {
    id,
    name,
    description: str(r.description),
    body: str(r.body),
    ...(type !== '' && { type }),
    ...(r.hidden === true && { hidden: true }),
  }
}

/**
 * Parse the raw JSON from disk. A missing or corrupt file yields an empty
 * store, which merges to exactly the built-ins — the same outcome as never
 * having edited a template, and the reason a broken templates.json can never
 * empty a picker.
 *
 * Duplicate ids keep the **first**, matching `parseHomebrew`'s dedupe: two
 * entries claiming `spell` is a hand-edit mistake, and the first is the one the
 * user sees at the top of the file.
 */
export function parseTemplateStore(raw: unknown): TemplateStore {
  if (typeof raw !== 'object' || raw === null) return EMPTY_TEMPLATE_STORE
  const r = raw as Record<string, unknown>
  const taken = new Set<string>(BUILT_IN_IDS)
  const templates: Array<StoredTemplate> = []
  const seen = new Set<string>()
  if (Array.isArray(r.templates)) {
    for (const entry of r.templates) {
      const parsed = parseTemplate(entry, taken)
      if (!parsed || seen.has(parsed.id)) continue
      seen.add(parsed.id)
      // Only *new* ids join `taken`. An override legitimately reuses a built-in
      // id, and adding it would make the next hand-written entry of the same
      // name suffix off a built-in it has nothing to do with.
      if (!BUILT_IN_IDS.has(parsed.id)) taken.add(parsed.id)
      templates.push(parsed)
    }
  }
  return {
    version:
      typeof r.version === 'number' && Number.isFinite(r.version)
        ? r.version
        : TEMPLATE_STORE_VERSION,
    templates,
  }
}

/**
 * Back to the on-disk shape. Unlike `serializeHomebrew` the id is **kept** —
 * see `StoredTemplate.id`. `origin` is never written: it is a product of the
 * merge, and a stored one would contradict the merge on the next load.
 */
export function serializeTemplateStore(store: TemplateStore): unknown {
  return {
    version: store.version,
    _comment: TEMPLATE_STORE_COMMENT,
    templates: store.templates.map(
      ({ id, name, description, body, type, hidden }) => ({
        id,
        name,
        description,
        body,
        ...(type != null && type !== '' && { type }),
        ...(hidden === true && { hidden: true }),
      }),
    ),
  }
}

/**
 * The template list in force: the built-ins, with the user's layer over them.
 *
 * **Precedence is user > built-in, matched on `id`.** The same shape as
 * `layer()` in lib/tables.ts, including its position rule — an override keeps
 * the built-in's slot, so editing the Spell template does not make it jump to
 * the bottom of the New-article grid. Genuinely new templates append in
 * authored order.
 *
 * Keyed on id rather than name, which is the one real difference from
 * `mergeTables`. A homebrew race *is* its name; a template is its id, because
 * code says `findTemplate('spell')` — an override that stopped matching the
 * moment someone retitled it "Spell (house rules)" would silently revert three
 * call sites to the built-in.
 *
 * `origin` is stamped here and nowhere else: it answers "can this be deleted,
 * or only hidden?", and computing it at the call site would let two screens
 * disagree.
 *
 * **Nothing is ever dropped.** The result always contains every built-in id,
 * which is what `findTemplate`'s contract rests on.
 */
export function mergeTemplates(
  store: TemplateStore = EMPTY_TEMPLATE_STORE,
): Array<ArticleTemplate> {
  const order: Array<string> = BUILT_IN_TEMPLATES.map((t) => t.id)
  const byId = new Map<string, ArticleTemplate>(
    BUILT_IN_TEMPLATES.map((t) => [
      t.id,
      { ...t, origin: 'built-in' as const },
    ]),
  )
  for (const entry of store.templates) {
    if (entry.id === '') continue
    const builtIn = byId.get(entry.id)
    if (!builtIn) order.push(entry.id)
    byId.set(entry.id, {
      ...entry,
      // A built-in's own name survives a blank override name, so a half-filled
      // draft on disk cannot render an unlabelled button in the picker.
      name: entry.name.trim() !== '' ? entry.name : (builtIn?.name ?? entry.id),
      origin: builtIn ? 'override' : 'user',
    })
  }
  return order.flatMap((id) => {
    const template = byId.get(id)
    return template ? [template] : []
  })
}

/**
 * The pickers' list: everything not hidden. Hiding is display-only — see
 * `findTemplate`, which deliberately ignores it.
 */
export function visibleTemplates(
  templates: Array<ArticleTemplate>,
): Array<ArticleTemplate> {
  return templates.filter((t) => t.hidden !== true)
}

/**
 * Which template a picker should start on. Blank when it is visible, otherwise
 * the first entry that is: a hidden Blank must not leave the dialog with
 * nothing selected and a Create button that appears to do nothing.
 */
export function defaultTemplateId(visible: Array<ArticleTemplate>): string {
  return visible.some((t) => t.id === 'blank')
    ? 'blank'
    : (visible[0]?.id ?? 'blank')
}

/**
 * The merged list, cached at module scope so the handful of by-id lookups can
 * read it **synchronously from inside a mutation callback**, where no hook is
 * reachable.
 *
 * Seeded by LoadingGate before any route renders, and re-seeded by the query
 * and by `useSaveTemplates`. Starts as the built-ins, so every read before the
 * first seed — a secondary window, a failed read, a corrupt file — still
 * answers correctly rather than emptily.
 *
 * **Do not read this during render.** It is not reactive: a component rendering
 * from it will not update when the user saves a template.
 */
let cached: Array<ArticleTemplate> = mergeTemplates()

export function seedTemplateCache(store: TemplateStore): void {
  cached = mergeTemplates(store)
}

/**
 * A template by id, for the call sites that want one specific template and have
 * no hook access: the bestiary's Monster, the spell panel's and the sheet's
 * Spell, the creation wizard's Player Character.
 *
 * **Never undefined for a built-in id.** `mergeTemplates` always emits every
 * built-in id and the cache is initialised from it, so this answers even before
 * the file has been read.
 *
 * `hidden` is deliberately ignored: hiding takes a template out of the
 * *pickers*, and a hidden Monster template must still be what "add a monster"
 * uses — the alternative is a settings toggle that silently breaks the
 * bestiary.
 *
 * Returns undefined only for an id nothing defines, which in practice means a
 * typo; callers keep their `?? ''` guard so that is a blank article, not a
 * crash.
 */
export function findTemplate(id: string): ArticleTemplate | undefined {
  return cached.find((t) => t.id === id)
}

/** The built-in behind an id, for "Reset to built-in" and the editor's hints. */
export function builtInTemplate(id: string): ArticleTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id)
}

/** Every id in play, for handing to `templateId` when naming a new template. */
export function takenIds(store: TemplateStore): Set<string> {
  return new Set([...BUILT_IN_IDS, ...store.templates.map((t) => t.id)])
}

/**
 * Add or replace by id, keeping position — `upsert` from lib/homebrew.ts, keyed
 * on id rather than name because that is what identifies a template.
 */
export function upsertTemplate(
  store: TemplateStore,
  entry: StoredTemplate,
): TemplateStore {
  const at = store.templates.findIndex((t) => t.id === entry.id)
  return {
    ...store,
    templates:
      at === -1
        ? [...store.templates, entry]
        : store.templates.map((t, i) => (i === at ? entry : t)),
  }
}

/**
 * Drop the user's entry for an id. For a built-in that is "Reset to built-in";
 * for a template of their own it is deletion. One function, because on disk
 * they are the same operation and the difference is only what the UI calls it.
 */
export function dropTemplate(store: TemplateStore, id: string): TemplateStore {
  return { ...store, templates: store.templates.filter((t) => t.id !== id) }
}

/**
 * Hide or show. A built-in needs a stored row to carry the flag, so hiding one
 * that has never been edited materialises an override that is otherwise a
 * verbatim copy — which is also what makes unhiding a flag flip rather than a
 * resurrection.
 */
export function setTemplateHidden(
  store: TemplateStore,
  id: string,
  hidden: boolean,
): TemplateStore {
  const existing = store.templates.find((t) => t.id === id)
  if (existing) return upsertTemplate(store, { ...existing, hidden })
  const builtIn = builtInTemplate(id)
  if (!builtIn) return store
  const { origin: _origin, hidden: _hidden, ...rest } = builtIn
  return upsertTemplate(store, { ...rest, hidden })
}
