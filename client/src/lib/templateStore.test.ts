import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_IDS,
  EMPTY_TEMPLATE_STORE,
  builtInTemplate,
  defaultTemplateId,
  dropTemplate,
  findTemplate,
  mergeTemplates,
  parseTemplateStore,
  seedTemplateCache,
  serializeTemplateStore,
  setTemplateHidden,
  takenIds,
  templateId,
  upsertTemplate,
  visibleTemplates,
} from './templateStore'
import type { StoredTemplate, TemplateStore } from './templateStore'
import { BUILT_IN_TEMPLATES, fillPlaceholders } from './templates'
import { splitFrontmatter } from './formatMarkdown'
import { parse as parseYaml } from 'yaml'

const store = (...templates: Array<StoredTemplate>): TemplateStore => ({
  version: 1,
  templates,
})

const row = (over: Partial<StoredTemplate> = {}): StoredTemplate => ({
  id: 'shop',
  name: 'Shop',
  description: 'Inventory and the owner',
  body: '# Shop',
  ...over,
})

describe('parseTemplateStore', () => {
  it('reads a missing or unusable file as an empty store', () => {
    // Every one of these reaches the app as "no templates yet", which merges to
    // exactly the built-ins — a corrupt file can never empty the picker.
    for (const raw of [null, undefined, 'nonsense', 42, [], {}]) {
      expect(parseTemplateStore(raw)).toEqual(EMPTY_TEMPLATE_STORE)
    }
    expect(parseTemplateStore({ templates: 'not an array' }).templates).toEqual(
      [],
    )
  })

  it('drops only the unusable rows, keeping the rest', () => {
    const parsed = parseTemplateStore({
      version: 1,
      templates: [null, 42, {}, { id: '', name: '' }, row()],
    })

    expect(parsed.templates).toEqual([row()])
  })

  it('slugs an id for a hand-written entry that omits one', () => {
    const parsed = parseTemplateStore({
      templates: [{ name: 'Wayside Inn', body: '# Inn' }],
    })

    expect(parsed.templates[0].id).toBe('wayside-inn')
  })

  it('does not let a hand-written entry hijack a built-in id', () => {
    // The trap the stored-id design creates. Someone hand-adds a template they
    // called "Spell"; slugging it naively gives `spell`, which would silently
    // become an *override* of the built-in and change what the character
    // sheet's add-spell produces.
    const parsed = parseTemplateStore({
      templates: [{ name: 'Spell', body: '# My spell layout' }],
    })

    expect(parsed.templates[0].id).toBe('spell-2')
    const merged = mergeTemplates(parsed)
    expect(merged.find((t) => t.id === 'spell')!.origin).toBe('built-in')
    expect(merged.find((t) => t.id === 'spell')!.body).toBe(
      builtInTemplate('spell')!.body,
    )
  })

  it('keeps the first of two entries claiming the same id', () => {
    const parsed = parseTemplateStore({
      templates: [row({ name: 'First' }), row({ name: 'Second' })],
    })

    expect(parsed.templates).toHaveLength(1)
    expect(parsed.templates[0].name).toBe('First')
  })

  it('normalises an id to lower case and keeps hidden only when true', () => {
    const parsed = parseTemplateStore({
      templates: [
        { id: 'SHOP', name: 'Shop', hidden: 'yes' },
        { id: 'inn', name: 'Inn', hidden: true },
      ],
    })

    expect(parsed.templates[0].id).toBe('shop')
    expect(parsed.templates[0].hidden).toBeUndefined()
    expect(parsed.templates[1].hidden).toBe(true)
  })

  it('falls back to the current version for a missing or absurd one', () => {
    expect(parseTemplateStore({ templates: [] }).version).toBe(1)
    expect(
      parseTemplateStore({ version: Infinity, templates: [] }).version,
    ).toBe(1)
  })
})

