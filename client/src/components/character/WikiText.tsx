import { Link } from '@tanstack/react-router'

/**
 * Renders a plain-text line with [[wiki links]] resolved to article links —
 * used by inventory rows and notes, where full markdown would be overkill.
 */
export function WikiText({
  text,
  worldId,
  articles,
}: {
  text: string
  worldId: string
  articles?: Array<{ id: string; title: string }>
}) {
  const parts = text.split(/(\[\[[^\][\n]+\]\])/)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[\[([^\][\n|]+)(?:\|([^\][\n]+))?\]\]$/)
        if (!m) return <span key={i}>{part}</span>
        const title = m[1].trim()
        // The alias group is optional; TS types match groups as string.
        const label = ((m[2] as string | undefined) ?? m[1]).trim()
        const target = articles?.find(
          (a) => a.title.toLowerCase() === title.toLowerCase(),
        )
        if (!target)
          return (
            <span key={i} className="underline decoration-dashed opacity-70">
              {label}
            </span>
          )
        return (
          <Link
            key={i}
            to="/worlds/$worldId/articles/$articleId"
            params={{ worldId, articleId: target.id }}
            className="text-primary underline underline-offset-2"
          >
            {label}
          </Link>
        )
      })}
    </>
  )
}
