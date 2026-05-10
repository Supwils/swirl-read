/**
 * Card generator — turns a Markdown source into a batch of review cards
 * via the configured AI provider.
 *
 * The provider abstraction (`AIProvider.ask`) is a streaming text
 * surface; the generator collects the full stream, parses the JSON the
 * model returned, and persists the resulting batch + cards. Streaming
 * is irrelevant here (Q/A is structured, the user wants the full result
 * before reviewing) but it's what we have, and it's free.
 *
 * Robustness over politeness: we accept models that wrap the JSON in a
 * ```json fence, that prefix it with "Sure, here are your cards:", or
 * that emit slightly malformed JSON with trailing commas. {@link parseCardsJson}
 * tries strict parsing first, then a fenced extraction, then a leniency
 * pass — only after all three fail do we surface the model's raw output.
 */

import { AIError } from '@/core/ai/types'
import type { AIProvider, ContextChunk } from '@/core/ai/types'
import type { VaultId, VaultPath } from '@/core/vault'
import { basename } from '@/core/vault'
import {
  DEFAULT_CARD_COUNT,
  DEFAULT_REVIEW_TTL_MS,
  MAX_CARD_COUNT,
  type GenerationOptions,
  type ReviewBatch,
  type ReviewCard,
} from './types'
import { persistBatch } from './card-store'

/** Hard char cap per source so we never blow past a model's context
 *  window on huge notes. Cards from the truncated tail won't exist; the
 *  user can re-generate from a smaller selection if that's an issue. */
const MAX_SOURCE_CHARS = 16_000

export class CardGenerationError extends Error {
  readonly kind:
    | 'no-provider'
    | 'parse-failed'
    | 'empty'
    | 'underlying'
    | 'aborted'
  /** Raw text the model returned, only populated for parse-failed. */
  readonly rawOutput?: string
  constructor(
    kind: 'no-provider' | 'parse-failed' | 'empty' | 'underlying' | 'aborted',
    message: string,
    rawOutput?: string,
  ) {
    super(message)
    this.kind = kind
    this.name = 'CardGenerationError'
    if (rawOutput !== undefined) this.rawOutput = rawOutput
  }
}

export interface GenerationInput {
  vaultId: VaultId
  sources: { path: VaultPath; content: string }[]
  /** Display label for the resulting batch. Single-file batches default
   *  to the source basename; multi-file callers pick something humane. */
  label?: string
  options?: GenerationOptions
  /** Cancellation signal — when fired, the underlying provider stream
   *  is aborted and `generateBatch` rejects with
   *  `CardGenerationError('aborted', ...)` so callers can distinguish
   *  user-cancelled runs from real failures. */
  signal?: AbortSignal
}

export interface GenerationDeps {
  provider: AIProvider
  providerLabel: string
  /** Test seam: pluggable id + clock so tests can pin both. */
  newId?: () => string
  now?: () => Date
}

/**
 * Run one generation: ask the AI, parse the response, persist the
 * batch, return the persisted record. Caller routes to the review page
 * with the returned batchId.
 */
