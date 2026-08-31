import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { ClassFeatureInfo, PickList } from '#/lib/srd'
import { FeatureRows } from './FeatureRows'
import { PickRows } from './PickEditor'

/**
 * A per-level choice — "College of Swords at 3rd level lets you choose between
 * two Fighting Styles" — was unauthorable by any route until this. The data
 * model always supported it (the Champion's second Fighting Style ships), but
 * `parseFeatures` dropped `picks` on load, so hand-writing one into
 * homebrew.json parsed to nothing and the next save wrote the loss back out.
 */
function PickHarness({ initial = [] }: { initial?: Array<PickList> }) {
  const [picks, setPicks] = useState<Array<PickList>>(initial)
  return (
    <div>
      <PickRows picks={picks} onChange={setPicks} />
      <output data-testid="state">{JSON.stringify(picks)}</output>
    </div>
  )
}

function FeatureHarness({
  initial = [],
}: {
  initial?: Array<ClassFeatureInfo>
}) {
  const [features, setFeatures] = useState<Array<ClassFeatureInfo>>(initial)
  return (
    <div>
      <FeatureRows features={features} onChange={setFeatures} minLevel={3} />
      <output data-testid="state">{JSON.stringify(features)}</output>
    </div>
  )
}

const state = <T,>(): T =>
  JSON.parse(screen.getByTestId('state').textContent || '[]')

const addToken = (value: string) => {
  const input = screen.getByPlaceholderText('Dueling')
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('authoring a choice', () => {
  it('defaults a new choice to the feature kind', () => {
    // The kind whose answer becomes a row on the sheet, and the reason this
    // editor exists — it was missing from the old dropdown entirely.
    render(<PickHarness />)
    fireEvent.click(screen.getByText(/Add choice/))
    expect(state<Array<PickList>>()[0].kind).toBe('feature')
  })

  it('offers feature, spell and cantrip, which the old dropdown did not', () => {
    render(<PickHarness initial={[blank()]} />)
    const options = [
      ...screen.getByLabelText('What kind of choice').querySelectorAll('option'),
    ].map((o) => o.getAttribute('value'))
    expect(options).toContain('feature')
    expect(options).toContain('spell')
    expect(options).toContain('cantrip')
  })

  it('records the options as chips', () => {
    render(<PickHarness initial={[blank()]} />)
    addToken('Dueling')
    expect(state<Array<PickList>>()[0].options).toEqual(['Dueling'])
  })

  it('carries a row prefix so the sheet reads "Fighting Style: Dueling"', () => {
    render(<PickHarness initial={[blank()]} />)
    fireEvent.change(screen.getByPlaceholderText('Fighting Style'), {
      target: { value: 'Fighting Style' },
    })
    expect(state<Array<PickList>>()[0].featureLabel).toBe('Fighting Style')
  })

  it('empties the prefix back to undefined rather than an empty string', () => {
    render(<PickHarness initial={[{ ...blank(), featureLabel: 'X' }]} />)
    fireEvent.change(screen.getByPlaceholderText('Fighting Style'), {
      target: { value: '  ' },
    })
    expect(state<Array<PickList>>()[0].featureLabel).toBeUndefined()
  })

  it('takes rules text per option, keyed by the option', () => {
    render(<PickHarness initial={[{ ...blank(), options: ['Dueling'] }]} />)
    fireEvent.change(screen.getByPlaceholderText('What Dueling does.'), {
      target: { value: '+2 damage with one one-handed weapon.' },
    })
    expect(state<Array<PickList>>()[0].featureText).toEqual({
      Dueling: '+2 damage with one one-handed weapon.',
    })
  })

  it('drops an emptied option out of the text record entirely', () => {
    render(
      <PickHarness
        initial={[
          { ...blank(), options: ['Dueling'], featureText: { Dueling: 'x' } },
        ]}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('What Dueling does.'), {
      target: { value: '' },
    })
    // Back to undefined, not `{}` — an empty record is noise on disk.
    expect(state<Array<PickList>>()[0].featureText).toBeUndefined()
  })

  it('offers no per-option text for a kind that has none', () => {
    render(
      <PickHarness initial={[{ ...blank(), kind: 'tool', options: ['Lute'] }]} />,
    )
    expect(screen.queryByPlaceholderText('What Lute does.')).toBeNull()
  })

  it('preserves featureGrant, which has no editor', () => {
    const withGrant: PickList = {
      ...blank(),
      options: ['Defense'],
      featureGrant: { Defense: { acBonus: 1 } },
    }
    render(<PickHarness initial={[withGrant]} />)
    fireEvent.change(screen.getByPlaceholderText('Fighting Style'), {
      target: { value: 'Fighting Style' },
    })
    expect(state<Array<PickList>>()[0].featureGrant).toEqual({
      Defense: { acBonus: 1 },
    })
    expect(screen.getByText(/kept as you edit/)).toBeDefined()
  })

  it('warns about a closed choice with nothing to choose from', () => {
    // `parsePickList` drops one rather than trapping the player on a step they
    // cannot satisfy, so saying so here beats losing it silently on reload.
    render(<PickHarness initial={[blank()]} />)
    expect(screen.getByText(/can never be answered/)).toBeDefined()
  })

  it('stops warning once it is open to free text', () => {
    render(<PickHarness initial={[blank()]} />)
    fireEvent.click(screen.getByLabelText(/Allow anything else/))
    expect(screen.queryByText(/can never be answered/)).toBeNull()
  })
})

describe('a choice on a feature', () => {
  it('adds one to a feature that had none', () => {
    render(<FeatureHarness initial={[{ level: 3, name: 'Fighting Style' }]} />)
    fireEvent.click(screen.getByText(/Add a choice/))
    expect(state<Array<ClassFeatureInfo>>()[0].picks).toHaveLength(1)
  })

  it('empties back to undefined rather than an empty array', () => {
    // `picks: []` would make `isBareSubclass` judge a subclass non-bare and
    // turn every cleared one into an object on disk.
    render(
      <FeatureHarness
        initial={[{ level: 3, name: 'Fighting Style', picks: [blank()] }]}
      />,
    )
    fireEvent.click(screen.getByLabelText('Remove choice'))
    expect(state<Array<ClassFeatureInfo>>()[0].picks).toBeUndefined()
  })

  it('keeps the resource note for what still has no editor', () => {
    render(
      <FeatureHarness
        initial={[
          {
            level: 3,
            name: 'Bardic Inspiration',
            resource: { name: 'Inspiration', total: 3 },
          },
        ]}
      />,
    )
    expect(screen.getByText(/Inspiration counter, kept as you edit/)).toBeDefined()
  })

  it('survives an edit to the feature name', () => {
    render(
      <FeatureHarness
        initial={[
          {
            level: 3,
            name: 'Fighting Style',
            picks: [{ ...blank(), options: ['Dueling'] }],
          },
        ]}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Feature name'), {
      target: { value: 'Martial Training' },
    })
    const out = state<Array<ClassFeatureInfo>>()[0]
    expect(out.name).toBe('Martial Training')
    expect(out.picks?.[0].options).toEqual(['Dueling'])
  })
})

function blank(): PickList {
  return { id: '', kind: 'feature', label: '', count: 1, options: [] }
}
