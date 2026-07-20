import { useEffect, useState } from 'react'
import { Loader2, Download } from 'lucide-react'
import { api } from '#/lib/api'
import type { UpdateStatus } from '#/lib/api'
import { Button } from '#/components/ui/button'

/**
 * Inline auto-update indicator for the app header. Renders nothing unless an
 * update is checking/downloading (spinner) or ready (a "Restart to update"
 * button). Status is pushed from the main process over `updates:status`.
 */
export function UpdateIndicator() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => api.updates.onStatus(setStatus), [])

  if (status.state === 'checking' || status.state === 'available') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Updating…
      </span>
    )
  }

  if (status.state === 'downloaded') {
    return (
      <Button size="xs" onClick={() => void api.updates.quitAndInstall()}>
        <Download />
        Restart to update
      </Button>
    )
  }

  return null
}
