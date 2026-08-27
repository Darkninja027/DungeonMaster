import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { HomebrewSubclass } from '#/lib/homebrew'
import { SRD_TABLES } from '#/lib/tables'
import {
  StandaloneSubclassEditor,
  blankSubclass,
} from './StandaloneSubclassEditor'

/**
 * The tab exists because a homebrew `ClassKit` *replaces* the built-in of the
 * same name. Adding one College to the Bard meant duplicating the Bard and
 * inheriting a frozen copy of its features, equipment and spell tables — which
 * would then never see another fix. Naming the class instead leaves it alone.
 */
function Harness({ initial }: { initial?: HomebrewSubclass }) {
  const [sub, setSub] = useState<HomebrewSubclass>(initial ?? blankSubclass())
  return (
    <div>
      <StandaloneSubclassEditor
        subclass={sub}
        kits={SRD_TABLES.kits}
        onChange={setSub}
      />
      <output data-testid="state">{JSON.stringify(sub)}</output>
    </div>
  )
}

const state = (): HomebrewSubclass =>
  JSON.parse(screen.getByTestId('state').textContent || '{}')

const setClass = (name: string) =>
  fireEvent.change(screen.getByPlaceholderText('Bard'), {
    target: { value: name },
  })

describe('attaching a subclass to a class', () => {
  it('records the class by name', () => {
    render(<Harness />)
    setClass('Bard')
    expect(state().className).toBe('Bard')
  })

  it('says what it will be added to', () => {
    render(<Harness />)
    setClass('Bard')
    // The Bard ships two colleges, and the label is said once — "Bard's bard
    // colleges" is what the obvious phrasing produces.
    expect(
      screen.getByText(/alongside the 2 bard colleges Bard already has/),
    ).toBeDefined()
  })

  it('warns when no such class exists, but keeps the entry', () => {
    // Kept because the class may live in a world this global file cannot see.
    render(<Harness />)
    setClass('Blood Hunter')
    expect(screen.getByText(/No class called Blood Hunter yet/)).toBeDefined()
    expect(state().className).toBe('Blood Hunter')
  })

  it('matches its class case-insensitively', () => {
    render(<Harness />)
    setClass('  bard  ')
    expect(screen.getByText(/Bard already has/)).toBeDefined()
  })

  it('derives the id from the subclass name', () => {
    render(<Harness />)
    fireEvent.change(screen.getByPlaceholderText('College of Swords'), {
      target: { value: 'College of Swords' },
    })
    expect(state().id).toBe('college-of-swords')
  })

  it('flags a name that overrides a built-in', () => {
    render(<Harness />)
    setClass('Bard')
    fireEvent.change(screen.getByPlaceholderText('College of Swords'), {
      target: { value: 'College of Lore' },
    })
    expect(
      screen.getByText(/Overrides the existing College of Lore/),
    ).toBeDefined()
  })

  it('offers the full subclass panel, and keeps the class through an edit', () => {
    // The panel is shared with the kit editor, and its onChange must not drop
    // `className` — which is not a `SubclassInfo` field.
    render(<Harness />)
    setClass('Bard')
    fireEvent.click(screen.getByText(/Add feature/))
    expect(state().className).toBe('Bard')
    expect(state().features).toHaveLength(1)
  })

  it('floors a new feature at the class’s own archetype level', () => {
    render(<Harness />)
    setClass('Bard')
    fireEvent.click(screen.getByText(/Add feature/))
    expect(state().features[0].level).toBe(3)
  })

  it('floors it at 1 for a class that chooses at 1', () => {
    // A Cleric picks its domain at level 1, so a domain feature starts there.
    render(<Harness />)
    setClass('Cleric')
    fireEvent.click(screen.getByText(/Add feature/))
    expect(state().features[0].level).toBe(1)
  })
})
