import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root } from 'mdast'
import remarkMermaid, { type MermaidNode } from './remark-mermaid'

function parse(source: string): Root {
  const processor = unified().use(remarkParse).use(remarkMermaid)
  return processor.runSync(processor.parse(source))
}

describe('remark-mermaid plugin', () => {
  it('converts a fenced ```mermaid block into a `mermaid` node', () => {
    const tree = parse('```mermaid\ngraph TD\nA-->B\n```')
    expect(tree.children).toHaveLength(1)
    const node = tree.children[0] as MermaidNode
    expect(node.type).toBe('mermaid')
    expect(node.source).toBe('graph TD\nA-->B')
  })

  it('preserves the diagram source verbatim, including indentation', () => {
    const source = 'sequenceDiagram\n    Alice->>John: Hello'
    const tree = parse('```mermaid\n' + source + '\n```')
    const node = tree.children[0] as MermaidNode
    expect(node.source).toBe(source)
  })

  it('sets a hast hint that emits <mermaid-diagram> with data-source', () => {
    const tree = parse('```mermaid\nflowchart\nA-->B\n```')
    const node = tree.children[0] as MermaidNode
    expect(node.data?.hName).toBe('mermaid-diagram')
    expect(node.data?.hProperties).toEqual({
      'data-source': 'flowchart\nA-->B',
    })
    expect(node.data?.hChildren?.[0]?.value).toBe('flowchart\nA-->B')
  })

  it('leaves non-mermaid code blocks alone (typescript, etc.)', () => {
    const tree = parse('```ts\nconst x = 1\n```')
    expect(tree.children[0]?.type).toBe('code')
  })

  it('leaves untagged code blocks alone', () => {
    const tree = parse('```\nplain\n```')
    expect(tree.children[0]?.type).toBe('code')
  })

  it('handles multiple mermaid blocks in one document', () => {
    const tree = parse(
      '```mermaid\ngraph A\n```\n\ntext\n\n```mermaid\ngraph B\n```',
    )
    const mermaidNodes = tree.children.filter(
      (child): child is MermaidNode => child.type === 'mermaid',
    )
    expect(mermaidNodes).toHaveLength(2)
    expect(mermaidNodes[0]!.source).toBe('graph A')
    expect(mermaidNodes[1]!.source).toBe('graph B')
  })
})
