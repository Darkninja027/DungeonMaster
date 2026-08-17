import { BookOpen, Pencil } from 'lucide-react'
import { ClassesSection } from './ClassesSection'
import { EditorSection } from './EditorSection'
import type { LucideIcon } from 'lucide-react'

/**
 * Every section of the world settings page, in the order the nav lists them.
 *
 * Adding a setting means adding a component and one entry here — the route
 * itself is a shell that renders whichever of these is selected, and never
 * needs to know what any of them contain.
 *
 * `id` reaches the URL as ?section=, so treat these as stable: renaming one
 * breaks any link someone has kept.
 */
export interface SettingsSection {
  id: string
  label: string
  icon: LucideIcon
  /** One line under the heading, so a section explains itself before you click. */
  blurb: string
  Component: (props: { worldId: string }) => React.ReactNode
}

export const SETTINGS_SECTIONS: Array<SettingsSection> = [
  {
    id: 'editor',
    label: 'Editor',
    icon: Pencil,
    blurb: 'How articles open for editing.',
    Component: EditorSection,
  },
  {
    id: 'classes',
    label: 'Classes',
    icon: BookOpen,
    blurb: 'Homebrew classes offered on character sheets.',
    Component: ClassesSection,
  },
]

export const DEFAULT_SECTION = SETTINGS_SECTIONS[0].id

/** Falls back to the first section for an unknown or absent ?section=. */
export function findSection(id: string | undefined): SettingsSection {
  return (
    SETTINGS_SECTIONS.find((s) => s.id === id) ?? SETTINGS_SECTIONS[0]
  )
}
