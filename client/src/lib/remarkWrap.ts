import type { Parent, Root, RootContent } from 'mdast'
import { WRAP_END_MARKER, WRAP_START_MARKER } from './formatMarkdown'

/**
 * Groups everything between a WRAP_START_MARKER paragraph and its
 * WRAP_END_MARKER into one `<div class="dnd-wrap">` — the box a floated image
 * wraps inside of. transformWrapBlocks turns `:::wrap` / `:::` into those
 * marker paragraphs; see its doc comment for why.
 *
 * Pairs markers within one parent, so a box inside a blockquote (a :::dm
 * callout) stays inside it. Boxes nest. An unclosed box runs to the end of its
 * parent and a stray end marker is dropped, so a half-typed block never shows
 * marker text.
 */
export function remarkWrap() {
  return (tree: Root) => {
    group(tree)
  }
}

type Marker = 'start' | 'end' | null

function markerOf(node: RootContent): Marker {
  if (node.type !== 'paragraph') return null
  let text = ''
  for (const child of node.children) {
    if (child.type !== 'text') return null
    text += child.value
  }
  text = text.trim()
  if (text === WRAP_START_MARKER) return 'start'
  if (text === WRAP_END_MARKER) return 'end'
  return null
}

function group(parent: Parent) {
  const root: Array<RootContent> = []
  // The children list currently being filled: the parent's own, or the
  // innermost open box's.
  const stack: Array<Array<RootContent>> = [root]
  for (const child of parent.children) {
    const marker = markerOf(child)
    if (marker === 'start') {
      // Not an mdast type: mdast-util-to-hast's unknown handler renders a node
      // with children as a div and applies hProperties.
      const box = {
        type: 'wrapBlock',
        children: [] as Array<RootContent>,
        data: { hName: 'div', hProperties: { className: ['dnd-wrap'] } },
      }
      stack[stack.length - 1].push(box as unknown as RootContent)
      stack.push(box.children)
      continue
    }
    if (marker === 'end') {
      if (stack.length > 1) stack.pop()
      continue
    }
    if ('children' in child) group(child)
    stack[stack.length - 1].push(child)
  }
  parent.children = root
}
