import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Token } from '#/lib/mapStore'
import { MapTokenCard } from './MapTokenCard'

const wolf: Token = {
  id: 'wolf',
  label: 'Wolf',
  x: 0,
  y: 0,
  size: 'medium',
  colour: '#999',
}

function card(over: Partial<Parameters<typeof MapTokenCard>[0]> = {}) {
  const onPatch = vi.fn()
  render(
    <MapTokenCard
      token={wolf}
      linked={null}
      orphaned={false}
      combatants={[]}
      canOpenStatBlock={false}
      onPatch={onPatch}
      onRemove={() => {}}
      onUnlink={() => {}}
      onLink={() => {}}
      onHp={() => {}}
      onStatBlock={() => {}}
      onClose={() => {}}
      {...over}
    />,
  )
  return onPatch
}

describe('Controlled by', () => {
  it('is absent with nobody at the table and nothing assigned', () => {
    card()
    expect(screen.queryByLabelText('Controlled by')).toBeNull()
  })

  it('hands the token to a seated player, and back to the DM', () => {
    const onPatch = card({ players: ['Sarah', 'Brok'] })
    const select = screen.getByLabelText('Controlled by')
    fireEvent.change(select, { target: { value: 'Brok' } })
    expect(onPatch).toHaveBeenLastCalledWith({ controlledBy: 'Brok' })
    fireEvent.change(select, { target: { value: '' } })
    // undefined rather than '', so the saved token grows no empty key.
    expect(onPatch).toHaveBeenLastCalledWith({ controlledBy: undefined })
  })

  it('keeps an assignment to a player who has stepped away', () => {
    card({ token: { ...wolf, controlledBy: 'Brok' }, players: ['Sarah'] })
    expect(screen.getByLabelText('Controlled by')).toHaveProperty(
      'value',
      'Brok',
    )
    expect(screen.getByText('Brok (not at the table)')).toBeTruthy()
  })

  it("says a party character's player can move it without an assignment", () => {
    card({ claimedBy: 'Thalia' })
    expect(screen.getByText(/Whoever plays Thalia can move it/)).toBeTruthy()
  })
})
