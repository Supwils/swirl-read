/**
 * PaletteAskResult — streamed AI answer surface for the palette `?` mode.
 *
 * Lifecycle:
 *   1. On mount (and when `query`/`vaultId`/`path` changes), read the
 *      current document text and pick whichever provider has a stored
 *      key (Anthropic preferred). Both calls are cheap and run in
 *      parallel.
 *   2. Build (or reuse) the vault wikilink index — used both for AI
 *      context expansion and for resolving `[[links]]` the model emits
 *      in its answer.
 *   3. Open `provider.ask(question, [{source: 'current document', ...}])`
 *      and append every yielded chunk to local state for live render.
 *   4. AbortController is wired through to fetch + the SSE reader so
 *      closing the palette / typing a new question cancels the in-flight
 *      request cleanly.
 *
 * Failure modes are explicit:
 *   - No provider configured → CTA pointing at Settings.
 *   - No active document → message asking the user to open a file first.
 *   - AIError → mapped to a one-line human label via `errorLabel`.
 *
 * The streamed text renders through the project's Markdown pipeline
 * ({@link PaletteAskAnswer}) so wikilinks become clickable, fenced code
 * gets Shiki highlighting, math renders via KaTeX, etc. — same affordances
 * as the reading shell.
 */

import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router'
import { Check, Copy, FileText, Loader2, Sparkles } from 'lucide-react'
import { resolveActiveProvider } from '@/core/ai/resolve-active-provider'
import { AIError, type ContextChunk } from '@/core/ai/types'
import { extractWikilinkTargets } from '@/core/navigation/wikilink-extractor'
import {
  buildWikilinkIndex,
  isMarkdownTarget,
  resolveWikilink,
  type WikilinkIndex,
} from '@/core/navigation/wikilink-resolver'
import { basename } from '@/core/vault'
import { getAdapter } from '@/stores/vault-store'
import type { VaultFileSystem, VaultId, VaultPath } from '@/core/vault'

const PaletteAskAnswer = lazy(() =>
  import('./PaletteAskAnswer').then((m) => ({ default: m.PaletteAskAnswer })),
)

/**
 * Hard caps so the prompt stays under typical model context windows
 * even on huge vaults. The current document is never truncated; the
 * 1-hop neighbours are.
 */
const MAX_WIKILINK_FILES = 4
const MAX_WIKILINK_FILE_CHARS = 8_000
const MAX_WIKILINK_TOTAL_CHARS = 30_000

type Status =
  | { kind: 'idle' }
  | { kind: 'no-provider' }
  | { kind: 'loading' }
  | { kind: 'streaming'; text: string; sources: VaultPath[] }
  | {
      kind: 'done'
      text: string
      providerName: string
      sources: VaultPath[]
    }
  | { kind: 'error'; message: string }

interface PaletteAskResultProps {
  question: string
  vaultId: VaultId | null
  path: string | null
  /** Called when the user picks a source link — lets the parent close
   *  the palette before the navigation lands. */
  onSelect: () => void
}

