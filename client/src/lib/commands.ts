import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Castle,
  Eraser,
  FilePlus,
  FolderPlus,
  MonitorX,
  Moon,
  Settings2,
  UserPlus,
} from 'lucide-react'
import { api } from '#/lib/api'
import { emitPaletteAction } from '#/lib/paletteActions'
import { clearRollLog } from '#/lib/rollLog'
import { isDark, setTheme } from '#/lib/theme'
import type { WorldMode } from '#/lib/worldMode'

/**
 * What a command can reach. Everything a command needs is passed in rather
 * than imported, so the registry stays a plain data array with no React
 * dependencies and no registration machinery — same shape as articleTemplates.
 */
export interface CommandContext {
  worldId: string
  /** Navigate to a route path (already interpolated). */
  navigate: (to: string) => void
}

/**
 * The open world's mode, so the palette can't offer a command whose surface is
 * hidden — "New folder" in a mode with no content tree would appear to do
 * nothing. Passed in rather than read here, keeping this file a plain data
 * array with no React dependencies.
 */
export interface CommandFilter {
  mode: WorldMode
}

export interface Command {
  id: string
  label: string
  /** Extra words matched against the query beyond the label. */
  keywords: Array<string>
  icon: LucideIcon
  /**
   * Modes this command applies to. Absent means every mode — most commands
   * (theme, reveal, go home) are about the app rather than a surface.
   */
  modes?: Array<WorldMode>
  run: (ctx: CommandContext) => void
}

export const commands: Array<Command> = [
  {
    // The only global handle on the secondary windows — player views and
    // pop-out references alike. One that has drifted onto a disconnected
    // monitor cannot be closed any other way.
    id: 'close-player-windows',
    label: 'Close all extra windows',
    keywords: [
      'projector',
      'players',
      'second',
      'screen',
      'monitor',
      'show',
      'popout',
      'pop out',
      'reference',
      'close',
    ],
    icon: MonitorX,
    modes: ['dm'],
    run: () => {
      void api.player.closeAll()
    },
  },
  {
    id: 'new-article',
    label: 'New article',
    keywords: ['create', 'page', 'note', 'add'],
    icon: FilePlus,
    modes: ['worldbuilder', 'dm'],
    run: () => emitPaletteAction({ kind: 'new-article' }),
  },
  {
    id: 'new-folder',
    label: 'New folder',
    keywords: ['create', 'directory', 'add'],
    icon: FolderPlus,
    modes: ['worldbuilder', 'dm'],
    run: () => emitPaletteAction({ kind: 'new-folder' }),
  },
  {
    id: 'new-character',
    label: 'New character',
    keywords: ['create', 'pc', 'player', 'sheet', 'add'],
    icon: UserPlus,
    modes: ['dm', 'player'],
    run: () => emitPaletteAction({ kind: 'new-character' }),
  },
  {
    id: 'world-settings',
    label: 'World settings',
    keywords: ['classes', 'subclasses', 'homebrew', 'configure'],
    icon: Settings2,
    run: (ctx) => ctx.navigate(`/worlds/${ctx.worldId}/settings`),
  },
  {
    id: 'reveal-world',
    label: 'Reveal world folder in Explorer',
    keywords: ['open', 'file', 'disk', 'finder', 'show'],
    icon: Castle,
    run: (ctx) => {
      void api.shell.reveal(ctx.worldId)
    },
  },
  {
    id: 'toggle-theme',
    label: 'Toggle light / dark theme',
    keywords: ['dark', 'light', 'appearance', 'mode'],
    icon: Moon,
    run: () => setTheme(isDark() ? 'light' : 'dark'),
  },
  {
    id: 'clear-rolls',
    label: 'Clear roll history',
    keywords: ['dice', 'log', 'reset', 'empty'],
    icon: Eraser,
    modes: ['dm', 'player'],
    run: () => clearRollLog(),
  },
  {
    id: 'go-home',
    label: 'Go to worlds home',
    keywords: ['worlds', 'back', 'exit', 'list'],
    icon: BookOpen,
    run: (ctx) => ctx.navigate('/'),
  },
]

/**
 * Commands matching a query, best first. Substring-based rather than the
 * fuzzier article scoring — a command list is short and exact wording is
 * predictable, so subsequence matching would only add noise.
 */
export function matchCommands(
  query: string,
  filter?: CommandFilter,
): Array<Command> {
  const available = filter
    ? commands.filter((c) => !c.modes || c.modes.includes(filter.mode))
    : commands
  const q = query.trim().toLowerCase()
  if (!q) return available
  const scored: Array<{ command: Command; score: number }> = []
  for (const command of available) {
    const label = command.label.toLowerCase()
    let score = 0
    if (label.startsWith(q)) score = 100
    else if (label.includes(q)) score = 50
    else if (command.keywords.some((k) => k.toLowerCase().includes(q)))
      score = 25
    if (score > 0) scored.push({ command, score })
  }
  return scored
    .sort(
      (a, b) =>
        b.score - a.score || a.command.label.localeCompare(b.command.label),
    )
    .map((s) => s.command)
}
