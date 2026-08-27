import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { HomebrewSubclass } from '#/lib/homebrew'
import { isBareSubclass } from '#/lib/homebrew'
import { SRD_TABLES } from '#/lib/tables'
import { SubclassWizard } from './SubclassWizard'

/**
 * The wizard exists because the flat form had no spine: every field was
 * optional and nothing said which two actually mattered. These tests pin the
 * two gates, the discardable draft, and the one silent-loss case the review
 * step is there to catch.
 */
function Harness() {
  const [created, setCreated] = useState<HomebrewSubclass | null>(null)
  const [cancelled, setCancelled] = useState(false)
  return (
    <div>
      <SubclassWizard
        open
        kits={SRD_TABLES.kits}
        onCancel={() => setCancelled(true)}
        onCreate={setCreated}
      />
      <output data-testid="created">
        {created ? JSON.stringify(created) : ''}
      </output>
      <output data-testid="cancelled">{String(cancelled)}</output>
    </div>
  )
}

const created = (): HomebrewSubclass | null => {
  const text = screen.getByTestId('created').textContent
  return text ? JSON.parse(text) : null
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /Next/ }))
const setClass = (name: string) =>
  fireEvent.change(screen.getByPlaceholderText('Bard'), {
    target: { value: name },
  })
const setName = (name: string) =>
  fireEvent.change(screen.getByPlaceholderText('College of Swords'), {
    target: { value: name },
  })

/** Class -> name -> features, the path every later step sits behind. */
const startWith = (className: string, name: string) => {
  setClass(className)
  next()
  setName(name)
  next()
}

describe('the two questions that gate', () => {
  it('will not advance without a class', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: /Next/ })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('advances once a class is named', () => {
    render(<Harness />)
    setClass('Bard')
    expect(screen.getByRole('button', { name: /Next/ })).toHaveProperty(
      'disabled',
      false,
    )
  })

  it('will not advance past a blank name', () => {
    // Both gates exist because `parseHomebrewSubclasses` drops an entry with a
    // blank className *or* a blank name — it would vanish on the next load.
    render(<Harness />)
    setClass('Bard')
    next()
    expect(screen.getByRole('button', { name: /Next/ })).toHaveProperty(
      'disabled',
      true,
    )
  })
})

describe('what the class answers', () => {
  it('says what it will be added to', () => {
    render(<Harness />)
    setClass('Bard')
    expect(
      screen.getByText(/alongside the 2 bard colleges Bard already has/),
    ).toBeDefined()
  })

  it('warns when no such class exists, but keeps going', () => {
    render(<Harness />)
    setClass('Blood Hunter')
    expect(screen.getByText(/No class called Blood Hunter yet/)).toBeDefined()
    expect(screen.getByRole('button', { name: /Next/ })).toHaveProperty(
      'disabled',
      false,
    )
  })

  it('labels the name field with what the class calls its subclasses', () => {
    render(<Harness />)
    setClass('Bard')
    next()
    expect(screen.getByText('Bard College')).toBeDefined()
  })

  it('floors a feature at the class’s own archetype level', () => {
    render(<Harness />)
    startWith('Bard', 'College of Swords')
    fireEvent.click(screen.getByText(/Add feature/))
    next()
    next()
    expect(screen.getByText(/1 feature, from level 3/)).toBeDefined()
  })

  it('floors it at 1 for a class that chooses at 1', () => {
    // A Cleric picks its domain at level 1, so a domain feature starts there.
    render(<Harness />)
    startWith('Cleric', 'Forge Domain')
    fireEvent.click(screen.getByText(/Add feature/))
    next()
    next()
    expect(screen.getByText(/1 feature, from level 1/)).toBeDefined()
  })
})

describe('the draft', () => {
  it('commits nothing until the end', () => {
    render(<Harness />)
    startWith('Bard', 'College of Swords')
    expect(created()).toBeNull()
  })

  it('commits nothing when cancelled halfway', () => {
    render(<Harness />)
    startWith('Bard', 'College of Swords')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(created()).toBeNull()
    expect(screen.getByTestId('cancelled').textContent).toBe('true')
  })

  it('derives the id from the name', () => {
    render(<Harness />)
    startWith('Bard', 'College of Swords')
    next()
    next()
    fireEvent.click(screen.getByRole('button', { name: /Create subclass/ }))
    expect(created()?.id).toBe('college-of-swords')
  })

  it('keeps the class through a features edit', () => {
    // `SubclassInfo` has no `className`; the shared parts drop it and the
    // wizard has to re-attach it, exactly as StandaloneSubclassEditor does.
    render(<Harness />)
    startWith('Bard', 'College of Swords')
    fireEvent.click(screen.getByText(/Add feature/))
    next()
    next()
    fireEvent.click(screen.getByRole('button', { name: /Create subclass/ }))
    expect(created()?.className).toBe('Bard')
    expect(created()?.features).toHaveLength(1)
  })

  it('finishes bare under a new name, and stays serializable as one', () => {
    // Class + name alone is a legitimate finish: it appends fine.
    render(<Harness />)
    startWith('Bard', 'College of Swords')
    next()
    next()
    fireEvent.click(screen.getByRole('button', { name: /Create subclass/ }))
    const result = created()
    expect(result).not.toBeNull()
    expect(isBareSubclass(result!)).toBe(true)
  })

  it('offers the full form as an escape once both answers are given', () => {
    render(<Harness />)
    startWith('Bard', 'College of Swords')
    fireEvent.click(screen.getByRole('button', { name: /Skip to the full form/ }))
    expect(created()?.name).toBe('College of Swords')
  })

  it('offers no escape before the name is given', () => {
    render(<Harness />)
    setClass('Bard')
    expect(screen.queryByText(/Skip to the full form/)).toBeNull()
  })
})

describe('the review step', () => {
  it('warns that a bare subclass colliding with an existing one is ignored', () => {
    // `layerSubclasses` skips an incoming *bare* subclass whose name the class
    // already has, so this one would save to disk and never appear anywhere.
    render(<Harness />)
    startWith('Bard', 'College of Lore')
    next()
    next()
    expect(screen.getByText(/it would be ignored/)).toBeDefined()
  })

  it('does not warn for a bare subclass under a fresh name', () => {
    render(<Harness />)
    startWith('Bard', 'College of Swords')
    next()
    next()
    expect(screen.queryByText(/it would be ignored/)).toBeNull()
  })

  it('stops warning once the colliding subclass carries something', () => {
    render(<Harness />)
    startWith('Bard', 'College of Lore')
    fireEvent.click(screen.getByText(/Add feature/))
    next()
    next()
    expect(screen.queryByText(/it would be ignored/)).toBeNull()
  })

  it('says what will be added', () => {
    render(<Harness />)
    startWith('Bard', 'College of Swords')
    next()
    next()
    // Named twice on this step — once in the rail's summary line, once in the
    // review body — so match the sentence rather than the bare name.
    expect(
      screen.getByText(/Adds/).textContent.replace(/\s+/g, ' '),
    ).toContain('Adds College of Swords to the Bard')
    expect(screen.getByText(/No features yet/)).toBeDefined()
  })
})
