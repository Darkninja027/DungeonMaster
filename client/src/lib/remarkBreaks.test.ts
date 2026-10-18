import { describe, expect, it } from 'vitest'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import type { Nodes, Root } from 'mdast'
import { remarkBreaks } from './remarkBreaks'

/** The tree flattened to node types (text as its value), depth-first. */
function shape(md: string): Array<string> {
  const processor = remark().use(remarkGfm).use(remarkBreaks)
  const tree = processor.runSync(processor.parse(md))
  const out: Array<string> = []
  const walk = (n: Nodes) => {
    out.push(n.type === 'text' ? `text:${n.value}` : n.type)
    if ('children' in n) n.children.forEach(walk)
  }
  walk(tree as Root)
  return out
}

describe('remarkBreaks', () => {
  it('turns a single newline between bold labels into a line break', () => {
    expect(shape('**Symbol**: 2 vials\n**Creed**: May your potions')).toEqual([
      'root',
      'paragraph',
      'strong',
      'text:Symbol',
      'text:: 2 vials',
      'break',
      'strong',
      'text:Creed',
      'text:: May your potions',
    ])
  })

  it('leaves blank-line paragraphs as paragraphs', () => {
    expect(shape('one\n\ntwo')).toEqual([
      'root',
      'paragraph',
      'text:one',
      'paragraph',
      'text:two',
    ])
  })

  it('does not touch code blocks', () => {
    expect(shape('```\na\nb\n```')).toEqual(['root', 'code'])
  })

  it('breaks a lazy continuation inside a list item', () => {
    expect(shape('- first\n  continued')).toContain('break')
  })
})
