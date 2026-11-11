import type { Break, Parent, Root, Text } from 'mdast'

/**
 * Renders a single newline inside a paragraph as a line break, the way
 * Obsidian does by default ("Strict line breaks" off).
 *
 * CommonMark folds a lone newline into a space, so
 *
 *   **Symbol:** 2 vials in the centre of a sun
 *   **Creed:** May your potions aid and assist
 *
 * reads as two lines in the editor and in Obsidian but one run-on line in our
 * preview. World folders are meant to open identically in both, so the book
 * renderer follows Obsidian.
 *
 * The same thing as the `remark-breaks` package, written out because it is a
 * dozen lines. Only `text` nodes are touched: code keeps its newlines as code,
 * and blank-line paragraph breaks never reach a text node at all.
 */
export function remarkBreaks() {
  return (tree: Root) => {
    splitNewlines(tree)
  }
}

function splitNewlines(node: Parent) {
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    if (child.type === 'text') {
      if (!child.value.includes('\n')) continue
      const parts = child.value.split(/\r?\n/)
      const replaced: Array<Text | Break> = []
      parts.forEach((value, n) => {
        if (n > 0) replaced.push({ type: 'break' })
        if (value) replaced.push({ type: 'text', value })
      })
      node.children.splice(i, 1, ...(replaced as Array<typeof child>))
      i += replaced.length - 1
    } else if ('children' in child) {
      splitNewlines(child)
    }
  }
}
