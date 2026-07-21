import { Link } from '@tanstack/react-router'

/**
 * Renders a plain-text line with [[wiki links]] resolved to article links —
 * used by inventory rows and notes, where full markdown would be overkill.
 * Unresolved links offer to create the missing article when a handler is
 * provided (same flow as the editor preview).
 */
export function WikiText({
  text,
  worldId,
  articles,
  onCreateMissing,
}: {
  text: string
  worldId: string
  articles?: Array<{ id: string; title: string }>
  onCreateMissing?: (title: string) => void
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
        if (!target) {
          if (!onCreateMissing) {
            return (
              <span key={i} className="underline decoration-dashed opacity-70">
                {label}
              </span>
            )
          }
          return (
            <button
              key={i}
              type="button"
              title={`No article called "${title}" yet — click to create it`}
              className="cursor-pointer underline decoration-dashed opacity-70 hover:opacity-100"
              onClick={() => onCreateMissing(title)}
            >
              {label}
            </button>
          )
        }
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
