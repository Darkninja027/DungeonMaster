import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { TableSession } from '#/lib/mapSession'
import { MapTableRail } from './MapTableRail'
import type { MapSessionTab } from './MapSessionRail'

const SESSION: TableSession = {
  round: 4,
  activeId: 'b',
  combatants: [
    {
      id: 'a',
      name: 'Goblin',
      initiative: 9,
      hp: 0,
      maxHp: null,
      ac: null,
      note: '',
    },
    {
      id: 'b',
      name: 'Thalia',
      initiative: 17,
      hp: 1,
      maxHp: null,
      ac: null,
      note: '',
    },
  ],
  rolls: [
    {
      id: 'r',
      notation: '1d20+5',
      total: 21,
      detail: '[16] + 5',
      at: Date.now(),
      label: 'Longbow',
      source: { title: 'Thalia' } as TableSession['rolls'][number]['source'],
      seat: { id: 's', name: 'Sarah', character: 'Thalia' },
    },
  ],
}

function Harness() {
  const [tab, setTab] = useState<MapSessionTab>('initiative')
  return <MapTableRail session={SESSION} open tab={tab} onToggle={setTab} />
}

describe('MapTableRail', () => {
  it('lists turn order with whose turn it is and the round', () => {
    render(<Harness />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual(['17Thalia', '9Goblindown'])
    expect(rows[0].getAttribute('aria-current')).toBe('true')
    expect(screen.getByText('Round 4')).toBeTruthy()
  })

  it('shows rolls as labels only — no router, so a Link would throw', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTitle('Rolls'))
    expect(screen.getByText('Longbow')).toBeTruthy()
    expect(screen.getByText('Sarah as Thalia')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
