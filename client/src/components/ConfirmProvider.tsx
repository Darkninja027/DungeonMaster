import { createContext, useCallback, useContext, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { buttonVariants } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { useSuspendShortcuts } from '#/lib/useShortcut'

export interface ConfirmOptions {
  title: string
  /** The consequence, in a sentence. Omit only when the title says everything. */
  description?: string
  /** Defaults to "Delete" for a destructive ask, "Continue" otherwise. */
  confirmLabel?: string
  cancelLabel?: string
  /**
   * Paints the confirm button red and defaults its label to "Delete". On by
   * default: every current caller is a delete, and a question that isn't
   * destructive should usually not be a modal at all.
   */
  destructive?: boolean
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

/**
 * `const confirm = useConfirm()` — then `if (!(await confirm({...}))) return`.
 *
 * Deliberately shaped like the `window.confirm` it replaces, promise instead of
 * blocking, so the ~14 destructive call sites keep their straight-line form and
 * the sweep stays a mechanical edit rather than a rewrite of each handler.
 */
export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext)
  if (!ctx)
    throw new Error('useConfirm must be used inside a <ConfirmProvider>.')
  return ctx
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  /**
   * The live request. Radix fires `onOpenChange(false)` while the close
   * animation runs, by which time `pending` may already be the next request, so
   * the resolver is held apart from render state and cleared as it is called —
   * whichever of Cancel, Escape or the unmount path gets there first wins, and
   * a promise is never resolved twice or left hanging.
   */
  const live = useRef<((ok: boolean) => void) | null>(null)

  // A confirm owns the keyboard the same way every other modal does, or Ctrl+N
  // would open a new-article dialog behind the question.
  useSuspendShortcuts(pending !== null)

  const confirm = useCallback<Confirm>((options) => {
    return new Promise<boolean>((resolve) => {
      live.current?.(false)
      live.current = resolve
      setPending({ ...options, resolve })
    })
  }, [])

  const settle = (ok: boolean) => {
    const resolve = live.current
    live.current = null
    setPending(null)
    resolve?.(ok)
  }

  const destructive = pending?.destructive ?? true

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) settle(false)
        }}
      >
        {pending && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pending.title}</AlertDialogTitle>
              {pending.description && (
                <AlertDialogDescription>
                  {pending.description}
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </AlertDialogCancel>
              <AlertDialogAction
                className={cn(
                  destructive && buttonVariants({ variant: 'destructive' }),
                )}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? (destructive ? 'Delete' : 'Continue')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
