import { describe, expect, it, vi } from 'vitest'
import { AIError } from './types'
import {
  XIAOMI_DEFAULT_BASE_URL,
  XIAOMI_DEFAULT_MODEL,
  createXiaomiProvider,
} from './xiaomi-provider'

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

function sse(events: object[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
}

async function collect(it: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const v of it) out += v
  return out
}

describe('createXiaomiProvider', () => {
  it('targets the Xiaomi default baseURL + model and streams deltas', async () => {
    const captured: { url: string | null; body: string | null } = {
      url: null,
      body: null,
    }
    const fetchImpl = vi.fn<FetchFn>((url, init) => {
      captured.url = url
      captured.body = (init?.body ?? null) as string | null
      return Promise.resolve(
        new Response(
          bodyFromChunks([
            sse([
              { choices: [{ delta: { content: 'Hi' } }] },
              { choices: [{ delta: { content: ', friend' } }] },
            ]) + 'data: [DONE]\n\n',
          ]),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
      )
    })

    const provider = createXiaomiProvider({
      apiKey: 'tp-test',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    const text = await collect(provider.ask('hello?', []))

    expect(text).toBe('Hi, friend')
    expect(provider.id).toBe('xiaomi')
    expect(captured.url).toBe(`${XIAOMI_DEFAULT_BASE_URL}/chat/completions`)
    const parsed = JSON.parse(captured.body ?? '{}') as { model: string }
    expect(parsed.model).toBe(XIAOMI_DEFAULT_MODEL)
  })

  it('honors a custom baseURL override (regional failover)', async () => {
    const fetchImpl = vi.fn<FetchFn>((url) => {
      expect(url).toBe('https://example.test/v1/chat/completions')
      return Promise.resolve(
        new Response(bodyFromChunks(['data: [DONE]\n\n']), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
    })

    const provider = createXiaomiProvider({
      apiKey: 'tp-test',
      baseURL: 'https://example.test/v1',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await collect(provider.ask('hi', []))
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('honors a custom model override', async () => {
    let capturedBody: string | null = null
    const fetchImpl = vi.fn<FetchFn>((_url, init) => {
      capturedBody = (init?.body ?? null) as string | null
      return Promise.resolve(
        new Response(bodyFromChunks(['data: [DONE]\n\n']), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
    })

    const provider = createXiaomiProvider({
      apiKey: 'tp-test',
      model: 'mimo-v2.5-pro-thinking',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await collect(provider.ask('hi', []))
    const parsed = JSON.parse(capturedBody ?? '{}') as { model: string }
    expect(parsed.model).toBe('mimo-v2.5-pro-thinking')
  })

  it('surfaces auth failures through the AIError discriminator', async () => {
    const fetchImpl = vi.fn<FetchFn>(() =>
      Promise.resolve(new Response('forbidden', { status: 401 })),
    )
    const provider = createXiaomiProvider({
      apiKey: 'tp-bad',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    let caught: unknown
    try {
      await collect(provider.ask('hi', []))
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AIError)
    expect((caught as AIError).kind).toBe('auth')
  })

  it('sends Bearer authorization header with the configured key', async () => {
    let capturedAuth: string | null = null
    const fetchImpl = vi.fn<FetchFn>((_url, init) => {
      const headers = init?.headers as Record<string, string> | undefined
      capturedAuth = headers?.authorization ?? null
      return Promise.resolve(
        new Response(bodyFromChunks(['data: [DONE]\n\n']), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
    })

    const provider = createXiaomiProvider({
      apiKey: 'tp-secret-123',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await collect(provider.ask('hi', []))
    expect(capturedAuth).toBe('Bearer tp-secret-123')
  })
})
