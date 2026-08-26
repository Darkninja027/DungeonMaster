import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { SubclassInfo } from '#/lib/srd'
import { SubclassEditor } from './SubclassEditor'

/**
 * A homebrew subclass could always be *represented* — `parseSubclasses` reads
 * features, summary, spells and a grant, and `serializeSubclass` writes them —
 * but there was nowhere to author one. The kit editor showed a list of names
 * and apologised for the rest, and renaming an entry silently discarded
 * whatever it carried.
 */
function Harness({ initial = [] }: { initial?: Array<SubclassInfo> }) {
  const [subs, setSubs] = useState<Array<SubclassInfo>>(initial)
  return (
    <div>
      <SubclassEditor
        subclasses={subs}
        onChange={setSubs}
        label="Subclasses"
        subclassLevel={3}
      />
      <output data-testid="state">{JSON.stringify(subs)}</output>
    </div>
  )
}

const state = () => JSON.parse(screen.getByTestId('state').textContent || '[]')

const rich: SubclassInfo = {
  id: 'champion',
  name: 'Champion',
  summary: 'Raw physical power.',
  features: [{ level: 3, name: 'Improved Critical', text: 'Crits on 19-20.' }],
}

describe('adding a subclass', () => {
  it('actually adds a row', () => {
    // The first version routed through `reconcileSubclasses`, which rebuilds
    // the list from names and drops empty ones — so a blank new row was
    // discarded and the button did nothing at all.
    render(<Harness />)
    expect(state()).toHaveLength(0)
    fireEvent.click(screen.getByLabelText(/^Add /))
    expect(state()).toHaveLength(1)
  })

  it('opens the new row so it can be named straight away', () => {
    render(<Harness />)
    fireEvent.click(screen.getByLabelText(/^Add /))
    expect(screen.getByPlaceholderText('Champion')).toBeDefined()
  })

  it('derives the id from the name as it is typed', () => {
    render(<Harness />)
    fireEvent.click(screen.getByLabelText(/^Add /))
    fireEvent.change(screen.getByPlaceholderText('Champion'), {
      target: { value: 'Order of the Lycan' },
    })
    expect(state()[0].name).toBe('Order of the Lycan')
    expect(state()[0].id).toBe('order-of-the-lycan')
  })
})

describe('editing a subclass', () => {
  it('keeps features across a rename', () => {
    // The whole reason this replaced the old TokenField: it matched on name,
    // so a rename read as "delete one, add another" and lost the features.
    render(<Harness initial={[rich]} />)
    fireEvent.click(screen.getByLabelText('Expand'))
    fireEvent.change(screen.getByPlaceholderText('Champion'), {
      target: { value: 'Gladiator' },
    })
    expect(state()[0].name).toBe('Gladiator')
    expect(state()[0].features).toHaveLength(1)
    expect(state()[0].summary).toBe('Raw physical power.')
  })

  it('edits a feature without dropping what the form cannot show', () => {
    // `picks` and `resource` have no UI here. Spreading the original in
    // `patchAt` is what keeps them, and silently dropping one would be worse
    // than not offering the edit at all.
    const withPick: SubclassInfo = {
      ...rich,
      features: [
        {
          level: 3,
          name: 'Combat Superiority',
          resource: { name: 'Superiority Dice', total: 4, resets: 'short' },
          picks: [
            {
              id: 'x-maneuvers',
              kind: 'feature',
              label: 'Choose',
              count: 1,
              options: ['Riposte'],
            },
          ],
        },
      ],
    }
    render(<Harness initial={[withPick]} />)
    fireEvent.click(screen.getByLabelText('Expand'))
    fireEvent.change(screen.getByPlaceholderText('Improved Critical'), {
      target: { value: 'Renamed' },
    })
    const feature = state()[0].features[0]
    expect(feature.name).toBe('Renamed')
    expect(feature.picks).toHaveLength(1)
    expect(feature.resource.total).toBe(4)
  })

  it('adds a feature at the class’s own subclass level', () => {
    // A Fighter picks its archetype at 3, so a new feature defaults to 3 —
    // level 1 would fail the srd invariant and never be granted.
    render(<Harness initial={[rich]} />)
    fireEvent.click(screen.getByLabelText('Expand'))
    fireEvent.click(screen.getByText(/Add feature/))
    expect(state()[0].features[1].level).toBe(3)
  })

  it('clears an emptied summary back to undefined', () => {
    // So `isBareSubclass` still recognises it and it serializes as a bare name
    // rather than an object with an empty string in it.
    render(<Harness initial={[rich]} />)
    fireEvent.click(screen.getByLabelText('Expand'))
    fireEvent.change(
      screen.getByPlaceholderText('One line, shown on the option card.'),
      { target: { value: '  ' } },
    )
    expect(state()[0].summary).toBeUndefined()
  })

  it('removes the right row', () => {
    render(
      <Harness
        initial={[rich, { id: 'thief', name: 'Thief', features: [] }]}
      />,
    )
    fireEvent.click(screen.getByLabelText('Remove Champion'))
    expect(state().map((s: SubclassInfo) => s.name)).toEqual(['Thief'])
  })

  it('summarises what a collapsed row carries', () => {
    render(<Harness initial={[rich]} />)
    expect(screen.getByText('1 feature')).toBeDefined()
  })
})
