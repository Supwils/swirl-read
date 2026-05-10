/**
 * AI provider abstraction (Phase 3).
 *
 * Reading-side AI is opt-in: nothing here runs unless the user has
 * configured a provider in Settings. The interface is intentionally
 * minimal — `ask(prompt, context)` streams a single answer; no chat
 * history, no tool calls, no embeddings. Those are roadmap items but
 * out of scope for the v0.1 AI surface.
 *
 * Providers are pure functions over `fetch` — no SDK, no global state,
 * easy to swap (Anthropic / OpenAI-compatible / future Ollama-direct /
 * future CLI-credential bridge).
 */

/**
 * Stable identifiers for the providers SwirlRead currently knows about.
 * Used as the primary key for the encrypted `aiKeys` Dexie table and as
 * the discriminator in `useAISettings`.
 */
export type AIProviderId = 'anthropic' | 'openai-compat' | 'xiaomi'

/**
 * One typed unit of context attached to a question. The `source` label
 * is shown to the user (so they can see what's being sent) and embedded
 * into the prompt so the model knows where each chunk came from.
 */
export interface ContextChunk {
  /** Origin label, e.g. "current document" or "[[other-note]]". */
  source: string
  /** Plain-text content. The provider concatenates these with markers. */
  content: string
}

export interface AskOptions {
  /** Cancel an in-flight request when the user dismisses the panel. */
  signal?: AbortSignal
}

export interface AIProvider {
  /** Stable id, used for keying credentials and for telemetry / logs. */
  readonly id: AIProviderId
  /**
   * Stream the model's answer as text chunks. Implementations close the
   * iterator on completion or on `signal.abort()`. Network / API errors
   * surface as a thrown {@link AIError} from the iterator (so callers
   * can `try/catch` around `for await`).
   */
  ask(
    prompt: string,
    context: ContextChunk[],
    options?: AskOptions,
  ): AsyncIterable<string>
}

/**
 * Discriminated error so the UI can distinguish "you forgot the key"
 * from "the network blew up" without parsing English error strings.
 */
export type AIErrorKind =
  | 'auth' // 401 / 403 — invalid or missing key
  | 'rate-limited' // 429
  | 'network' // fetch threw or non-OK without a structured body
  | 'aborted' // user cancellation
  | 'malformed-response' // unexpected stream shape
  | 'unknown'

export class AIError extends Error {
  readonly kind: AIErrorKind
  constructor(kind: AIErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'AIError'
  }
}
