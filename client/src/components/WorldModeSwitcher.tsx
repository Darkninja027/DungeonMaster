import { Check } from 'lucide-react'
import { WORLD_MODES } from '#/lib/worldMode'
import {
  useIsVault,
  useWorldMode,
  useWorldSettingsSection,
} from '#/lib/useWorldSettings'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

/**
 * Switches which of the app's three jobs this world is showing.
 *
 * Always visible, unlike the pencil and gear beside it, because it reports
 * state as well as offering an action — a hidden control that silently explains
 * where the sidebar went is the one thing this must not be.
 *
 * The write goes through `patch`, which merges against what is on disk, so
 * flipping a mode can't erase a class list or homebrew someone is editing in
 * another tab.
 */
export function WorldModeSwitcher({ worldId }: { worldId: string }) {
  const mode = useWorldMode(worldId)
  const isVault = useIsVault(worldId)
  const { patch, isPending } = useWorldSettingsSection(worldId)
  const Icon = mode.icon

  // The vault holds characters and nothing else, so there is no choice to
  // offer — a dropdown whose other two entries lead somewhere empty reads as a
  // bug. A plain label keeps the header looking deliberate rather than as
  // though the control failed to load.
  if (isVault) {
    return (
      <span
        className="text-muted-foreground flex shrink-0 items-center gap-1 px-1.5 text-xs"
        title="Your character vault always shows characters — it isn't a campaign world."
      >
        <Icon className="size-3.5" />
        Characters
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-6 shrink-0 gap-1 px-1.5 text-xs"
          disabled={isPending}
          title={`${mode.label} — click to change what this world shows`}
        >
          <Icon className="size-3.5" />
          {mode.short}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          What is this world for?
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {WORLD_MODES.map((entry) => {
          const EntryIcon = entry.icon
          const active = entry.id === mode.id
          return (
            <DropdownMenuItem
              key={entry.id}
              className="items-start gap-2"
              onClick={() => {
                if (!active) patch({ mode: entry.id })
              }}
            >
              <EntryIcon className="mt-0.5 size-4 shrink-0" />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className={cn('text-sm', active && 'font-medium')}>
                  {entry.label}
                </span>
                <span className="text-muted-foreground text-xs leading-snug">
                  {entry.blurb}
                </span>
              </div>
              {active && <Check className="mt-0.5 size-3.5 shrink-0" />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <p className="text-muted-foreground px-2 py-1.5 text-xs leading-snug">
          This only changes what you see. Nothing moves on disk, and every page
          stays reachable by link.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
