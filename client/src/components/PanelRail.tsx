import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import type { LucideIcon } from 'lucide-react'

/**
 * The docked right-hand panel: a vertical strip of icons, and the open one's
 * body beside it.
 *
 * Generic over the tab id so the DM's session panel and a guest's table panel
 * are the SAME component rather than two that look alike. They had drifted into
 * two — the guest's was a row of labelled buttons — and the difference was not
 * a decision anyone made, just the order the two were written in. Same reason
 * WizardRail is shared by three wizards.
 *
 * Clicking the open tab closes the panel, which is what makes the rail a
 * toggle rather than a menu; the caller owns that state so it can persist it.
 */

export interface PanelRailTab<T extends string> {
  id: T
  icon: LucideIcon
  /** Panel heading when this tab is open. */
  title: string
  /** Rail tooltip. Reads as an action, where `title` reads as a heading. */
  hint?: string
  /** A dot on the rail icon when there is something in here. */
  count?: number
}

export function PanelRail<T extends string>({
  tabs,
  open,
  active,
  onToggle,
  header,
  children,
  width = 'w-85',
}: {
  tabs: Array<PanelRailTab<T>>
  open: boolean
  active: T
  /** Called with the tab clicked; the caller decides open/close. */
  onToggle: (id: T) => void
  /** Optional row above the panel body — a session's name, a Leave button. */
  header?: React.ReactNode
  /** The open tab's body. */
  children: React.ReactNode
  width?: string
}) {
  if (tabs.length === 0) return null
  const shown = tabs.find((t) => t.id === active) ?? tabs[0]

  return (
    <div className="flex h-full shrink-0 border-l">
      {open && (
        <div className={cn('flex h-full flex-col border-r', width)}>
          {header}
          <div className="border-b px-3 py-2">
            <h3 className="text-sm font-semibold">{shown.title}</h3>
          </div>
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      )}
      <div className="flex flex-col items-center gap-1 px-1.5 py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = open && shown.id === tab.id
          return (
            <Button
              key={tab.id}
              variant={isActive ? 'secondary' : 'ghost'}
              size="icon"
              className="relative size-8"
              title={tab.hint ?? tab.title}
              onClick={() => onToggle(tab.id)}
            >
              <Icon className="size-4" />
              {(tab.count ?? 0) > 0 && (
                <span
                  className={cn(
                    'bg-primary absolute top-1 right-1 size-1.5 rounded-full',
                    isActive && 'hidden',
                  )}
                />
              )}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
