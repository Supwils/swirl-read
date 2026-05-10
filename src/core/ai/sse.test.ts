import { describe, expect, it } from 'vitest'
import { readSSE } from './sse'

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[i]))
      i += 1
    },
  })
}

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = []
  for await (const v of it) out.push(v)
  return out
}

describe('readSSE', () => {
  it('parses one record per blank-line separator', async () => {
    const stream = streamFrom(['data: hello\n\ndata: world\n\n'])
    const events = await collect(readSSE(stream))
    expect(events).toEqual(['hello', 'world'])
  })

  it('handles records that arrive split across chunks', async () => {
    const stream = streamFrom(['data: hel', 'lo\n\ndata: wor', 'ld\n\n'])
    const events = await collect(readSSE(stream))
    expect(events).toEqual(['hello', 'world'])
  })

  it('joins multi-line data within a single record', async () => {
    const stream = streamFrom(['data: line1\ndata: line2\n\n'])
    const events = await collect(readSSE(stream))
    expect(events).toEqual(['line1\nline2'])
  })

  it('skips comment heartbeats', async () => {
    const stream = streamFrom([': keep-alive\n\ndata: real\n\n'])
    const events = await collect(readSSE(stream))
    expect(events).toEqual(['real'])
  })

  it('flushes a trailing record without a final blank line', async () => {
    const stream = streamFrom(['data: one\n\ndata: two'])
    const events = await collect(readSSE(stream))
    expect(events).toEqual(['one', 'two'])
  })

  it('respects the abort signal between chunks', async () => {
    const controller = new AbortController()
    const encoder = new TextEncoder()
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(streamController) {
        pulls += 1
        if (pulls === 1) {
          streamController.enqueue(encoder.encode('data: first\n\n'))
          return
        }
        controller.abort()
        streamController.enqueue(encoder.encode('data: second\n\n'))
      },
    })

    const events: string[] = []
    for await (const v of readSSE(stream, controller.signal)) {
      events.push(v)
    }
    expect(events).toEqual(['first'])
  })
})
