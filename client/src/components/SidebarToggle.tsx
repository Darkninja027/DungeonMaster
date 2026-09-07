import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import {
  toggleSidebar,
  useClaimSidebarToggle,
  useSidebarOpen,
  useSidebarPresent,
} from '#/lib/sidebarState'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

/**
 * Show/hide the left sidebar. Rendered beside the file name in the article and
 * character headers, and in the app header as a fallback when neither is on
 * screen — see `useHeaderTogglePreferred`. Sized to sit in a title row without
 * pushing its height around.
 */
export function SidebarToggle({
  className,
  claim = true,
}: {
  className?: string
  /**
   * Claim the title-row slot, which stands the app header's copy down. True
   * for a title row; false for the header's own fallback, which would
   * otherwise claim the slot and immediately hide itself.
   */
  claim?: boolean
}) {
  const open = useSidebarOpen()
  const present = useSidebarPresent()
  // Nothing to toggle: the vault renders no sidebar, and a button that opens an
  // empty rail is worse than no button. Claimed before the bail-out so the hook
  // order stays fixed, and so the app header's fallback isn't offered either —
  // it checks useSidebarPresent too.
  useClaimSidebarToggle(claim && present)
  if (!present) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-7 shrink-0', className)}
      title={open ? 'Hide sidebar (Ctrl+\\)' : 'Show sidebar (Ctrl+\\)'}
      aria-label={open ? 'Hide sidebar' : 'Show sidebar'}
      onClick={toggleSidebar}
    >
      {open ? (
        <PanelLeftClose className="size-4" />
      ) : (
        <PanelLeftOpen className="size-4" />
      )}
    </Button>
  )
}
