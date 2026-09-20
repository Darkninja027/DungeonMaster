import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ToastProvider, useToast } from './ToastProvider'

/**
 * The non-blocking replacement for `alert(error.message)`.
 *
 * Two things are worth pinning: an error is announced assertively (it is the
 * only kind that interrupts), and a toast carrying an action stays long enough
 * to reach — an undo yanked away at 6s would be worse than no undo at all.
 */

function Harness({
  label = 'go',
  ...options
}: Parameters<ReturnType<typeof useToast>['show']>[0] & { label?: string }) {
  const toast = useToast()
  return <button onClick={() => toast.show(options)}>{label}</button>
}

describe('ToastProvider', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('shows a message and dismisses itself', () => {
    render(
      <ToastProvider>
        <Harness kind="error" message="Rename failed." />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('go'))
    expect(screen.getByText('Rename failed.')).toBeTruthy()

    act(() => void vi.advanceTimersByTime(6_000))
    expect(screen.queryByText('Rename failed.')).toBeNull()
  })

  it('announces an error assertively and anything else politely', () => {
    render(
      <ToastProvider>
        <Harness kind="error" message="Bad." label="err" />
        <Harness kind="success" message="Good." label="ok" />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('err'))
    expect(screen.getByRole('alert').textContent).toContain('Bad.')

    fireEvent.click(screen.getByText('ok'))
    expect(screen.getByRole('status').textContent).toContain('Good.')
  })

  it('gives a toast with an action longer to live', () => {
    render(
      <ToastProvider>
        <Harness
          message="Renamed."
          action={{ label: 'Undo', onClick: () => {} }}
        />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('go'))

    // Still there at the plain-toast deadline.
    act(() => void vi.advanceTimersByTime(6_000))
    expect(screen.getByText('Renamed.')).toBeTruthy()

    act(() => void vi.advanceTimersByTime(4_000))
    expect(screen.queryByText('Renamed.')).toBeNull()
  })

  it('runs the action and dismisses on click', () => {
    const onClick = vi.fn()
    render(
      <ToastProvider>
        <Harness message="Renamed." action={{ label: 'Undo', onClick }} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('go'))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByText('Renamed.')).toBeNull()
  })

  it('pins a toast with duration null until dismissed', () => {
    render(
      <ToastProvider>
        <Harness message="Stuck." duration={null} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('go'))

    act(() => void vi.advanceTimersByTime(60_000))
    expect(screen.getByText('Stuck.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Stuck.')).toBeNull()
  })

  it('caps the stack so a failing loop cannot paper over the app', () => {
    render(
      <ToastProvider>
        <Harness kind="error" message="Nope." />
      </ToastProvider>,
    )
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByText('go'))
    expect(screen.getAllByText('Nope.')).toHaveLength(4)
  })
})
