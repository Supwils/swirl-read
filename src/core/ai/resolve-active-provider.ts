/**
 * Shared provider-resolution helper.
 *
 * Two surfaces (`PaletteAskResult` for the ⌘K `?` mode and
 * `GenerateCardsDialog` for review-card generation) need the same logic:
 *
 *   1. If the user has explicitly set a default provider in Settings,
 *      try that one first.
 *   2. Otherwise (or if the explicit pick has no key configured), walk
 *      a deterministic chain — Anthropic → Xiaomi → OpenAI-compatible —
 *      and use the first provider with a usable key.
 *
 * Both call sites used to inline a near-identical 30-line copy of this
 * function; pulling it into one module makes adding a fourth provider
 * (or changing the chain order) a single-file change.
 */

import { createAnthropicProvider } from './anthropic-provider'
import { createOpenAICompatibleProvider } from './openai-compatible-provider'
import { createXiaomiProvider } from './xiaomi-provider'
import { getAIKey, getActiveProvider } from './key-store'
import type { AIProvider, AIProviderId } from './types'

export interface ResolvedAIProvider {
  /** Live provider instance, ready for `provider.ask(...)`. */
  provider: AIProvider
  /** Display label for the surface header — typically the model id, or
   *  the brand name when no model is configured. */
  label: string
}

/** Resolve the provider that should answer the next question. Returns
 *  `null` when nothing usable is configured. */
export async function resolveActiveProvider(): Promise<ResolvedAIProvider | null> {
  const active = await getActiveProvider()
  if (active) {
    const explicit = await tryProvider(active)
    if (explicit) return explicit
    // The explicit pick has been wiped (or never had a key). Fall
    // through to the chain instead of erroring — a configured
    // runner-up is more useful than a hard "no provider" stop.
  }
  for (const id of ['anthropic', 'xiaomi', 'openai-compat'] as const) {
    if (id === active) continue
    const resolved = await tryProvider(id)
    if (resolved) return resolved
  }
  return null
}

async function tryProvider(
  id: AIProviderId,
): Promise<ResolvedAIProvider | null> {
  const stored = await getAIKey(id)
  if (!stored) return null
  if (id === 'anthropic') {
    if (!stored.apiKey) return null
    return {
      provider: createAnthropicProvider({
        apiKey: stored.apiKey,
        ...(stored.meta.model && { model: stored.meta.model }),
      }),
      label: stored.meta.model ?? 'Claude',
    }
  }
  if (id === 'xiaomi') {
    if (!stored.apiKey) return null
    return {
      provider: createXiaomiProvider({
        apiKey: stored.apiKey,
        ...(stored.meta.baseURL && { baseURL: stored.meta.baseURL }),
        ...(stored.meta.model && { model: stored.meta.model }),
      }),
      label: stored.meta.model ?? 'Xiaomi MiMo',
    }
  }
  // openai-compat — base URL + model are both required.
  if (!stored.meta.baseURL || !stored.meta.model) return null
  return {
    provider: createOpenAICompatibleProvider({
      apiKey: stored.apiKey,
      baseURL: stored.meta.baseURL,
      model: stored.meta.model,
    }),
    label: stored.meta.model,
  }
}
