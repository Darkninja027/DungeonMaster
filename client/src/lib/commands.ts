import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Castle,
  Eraser,
  FilePlus,
  FolderPlus,
  Moon,
  Settings2,
  UserPlus,
} from 'lucide-react'
import { api } from '#/lib/api'
import { emitPaletteAction } from '#/lib/paletteActions'
import { clearRollLog } from '#/lib/rollLog'
import { isDark, setTheme } from '#/lib/theme'

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

export interface Command {
  id: string
  label: string
  /** Extra words matched against the query beyond the label. */
  keywords: Array<string>
  icon: LucideIcon
  run: (ctx: CommandContext) => void
}

export const commands: Array<Command> = [
  {
    id: 'new-article',
    label: 'New article',
    keywords: ['create', 'page', 'note', 'add'],
    icon: FilePlus,
    run: () => emitPaletteAction({ kind: 'new-article' }),
  },
  {
    id: 'new-folder',
    label: 'New folder',
    keywords: ['create', 'directory', 'add'],
    icon: FolderPlus,
    run: () => emitPaletteAction({ kind: 'new-folder' }),
  },
  {
    id: 'new-character',
    label: 'New character',
    keywords: ['create', 'pc', 'player', 'sheet', 'add'],
    icon: UserPlus,
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
export function matchCommands(query: string): Array<Command> {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  const scored: Array<{ command: Command; score: number }> = []
  for (const command of commands) {
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
