import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  DEFAULT_SECTION,
  SETTINGS_SECTIONS,
  findSection,
} from '#/components/settings/sections'
import { Separator } from '#/components/ui/separator'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/worlds/$worldId/settings')({
  component: WorldSettingsPage,
})

/**
 * World settings: a nav rail and one section at a time.
 *
 * Deliberately a shell. Every setting lives in its own component listed in
 * components/settings/sections.ts, so adding one never means editing this file
 * — and each section owns its own save, because they save on different terms
 * (the class list has a draft to review; a three-way toggle does not).
 *
 * One section at a time rather than a long scroll: the class editor is itself a
 * master-detail list that wants the full height, which it cannot have if it is
 * queued behind everything else on the page.
 */
function WorldSettingsPage() {
  const { worldId } = Route.useParams()
  const [sectionId, setSectionId] = useState(DEFAULT_SECTION)
  const section = findSection(sectionId)
  const { Component } = section

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 p-4">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-muted-foreground text-xs">
          Stored as <code>worldSettings.json</code> in the world folder; safe to
          hand-edit. If your edits don’t show up, check it for a JSON syntax
          error. Library is the exception — it applies to every world.
        </p>
      </div>

      <Separator />

      <div className="grid min-h-0 flex-1 gap-5 md:grid-cols-[180px_1fr]">
        <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          {SETTINGS_SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-current={entry.id === section.id ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                entry.id === section.id ? 'bg-accent' : 'hover:bg-accent/50',
              )}
              onClick={() => setSectionId(entry.id)}
            >
              <entry.icon className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">{entry.label}</span>
            </button>
          ))}
        </nav>

        {/* Keyed on the section so switching away discards that section's local
            draft state rather than carrying it into the next one. */}
        <div className="flex min-h-0 flex-col">
          <Component key={section.id} worldId={worldId} />
        </div>
      </div>
    </div>
  )
}
