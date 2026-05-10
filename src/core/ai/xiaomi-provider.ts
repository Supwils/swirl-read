/**
 * Xiaomi MiMo provider — first-class adapter for the
 * `xiaomimimo.com` token-plan endpoint.
 *
 * Xiaomi exposes an OpenAI-compatible chat-completions API
 * (`POST /v1/chat/completions`, Bearer auth, SSE deltas). We could ask
 * users to configure it through the generic OpenAI-compatible form, but
 * promoting it to a first-class provider gives them a one-click setup
 * with the right baseURL + model preset, and lets them configure
 * Anthropic + Xiaomi + OpenAI-compatible side by side under separate
 * encrypted rows. The UX is the win — under the hood we just delegate
 * to {@link createOpenAICompatibleProvider} with the Xiaomi defaults.
 *
 * Verified upstream contract (see `/Users/supwils/supwilsoft/AI/xiaomi`
 * sample scripts): Bearer key starts with `tp-`, default model
 * `mimo-v2.5-pro`, base URL `https://token-plan-sgp.xiaomimimo.com/v1`.
 */

import { createOpenAICompatibleProvider } from './openai-compatible-provider'
import type { AIProvider, AskOptions, ContextChunk } from './types'

export const XIAOMI_DEFAULT_BASE_URL =
  'https://token-plan-sgp.xiaomimimo.com/v1'
export const XIAOMI_DEFAULT_MODEL = 'mimo-v2.5-pro'

export interface XiaomiConfig {
  /** Bearer token issued by Xiaomi (typically begins with `tp-`). */
  apiKey: string
  /** Override the default base URL — useful for region failover. */
  baseURL?: string
  /** Override the default model — defaults to {@link XIAOMI_DEFAULT_MODEL}. */
  model?: string
  /** Test-only: swap out `globalThis.fetch`. */
  fetch?: typeof fetch
}

export function createXiaomiProvider(config: XiaomiConfig): AIProvider {
  const inner = createOpenAICompatibleProvider({
    apiKey: config.apiKey,
    baseURL: config.baseURL ?? XIAOMI_DEFAULT_BASE_URL,
    model: config.model ?? XIAOMI_DEFAULT_MODEL,
    ...(config.fetch && { fetch: config.fetch }),
  })

  // Re-key the id so the rest of the app can distinguish a Xiaomi-backed
  // provider from a manually-configured OpenAI-compatible one. The
  // streaming logic itself is unchanged.
  return {
    id: 'xiaomi',
    ask(
      prompt: string,
      context: ContextChunk[],
      options?: AskOptions,
    ): AsyncIterable<string> {
      return inner.ask(prompt, context, options)
    },
  }
}
