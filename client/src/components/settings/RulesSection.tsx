import { useWorldSettingsSection } from '#/lib/useWorldSettings'
import { DEFAULT_RULESET, RULESETS } from '#/lib/ruleset'
import { cn } from '#/lib/utils'

/**
 * Which edition of the shared spell list and bestiary this world shows.
 *
 * The app ships both, seeded into one library, so without this a 2024 campaign
 * sees "Fireball" and "Fireball 5.5e" side by side in every picker.
 *
 * The scope note below is load-bearing rather than decoration: this filters two
 * libraries and nothing else. Races, classes and backgrounds come from SRD 5.1,
 * which is 2014 content, and there is no 2024 counterpart in the app — a
 * setting called "Rules" that quietly left those alone would be read as a
 * promise it doesn't keep.
 */
export function RulesSection({ worldId }: { worldId: string }) {
  const { settings, patch, isPending } = useWorldSettingsSection(worldId)
  const ruleset = settings?.ruleset ?? DEFAULT_RULESET

  return (
    <div className="grid max-w-2xl gap-4">
      <div className="grid gap-1.5">
        <h2 className="text-sm font-medium">Rules edition</h2>
        <p className="text-muted-foreground text-xs">
          Which edition's spells and monsters this world offers you.
        </p>
      </div>

      {/* Saved on click rather than behind a Save button, matching the Editor
          section: a single three-way choice has nothing to review, and the
          effect is visible in the next panel you open. */}
      <div className="grid gap-1.5">
        {RULESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={isPending}
            aria-pressed={ruleset === option.id}
            className={cn(
              'grid gap-0.5 rounded-md border px-3 py-2 text-left disabled:opacity-60',
              ruleset === option.id
                ? 'border-primary bg-accent'
                : 'hover:bg-accent/50',
            )}
            onClick={() => patch({ ruleset: option.id })}
          >
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-muted-foreground text-xs">
              {option.blurb}
            </span>
          </button>
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        This filters the shared spell list and bestiary only — nothing is
        deleted, moved or hidden on disk, and switching back shows everything
        again. An article that doesn't say which edition it belongs to, like
        your own homebrew, always shows. Races, classes and backgrounds come
        from the 2014 SRD whichever option you pick.
      </p>
    </div>
  )
}
