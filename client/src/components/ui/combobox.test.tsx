import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { Combobox } from '#/components/ui/combobox'
import { Dialog, DialogContent, DialogTitle } from '#/components/ui/dialog'

/**
 * Every one of these renders the Combobox inside a **modal** `Dialog`, and that
 * is the whole point. The bug these guard against — the suggestion list opening
 * and instantly closing, committing the half-typed query on the way out — only
 * reproduces inside a modal dialog's focus trap. A bare Combobox test passes
 * against the broken version, which is exactly how the broken version shipped.
 *
 * jsdom only approximates Chromium's `focusin` ordering, so these catch the
 * state-desync half faithfully and the native-focus half by proxy. The manual
 * pass in the running app is still what confirms the fix.
 */
const SPELLS = ['Fire Bolt', 'Fireball', 'Wall of Fire', 'Mage Hand']

function InDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Spells</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}

describe('Combobox', () => {
  it('commits the pointed-at suggestion, not the half-typed query', () => {
    const onCommit = vi.fn()
    render(
      <InDialog>
        <Combobox options={SPELLS} onCommit={onCommit} />
      </InDialog>,
    )

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'fire' } })

    // The list has to still be on screen by the time the pointer arrives.
    const row = screen.getByRole('option', { name: 'Fire Bolt' })
    fireEvent.mouseDown(row)

    expect(onCommit).toHaveBeenCalledWith('Fire Bolt')
    // The draft-corrupting half of the bug: the blur that closed the list also
    // committed whatever was typed so far.
    expect(onCommit).not.toHaveBeenCalledWith('fire')
  })

  it('reopens the list after a pick, so a second one needs no re-focus', () => {
    // The box is an add-to-a-list field: it clears itself ready for the next
    // entry, but the only thing that reopens the list is `onFocus`, and a pick
    // made with `mousedown` never moves focus — so nothing could fire it. The
    // list stayed shut until you clicked away and back, which reads as broken.
    const onCommit = vi.fn()
    render(
      <InDialog>
        <Combobox options={SPELLS} onCommit={onCommit} />
      </InDialog>,
    )

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'fire' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Fire Bolt' }))

    expect(onCommit).toHaveBeenCalledWith('Fire Bolt')
    // Still open, and showing the whole list again — the query has cleared, so
    // every option matches the empty string.
    expect(screen.getByRole('option', { name: 'Mage Hand' })).toBeTruthy()
    expect(input.getAttribute('aria-expanded')).toBe('true')
  })

  it('reopens after an Enter pick too', () => {
    const onCommit = vi.fn()
    render(
      <InDialog>
        <Combobox options={SPELLS} onCommit={onCommit} />
      </InDialog>,
    )

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'fire' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCommit).toHaveBeenCalledWith('Fire Bolt')
    expect(input.getAttribute('aria-expanded')).toBe('true')
  })

  it('controlled: a pick does NOT reopen the list', () => {
    // The value *is* the answer there, so a reopened list would hang over the
    // next field rather than waiting for a second entry that never comes.
    function Harness() {
      const [value, setValue] = useState('')
      return (
        <InDialog>
          <Combobox options={SPELLS} value={value} onCommit={setValue} />
        </InDialog>
      )
    }
    render(<Harness />)

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'fire' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Fire Bolt' }))

    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows a muted note beside an option that has one', () => {
    render(
      <InDialog>
        <Combobox
          options={SPELLS}
          meta={{
            'Fire Bolt': 'Cantrip · Evocation',
            Fireball: '3rd · Evocation',
          }}
          onCommit={vi.fn()}
        />
      </InDialog>,
    )
    fireEvent.focus(screen.getByRole('combobox'))

    // The note rides on the row, so the accessible name carries both halves.
    expect(
      screen.getByRole('option', { name: /Fire Bolt/ }).textContent,
    ).toContain('Cantrip · Evocation')
    // An option with no entry renders the bare name, exactly as before.
    expect(
      screen.getByRole('option', { name: /Mage Hand/ }).textContent.trim(),
    ).toBe('Mage Hand')
  })

  it('commits the name alone, never the note', () => {
    // The value stored is still just the spell name — the note is decoration on
    // the row, and free text on disk is unchanged.
    const onCommit = vi.fn()
    render(
      <InDialog>
        <Combobox
          options={SPELLS}
          meta={{ Fireball: '3rd · Evocation' }}
          onCommit={onCommit}
        />
      </InDialog>,
    )
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'fireb' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: /Fireball/ }))

    expect(onCommit).toHaveBeenCalledWith('Fireball')
  })

  it('ranks prefix matches above substring matches', () => {
    render(
      <InDialog>
        <Combobox options={SPELLS} onCommit={vi.fn()} />
      </InDialog>,
    )

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'fire' } })

    const shown = screen.getAllByRole('option').map((o) => o.textContent)
    expect(shown).toEqual(['Fire Bolt', 'Fireball', 'Wall of Fire'])
  })

  it('arrows through rows and Enter commits the highlighted one', () => {
    const onCommit = vi.fn()
    render(
      <InDialog>
        <Combobox id="spells" options={SPELLS} onCommit={onCommit} />
      </InDialog>,
    )

    const input = screen.getByRole<HTMLInputElement>('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'fire' } })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe('spells-option-1')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.getAttribute('aria-activedescendant')).toBe('spells-option-0')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('Fire Bolt')
  })

  it('Enter with no row highlighted commits the raw text', () => {
    const onCommit = vi.fn()
    render(
      <InDialog>
        <Combobox options={SPELLS} onCommit={onCommit} />
      </InDialog>,
    )

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "Fizzlebang's Doom" } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCommit).toHaveBeenCalledWith("Fizzlebang's Doom")
  })

  it('offers the empty state for a query nothing matches, and still takes it', () => {
    const onCommit = vi.fn()
    render(
      <InDialog>
        <Combobox options={SPELLS} onCommit={onCommit} />
      </InDialog>,
    )

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'zzzz' } })

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText(/press Enter to use what you typed/)).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('zzzz')
  })

  it('Escape closes the list without closing the dialog', () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Spells</DialogTitle>
          <Combobox options={SPELLS} onCommit={vi.fn()} />
        </DialogContent>
      </Dialog>,
    )

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0)

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    // Radix's DismissableLayer used to swallow this key for us. Without it,
    // Escape would close the list *and* throw the whole draft away.
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('a second Escape, with the list already shut, reaches the dialog', () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Spells</DialogTitle>
          <Combobox options={SPELLS} onCommit={vi.fn()} />
        </DialogContent>
      </Dialog>,
    )

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    onOpenChange.mockClear()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('uncontrolled: blurring away commits the text and clears the box', () => {
    const onCommit = vi.fn()
    render(
      <InDialog>
        <Combobox options={SPELLS} onCommit={onCommit} />
      </InDialog>,
    )

    const input = screen.getByRole<HTMLInputElement>('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Mage Hand' } })
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledWith('Mage Hand')
    expect(input.value).toBe('')
  })

  it('controlled: keystrokes commit, blurring does not commit again', () => {
    const onCommit = vi.fn()
    function Controlled() {
      const [value, setValue] = useState('')
      return (
        <InDialog>
          <Combobox
            options={SPELLS}
            value={value}
            onCommit={(v) => {
              setValue(v)
              onCommit(v)
            }}
          />
        </InDialog>
      )
    }
    render(<Controlled />)

    const input = screen.getByRole<HTMLInputElement>('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Fire' } })
    expect(onCommit).toHaveBeenCalledWith('Fire')

    onCommit.mockClear()
    fireEvent.blur(input)

    // The value *is* the answer, so leaving the field is not a commit and must
    // not clear what the caller is storing.
    expect(onCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('Fire')
  })
})
