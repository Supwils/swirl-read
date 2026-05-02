import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import type { Root as HastRoot, Element as HastElement } from 'hast'
import remarkMathShim from './remark-math-shim'

async function toHast(source: string): Promise<HastRoot> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkMathShim)
    .use(remarkRehype)
  const mdast = processor.parse(source)
  // `processor.run` returns the post-rehype hast tree; TypeScript
  // already widens to `Node`, so a single hast typed binding suffices.
  const hast: HastRoot = await processor.run(mdast)
  return hast
}

function findElements(
  tree: HastRoot | HastElement,
  tagName: string,
): HastElement[] {
  const out: HastElement[] = []
  function walk(node: {
    type: string
    tagName?: string
    children?: unknown[]
  }) {
    if (node.type === 'element' && node.tagName === tagName) {
      out.push(node as unknown as HastElement)
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children)
        walk(child as { type: string; tagName?: string; children?: unknown[] })
    }
  }
  walk(tree)
  return out
}

describe('remark-math-shim', () => {
  it('converts $inline$ math into <math-inline data-source>', async () => {
    const tree = await toHast('Energy is $E = mc^2$ exactly.')
    const els = findElements(tree, 'math-inline')
    expect(els).toHaveLength(1)
    expect(els[0]?.properties?.['data-source']).toBe('E = mc^2')
  })

  it('converts $$block$$ math into <math-block data-source>', async () => {
    const tree = await toHast('$$\n\\int_0^1 x^2 dx\n$$')
    const els = findElements(tree, 'math-block')
    expect(els).toHaveLength(1)
    expect(els[0]?.properties?.['data-source']).toBe('\\int_0^1 x^2 dx')
  })

  it('handles multiple inline math spans in one paragraph', async () => {
    const tree = await toHast('Both $a + b$ and $c - d$ matter.')
    expect(findElements(tree, 'math-inline')).toHaveLength(2)
  })

  it('leaves non-math content untouched', async () => {
    const tree = await toHast('A plain paragraph with no math.')
    expect(findElements(tree, 'math-inline')).toHaveLength(0)
    expect(findElements(tree, 'math-block')).toHaveLength(0)
  })

  it('preserves the raw source verbatim in data-source', async () => {
    const tree = await toHast('$\\frac{1}{2}$')
    const [el] = findElements(tree, 'math-inline')
    expect(el?.properties?.['data-source']).toBe('\\frac{1}{2}')
  })
})
