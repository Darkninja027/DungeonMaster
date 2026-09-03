import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DiceRoller } from './DiceRoller'
import { clearRollLog, rollLogSnapshot } from '#/lib/rollLog'

/**
 * The bare dice roller: the "just roll a d20" case that dice chips, which live
 * inside articles and sheets, cannot cover.
 *
 * The thing worth pinning is that it goes through the ordinary logRoll rather
 * than its own mechanism — that is what makes a roll here reach every window
 * and, at a LAN table, every seat.
 */

describe('DiceRoller', () => {
  beforeEach(() => clearRollLog())

  it('logs a quick-pick die', async () => {
    render(<DiceRoller />)
    fireEvent.click(screen.getByRole('button', { name: 'd20' }))
    const log = rollLogSnapshot()
    expect(log).toHaveLength(1)
    expect(log[0].notation).toBe('d20')
    expect(log[0].total).toBeGreaterThanOrEqual(1)
    expect(log[0].total).toBeLessThanOrEqual(20)
  })

  it('offers the dice a sheet actually uses', () => {
    render(<DiceRoller />)
    for (const die of ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']) {
      expect(screen.getByRole('button', { name: die })).toBeTruthy()
    }
  })

  it('rolls typed notation with a count and a modifier', async () => {
    render(<DiceRoller />)
    fireEvent.change(screen.getByLabelText('Dice notation'), {
      target: { value: '2d6+3' },
    })
    fireEvent.click(screen.getByTitle('Roll this'))
    const log = rollLogSnapshot()
    expect(log).toHaveLength(1)
    expect(log[0].notation).toBe('2d6+3')
    // Two d6 plus 3.
    expect(log[0].total).toBeGreaterThanOrEqual(5)
    expect(log[0].total).toBeLessThanOrEqual(15)
  })

  it('rejects notation rollDice cannot parse, and logs nothing', async () => {
    render(<DiceRoller />)
    fireEvent.change(screen.getByLabelText('Dice notation'), {
      target: { value: 'lots of dice' },
    })
    fireEvent.click(screen.getByTitle('Roll this'))
    expect(rollLogSnapshot()).toHaveLength(0)
    expect(
      screen.getByLabelText('Dice notation').getAttribute('aria-invalid'),
    ).toBe('true')
  })

  it('keeps a rejected string in the box, since the person is mid-thought', async () => {
    render(<DiceRoller />)
    const input = screen.getByLabelText('Dice notation')
    fireEvent.change(input, { target: { value: '2d' } })
    fireEvent.click(screen.getByTitle('Roll this'))
    expect((input as HTMLInputElement).value).toBe('2d')
  })

  it('clears the error once the notation changes', async () => {
    render(<DiceRoller />)
    const input = screen.getByLabelText('Dice notation')
    fireEvent.change(input, { target: { value: 'nonsense' } })
    fireEvent.click(screen.getByTitle('Roll this'))
    expect(input.getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(input, { target: { value: 'nonsens' } })
    expect(input.getAttribute('aria-invalid')).toBe('false')
  })

  it('attributes the roll to a source when given one', async () => {
    render(
      <DiceRoller
        source={{
          worldId: 'w',
          articleId: 'Characters/Thalia',
          title: 'Thalia',
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'd8' }))
    expect(rollLogSnapshot()[0].source?.title).toBe('Thalia')
  })

  it('does not roll an empty box', async () => {
    render(<DiceRoller />)
    // The submit button is disabled with nothing typed.
    expect(screen.getByTitle('Roll this').hasAttribute('disabled')).toBe(true)
    expect(rollLogSnapshot()).toHaveLength(0)
  })
})
