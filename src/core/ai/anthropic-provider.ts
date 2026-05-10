/**
 * Anthropic Messages API provider.
 *
 * Calls the Messages endpoint directly from the browser. Anthropic
 * gates browser direct access behind the
 * `anthropic-dangerous-direct-browser-access` opt-in header — that's
 * intentional, because browser-issued requests expose the API key to
 * any script in the page. The local-first architecture mitigates this
 * by storing the key encrypted at rest (see `key-store.ts`); for
 * stronger isolation we'll ship a Tauri build later (per the AI
 * roadmap's Tier-2 path).
 *
 * Default model: `claude-sonnet-4-6`. Override per-instance via the
 * `model` option — the AI settings panel exposes that to power users.
 */

import {
  AIError,
  type AIProvider,
  type AskOptions,
  type ContextChunk,
} from './types'
import { readSSE } from './sse'

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-sonnet-4-6'
// 4096 gives card-generation room for ~25 Chinese flashcards plus the
// short ⌘K answers that reuse the same provider; 1024 was a 2024-era
// chat default that quietly truncated longer structured outputs.
// Anthropic's API requires the field, so unlike the OpenAI-compatible
// adapter we still send a value — just a more generous one.
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_SYSTEM_PROMPT =
  'You are a careful reading assistant inside SwirlRead, a local-first ' +
  'Markdown reader. Answer the user using only the provided context. If ' +
  'the answer is not in the context, say so plainly. Keep responses concise.'

export interface AnthropicConfig {
  /** Anthropic API key (`sk-ant-...`). */
  apiKey: string
  /** Override the default model id. */
  model?: string
  /** Override the default max output tokens. */
  maxTokens?: number
  /** Override the default system prompt. */
  systemPrompt?: string
  /** Test-only: swap out `globalThis.fetch`. */
  fetch?: typeof fetch
}

export function createAnthropicProvider(config: AnthropicConfig): AIProvider {
  const fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis)
  const model = config.model ?? DEFAULT_MODEL
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS
  const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

  return {
    id: 'anthropic',
    async *ask(
      prompt: string,
      context: ContextChunk[],
      options?: AskOptions,
    ): AsyncIterable<string> {
      const userMessage = composeUserMessage(prompt, context)
      const body = JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        stream: true,
      })

      let response: Response
      try {
        response = await fetchImpl(ANTHROPIC_ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body,
          signal: options?.signal,
        })
      } catch (err) {
        if (options?.signal?.aborted) {
          throw new AIError('aborted', 'Cancelled')
        }
        throw new AIError(
          'network',
          err instanceof Error ? err.message : String(err),
        )
      }

      if (!response.ok) {
        throw classifyHttpError(response.status, await safeText(response))
      }
      if (!response.body) {
        throw new AIError('malformed-response', 'No response body')
      }

      for await (const event of readSSE(response.body, options?.signal)) {
        const chunk = parseEvent(event)
        if (chunk) yield chunk
      }
    },
  }
}

function composeUserMessage(prompt: string, context: ContextChunk[]): string {
  if (context.length === 0) return prompt
  const blocks = context.map(
    (c) =>
      `<context source="${escapeAttr(c.source)}">\n${c.content}\n</context>`,
  )
  return `${blocks.join('\n\n')}\n\nQuestion: ${prompt}`
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

interface ContentBlockDelta {
  type: 'content_block_delta'
  delta: { type: 'text_delta'; text: string } | { type: string }
}

/**
 * Anthropic emits a small set of typed events. We only care about
 * `content_block_delta` with a `text_delta`; everything else (start /
 * stop / usage / ping) is ignored for v0.1. If the model ever streams
 * tool-use blocks, those will arrive as different delta types here and
 * be safely skipped — they're a future feature, not a regression.
 */
function parseEvent(raw: string): string | null {
  if (raw === '[DONE]' || raw.length === 0) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObject(parsed)) return null
  if (parsed.type !== 'content_block_delta') return null
  const event = parsed as unknown as ContentBlockDelta
  if (event.delta.type === 'text_delta') {
    return (event.delta as { text: string }).text
  }
  return null
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function classifyHttpError(status: number, body: string): AIError {
  if (status === 401 || status === 403) {
    return new AIError(
      'auth',
      `Anthropic auth failed (${String(status)}): ${body || 'no body'}`,
    )
  }
  if (status === 429) {
    return new AIError('rate-limited', 'Anthropic rate limit hit')
  }
  return new AIError(
    'network',
    `Anthropic returned ${String(status)}: ${body || 'no body'}`,
  )
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}
