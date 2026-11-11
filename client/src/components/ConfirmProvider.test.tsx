import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfirmProvider, useConfirm } from './ConfirmProvider'
import { shortcutsSuspended } from '#/lib/useShortcut'

/**
 * The promise-based replacement for `window.confirm`.
 *
 * The property that matters is that the promise always settles: a caller does
 * `if (!(await confirm(...))) return` and a hung promise would leave a delete
 * half-done with no dialog on screen and no error.
 */

function Harness({ onResult }: { onResult: (ok: boolean) => void }) {
  const confirm = useConfirm()
  return (
    <button
      onClick={async () => {
        onResult(
          await confirm({
            title: 'Delete "Strahd"?',
            description: 'It goes to the Recycle Bin.',
          }),
        )
      }}
    >
      ask
    </button>
  )
}

function renderHarness() {
  const results: Array<boolean> = []
  render(
    <ConfirmProvider>
      <Harness onResult={(ok) => results.push(ok)} />
    </ConfirmProvider>,
  )
  return results
}

describe('ConfirmProvider', () => {
  it('resolves true when confirmed', async () => {
    const results = renderHarness()
    fireEvent.click(screen.getByText('ask'))

    await screen.findByText('Delete "Strahd"?')
    expect(screen.getByText('It goes to the Recycle Bin.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(results).toEqual([true]))
  })

  it('resolves false when cancelled', async () => {
    const results = renderHarness()
    fireEvent.click(screen.getByText('ask'))
    await screen.findByText('Delete "Strahd"?')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(results).toEqual([false]))
  })

  it('resolves false on Escape rather than hanging', async () => {
    const results = renderHarness()
    fireEvent.click(screen.getByText('ask'))
    const dialog = await screen.findByRole('alertdialog')

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(results).toEqual([false]))
  })

  it('suspends shortcuts while open, and re-arms them after', async () => {
    renderHarness()
    expect(shortcutsSuspended()).toBe(false)

    fireEvent.click(screen.getByText('ask'))
    await screen.findByRole('alertdialog')
    // Ctrl+N must not open a new-article dialog behind the question.
    expect(shortcutsSuspended()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(shortcutsSuspended()).toBe(false))
  })

  it('labels the action "Continue" for a non-destructive ask', async () => {
    function Ask() {
      const confirm = useConfirm()
      return (
        <button
          onClick={() => void confirm({ title: 'Leave?', destructive: false })}
        >
          ask
        </button>
      )
    }
    render(
      <ConfirmProvider>
        <Ask />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByText('ask'))
    await screen.findByRole('alertdialog')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('settles a superseded request instead of stranding its caller', async () => {
    // Two asks without answering the first. The original promise must still
    // resolve, or whichever handler awaited it never runs its cleanup.
    const results: Array<boolean> = []
    function Twice() {
      const confirm = useConfirm()
      return (
        <button
          onClick={() => {
            void confirm({ title: 'First?' }).then((ok) => results.push(ok))
            void confirm({ title: 'Second?' }).then((ok) => results.push(ok))
          }}
        >
          ask
        </button>
      )
    }
    render(
      <ConfirmProvider>
        <Twice />
      </ConfirmProvider>,
    )
    fireEvent.click(screen.getByText('ask'))

    await waitFor(() => expect(results).toEqual([false]))
    expect(await screen.findByText('Second?')).toBeTruthy()
  })
})
