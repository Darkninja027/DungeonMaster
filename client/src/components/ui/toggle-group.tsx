'use client'

import * as React from 'react'
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils'

/**
 * A segmented control: several buttons of which one is on.
 *
 * Added for the battlemap toolbar, where the tool buttons were a flat row of
 * ghost/default `Button`s toggled by hand. That worked, but it made a set of
 * mutually exclusive choices look like a set of unrelated actions, and it gave
 * a screen reader no way to tell that picking one unpicks the others. Radix
 * supplies the roving focus and the `aria-pressed` semantics.
 *
 * `type="single"` is what the map wants — `tool` is one value. The primitive
 * also does `type="multiple"`, which is why the type is left to the caller.
 */
function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(
        'bg-muted inline-flex w-fit items-center gap-0.5 rounded-md p-0.5',
        className,
      )}
      {...props}
    />
  )
}

function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex size-7 cursor-pointer items-center justify-center rounded-sm text-sm font-medium whitespace-nowrap transition-colors outline-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        'hover:bg-background/60 focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        // The on state reads as raised rather than merely tinted, so the
        // current tool is obvious at a glance across a lit table.
        'data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
