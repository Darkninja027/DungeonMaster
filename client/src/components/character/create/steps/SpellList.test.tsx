import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { SpellList } from '#/components/character/create/steps/SpellsStep'
import { Dialog, DialogContent, DialogTitle } from '#/components/ui/dialog'

/**
 * The spell picker as the wizard actually renders it — inside a modal Dialog,
 * for the same reason `combobox.test.tsx` does: the focus-trap bugs this
 * component has hit only reproduce there.
 */
const SUGGESTIONS = ['Magic Missile', 'Shield', 'Scorching Ray']
const META = {
  'Magic Missile': '1st · Evocation',
  Shield: '1st · Abjuration',
  'Scorching Ray': '2nd · Evocation',
}

function Harness({ count = 2 }: { count?: number }) {
  const [values, setValues] = useState<Array<string>>([])
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Spells</DialogTitle>
        <SpellList
          label="Spells in your book"
          count={count}
          values={values}
          suggestions={SUGGESTIONS}
          meta={META}
          onChange={setValues}
        />
        <output data-testid="state">{values.join('|')}</output>
      </DialogContent>
    </Dialog>
  )
}

describe('SpellList', () => {
  it('labels each suggestion with its level and school', () => {
    render(<Harness />)
    fireEvent.focus(screen.getByRole('combobox'))

    expect(
      screen.getByRole('option', { name: /Scorching Ray/ }).textContent,
    ).toContain('2nd · Evocation')
    expect(
      screen.getByRole('option', { name: /Shield/ }).textContent,
    ).toContain('1st · Abjuration')
  })

  it('picks two in a row without needing a re-focus', () => {
    // The bug: after the first pick the list closed, and the only thing that
    // reopens it is `onFocus` — which cannot fire, because a `mousedown` pick
    // never moved focus out of the input. Picking a second spell meant clicking
    // away and back.
    render(<Harness />)
    fireEvent.focus(screen.getByRole('combobox'))

    fireEvent.mouseDown(screen.getByRole('option', { name: /Magic Missile/ }))
    expect(screen.getByTestId('state').textContent).toBe('Magic Missile')

    // No re-focus in between — the list is still up, so the second pick is
    // just another click.
    fireEvent.mouseDown(screen.getByRole('option', { name: /Shield/ }))
    expect(screen.getByTestId('state').textContent).toBe('Magic Missile|Shield')
  })

  it('stores the bare name, never the level/school note', () => {
    render(<Harness />)
    fireEvent.focus(screen.getByRole('combobox'))
    fireEvent.mouseDown(screen.getByRole('option', { name: /Scorching Ray/ }))

    expect(screen.getByTestId('state').textContent).toBe('Scorching Ray')
  })

  it('hides the picker once the count is reached', () => {
    // `{!full && <Combobox/>}` — which is also what closes the reopened list on
    // the last pick, since the whole input unmounts with it.
    render(<Harness count={1} />)
    fireEvent.focus(screen.getByRole('combobox'))
    fireEvent.mouseDown(screen.getByRole('option', { name: /Shield/ }))

    expect(screen.getByTestId('state').textContent).toBe('Shield')
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
