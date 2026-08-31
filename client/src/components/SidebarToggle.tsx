import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import {
  toggleSidebar,
  useClaimSidebarToggle,
  useSidebarOpen,
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
  useClaimSidebarToggle(claim)

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
