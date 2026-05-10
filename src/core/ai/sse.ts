/**
 * Tiny SSE line-event reader.
 *
 * Both Anthropic Messages API and OpenAI-compatible chat completions
 * stream as `text/event-stream`. We don't need a full SSE client — just
 * line buffering + dispatch on blank-line separators. This module owns
 * that boring chunking work so the provider implementations stay
 * focused on response-shape parsing.
 *
 * Yields one event per SSE record. Each event is the raw `data:` payload
 * (string), with the `data:` prefix stripped and concatenated when the
 * record had multiple `data:` lines (rare — both providers send one).
 *
 * The reader respects `signal` and stops cleanly on cancellation.
 */

const NEWLINE = /\r?\n/

export async function* readSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    while (true) {
      if (signal?.aborted) return
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // Records are separated by a blank line. Process every complete
      // record currently buffered, leaving the last (possibly partial)
      // record in the buffer for the next iteration.
      let separatorIdx = buffer.indexOf('\n\n')
      while (separatorIdx >= 0) {
        const record = buffer.slice(0, separatorIdx)
        buffer = buffer.slice(separatorIdx + 2)
        const data = collectDataLines(record)
        if (data !== null) yield data
        separatorIdx = buffer.indexOf('\n\n')
      }
    }
    // Flush a trailing record without a final blank line (Anthropic and
    // OpenAI both end with `\n\n`, but we don't want to lose the last
    // event if a server skips it).
    if (buffer.length > 0) {
      const data = collectDataLines(buffer)
      if (data !== null) yield data
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // The reader may already be released; ignore.
    }
  }
}

function collectDataLines(record: string): string | null {
  const lines = record.split(NEWLINE)
  const dataParts: string[] = []
  for (const line of lines) {
    // Comment lines (starting with `:`) are heartbeats — skip silently.
    if (line.startsWith(':')) continue
    if (line.startsWith('data:')) {
      // SSE conventionally allows a single space after the colon.
      const payload = line.startsWith('data: ') ? line.slice(6) : line.slice(5)
      dataParts.push(payload)
    }
  }
  if (dataParts.length === 0) return null
  return dataParts.join('\n')
}
