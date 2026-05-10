/**
 * OpenAI-compatible chat completions provider.
 *
 * One adapter that covers OpenAI itself, DeepSeek, Together, plus
 * locally-hosted backends like Ollama (`http://localhost:11434/v1`)
 * and LM Studio. The endpoint shape is the same `/v1/chat/completions`
 * with a Bearer token, so a single provider with a configurable
 * `baseURL` covers them all.
 *
 * Unlike the Anthropic adapter there's no sane default model — the user
 * has to pick one that matches whichever backend they pointed us at.
 * `model` is therefore required in the config.
 */

import {
  AIError,
  type AIProvider,
  type AskOptions,
  type ContextChunk,
} from './types'
import { readSSE } from './sse'

// We deliberately do NOT default `max_tokens`. The official Xiaomi /
// DeepSeek / OpenAI sample scripts all omit the field and let the API
// pick. Reasoning models (Xiaomi MiMo, DeepSeek-R1) need a generous
// budget — any small static cap silently truncates the chain-of-thought
// and we end up with an empty visible answer. Users who genuinely want
// a cap can pass `maxTokens` through {@link OpenAICompatibleConfig}.
const DEFAULT_SYSTEM_PROMPT =
  'You are a careful reading assistant inside SwirlRead, a local-first ' +
  'Markdown reader. Answer the user using only the provided context. If ' +
  'the answer is not in the context, say so plainly. Keep responses concise.'

export interface OpenAICompatibleConfig {
  /** Bearer token; pass an empty string for endpoints that do not require auth. */
  apiKey: string
  /** Base URL up to and including the API prefix, e.g.
   *  `https://api.openai.com/v1`, `https://api.deepseek.com/v1`,
   *  `http://localhost:11434/v1`. Trailing slash is fine — we strip it. */
  baseURL: string
  /** Required — model id matching the configured backend. */
  model: string
  /** Override the default max output tokens. */
  maxTokens?: number
  /** Override the default system prompt. */
  systemPrompt?: string
  /** Test-only: swap out `globalThis.fetch`. */
  fetch?: typeof fetch
}

export function createOpenAICompatibleProvider(
  config: OpenAICompatibleConfig,
): AIProvider {
  const fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis)
  const baseURL = config.baseURL.replace(/\/$/, '')
  const endpoint = `${baseURL}/chat/completions`
  const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

  return {
    id: 'openai-compat',
    async *ask(
      prompt: string,
      context: ContextChunk[],
      options?: AskOptions,
    ): AsyncIterable<string> {
      const userMessage = composeUserMessage(prompt, context)
      // Mirror the official Xiaomi / DeepSeek / OpenAI sample shape:
      // `model`, `messages`, `stream: true`. `max_tokens` is only
      // attached when the caller explicitly opted in — see the comment
      // by `DEFAULT_SYSTEM_PROMPT` for why.
      const payload: Record<string, unknown> = {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: true,
      }
      if (typeof config.maxTokens === 'number') {
        payload.max_tokens = config.maxTokens
      }
      const body = JSON.stringify(payload)

      const headers: Record<string, string> = {
        'content-type': 'application/json',
      }
      if (config.apiKey) {
        headers.authorization = `Bearer ${config.apiKey}`
      }

      let response: Response
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers,
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
        if (event === '[DONE]') return
        const chunk = parseEvent(event)
        if (chunk) yield chunk
      }
    },
  }
}

function composeUserMessage(prompt: string, context: ContextChunk[]): string {
  if (context.length === 0) return prompt
  const blocks = context.map((c) => `--- ${c.source} ---\n${c.content}`)
  return `${blocks.join('\n\n')}\n\nQuestion: ${prompt}`
}

interface ChatCompletionDelta {
  choices: {
    delta?: {
      content?: string
      // Reasoning models (DeepSeek-R1, Xiaomi MiMo, Qwen-thinking) split
      // their output into hidden chain-of-thought (`reasoning_content`)
      // and the user-visible answer (`content`). When the model truncates
      // mid-reasoning we'd see only `reasoning_content` — capturing it as
      // a fallback prevents "empty response" from looking like an outage.
      reasoning_content?: string
      reasoning?: string
    }
  }[]
}

function parseEvent(raw: string): string | null {
  if (raw.length === 0) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObject(parsed)) return null
  const choices = (parsed as unknown as ChatCompletionDelta).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const delta = choices[0]?.delta
  if (!delta) return null
  // Visible answer wins; we wrap reasoning fragments in <think> tags so
  // downstream parsers (e.g. the review-card JSON parser) can strip them
  // with a single regex pass instead of carrying field-aware logic.
  if (typeof delta.content === 'string' && delta.content.length > 0) {
    return delta.content
  }
  const reasoning =
    (typeof delta.reasoning_content === 'string' && delta.reasoning_content) ||
    (typeof delta.reasoning === 'string' && delta.reasoning) ||
    ''
  if (reasoning.length > 0) {
    return `<think>${reasoning}</think>`
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
      `OpenAI-compatible auth failed (${String(status)}): ${body || 'no body'}`,
    )
  }
  if (status === 429) {
    return new AIError('rate-limited', 'OpenAI-compatible rate limit hit')
  }
  return new AIError(
    'network',
    `OpenAI-compatible endpoint returned ${String(status)}: ${body || 'no body'}`,
  )
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}