describe('serializeTemplateStore', () => {
  it('round-trips a store unchanged', () => {
    const original = store(
      row({ id: 'spell', name: 'Spell', body: 'house rules' }),
      row({ hidden: true }),
      row({ id: 'inn', name: 'Inn', type: 'location' }),
    )

    expect(parseTemplateStore(serializeTemplateStore(original))).toEqual(
      original,
    )
  })

  it('never writes origin, and documents itself for hand-editors', () => {
    // `origin` is a product of the merge. Storing one would contradict the
    // merge on the next load — a row claiming 'built-in' that is by definition
    // an override.
    const written = serializeTemplateStore(store(row())) as Record<
      string,
      unknown
    >

    expect(JSON.stringify(written)).not.toContain('origin')
    expect(written._comment).toEqual(expect.stringContaining('overrides it'))
  })
})

describe('templateId', () => {
  it('slugs, and suffixes rather than colliding', () => {
    expect(templateId('Wayside Inn', new Set())).toBe('wayside-inn')
    expect(templateId("Sha'ir's Shop", new Set())).toBe('shairs-shop')
    expect(templateId('  ', new Set())).toBe('template')
    expect(templateId('Spell', BUILT_IN_IDS)).toBe('spell-2')
    expect(templateId('Spell', new Set([...BUILT_IN_IDS, 'spell-2']))).toBe(
      'spell-3',
    )
  })
})

describe('mergeTemplates', () => {
  it('is exactly the built-ins when nothing is stored', () => {
    const merged = mergeTemplates()

    expect(merged.map((t) => t.id)).toEqual(BUILT_IN_TEMPLATES.map((t) => t.id))
    expect(merged.every((t) => t.origin === 'built-in')).toBe(true)
  })

  it('keeps an override in the built-in slot rather than moving it', () => {
    // A Spell template that jumped to the end of the grid the moment you
    // tweaked it would be disorienting — the same rule layer() holds in
    // tables.ts.
    const at = BUILT_IN_TEMPLATES.findIndex((t) => t.id === 'spell')
    const merged = mergeTemplates(
      store(row({ id: 'spell', name: 'Spell', body: 'house rules' })),
    )

    expect(merged[at].id).toBe('spell')
    expect(merged[at].body).toBe('house rules')
    expect(merged[at].origin).toBe('override')
    expect(merged).toHaveLength(BUILT_IN_TEMPLATES.length)
  })

  it('appends a template of the user own, in authored order', () => {
    const merged = mergeTemplates(store(row(), row({ id: 'inn', name: 'Inn' })))

    expect(merged.slice(-2).map((t) => t.id)).toEqual(['shop', 'inn'])
    expect(merged.slice(-2).every((t) => t.origin === 'user')).toBe(true)
  })

  it('falls back to the built-in name when an override leaves it blank', () => {
    // A half-filled draft on disk must not render an unlabelled button.
    const merged = mergeTemplates(store(row({ id: 'spell', name: '   ' })))

    expect(merged.find((t) => t.id === 'spell')!.name).toBe('Spell')
  })

  it('emits every built-in id no matter what the store does', () => {
    // findTemplate's whole contract, as an assertion: the four hardcoded
    // lookups must resolve however the user has mangled their templates.
    const merged = mergeTemplates(
      store(
        row({ id: 'spell', name: 'Mine' }),
        row({ id: 'monster', name: 'Hidden', hidden: true }),
        row(),
        row({ id: '', name: 'No id at all' }),
      ),
    )

    for (const id of BUILT_IN_IDS) {
      expect(
        merged.some((t) => t.id === id),
        `${id} survives`,
      ).toBe(true)
    }
  })
})

describe('visibleTemplates and defaultTemplateId', () => {
  it('hides from the picker but not from the list', () => {
    const merged = mergeTemplates(
      store(row({ id: 'monster', name: 'Monster', hidden: true })),
    )

    expect(merged.some((t) => t.id === 'monster')).toBe(true)
    expect(visibleTemplates(merged).some((t) => t.id === 'monster')).toBe(false)
  })

  it('picks the first visible template when Blank is hidden', () => {
    const visible = visibleTemplates(mergeTemplates())
    expect(defaultTemplateId(visible)).toBe('blank')

    const withoutBlank = visibleTemplates(
      mergeTemplates(store(row({ id: 'blank', name: 'Blank', hidden: true }))),
    )
    expect(defaultTemplateId(withoutBlank)).toBe(withoutBlank[0].id)
    expect(defaultTemplateId(withoutBlank)).not.toBe('blank')

    // Nothing visible at all still names something, so the picker cannot end up
    // with a selection of ''.
    expect(defaultTemplateId([])).toBe('blank')
  })
})

