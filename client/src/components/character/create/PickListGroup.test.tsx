import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import type { PickList } from '#/lib/srd'
import { SRD_CLASS_KITS } from '#/lib/srd'
import { PickListGroup } from './PickListGroup'

/**
 * A `feature` pick renders as a `<select>` rather than a chip cloud, and for a
 * long time that branch ignored `pick.open` entirely — so an open feature pick
 * offered a closed dropdown and there was no way to answer it with anything
 * the table did not already list.
 *
 * That mattered the moment the Totem Warrior arrived: its spirit is open
 * precisely so an Elk or a Tiger from a book this app does not ship can be
 * typed in. The data layer accepted one the whole time (`applyFeaturePick`
 * writes a bare named row for an unlisted value); only the UI refused to ask.
 */
const TOTEM: PickList = {
  id: 'totem-warrior-3-totem',
  kind: 'feature',
  label: 'Choose a totem spirit',
  count: 1,
  options: ['Bear', 'Eagle', 'Wolf'],
  open: true,
  featureLabel: 'Totem Spirit',
  featureText: {
    Bear: 'Resistance to everything but psychic while raging.',
    Eagle: 'Dash as a bonus action while raging.',
    Wolf: 'Allies gain advantage on melee attacks near you.',
  },
}

/** A closed feature pick, to prove the box appears only when asked for. */
const STYLE: PickList = {
  ...TOTEM,
  id: 'fighter-fighting-style',
  open: false,
  label: 'Choose a Fighting Style',
}

/** Holds the chosen values, as the wizard's own draft does. */
function Harness({ pick }: { pick: PickList }) {
  const [chosen, setChosen] = useState<Array<string>>([])
  return (
    <div>
      <PickListGroup pick={pick} chosen={chosen} onChange={setChosen} />
      <output data-testid="chosen">{chosen.join(',')}</output>
    </div>
  )
}

describe('an open feature pick', () => {
  it('offers an Other… entry alongside the authored options', () => {
    render(<Harness pick={TOTEM} />)
    const select = screen.getByRole('combobox')
    const labels = [...select.querySelectorAll('option')].map((o) => o.text)
    expect(labels).toContain('Bear')
    expect(labels).toContain('Other…')
  })

  it('reveals a text box when Other… is chosen, and commits what is typed', () => {
    render(<Harness pick={TOTEM} />)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '__other__' },
    })
    const box = screen.getByPlaceholderText('Type your own…')
    fireEvent.change(box, { target: { value: 'Tiger' } })
    expect(screen.getByTestId('chosen').textContent).toBe('Tiger')
  })

  it('leaves the pick unanswered until something is actually typed', () => {
    // Selecting Other… must not commit the sentinel as if it were an answer —
    // the level-up step gates Next on every pick being satisfied.
    render(<Harness pick={TOTEM} />)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '__other__' },
    })
    expect(screen.getByTestId('chosen').textContent).toBe('')
  })

  it('keeps the box open for a typed answer rather than reverting it', () => {
    // A custom value is not in `options`, so a naive `value={chosen}` would
    // fall back to "Choose…" and read as though the app had lost the answer.
    render(<Harness pick={TOTEM} />)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '__other__' },
    })
    fireEvent.change(screen.getByPlaceholderText('Type your own…'), {
      target: { value: 'Tiger' },
    })
    const select = screen.getByRole('combobox')
    const box = screen.getByPlaceholderText('Type your own…')
    expect(select).toHaveProperty('value', '__other__')
    expect(box).toHaveProperty('value', 'Tiger')
  })

  it('still commits a listed option normally', () => {
    render(<Harness pick={TOTEM} />)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Bear' },
    })
    expect(screen.getByTestId('chosen').textContent).toBe('Bear')
    expect(screen.queryByPlaceholderText('Type your own…')).toBeNull()
  })

  it('shows the chosen option’s rules text', () => {
    render(<Harness pick={TOTEM} />)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Bear' },
    })
    expect(
      screen.getByText(/Resistance to everything but psychic/),
    ).toBeDefined()
  })
})

describe('a closed feature pick', () => {
  it('offers no Other… entry', () => {
    render(<Harness pick={STYLE} />)
    const labels = [
      ...screen.getByRole('combobox').querySelectorAll('option'),
    ].map((o) => o.text)
    expect(labels).toContain('Bear')
    expect(labels).not.toContain('Other…')
  })
})

/**
 * The warlock's invocations, rendered from the **real table** rather than a
 * fixture.
 *
 * They were prose until a player pointed out there was no way to choose them,
 * and they are the class's defining choice — so this asserts the authored data
 * actually reaches a control the player can answer. A fixture would prove the
 * component works and say nothing about whether `INVOCATION_PICK` produces
 * something it can render.
 *
 * The level-2 pick is the interesting one: `count: 2` is the only place in the
 * game where one feature pick asks twice at once.
 */
describe('the warlock’s eldritch invocations, from the real table', () => {
  const warlock = SRD_CLASS_KITS.find((k) => k.name === 'Warlock')!
  const pickAt = (level: number) =>
    warlock.features.find(
      (f) => f.level === level && f.name.startsWith('Eldritch Invocations'),
    )!.picks![0]

  it('renders two selects at 2nd level, because two are learned at once', () => {
    render(<Harness pick={pickAt(2)} />)
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
  })

  it('offers every authored invocation as a real option', () => {
    render(<Harness pick={pickAt(2)} />)
    const first = screen.getAllByRole('combobox')[0]
    const labels = [...first.querySelectorAll('option')].map(
      (o) => o.textContent,
    )
    for (const name of pickAt(2).options) {
      expect(labels, name).toContain(name)
    }
    // Plus "Choose…" and the open-pick escape hatch.
    expect(labels).toContain('Other…')
  })

  it('shows the summary once an invocation is chosen', () => {
    // The only place a prerequisite is ever stated to the player, since nothing
    // enforces one — so it has to actually render.
    render(<Harness pick={pickAt(2)} />)
    const first = screen.getAllByRole('combobox')[0]
    fireEvent.change(first, { target: { value: 'Agonizing Blast' } })
    expect(screen.getByText(/eldritch blast/i)).toBeTruthy()
  })

  it('stops the same invocation being taken in both slots', () => {
    // An invocation cannot be learned twice, and the shared `featureLabel` is
    // what makes `applyFeaturePick` de-dupe. This is the UI half of that.
    render(<Harness pick={pickAt(2)} />)
    const [first, second] = screen.getAllByRole('combobox')
    fireEvent.change(first, { target: { value: 'Devil’s Sight' } })
    const dupe = [...second.querySelectorAll('option')].find(
      (o) => o.getAttribute('value') === 'Devil’s Sight',
    )!
    expect(dupe.hasAttribute('disabled')).toBe(true)
    expect(dupe.textContent).toContain('already chosen')
  })

  it('lets a later book’s invocation be typed in', () => {
    // `open: true`: Xanathar's and Tasha's each add more and this repo ships
    // neither.
    render(<Harness pick={pickAt(5)} />)
    const first = screen.getAllByRole('combobox')[0]
    fireEvent.change(first, { target: { value: '__other__' } })
    const box = screen.getByPlaceholderText('Type your own…')
    fireEvent.change(box, { target: { value: 'Eldritch Smite' } })
    expect(screen.getByTestId('chosen').textContent).toBe('Eldritch Smite')
  })
})
