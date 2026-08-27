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

describe('a fully custom subclass', () => {
  /** Expand the single row these tests render. */
  const expand = () => fireEvent.click(screen.getByLabelText('Expand'))

  it('adds an always-prepared spell row at the right two levels', () => {
    // `grantedAt` is a *character* level and `level` is a *spell* level. They
    // are different numbers and conflating them is the easy mistake, so the
    // defaults have to be right: a Cleric row starts at character level 1 for
    // 1st-level spells.
    render(<Harness initial={[rich]} />)
    expand()
    fireEvent.click(screen.getByLabelText('Add spell row'))
    expect(state()[0].spells).toEqual([{ grantedAt: 3, level: 1, names: [] }])
  })

  it('empties bonus spells back to undefined', () => {
    // Not `[]`: `isBareSubclass` checks for undefined, so an emptied list would
    // otherwise keep the subclass looking like it carries something and stop it
    // serializing as a plain name.
    render(<Harness initial={[rich]} />)
    expand()
    fireEvent.click(screen.getByLabelText('Add spell row'))
    expect(state()[0].spells).toHaveLength(1)
    fireEvent.click(screen.getByLabelText(/^Remove level 1 spells$/))
    expect(state()[0].spells).toBeUndefined()
  })

  it('turns spellcasting on with a usable default', () => {
    render(<Harness initial={[rich]} />)
    expand()
    fireEvent.click(screen.getByLabelText(/^Casts spells from level/))
    const sc = state()[0].spellcasting
    expect(sc.ability).toBe('int')
    // The list label is seeded from the subclass name, because
    // `spellListClass` derives "whose spell list?" from exactly this string.
    expect(sc.listLabel).toBe('Champion spells')
  })

  it('turns spellcasting back off to undefined', () => {
    render(<Harness initial={[rich]} />)
    expand()
    const box = screen.getByLabelText(/^Casts spells from level/)
    fireEvent.click(box)
    expect(state()[0].spellcasting).toBeDefined()
    fireEvent.click(box)
    expect(state()[0].spellcasting).toBeUndefined()
  })

  it('lets the spell list be renamed, for a third caster', () => {
    // An Arcane Trickster is a Rogue casting *wizard* spells. Without this the
    // label was fixed to the owner's name and suggestions came back empty.
    render(<Harness initial={[rich]} />)
    expand()
    fireEvent.click(screen.getByLabelText(/^Casts spells from level/))
    fireEvent.change(screen.getByPlaceholderText('Wizard spells'), {
      target: { value: 'Wizard spells' },
    })
    expect(state()[0].spellcasting.listLabel).toBe('Wizard spells')
  })

  it('says the subclass casts from its own archetype level', () => {
    // A class casts "at 1st level"; a subclass casts from the level the
    // archetype is chosen, which is what the harness passes as 3.
    render(<Harness initial={[rich]} />)
    expand()
    expect(screen.getByLabelText('Casts spells from level 3')).toBeDefined()
  })
})
