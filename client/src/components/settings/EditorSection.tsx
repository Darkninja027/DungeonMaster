import { useWorldSettingsSection } from '#/lib/useWorldSettings'
import { DEFAULT_SETTINGS } from '#/lib/worldSettings'
import type { LiveEditMode } from '#/lib/worldSettings'
import { cn } from '#/lib/utils'

/**
 * Which editing surface this world's articles open with.
 *
 * Wording follows the article's Write tab: "Live edit" is the button there, so
 * these name the same thing rather than describing the mechanism. Choosing
 * anything other than Remember removes that button — a per-article override
 * would contradict a preference set deliberately for the whole world.
 */
const OPTIONS: Array<{
  mode: LiveEditMode
  label: string
  description: string
}> = [
  {
    mode: 'remember',
    label: 'Remember my choice',
    description:
      'Every article keeps a Live edit button in its Write tab, and whichever you used last is the one you get next time.',
  },
  {
    mode: 'always',
    label: 'Always live edit',
    description:
      'Articles open with markdown syntax hidden as you type — bold reads as bold, and the markers reappear when your cursor enters them. No Live edit button.',
  },
  {
    mode: 'never',
    label: 'Always plain text',
    description:
      'Articles open in the plain markdown editor, with [[ ]] and image autocomplete. No Live edit button.',
  },
]

export function EditorSection({ worldId }: { worldId: string }) {
  const { settings, patch, isPending } = useWorldSettingsSection(worldId)
  const liveEdit = settings?.liveEdit ?? DEFAULT_SETTINGS.liveEdit

  return (
    <div className="grid max-w-2xl gap-4">
      <div className="grid gap-1.5">
        <h2 className="text-sm font-medium">Editing articles</h2>
        <p className="text-muted-foreground text-xs">
          How articles in this world open when you edit them.
        </p>
      </div>

      {/* Saved on click rather than behind a Save button: a single three-way
          choice has nothing to review, and its effect is visible immediately
          in the next article you open. */}
      <div className="grid gap-1.5">
        {OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            disabled={isPending}
            aria-pressed={liveEdit === option.mode}
            className={cn(
              'grid gap-0.5 rounded-md border px-3 py-2 text-left disabled:opacity-60',
              liveEdit === option.mode
                ? 'border-primary bg-accent'
                : 'hover:bg-accent/50',
            )}
            onClick={() => patch({ liveEdit: option.mode })}
          >
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-muted-foreground text-xs">
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
