import { describe, expect, it, vi } from 'vitest'
import { AIError } from './types'
import { createAnthropicProvider } from './anthropic-provider'

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

function bodyFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
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

function sse(
  events: { type: string; delta?: { type: string; text?: string } }[],
): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
}

async function collect(it: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const v of it) out += v
  return out
}

describe('createAnthropicProvider', () => {
  it('streams text_delta chunks and ignores other event types', async () => {
    const fetchImpl = vi.fn<FetchFn>(() =>
      Promise.resolve(
        new Response(
          bodyFromChunks([
            sse([
              { type: 'message_start' },
              {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'Hello' },
              },
              { type: 'ping' },
              {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: ', world' },
              },
              { type: 'message_stop' },
            ]),
          ]),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
      ),
    )

    const provider = createAnthropicProvider({
      apiKey: 'sk-test',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    const text = await collect(provider.ask('hello?', []))

    expect(text).toBe('Hello, world')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const call = fetchImpl.mock.calls[0]!
    expect(call[0]).toBe('https://api.anthropic.com/v1/messages')
    const headers = call[1]!.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-test')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  })

  it('embeds context chunks with source markers in the user message', async () => {
    let capturedBody: string | null = null
    const fetchImpl = vi.fn<FetchFn>((_url, init) => {
      capturedBody = (init?.body ?? null) as string | null
      return Promise.resolve(
        new Response(
          bodyFromChunks([
            sse([
              {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'ok' },
              },
            ]),
          ]),
          { status: 200 },
        ),
      )
    })

    const provider = createAnthropicProvider({
      apiKey: 'sk-test',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await collect(
      provider.ask('What is X?', [
        { source: 'current document', content: 'X is Y.' },
      ]),
    )

    expect(capturedBody).not.toBeNull()
    const parsed = JSON.parse(capturedBody!) as {
      messages: { content: string }[]
    }
    expect(parsed.messages[0]!.content).toContain(
      '<context source="current document">',
    )
    expect(parsed.messages[0]!.content).toContain('X is Y.')
    expect(parsed.messages[0]!.content).toContain('Question: What is X?')
  })

  it('throws AIError(auth) on a 401', async () => {
    const fetchImpl = vi.fn<FetchFn>(() =>
      Promise.resolve(
        new Response('{"error":"invalid api key"}', { status: 401 }),
      ),
    )
    const provider = createAnthropicProvider({
      apiKey: 'sk-bad',
      fetch: fetchImpl as unknown as typeof fetch,
    })

    await expect(collect(provider.ask('q', []))).rejects.toMatchObject({
      name: 'AIError',
      kind: 'auth',
    })
  })

  it('throws AIError(rate-limited) on a 429', async () => {
    const fetchImpl = vi.fn<FetchFn>(() =>
      Promise.resolve(new Response('rate limited', { status: 429 })),
    )
    const provider = createAnthropicProvider({
      apiKey: 'sk-ok',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await expect(collect(provider.ask('q', []))).rejects.toBeInstanceOf(AIError)
    await expect(collect(provider.ask('q', []))).rejects.toMatchObject({
      kind: 'rate-limited',
    })
  })

  it('throws AIError(network) when fetch itself rejects', async () => {
    const fetchImpl = vi.fn<FetchFn>(() => Promise.reject(new Error('boom')))
    const provider = createAnthropicProvider({
      apiKey: 'sk',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await expect(collect(provider.ask('q', []))).rejects.toMatchObject({
      kind: 'network',
    })
  })
})
