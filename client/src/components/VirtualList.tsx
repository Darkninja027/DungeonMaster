import { useCallback, useImperativeHandle, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ScrollArea } from '#/components/ui/scroll-area'

export interface VirtualListHandle {
  /** Bring a row into view, mounting it if it was outside the window. */
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void
}

/**
 * A windowed list: only the rows near the viewport are mounted.
 *
 * The reference panels are backed by the global library, which ships ~1600
 * articles. Mounting every row cost roughly ten thousand DOM nodes and made a
 * tab switch tear down one whole list and build the other.
 *
 * Owning the virtualizer *here*, rather than in the panel, is the point of the
 * component and not an accident of tidiness. `useVirtualizer` re-renders its
 * host on every scroll frame — it has to, since the set of visible rows is
 * state. With the hook in the panel, each frame also re-rendered the search
 * box, the import button, the footer and every row's callbacks, which is real
 * per-frame work for markup that never changes while scrolling. Confining it to
 * this component means a scroll re-renders the rows and nothing else.
 *
 * Rows measure themselves rather than assuming a fixed height, because an
 * opened row expands to hold a stat block or description and a guessed height
 * would misplace everything below it.
 */
export function VirtualList<T>({
  items,
  estimateHeight,
  getKey,
  renderRow,
  empty,
  handleRef,
  className,
}: {
  items: Array<T>
  /** Height of a closed row; only has to be close enough to size the scrollbar. */
  estimateHeight: number
  getKey: (item: T) => string
  renderRow: (item: T) => React.ReactNode
  /** Shown instead of the list when there is nothing to render. */
  empty: React.ReactNode
  handleRef?: React.Ref<VirtualListHandle>
  className?: string
}) {
  // State, not a ref: the virtualizer has to re-run once the element exists,
  // and a ref assignment alone would not schedule that render.
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)

  // Radix's ScrollArea puts the scrollport on an inner Viewport element, not on
  // the Root this ref lands on — a virtualizer pointed at the Root would
  // measure a container that never scrolls and render one screen forever.
  const mountRef = useCallback((node: HTMLElement | null) => {
    setScrollEl(
      node?.querySelector<HTMLElement>('[data-slot=scroll-area-viewport]') ??
        null,
    )
  }, [])

  const estimate = useRef(estimateHeight)
  estimate.current = estimateHeight

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => estimate.current,
    // A few rows beyond the fold, so ordinary scrolling doesn't reach the edge
    // of the rendered window before the next frame fills it in.
    overscan: 8,
  })

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToIndex: (index, align = 'center') =>
        virtualizer.scrollToIndex(index, { align }),
    }),
    [virtualizer],
  )

  return (
    <ScrollArea className={className} ref={mountRef}>
      {items.length === 0 ? (
        empty
      ) : (
        // The wrapper's height stands in for the whole list, so the scrollbar
        // reflects its real size even though most rows aren't mounted.
        <ul
          className="relative divide-y"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => (
            <li
              key={getKey(items[item.index])}
              className="group absolute inset-x-0 top-0 px-3 py-1.5"
              style={{ transform: `translateY(${item.start}px)` }}
              data-index={item.index}
              // measureElement directly, never wrapped in an inline arrow: a
              // fresh function identity each render makes React detach and
              // reattach the ref on every row, remeasuring the whole window on
              // every scroll frame.
              ref={virtualizer.measureElement}
            >
              {renderRow(items[item.index])}
            </li>
          ))}
        </ul>
      )}
    </ScrollArea>
  )
}
