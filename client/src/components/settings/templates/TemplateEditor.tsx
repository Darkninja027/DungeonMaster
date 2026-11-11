import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { BUILT_IN_TEMPLATES, newArticleContent } from '#/lib/templates'
import type { ArticleTemplate } from '#/lib/templates'

/**
 * The detail pane: one template's fields, plus a preview of what an article
 * made from it actually starts as.
 *
 * The preview earns its place because `newArticleContent` is not obvious from
 * the fields alone — it prepends a `type:` + empty `tags:` header, but only
 * when the template declares a type *and* its body has no frontmatter of its
 * own. Someone editing the Spell template needs to see that their own
 * frontmatter is what survives.
 */

/** The `type` values the built-ins use, offered as a datalist rather than a
 * closed list — `type` is free text on disk, and a world can query any value
 * someone invents. */
const KNOWN_TYPES = [
  ...new Set(BUILT_IN_TEMPLATES.map((t) => t.type).filter((t) => t != null)),
].sort()

/**
 * Placeholders substituted when the app creates an article from a template, by
 * template id. Only the spell template has any: the character sheet's add-spell
 * fills them in when it files a new spell.
 *
 * Shown rather than merely documented, because a template that drops its
 * placeholders still works — it just stops being stamped, and nothing would
 * otherwise tell the author that.
 */
const PLACEHOLDERS: Record<
  string,
  Array<{ token: string; what: string }> | undefined
> = {
  spell: [
    { token: '{{level}}', what: 'the spell level, as a number' },
    { token: '{{levelLabel}}', what: '“Cantrip” or “Level 3”' },
  ],
}

export function TemplateEditor({
  template,
  onChange,
}: {
  template: ArticleTemplate
  /** A patch, so the caller can spread it over the stored entry and keep
   *  whatever a form cannot show. */
  onChange: (patch: Partial<ArticleTemplate>) => void
}) {
  const placeholders = PLACEHOLDERS[template.id]
  const preview = newArticleContent(template)
  const synthesised = preview !== template.body

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="template-name" className="text-xs">
            Name
          </Label>
          <Input
            id="template-name"
            className="h-8 text-sm"
            value={template.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="template-type" className="text-xs">
            Article type
          </Label>
          <Input
            id="template-type"
            list="template-types"
            className="h-8 text-sm"
            placeholder="none"
            value={template.type ?? ''}
            onChange={(e) => onChange({ type: e.target.value })}
          />
          <datalist id="template-types">
            {KNOWN_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="template-description" className="text-xs">
          Description
        </Label>
        <Input
          id="template-description"
          className="h-8 text-sm"
          placeholder="What this template is for"
          value={template.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
        <p className="text-muted-foreground text-xs">
          Shown under the name in the New-article picker.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-1.5">
        <Label htmlFor="template-body" className="text-xs">
          Body
        </Label>
        <Textarea
          id="template-body"
          className="min-h-50 flex-1 font-mono text-xs"
          placeholder="# Heading&#10;&#10;What a new article starts as."
          value={template.body}
          onChange={(e) => onChange({ body: e.target.value })}
        />
      </div>

      {placeholders && (
        <div className="text-muted-foreground text-xs">
          <span className="text-foreground font-medium">Placeholders.</span>{' '}
          Filled in when the character sheet creates a spell:{' '}
          {placeholders.map((p, i) => (
            <span key={p.token}>
              {i > 0 && ', '}
              <code className="text-foreground">{p.token}</code> — {p.what}
            </span>
          ))}
          . Remove them and the spell is still created, just without the level
          filled in.
        </div>
      )}

      <div className="grid gap-1.5">
        <Label className="text-xs">A new article starts as</Label>
        <pre className="bg-muted text-muted-foreground max-h-40 overflow-auto rounded p-2 font-mono text-[11px] whitespace-pre-wrap">
          {preview.trim() === '' ? 'an empty article' : preview}
        </pre>
        <p className="text-muted-foreground text-xs">
          {synthesised
            ? 'The type and tags header is added for you, because this body has no frontmatter of its own.'
            : template.body.trimStart().startsWith('---')
              ? 'This body carries its own frontmatter, so it is used exactly as written and the type above is ignored.'
              : 'No type set, so the article starts with no frontmatter.'}
        </p>
      </div>
    </div>
  )
}
