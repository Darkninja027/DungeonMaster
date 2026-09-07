import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useRegisterSidebar, useSidebarPresent } from '#/lib/sidebarState'
import { SidebarToggle } from '#/components/SidebarToggle'

/**
 * The vault draws no sidebar: everything in it is either about a campaign the
 * vault doesn't have, or a character list the home screen already offers.
 *
 * "Present" is the load-bearing idea, and it is why the world layout does not
 * simply collapse the panel. `mounted` is what the app header toggle, the
 * title-row toggle and the Ctrl+\ shortcut all key off, so a layout that draws
 * nothing must also register nothing — otherwise all three keep offering to
 * open a rail that will never appear.
 */
function Harness({ present }: { present: boolean }) {
  useRegisterSidebar(present)
  return (
    <div>
      <SidebarToggle />
      <span data-testid="present">{String(useSidebarPresent())}</span>
    </div>
  )
}

describe('sidebar presence', () => {
  it('a world that renders a sidebar offers the toggle', async () => {
    render(<Harness present />)
    await waitFor(() =>
      expect(screen.getByTestId('present').textContent).toBe('true'),
    )
    expect(screen.queryByLabelText(/sidebar/i)).not.toBeNull()
  })

  it('a world that renders none hides the toggle entirely', async () => {
    render(<Harness present={false} />)
    await waitFor(() =>
      expect(screen.getByTestId('present').textContent).toBe('false'),
    )
    // A button that opens an empty rail is worse than no button.
    expect(screen.queryByLabelText(/sidebar/i)).toBeNull()
  })
})