export function PaletteAskResult({
  question,
  vaultId,
  path,
  onSelect,
}: PaletteAskResultProps): ReactNode {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [wikilinkIndex, setWikilinkIndex] = useState<WikilinkIndex | null>(null)
  // Mirror the live index into a ref so the answer effect can read the
  // latest value without listing it as a dep — re-running the entire
  // ask flow just because the index finished building (a few hundred
  // ms after typing) doubles the API call cost. The wikilinks rendered
  // inside the answer pick up the new index via context regardless.
  const wikilinkIndexRef = useRef<WikilinkIndex | null>(null)

  // Build the vault wikilink index once per vault so <Wikilink> inside
  // the rendered answer can resolve `[[links]]` the model emits. The
  // same index is reused for AI context expansion (loadContext below).
  useEffect(() => {
    if (!vaultId) {
      setWikilinkIndex(null)
      wikilinkIndexRef.current = null
      return
    }
    const adapter = getAdapter(vaultId)
    if (!adapter) {
      setWikilinkIndex(null)
      wikilinkIndexRef.current = null
      return
    }
    let cancelled = false
    void buildWikilinkIndex(adapter).then((index) => {
      if (!cancelled) {
        setWikilinkIndex(index)
        wikilinkIndexRef.current = index
      }
    })
    return () => {
      cancelled = true
    }
  }, [vaultId])

  useEffect(() => {
    if (question.trim().length === 0) {
      setStatus({ kind: 'idle' })
      return
    }
    const controller = new AbortController()
    let cancelled = false

    void (async () => {
      setStatus({ kind: 'loading' })

      const resolved = await resolveActiveProvider()
      if (cancelled) return
      if (!resolved) {
        setStatus({ kind: 'no-provider' })
        return
      }

      // Read the latest index via the ref. `loadContext` falls back to
      // building a fresh index when this is null, so racing with the
      // index-build effect costs at worst one extra walk.
      const { context, sources } = await loadContext(
        vaultId,
        path,
        wikilinkIndexRef.current,
      )
      if (cancelled) return

      let acc = ''
      try {
        const stream = resolved.provider.ask(question, context, {
          signal: controller.signal,
        })
        for await (const chunk of stream) {
          if (cancelled) return
          acc += chunk
          setStatus({ kind: 'streaming', text: acc, sources })
        }
        if (!cancelled) {
          setStatus({
            kind: 'done',
            text: acc,
            providerName: resolved.label,
            sources,
          })
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof AIError && err.kind === 'aborted') return
        setStatus({ kind: 'error', message: errorLabel(err) })
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [question, vaultId, path])

  return (
    <AskBody
      status={status}
      vaultId={vaultId}
      currentPath={path}
      wikilinkIndex={wikilinkIndex}
      onSelect={onSelect}
    />
  )
}

interface AskBodyProps {
  status: Status
  vaultId: VaultId | null
  currentPath: string | null
  wikilinkIndex: WikilinkIndex | null
  onSelect: () => void
}

function AskBody({
  status,
  vaultId,
  currentPath,
  wikilinkIndex,
  onSelect,
}: AskBodyProps): ReactNode {
  if (status.kind === 'idle') return null

  if (status.kind === 'no-provider') {
    return (
      <div className="swirlread-ask">
        <p className="swirlread-ask__title">No AI provider configured</p>
        <p className="swirlread-ask__body-text">
          Open Settings and configure either an Anthropic key or an
          OpenAI-compatible endpoint to enable the <kbd>?</kbd> mode.
        </p>
      </div>
    )
  }

  if (status.kind === 'loading') {
    return (
      <div className="swirlread-ask">
        <p className="swirlread-ask__status">
          <Loader2
            size={14}
            aria-hidden="true"
            className="swirlread-ask__spinner"
          />
          Reading the document and asking your provider…
        </p>
      </div>
    )
  }

  if (status.kind === 'streaming' || status.kind === 'done') {
    const isStreaming = status.kind === 'streaming'
    const headerLabel = isStreaming
      ? 'Answering…'
      : `Answered by ${status.providerName}`
    return (
      <div className="swirlread-ask">
        <header className="swirlread-ask__header">
          <p className="swirlread-ask__title">
            <Sparkles size={14} aria-hidden="true" />
            {headerLabel}
          </p>
          {!isStreaming && status.text.length > 0 && (
            <CopyAnswerButton text={status.text} />
          )}
        </header>
        {status.sources.length > 0 && (
          <SourcesRow
            sources={status.sources}
            vaultId={vaultId}
            onSelect={onSelect}
          />
        )}
        <div className="swirlread-ask__body">
          <Suspense fallback={<StreamingFallback text={status.text} />}>
            <PaletteAskAnswer
              text={status.text}
              isStreaming={isStreaming}
              vaultId={vaultId}
              currentPath={currentPath}
              wikilinkIndex={wikilinkIndex}
            />
          </Suspense>
          {isStreaming && (
            <span aria-hidden="true" className="swirlread-ask__cursor">
              ▋
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="swirlread-ask swirlread-ask--error" role="alert">
      <p className="swirlread-ask__title">Couldn&apos;t answer</p>
      <p className="swirlread-ask__body-text">{status.message}</p>
    </div>
  )
}

/**
 * Pre-pipeline fallback while the lazy answer chunk loads on first use.
 * Shows the raw streamed text so the user sees progress immediately —
 * once the chunk arrives the Markdown render replaces this in place.
 */
function StreamingFallback({ text }: { text: string }): ReactNode {
  return <pre className="swirlread-ask__fallback">{text}</pre>
}

interface SourcesRowProps {
  sources: VaultPath[]
  vaultId: VaultId | null
  onSelect: () => void
}

function SourcesRow({
  sources,
  vaultId,
  onSelect,
}: SourcesRowProps): ReactNode {
  const navigate = useNavigate()
  const handleOpen = (path: VaultPath): void => {
    if (!vaultId) return
    onSelect()
    void navigate(`/app/${vaultId}/${path}`)
  }
  return (
    <p className="swirlread-ask__sources">
      <span className="swirlread-ask__sources-label">
        With {sources.length} linked note
        {sources.length === 1 ? '' : 's'}:
      </span>
      {sources.map((path) => (
        <button
          key={path}
          type="button"
          className="swirlread-ask__source-chip"
          onClick={() => {
            handleOpen(path)
          }}
          title={path}
          disabled={!vaultId}
        >
          <FileText size={11} aria-hidden="true" />
          <span>{basename(path)}</span>
        </button>
      ))}
    </p>
  )
}

function CopyAnswerButton({ text }: { text: string }): ReactNode {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current)
        }
        timerRef.current = window.setTimeout(() => {
          setCopied(false)
        }, 1600)
      },
      () => {
        // Clipboard write can reject when the document isn't focused or
        // the API is gated by permissions; failing silently here is the
        // least-disruptive path — user can manually select the text.
      },
    )
  }

  return (
    <button
      type="button"
      className="swirlread-ask__copy"
      onClick={handleCopy}
      aria-label={copied ? 'Answer copied' : 'Copy answer'}
    >
      {copied ? (
        <>
          <Check size={12} aria-hidden="true" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy size={12} aria-hidden="true" />
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

interface LoadedContext {
  context: ContextChunk[]
  /** Vault paths actually included as wikilink-expansion neighbours
   *  (excludes the current document). Surfaced in the UI for trust. */
  sources: VaultPath[]
}

/**
 * Build the AI context from the current document plus its directly-
 * linked neighbours (1 hop). The current doc is always first; neighbours
 * follow in document order, capped at {@link MAX_WIKILINK_FILES} files
 * and {@link MAX_WIKILINK_TOTAL_CHARS} total chars across them.
 *
 * Non-Markdown wikilinks (images, audio, ...) are skipped — their bytes
 * aren't usable as text context. Self-references are skipped too.
 *
 * `prebuiltIndex` lets the parent reuse the index it already built for
 * answer-side wikilink resolution, avoiding a second vault walk.
 */
async function loadContext(
  vaultId: VaultId | null,
  path: string | null,
  prebuiltIndex: WikilinkIndex | null,
): Promise<LoadedContext> {
  if (!vaultId || !path) return { context: [], sources: [] }
  const adapter = getAdapter(vaultId)
  if (!adapter) return { context: [], sources: [] }

  let primary: string
  try {
    primary = await adapter.readText(path)
  } catch {
    return { context: [], sources: [] }
  }

  const context: ContextChunk[] = [
    { source: `current document (${path})`, content: primary },
  ]
  const sources: VaultPath[] = []

  const neighbours = await loadNeighbours(adapter, path, primary, prebuiltIndex)
  let totalNeighbourChars = 0
  for (const n of neighbours) {
    if (sources.length >= MAX_WIKILINK_FILES) break
    if (totalNeighbourChars + n.content.length > MAX_WIKILINK_TOTAL_CHARS) break
    context.push({
      source: `linked: ${n.resolved}`,
      content: n.content,
    })
    sources.push(n.resolved)
    totalNeighbourChars += n.content.length
  }
  return { context, sources }
}

interface NeighbourFile {
  resolved: VaultPath
  content: string
}

async function loadNeighbours(
  adapter: VaultFileSystem,
  currentPath: VaultPath,
  source: string,
  prebuiltIndex: WikilinkIndex | null,
): Promise<NeighbourFile[]> {
  const targets = extractWikilinkTargets(source)
  if (targets.length === 0) return []

  let index = prebuiltIndex
  if (!index) {
    try {
      index = await buildWikilinkIndex(adapter)
    } catch {
      return []
    }
  }

  const seenPath = new Set<string>([currentPath])
  const results: NeighbourFile[] = []
  for (const target of targets) {
    if (results.length >= MAX_WIKILINK_FILES) break
    const resolved = resolveWikilink(target, index, currentPath)
    if (!resolved) continue
    if (seenPath.has(resolved)) continue
    if (!isMarkdownTarget(resolved)) continue
    seenPath.add(resolved)
    try {
      const text = await adapter.readText(resolved)
      const truncated =
        text.length > MAX_WIKILINK_FILE_CHARS
          ? text.slice(0, MAX_WIKILINK_FILE_CHARS) + '\n…[truncated]…'
          : text
      results.push({ resolved, content: truncated })
    } catch {
      // Skip unreadable neighbours — most likely a permission gap on a
      // freshly added file. Not worth blocking the answer over.
    }
  }
  return results
}

function errorLabel(err: unknown): string {
  if (err instanceof AIError) {
    switch (err.kind) {
      case 'auth':
        return 'Provider rejected the API key. Check Settings → AI assistant.'
      case 'rate-limited':
        return 'Provider rate-limited the request. Try again in a moment.'
      case 'network':
        return 'Network error reaching the provider.'
      case 'malformed-response':
        return 'Provider returned an unexpected response shape.'
      default:
        return err.message
    }
  }
  return err instanceof Error ? err.message : String(err)
}
