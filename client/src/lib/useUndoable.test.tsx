import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '#/components/ToastProvider'
import { useUndoable } from './useUndoable'

/**
 * The undo affordance itself. What the inverse *does* is the caller's business;
 * what this pins is that the offer appears, runs exactly once, and never fails
 * silently — an undo that quietly does nothing is worse than none, because the
 * user believes the change was put back.
 */

function Harness({
  undo,
  undoFailed,
}: {
  undo: () => Promise<unknown>
  undoFailed?: string
}) {
  const offerUndo = useUndoable()
  return (
    <button
      onClick={() =>
        offerUndo({ message: 'Renamed "A" to "B".', undo, undoFailed })
      }
    >
      go
    </button>
  )
}

function renderHarness(undo: () => Promise<unknown>, undoFailed?: string) {
  render(
    <ToastProvider>
      <Harness undo={undo} undoFailed={undoFailed} />
    </ToastProvider>,
  )
}

describe('useUndoable', () => {
  it('offers the undo and runs the inverse once', async () => {
    const undo = vi.fn().mockResolvedValue(undefined)
    renderHarness(undo)

    fireEvent.click(screen.getByText('go'))
    expect(screen.getByText('Renamed "A" to "B".')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(undo).toHaveBeenCalledOnce())
    // The offer is spent: the toast goes, so it cannot be clicked twice.
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('reports a failed undo instead of swallowing it', async () => {
    const undo = vi
      .fn()
      .mockRejectedValue(new Error('Target folder not found.'))
    renderHarness(undo, 'Could not move "A" back.')

    fireEvent.click(screen.getByText('go'))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    // The undo is the last safety net, so its own failure has to be loud.
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Could not move "A" back.')
    expect(alert.textContent).toContain('Target folder not found.')
  })

  it('does nothing when the offer is ignored', async () => {
    const undo = vi.fn().mockResolvedValue(undefined)
    renderHarness(undo)

    fireEvent.click(screen.getByText('go'))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() =>
      expect(screen.queryByText('Renamed "A" to "B".')).toBeNull(),
    )
    expect(undo).not.toHaveBeenCalled()
  })
})