export async function generateBatch(
  input: GenerationInput,
  deps: GenerationDeps,
): Promise<ReviewBatch> {
  if (input.sources.length === 0) {
    throw new CardGenerationError('empty', 'No source documents provided')
  }
  const newId = deps.newId ?? defaultNewId
  const now = (deps.now ?? (() => new Date()))()

  const cardCount = clampCardCount(input.options?.cardCount)
  const ttlMs = input.options?.ttlMs ?? DEFAULT_REVIEW_TTL_MS

  const prompt = buildPrompt(cardCount)
  const context = input.sources.map<ContextChunk>((s) => ({
    source: s.path,
    content: s.content.slice(0, MAX_SOURCE_CHARS),
  }))

  if (input.signal?.aborted) {
    throw new CardGenerationError('aborted', 'Generation cancelled')
  }

  let raw = ''
  try {
    const stream = deps.provider.ask(
      prompt,
      context,
      input.signal ? { signal: input.signal } : undefined,
    )
    for await (const chunk of stream) {
      raw += chunk
    }
  } catch (err) {
    if (err instanceof AIError && err.kind === 'aborted') {
      throw new CardGenerationError('aborted', 'Generation cancelled')
    }
    if (input.signal?.aborted) {
      throw new CardGenerationError('aborted', 'Generation cancelled')
    }
    throw new CardGenerationError(
      'underlying',
      err instanceof Error ? err.message : String(err),
    )
  }

  if (input.signal?.aborted) {
    throw new CardGenerationError('aborted', 'Generation cancelled')
  }

  // Always log the raw response under a recognisable prefix so users
  // can grep their browser console without having to reach into the
  // SSE stream via DevTools → Network. Stays out of production builds
  // — `import.meta.env.DEV` is a Vite-replaced compile-time constant.
  if (import.meta.env.DEV) {
    console.debug(
      '[review] raw model response',
      { length: raw.length, providerLabel: deps.providerLabel },
      raw,
    )
  }

  const parsed = parseCardsJson(raw)
  if (parsed.length === 0) {
    if (import.meta.env.DEV) {
      console.warn(
        '[review] parse failed — see raw response above. Common causes:',
        '\n  • model emitted only reasoning tokens (max_tokens too low?)',
        '\n  • model returned an unexpected envelope shape',
        '\n  • model refused or returned an empty body',
      )
    }
    throw new CardGenerationError(
      'parse-failed',
      raw.length === 0
        ? 'The model returned an empty response. The reasoning may have hit the token limit before producing any answer — try a smaller card count or pick a different provider.'
        : 'The model returned a response we could not parse as cards. Try again or pick a different provider.',
      raw,
    )
  }

  const batchId = newId()
  const expiresAt = new Date(now.getTime() + ttlMs)
  const label =
    input.label ??
    (input.sources.length === 1
      ? basename(input.sources[0]!.path)
      : `${String(input.sources.length)} selected files`)

  const batch: ReviewBatch = {
    id: batchId,
    vaultId: input.vaultId,
    sourcePaths: input.sources.map((s) => s.path),
    label,
    providerLabel: deps.providerLabel,
    createdAt: now,
    expiresAt,
  }

  // Cards inherit the batch TTL — same expiry, same creation time.
  // This is what lets the TTL purge use one range index instead of two.
  // Source-path attribution prefers the FIRST source for now; multi-file
  // batches can split later via cross-card heuristics.
  const sourceFallback = input.sources[0]!.path
  const cards: ReviewCard[] = parsed.slice(0, cardCount).map((c, i) => ({
    id: newId(),
    batchId,
    vaultId: input.vaultId,
    order: i,
    question: c.question,
    answer: c.answer,
    explanation: c.explanation,
    sourcePath: sourceFallback,
    createdAt: now,
    expiresAt,
  }))

  await persistBatch(batch, cards)
  return batch
}

function clampCardCount(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_CARD_COUNT
  if (!Number.isFinite(requested) || requested < 1) return DEFAULT_CARD_COUNT
  return Math.min(MAX_CARD_COUNT, Math.floor(requested))
}

function buildPrompt(cardCount: number): string {
  // Few-shot the schema and the constraints in one go. The "Return ONLY"
  // language plus an explicit example block is what gets the closed
  // models (Claude / GPT-4) to drop their preamble; open models often
  // ignore it but the parser is tolerant enough that a code-fenced
  // response still works. Reasoning models (DeepSeek-R1, Xiaomi MiMo)
  // emit `<think>` blocks before the answer — we strip those at parse
  // time, but explicitly forbidding them here cuts the failure rate.
  return [
    `Generate exactly ${String(cardCount)} spaced-repetition flashcards from the source notes.`,
    '',
    'Output FORMAT — read this carefully:',
    '- Output is a single JSON array and nothing else.',
    '- The first character of your response must be `[`.',
    '- The last character of your response must be `]`.',
    '- Do not write any prose before, after, or between cards.',
    '- Do not emit `<think>`, `<thinking>`, or any other XML tags.',
    '- Do not wrap the array in `{cards: ...}` or any other object.',
    '- Use the exact English keys "question", "answer", "explanation" (do not translate the keys, even if the source language is not English).',
    '',
    'Schema:',
    '[',
    '  {',
    '    "question": "concise question, answerable from the source",',
    '    "answer": "1–2 sentence factual answer",',
    '    "explanation": "why / context / mechanism — adds info, does not repeat the answer"',
    '  }',
    ']',
    '',
    'Content constraints:',
    '- Each question must be answerable strictly from the provided source.',
    '- Avoid yes/no questions and questions whose answer is a verbatim quote.',
    '- Vary the question types: factual recall, mechanism, contrast, application.',
    '- Keep questions self-contained — do not say "in this note" or "according to the text".',
    '- Match the language of the SOURCE for question / answer / explanation VALUES (e.g. Chinese source → Chinese values). The JSON KEYS stay English.',
  ].join('\n')
}

/**
 * Parse the model's response into structured card payloads. Strategy:
 *
 *   pre-clean: strip `<think>...</think>` / `<thinking>...</thinking>`
 *              blocks emitted by reasoning models (DeepSeek-R1, MiMo).
 *
 *   1. The whole cleaned string as JSON.
 *   2. The first ```json … ``` fenced block.
 *   3. The first `[…]` slice (catches "好的，下面是: [ … ]" / "Sure: [ … ]").
 *   4. The first `{…}` slice and look for an array under the common
 *      envelope keys (`cards` / `flashcards` / `questions` / `items`).
 *   5. Each candidate also goes through a leniency pass that drops
 *      trailing commas before retrying.
 *
 * Field aliases are absorbed in {@link readCardItem}: Chinese key names
 * (问题 / 答案 / 解释) and a few common English variants (q / a / why)
 * resolve to the canonical {question, answer, explanation} shape.
 *
 * Returns `[]` only if every strategy fails — the caller then surfaces
 * a parse-failed error with the raw output for debugging.
 */
