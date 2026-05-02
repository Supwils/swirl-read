import { describe, it, expect } from 'vitest'
import { parseDelimited } from './csv-parse'

describe('parseDelimited (M7.3)', () => {
  it('parses a simple comma-separated grid', () => {
    const { rows, truncated } = parseDelimited('a,b,c\n1,2,3\n4,5,6')
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ])
    expect(truncated).toBe(false)
  })

  it('switches to tab delimiter for TSV', () => {
    const { rows } = parseDelimited('a\tb\nc\td', { delimiter: '\t' })
    expect(rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('handles double-quoted fields and escaped double quotes', () => {
    const { rows } = parseDelimited('a,"b,c","d""e"\n1,2,3')
    expect(rows).toEqual([
      ['a', 'b,c', 'd"e'],
      ['1', '2', '3'],
    ])
  })

  it('preserves newlines inside quoted fields', () => {
    const { rows } = parseDelimited('"line1\nline2",b\n1,2')
    expect(rows).toEqual([
      ['line1\nline2', 'b'],
      ['1', '2'],
    ])
  })

  it('handles CRLF endings', () => {
    const { rows } = parseDelimited('a,b\r\nc,d\r\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('preserves empty cells', () => {
    const { rows } = parseDelimited('a,,c\n,,\n')
    expect(rows).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ])
  })

  it('preserves CJK characters verbatim', () => {
    const { rows } = parseDelimited('姓名,年龄\n张三,28\n李四,32')
    expect(rows).toEqual([
      ['姓名', '年龄'],
      ['张三', '28'],
      ['李四', '32'],
    ])
  })

  it('stops at maxRows and reports truncated', () => {
    const csv = ['a', 'b', 'c', 'd', 'e'].map((v) => `${v},${v}`).join('\n')
    const { rows, truncated } = parseDelimited(csv, { maxRows: 3 })
    expect(rows).toHaveLength(3)
    expect(truncated).toBe(true)
  })

  it('does not emit a phantom row for a trailing newline', () => {
    const { rows } = parseDelimited('a,b\n')
    expect(rows).toEqual([['a', 'b']])
  })

  it('handles a file that is just a quoted single field', () => {
    const { rows } = parseDelimited('"just one"')
    expect(rows).toEqual([['just one']])
  })
})
