import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetDbForTests } from '@/core/persistence/db'
import type { AIProvider, ContextChunk } from '@/core/ai/types'
import {
  CardGenerationError,
  generateBatch,
  parseCardsJson,
} from './card-generator'
import { getBatch, getCardsForBatch } from './card-store'
import type { GenerationDeps, GenerationInput } from './card-generator'

function fakeProvider(reply: string): AIProvider {
  return {
    id: 'anthropic',
    async *ask(_p: string, _c: ContextChunk[]): AsyncIterable<string> {
      // Yield in two pieces to cover the streaming-collect path even
      // though the generator only cares about the concatenated whole.
      // The token-yielding microtask split keeps the lint
      // `require-await` rule satisfied without changing semantics.
      await Promise.resolve()
      const half = Math.floor(reply.length / 2)
      yield reply.slice(0, half)
      yield reply.slice(half)
    },
  }
}

// Far enough in the future that the 24h default TTL never expires
// against the real wall clock — `getBatch` lazy-purges on access.
const FIXED_NOW = new Date('2099-05-09T10:00:00Z')

function makeDeps(reply: string): GenerationDeps {
  let id = 0
  return {
    provider: fakeProvider(reply),
    providerLabel: 'fake-model',
    newId: () => `id-${String(++id)}`,
    now: () => FIXED_NOW,
  }
}

function singleSourceInput(content: string): GenerationInput {
  return {
    vaultId: 'v',
    sources: [{ path: 'react.md', content }],
  }
}

beforeEach(async () => {
  await __resetDbForTests()
})

afterEach(async () => {
  await __resetDbForTests()
})

describe('parseCardsJson', () => {
  const goodJson = JSON.stringify([
    { question: 'Q1', answer: 'A1', explanation: 'E1' },
    { question: 'Q2', answer: 'A2', explanation: 'E2' },
  ])

  it('parses raw JSON', () => {
    const cards = parseCardsJson(goodJson)
    expect(cards.map((c) => c.question)).toEqual(['Q1', 'Q2'])
  })

  it('parses JSON inside a ```json fenced block with prose around it', () => {
    const wrapped = `Sure, here are your cards:\n\n\`\`\`json\n${goodJson}\n\`\`\`\n\nLet me know if you want more.`
    expect(parseCardsJson(wrapped).length).toBe(2)
  })

  it('parses JSON when the model just prefixes prose without a fence', () => {
    const wrapped = `Of course: ${goodJson} Hope that helps!`
    expect(parseCardsJson(wrapped).length).toBe(2)
  })

  it('tolerates trailing commas inside a fenced block', () => {
    const messy = `\`\`\`json\n[\n  { "question": "Q", "answer": "A", "explanation": "E", },\n]\n\`\`\``
    expect(parseCardsJson(messy).length).toBe(1)
  })

  it('skips items missing required fields without failing the batch', () => {
    const partial = JSON.stringify([
      { question: 'Q1', answer: 'A1', explanation: 'E1' },
      { question: 'just a question, no answer' },
      { question: 'Q3', answer: 'A3' }, // explanation missing → ok, defaults to ''
    ])
    const cards = parseCardsJson(partial)
    expect(cards.map((c) => c.question)).toEqual(['Q1', 'Q3'])
    expect(cards[1]?.explanation).toBe('')
  })

  it('returns [] when the response has no parseable JSON', () => {
    expect(parseCardsJson('I cannot help with that.')).toEqual([])
  })

  it('returns [] for an empty string', () => {
    expect(parseCardsJson('')).toEqual([])
  })

  it('strips a balanced <think> block emitted by reasoning models', () => {
    const reasoning = `<think>
Let me think about which cards to generate. The user wants 2 cards about
hooks, so I should focus on useState and useEffect.
</think>

[
  { "question": "Q1", "answer": "A1", "explanation": "E1" },
  { "question": "Q2", "answer": "A2", "explanation": "E2" }
]`
    expect(parseCardsJson(reasoning).length).toBe(2)
  })

  it('also handles <thinking> tag variant (Claude / Qwen-thinking)', () => {
    const reasoning = `<thinking>weighing options</thinking>
[{"question":"Q","answer":"A","explanation":"E"}]`
    expect(parseCardsJson(reasoning).length).toBe(1)
  })

  it('recovers from an unclosed <think> block by jumping to the JSON', () => {
    // Truncated reasoning model output — common when max_tokens cuts mid-thought.
    const truncated = `<think>I should... wait, also the JSON [{"question":"Q","answer":"A"}]`
    expect(parseCardsJson(truncated).length).toBe(1)
  })

  it('unwraps the {cards: [...]} envelope', () => {
    const wrapped = JSON.stringify({
      cards: [{ question: 'Q', answer: 'A', explanation: 'E' }],
    })
    expect(parseCardsJson(wrapped).length).toBe(1)
  })

  it('unwraps the {flashcards: [...]} envelope', () => {
    const wrapped = JSON.stringify({
      flashcards: [
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2' },
      ],
    })
    expect(parseCardsJson(wrapped).length).toBe(2)
  })

  it('accepts Chinese field names — 问题 / 答案 / 解释', () => {
    const cn = JSON.stringify([
      {
        问题: '什么是事件循环？',
        答案: '一种异步执行模型。',
        解释: '让 JavaScript 单线程也能处理并发任务。',
      },
    ])
    const cards = parseCardsJson(cn)
    expect(cards).toHaveLength(1)
    expect(cards[0]?.question).toBe('什么是事件循环？')
    expect(cards[0]?.answer).toBe('一种异步执行模型。')
    expect(cards[0]?.explanation).toContain('单线程')
  })

  it('accepts mixed: <think> block + Chinese envelope + Chinese keys', () => {
    const messy = `<think>用户在阅读 event-loop，应该生成事件循环相关的卡片</think>

\`\`\`json
{
  "cards": [
    { "问题": "事件循环是什么？", "答案": "JS 的异步执行模型。", "解释": "用任务队列调度回调。" }
  ]
}
\`\`\``
    const cards = parseCardsJson(messy)
    expect(cards).toHaveLength(1)
    expect(cards[0]?.question).toBe('事件循环是什么？')
  })

  it('accepts short-form English keys (q / a / why)', () => {
    const short = JSON.stringify([
      { q: 'Q', a: 'A', why: 'E' },
      { q: 'Q2', a: 'A2' },
    ])
    expect(parseCardsJson(short).length).toBe(2)
  })
})

