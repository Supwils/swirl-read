import { describe, expect, it, vi } from 'vitest'
import { createOpenAICompatibleProvider } from './openai-compatible-provider'

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

function sse(deltas: (string | null)[]): string {
  return (
    deltas
      .map((content) => {
        if (content === null) {
          return 'data: {"choices":[{"delta":{}}]}\n\n'
        }
        return `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\n`
      })
      .join('') + 'data: [DONE]\n\n'
  )
}

async function collect(it: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const v of it) out += v
  return out
}

function sseRaw(events: object[]): string {
  return (
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') +
    'data: [DONE]\n\n'
  )
}

describe('createOpenAICompatibleProvider', () => {
  it('omits max_tokens by default — matching the official Xiaomi/OpenAI sample', async () => {
    let capturedBody: string | null = null
    const fetchImpl = vi.fn<FetchFn>((_url, init) => {
      capturedBody = (init?.body ?? null) as string | null
      return Promise.resolve(
        new Response(bodyFromChunks([sse(['ok'])]), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      )
    })
    const provider = createOpenAICompatibleProvider({
      apiKey: 'k',
      baseURL: 'https://example.test/v1',
      model: 'mimo-v2.5-pro',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await collect(provider.ask('hi', []))
    const parsed = JSON.parse(capturedBody ?? '{}') as Record<string, unknown>
    expect('max_tokens' in parsed).toBe(false)
  })

  it('forwards max_tokens only when the caller explicitly configures it', async () => {
    let capturedBody: string | null = null
    const fetchImpl = vi.fn<FetchFn>((_url, init) => {
      capturedBody = (init?.body ?? null) as string | null
      return Promise.resolve(
        new Response(bodyFromChunks([sse(['ok'])]), { status: 200 }),
      )
    })
    const provider = createOpenAICompatibleProvider({
      apiKey: 'k',
      baseURL: 'https://example.test/v1',
      model: 'm',
      maxTokens: 8000,
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await collect(provider.ask('hi', []))
    const parsed = JSON.parse(capturedBody ?? '{}') as { max_tokens?: number }
    expect(parsed.max_tokens).toBe(8000)
  })

  it('captures reasoning_content as <think> blocks when content is absent', async () => {
    // Reasoning models (DeepSeek-R1, Xiaomi MiMo) emit `reasoning_content`
    // for the chain-of-thought, then `content` for the visible answer. If
    // the request truncates mid-reasoning we'd see only the reasoning;
    // wrapping it in <think> tags lets downstream parsers strip it
    // uniformly with the inline-think-block path.
    const events = [
      { choices: [{ delta: { reasoning_content: 'thinking… ' } }] },
      { choices: [{ delta: { reasoning_content: 'still thinking' } }] },
      { choices: [{ delta: { content: '[{"q":"Q","a":"A"}]' } }] },
    ]
    const fetchImpl = vi.fn<FetchFn>(() =>
      Promise.resolve(
        new Response(bodyFromChunks([sseRaw(events)]), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      ),
    )
    const provider = createOpenAICompatibleProvider({
      apiKey: 'tp-test',
      baseURL: 'https://example.test/v1',
      model: 'mimo-v2.5-pro',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    const text = await collect(provider.ask('hi', []))
    expect(text).toContain('<think>thinking… </think>')
    expect(text).toContain('<think>still thinking</think>')
    expect(text).toContain('[{"q":"Q","a":"A"}]')
  })

  it('also accepts the bare `reasoning` field (some providers use it)', async () => {
    const events = [
      { choices: [{ delta: { reasoning: 'pondering' } }] },
      { choices: [{ delta: { content: 'final' } }] },
    ]
    const fetchImpl = vi.fn<FetchFn>(() =>
      Promise.resolve(
        new Response(bodyFromChunks([sseRaw(events)]), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      ),
    )
    const provider = createOpenAICompatibleProvider({
      apiKey: 'k',
      baseURL: 'https://example.test/v1',
      model: 'm',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    expect(await collect(provider.ask('hi', []))).toBe(
      '<think>pondering</think>final',
    )
  })

  it('streams chat-completion deltas and stops at [DONE]', async () => {
    const fetchImpl = vi.fn<FetchFn>(() =>
      Promise.resolve(
        new Response(bodyFromChunks([sse(['Hello', ', ', 'world'])]), {
          status: 200,
        }),
      ),
    )

    const provider = createOpenAICompatibleProvider({
      apiKey: 'sk-openai',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    expect(await collect(provider.ask('hi', []))).toBe('Hello, world')

    const call = fetchImpl.mock.calls[0]!
    expect(call[0]).toBe('https://api.openai.com/v1/chat/completions')
    const headers = call[1]!.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-openai')
  })

  it('strips a trailing slash from baseURL', async () => {
    const fetchImpl = vi.fn<FetchFn>(() =>
      Promise.resolve(new Response(bodyFromChunks([sse([])]), { status: 200 })),
    )
    const provider = createOpenAICompatibleProvider({
      apiKey: 'sk',
      baseURL: 'https://example.com/v1/',
      model: 'm',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await collect(provider.ask('q', []))
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      'https://example.com/v1/chat/completions',
    )
  })

  it('omits the Authorization header when apiKey is empty (Ollama / local LMs)', async () => {
    const fetchImpl = vi.fn<FetchFn>(() =>
      Promise.resolve(
        new Response(bodyFromChunks([sse(['ok'])]), { status: 200 }),
      ),
    )
    const provider = createOpenAICompatibleProvider({
      apiKey: '',
      baseURL: 'http://localhost:11434/v1',
      model: 'llama3',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await collect(provider.ask('q', []))
    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >
    expect(headers.authorization).toBeUndefined()
  })

  it('uses --- source --- markers when context is provided', async () => {
    let capturedBody: string | null = null
    const fetchImpl = vi.fn<FetchFn>((_url, init) => {
      capturedBody = (init?.body ?? null) as string | null
      return Promise.resolve(
        new Response(bodyFromChunks([sse(['ok'])]), { status: 200 }),
      )
    })
    const provider = createOpenAICompatibleProvider({
      apiKey: 'sk',
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await collect(
      provider.ask('What?', [{ source: 'note.md', content: 'body text' }]),
    )
    expect(capturedBody).not.toBeNull()
    const parsed = JSON.parse(capturedBody!) as {
      messages: { role: string; content: string }[]
    }
    expect(parsed.messages[0]!.role).toBe('system')
    expect(parsed.messages[1]!.role).toBe('user')
    expect(parsed.messages[1]!.content).toContain('--- note.md ---')
    expect(parsed.messages[1]!.content).toContain('Question: What?')
  })

  it('skips empty deltas (Anthropic-style ping equivalent)', async () => {
    const fetchImpl = vi.fn<FetchFn>(() =>
      Promise.resolve(
        new Response(bodyFromChunks([sse([null, 'real', null, 'tail'])]), {
          status: 200,
        }),
      ),
    )
    const provider = createOpenAICompatibleProvider({
      apiKey: 'sk',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    expect(await collect(provider.ask('q', []))).toBe('realtail')
  })

  it('classifies 401 as auth error', async () => {
    const fetchImpl = vi.fn<FetchFn>(() =>
      Promise.resolve(new Response('{"error":"x"}', { status: 401 })),
    )
    const provider = createOpenAICompatibleProvider({
      apiKey: 'sk',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      fetch: fetchImpl as unknown as typeof fetch,
    })
    await expect(collect(provider.ask('q', []))).rejects.toMatchObject({
      kind: 'auth',
    })
  })
})
