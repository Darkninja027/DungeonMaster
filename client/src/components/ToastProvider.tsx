import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '#/lib/utils'

export type ToastKind = 'error' | 'success' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  kind?: ToastKind
  /** The headline. Keep it a sentence — this replaces an `alert()` body. */
  message: string
  /** Optional second line for detail the message shouldn't carry. */
  detail?: string
  /**
   * A single affordance, rendered as a button. This is what makes an undo
   * toast possible; see `useUndoableMutation`.
   */
  action?: ToastAction
  /**
   * Milliseconds before auto-dismiss. Defaults to 6s, or 10s with an action so
   * an undo is not yanked away mid-reach. `null` pins it until dismissed.
   */
  duration?: number | null
}

interface Toast extends ToastOptions {
  id: number
}

interface ToastApi {
  show: (options: ToastOptions) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/**
 * `const toast = useToast()` — then `toast.show({ kind: 'error', message })`.
 *
 * Replaces the ~31 `alert(error.message)` call sites. An alert blocks the
 * renderer and looks like the OS rather than the app; a failed rename is worth
 * saying, not worth stopping everything for.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside a <ToastProvider>.')
  return ctx
}

const ICONS: Record<ToastKind, typeof AlertCircle> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
}

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: () => void
}) {
  const kind = toast.kind ?? 'info'
  const Icon = ICONS[kind]
  const duration =
    toast.duration === undefined
      ? toast.action
        ? 10_000
        : 6_000
      : toast.duration

  // Held in a ref so the timer below depends only on the duration: taking
  // `onDismiss` as a dependency would restart the clock on every parent render
  // and a toast would never leave.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (duration === null) return
    const timer = setTimeout(() => dismissRef.current(), duration)
    return () => clearTimeout(timer)
  }, [duration])

  return (
    <div
      // Errors interrupt; the rest are announced politely so a save confirmation
      // doesn't talk over whatever the user is reading.
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-background p-3 shadow-lg',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2',
        kind === 'error' && 'border-destructive/50',
      )}
      data-state="open"
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          kind === 'error' && 'text-destructive',
          kind === 'success' && 'text-(--tome-gold)',
          kind === 'info' && 'text-muted-foreground',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug break-words">{toast.message}</p>
        {toast.detail && (
          <p className="mt-0.5 text-xs text-muted-foreground break-words">
            {toast.detail}
          </p>
        )}
      </div>
      {toast.action && (
        <button
          type="button"
          className="shrink-0 rounded px-2 py-0.5 text-sm font-medium text-(--tome-head) hover:bg-accent"
          onClick={() => {
            toast.action?.onClick()
            onDismiss()
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Array<Toast>>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++
    // Newest first, and capped: a failing loop should not paper over the app.
    setToasts((all) => [{ ...options, id }, ...all].slice(0, 4))
    return id
  }, [])

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        Bottom-right, above the session panel's rail. `pointer-events-none` on
        the stack so a dismissed-but-animating toast never swallows a click
        meant for the app; each row re-enables them for itself.
      */}
      <div className="pointer-events-none fixed right-4 bottom-4 z-100 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <ToastRow
            key={toast.id}
            toast={toast}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