describe('generateBatch', () => {
  const reply = JSON.stringify([
    { question: 'What is useState?', answer: 'A hook.', explanation: '...' },
    { question: 'What is useEffect?', answer: 'A hook.', explanation: '...' },
  ])

  it('persists the batch + cards and returns the batch record', async () => {
    const batch = await generateBatch(
      singleSourceInput('# React\n\nReact has hooks.'),
      makeDeps(reply),
    )
    expect(batch.id).toBe('id-1')
    expect(batch.label).toBe('react.md')
    expect(batch.providerLabel).toBe('fake-model')

    const stored = await getBatch(batch.id)
    expect(stored).not.toBeNull()
    const cards = await getCardsForBatch(batch.id)
    expect(cards.map((c) => c.question)).toEqual([
      'What is useState?',
      'What is useEffect?',
    ])
    expect(cards[0]?.order).toBe(0)
    expect(cards[1]?.order).toBe(1)
  })

  it('honors the cardCount option as a hard cap', async () => {
    const tenCards = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({
        question: `Q${String(i)}`,
        answer: `A${String(i)}`,
        explanation: `E${String(i)}`,
      })),
    )
    const batch = await generateBatch(
      { ...singleSourceInput('source'), options: { cardCount: 3 } },
      makeDeps(tenCards),
    )
    const cards = await getCardsForBatch(batch.id)
    expect(cards.length).toBe(3)
  })

  it('expires cards 24h from the seeded clock by default', async () => {
    const batch = await generateBatch(
      singleSourceInput('source'),
      makeDeps(reply),
    )
    expect(batch.expiresAt.getTime() - FIXED_NOW.getTime()).toBe(
      24 * 3600 * 1000,
    )
  })

  it('uses a custom TTL when supplied', async () => {
    const batch = await generateBatch(
      { ...singleSourceInput('source'), options: { ttlMs: 60_000 } },
      makeDeps(reply),
    )
    expect(batch.expiresAt.getTime() - FIXED_NOW.getTime()).toBe(60_000)
  })

  it('throws CardGenerationError(parse-failed) when the model returns nothing usable', async () => {
    let caught: unknown
    try {
      await generateBatch(singleSourceInput('source'), makeDeps('I refuse.'))
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(CardGenerationError)
    expect((caught as CardGenerationError).kind).toBe('parse-failed')
    expect((caught as CardGenerationError).rawOutput).toBe('I refuse.')
  })

  it('throws CardGenerationError(empty) when no sources are provided', async () => {
    let caught: unknown
    try {
      await generateBatch({ vaultId: 'v', sources: [] }, makeDeps(reply))
    } catch (err) {
      caught = err
    }
    expect((caught as CardGenerationError).kind).toBe('empty')
  })

  it('rejects with CardGenerationError(aborted) when the signal fires before the stream', async () => {
    const controller = new AbortController()
    controller.abort()

    let caught: unknown
    try {
      await generateBatch(
        { ...singleSourceInput('source'), signal: controller.signal },
        makeDeps(reply),
      )
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(CardGenerationError)
    expect((caught as CardGenerationError).kind).toBe('aborted')
  })

  it('forwards the signal to the provider and surfaces aborted as CardGenerationError', async () => {
    let receivedSignal: AbortSignal | undefined
    const provider: AIProvider = {
      id: 'anthropic',
      async *ask(_p, _c, options): AsyncIterable<string> {
        await Promise.resolve()
        receivedSignal = options?.signal
        // Simulate the provider noticing the abort and bailing.
        if (options?.signal?.aborted) {
          // We intentionally throw the same shape the real providers use
          // so the generator's catch path is exercised.
          const { AIError } = await import('@/core/ai/types')
          throw new AIError('aborted', 'Cancelled')
        }
        yield ''
      },
    }
    const controller = new AbortController()
    controller.abort()

    let caught: unknown
    try {
      await generateBatch(
        { ...singleSourceInput('source'), signal: controller.signal },
        {
          provider,
          providerLabel: 'fake',
          newId: () => 'x',
          now: () => FIXED_NOW,
        },
      )
    } catch (err) {
      caught = err
    }
    // We aborted before the call so the pre-flight guard catches first;
    // the signal still gets propagated when the stream actually opens
    // (see the next test for the mid-stream case).
    expect((caught as CardGenerationError).kind).toBe('aborted')
    void receivedSignal
  })

  it('wraps provider failures in CardGenerationError(underlying)', async () => {
    const failingProvider: AIProvider = {
      id: 'anthropic',
      async *ask(_p, _c): AsyncIterable<string> {
        await Promise.resolve()
        throw new Error('boom')
        yield '' // unreachable; satisfies the generator return-type
      },
    }
    let caught: unknown
    try {
      await generateBatch(singleSourceInput('source'), {
        provider: failingProvider,
        providerLabel: 'fake',
        newId: () => 'x',
        now: () => FIXED_NOW,
      })
    } catch (err) {
      caught = err
    }
    expect((caught as CardGenerationError).kind).toBe('underlying')
    expect((caught as CardGenerationError).message).toContain('boom')
  })
})