describe('findTemplate', () => {
  it('answers from the built-ins before anything has been seeded', () => {
    // Secondary windows skip LoadingGate and never seed. They create no
    // articles, but a lookup there must still not be undefined.
    expect(findTemplate('spell')!.origin).toBe('built-in')
    expect(findTemplate('monster')).toBeDefined()
  })

  it('returns a hidden template, because hiding is about menus only', () => {
    // The load-bearing rule: hiding Monster in settings must not break the
    // bestiary's "add a monster".
    seedTemplateCache(
      store(row({ id: 'monster', name: 'Monster', hidden: true })),
    )

    expect(findTemplate('monster')).toBeDefined()
    expect(findTemplate('monster')!.hidden).toBe(true)

    seedTemplateCache(EMPTY_TEMPLATE_STORE)
  })

  it('tracks the seeded store, and is undefined only for an unknown id', () => {
    seedTemplateCache(store(row({ id: 'spell', name: 'Spell', body: 'mine' })))
    expect(findTemplate('spell')!.body).toBe('mine')

    seedTemplateCache(EMPTY_TEMPLATE_STORE)
    expect(findTemplate('spell')!.body).toBe(builtInTemplate('spell')!.body)
    expect(findTemplate('no-such-template')).toBeUndefined()
  })
})

describe('store edits', () => {
  it('upserts by id, keeping position', () => {
    const before = store(row(), row({ id: 'inn', name: 'Inn' }))
    const after = upsertTemplate(before, row({ name: 'Renamed' }))

    expect(after.templates.map((t) => t.id)).toEqual(['shop', 'inn'])
    expect(after.templates[0].name).toBe('Renamed')
  })

  it('drops an entry, which is both "reset" and "delete"', () => {
    const after = dropTemplate(
      store(row({ id: 'spell', name: 'Mine' })),
      'spell',
    )

    expect(after.templates).toEqual([])
    expect(mergeTemplates(after).find((t) => t.id === 'spell')!.origin).toBe(
      'built-in',
    )
  })

  it('materialises an override to carry hidden, then restores on drop', () => {
    const hidden = setTemplateHidden(EMPTY_TEMPLATE_STORE, 'monster', true)
    const entry = hidden.templates[0]

    expect(entry.hidden).toBe(true)
    // Otherwise a verbatim copy, so unhiding is a flag flip and not a
    // resurrection of content the user never edited.
    expect(entry.body).toBe(builtInTemplate('monster')!.body)
    expect(entry).not.toHaveProperty('origin')

    const shown = setTemplateHidden(hidden, 'monster', false)
    expect(shown.templates[0].hidden).toBe(false)
    expect(
      mergeTemplates(dropTemplate(shown, 'monster')).find(
        (t) => t.id === 'monster',
      )!.origin,
    ).toBe('built-in')
  })

  it('ignores hiding an id nothing defines', () => {
    expect(setTemplateHidden(EMPTY_TEMPLATE_STORE, 'nope', true)).toEqual(
      EMPTY_TEMPLATE_STORE,
    )
  })

  it('counts the built-ins and the store when naming a new template', () => {
    const taken = takenIds(store(row()))

    expect(taken.has('spell')).toBe(true)
    expect(taken.has('shop')).toBe(true)
    expect(templateId('Shop', taken)).toBe('shop-2')
  })
})

describe('fillPlaceholders', () => {
  it('substitutes what it knows and leaves the rest verbatim', () => {
    expect(fillPlaceholders('a {{x}} b {{y}}', { x: '1' })).toBe('a 1 b {{y}}')
    expect(fillPlaceholders('no placeholders', { x: '1' })).toBe(
      'no placeholders',
    )
  })

  it('leaves the spell template parseable before substitution', () => {
    // The placeholder is quoted in the template body for exactly this reason:
    // a bare {{level}} parses as a YAML flow mapping, so `level` would silently
    // become an object rather than a number.
    const { frontmatter } = splitFrontmatter(builtInTemplate('spell')!.body)
    const fm = parseYaml(frontmatter!) as Record<string, unknown>

    expect(fm.level).toBe('{{level}}')
  })
})