export function parseCardsJson(
  raw: string,
): { question: string; answer: string; explanation: string }[] {
  const trimmed = stripThinkingBlocks(raw).trim()
  if (trimmed.length === 0) return []

  const candidates = [
    trimmed,
    extractFencedJson(trimmed),
    extractBracketSlice(trimmed),
    extractObjectSlice(trimmed),
  ].filter((c): c is string => c !== null)

  for (const candidate of candidates) {
    const parsed = tryParse(candidate)
    if (parsed) return parsed
    const lenient = tryParse(makeLenient(candidate))
    if (lenient) return lenient
  }
  return []
}

function tryParse(
  candidate: string,
): { question: string; answer: string; explanation: string }[] | null {
  let value: unknown
  try {
    value = JSON.parse(candidate)
  } catch {
    return null
  }
  // Direct array form — what we ask for.
  if (Array.isArray(value)) return collectCards(value)
  // Envelope form — `{cards: [...]}` / `{flashcards: [...]}` / etc.
  // Every reasonable wrapper key we've seen in the wild is checked; the
  // first one with an array value wins.
  if (isObject(value)) {
    for (const key of [
      'cards',
      'flashcards',
      'questions',
      'items',
      'data',
      'result',
      '卡片',
      '问题',
    ]) {
      const inner = value[key]
      if (Array.isArray(inner)) return collectCards(inner)
    }
  }
  return null
}

function collectCards(
  value: unknown[],
): { question: string; answer: string; explanation: string }[] | null {
  const out: { question: string; answer: string; explanation: string }[] = []
  for (const item of value) {
    if (!isObject(item)) continue
    const card = readCardItem(item)
    if (card) out.push(card)
  }
  return out.length > 0 ? out : null
}

/** Field alias resolver — accepts the canonical English keys plus the
 *  Chinese keys the model sometimes emits (despite the prompt) and a
 *  handful of short forms. The first non-empty match wins per slot. */
function readCardItem(
  item: Record<string, unknown>,
): { question: string; answer: string; explanation: string } | null {
  const q =
    stringField(item, 'question') ??
    stringField(item, 'q') ??
    stringField(item, 'prompt') ??
    stringField(item, 'front') ??
    stringField(item, '问题') ??
    stringField(item, '問題') ??
    stringField(item, '题目') ??
    stringField(item, '提问')
  const a =
    stringField(item, 'answer') ??
    stringField(item, 'a') ??
    stringField(item, 'response') ??
    stringField(item, 'back') ??
    stringField(item, '答案') ??
    stringField(item, '回答')
  const e =
    stringField(item, 'explanation') ??
    stringField(item, 'why') ??
    stringField(item, 'reason') ??
    stringField(item, 'rationale') ??
    stringField(item, 'context') ??
    stringField(item, '解释') ??
    stringField(item, '解釋') ??
    stringField(item, '说明') ??
    stringField(item, '说理') ??
    ''
  if (q === null || a === null) return null
  return { question: q, answer: a, explanation: e }
}

/** Strip `<think>...</think>` / `<thinking>...</thinking>` blocks that
 *  reasoning models (DeepSeek-R1, Xiaomi MiMo, Qwen-thinking) emit
 *  before their actual answer. Also handles the case where the closing
 *  tag is missing — we drop everything from the opening tag to the
 *  next `[` or `{` if the close never lands. */
function stripThinkingBlocks(s: string): string {
  let out = s.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
  // Unbalanced `<think>` (model truncated mid-thought): remove everything
  // up to the first `[` or `{` we find after the open tag.
  const open = /<think(?:ing)?>/i.exec(out)
  if (open) {
    const after = out.slice(open.index + open[0].length)
    const jsonStart = Math.min(
      ...[after.indexOf('['), after.indexOf('{')]
        .filter((n) => n >= 0)
        .concat([after.length]),
    )
    out = out.slice(0, open.index) + after.slice(jsonStart)
  }
  return out
}

function extractFencedJson(s: string): string | null {
  const fence = /```(?:json|javascript|js)?\s*([\s\S]*?)```/i.exec(s)
  return fence?.[1]?.trim() ?? null
}

function extractBracketSlice(s: string): string | null {
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  return s.slice(start, end + 1)
}

function extractObjectSlice(s: string): string | null {
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return s.slice(start, end + 1)
}

function makeLenient(s: string): string {
  // Drop trailing commas before } or ] — common LLM tic.
  return s.replace(/,(\s*[}\]])/g, '$1')
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function stringField(o: Record<string, unknown>, key: string): string | null {
  const v = o[key]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

function defaultNewId(): string {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `card-${String(Date.now())}-${String(Math.random()).slice(2)}`
}
