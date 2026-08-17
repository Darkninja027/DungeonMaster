import * as React from 'react'
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils'

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn('relative', className)}
      {...props}
    >
      {/*
        Radix wraps children in an inline-styled `display: table; min-width:100%`
        div so content can size itself. A table sizes to its *content*, and
        `width:100%` on one acts as a minimum rather than a cap — so a long row
        grows the wrapper past the viewport and `min-w-0 flex-1` inside can
        never claw the width back. That pushed the bestiary's trailing
        edit/menu buttons outside the panel once titles got long enough.

        Forcing the wrapper back to `display: block` makes it fill the viewport
        and clip normally, which is what every list here wants. Content that
        genuinely needs to scroll sideways should set its own `overflow-x`.
      */}
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 [&>div]:block! [&>div]:min-w-0!"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'flex touch-none p-px transition-colors select-none',
        orientation === 'vertical' &&
          'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' &&
          'h-2.5 flex-col border-t border-t-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
