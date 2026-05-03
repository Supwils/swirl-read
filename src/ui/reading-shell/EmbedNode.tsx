/**
 * EmbedNode — renders a parsed `![[file]]` reference.
 *
 * Resolution mirrors {@link Wikilink}: we look up the target via the
 * basename index in {@link WikilinkContext}. The renderer is then chosen
 * by `data-kind` (set by the remark plugin from the file extension):
 *
 *   - image  → `<img>` from `vault.getBlobURL`
 *   - video  → native `<video controls>`
 *   - audio  → native `<audio controls>`
 *   - markdown → recursive `renderMarkdown`, with cycle detection via
 *                {@link EmbedContext}
 *   - pdf / other → file metadata card (open-in-default-app is M7.x)
 *
 * Cycle protection: every nested `MarkdownEmbed` provides an updated
 * {@link EmbedContext} value whose `stack` includes the embedded path. If
 * a deeper embed encounters a path already in the stack, it short-circuits
 * with a "circular embed" notice rather than infinite-recursing.
 */

import { useContext, useEffect, useState, type ReactNode } from 'react'
import { resolveWikilink } from '@/core/navigation/wikilink-resolver'
import { renderMarkdown } from '@/core/render/pipeline'
import { getAdapter } from '@/stores/vault-store'
import type { VaultFileSystem, VaultPath } from '@/core/vault'
import { WikilinkContext } from './wikilink-context'
import { EmbedContext, MAX_EMBED_DEPTH } from './embed-context'
import { useBlobURL } from './use-blob-url'

interface EmbedProps {
  'data-target'?: string
  'data-kind'?: string
  'data-display'?: string
  'data-heading'?: string
  'data-block-id'?: string
}

export function EmbedNode(props: EmbedProps): ReactNode {
  const target = props['data-target']
  const kind = (props['data-kind'] ?? 'other') as
    | 'image'
    | 'video'
    | 'audio'
    | 'markdown'
    | 'pdf'
    | 'other'
  const display = props['data-display']

  const wikiCtx = useContext(WikilinkContext)
  const embedCtx = useContext(EmbedContext)

  if (!target) {
    return (
      <span className="swirlread-embed swirlread-embed--broken">
        Empty embed
      </span>
    )
  }

  if (!wikiCtx) {
    return (
      <span className="swirlread-embed swirlread-embed--pending">
        Loading embed…
      </span>
    )
  }

  if (!wikiCtx.index) {
    return (
      <span
        className="swirlread-embed swirlread-embed--pending"
        data-target={target}
      >
        Resolving “{target}”…
      </span>
    )
  }

  const resolved = resolveWikilink(target, wikiCtx.index, wikiCtx.currentPath)
  if (!resolved) {
    return (
      <span
        className="swirlread-embed swirlread-embed--broken"
        data-target={target}
        title={`No file found for "${target}"`}
      >
        Couldn&apos;t find “{target}”
      </span>
    )
  }

  if (embedCtx.stack.includes(resolved)) {
    return (
      <aside className="swirlread-embed swirlread-embed--cycle">
        Circular embed prevented: <code>{resolved}</code>
      </aside>
    )
  }

  if (embedCtx.stack.length >= MAX_EMBED_DEPTH) {
    return (
      <aside className="swirlread-embed swirlread-embed--cycle">
        Embed depth limit ({MAX_EMBED_DEPTH}) reached at <code>{resolved}</code>
        .
      </aside>
    )
  }

  const vault = getAdapter(wikiCtx.vaultId)
  if (!vault) {
    return (
      <span className="swirlread-embed swirlread-embed--broken">
        Vault not loaded for embed.
      </span>
    )
  }

  switch (kind) {
    case 'image':
      return (
        <ImageEmbed
          vault={vault}
          resolved={resolved}
          display={display}
          fallbackAlt={target}
        />
      )
    case 'video':
      return <VideoEmbed vault={vault} resolved={resolved} />
    case 'audio':
      return <AudioEmbed vault={vault} resolved={resolved} />
    case 'markdown':
      return <MarkdownEmbed vault={vault} resolved={resolved} />
    case 'pdf':
    case 'other':
    default:
      return <FileCardEmbed resolved={resolved} kind={kind} />
  }
}

/* ─── leaf renderers ─────────────────────────────────────────────────── */

function parseImageDimensions(display: string | undefined): {
  alt?: string
  width?: number
  height?: number
} {
  if (!display) return {}
  const m = /^(\d+)(?:x(\d+))?$/.exec(display.trim())
  if (m) {
    const w = Number(m[1])
    const h = m[2] ? Number(m[2]) : undefined
    return h !== undefined ? { width: w, height: h } : { width: w }
  }
  return { alt: display }
}

function ImageEmbed({
  vault,
  resolved,
  display,
  fallbackAlt,
}: {
  vault: VaultFileSystem
  resolved: VaultPath
  display: string | undefined
  fallbackAlt: string
}): ReactNode {
  const { url, error } = useBlobURL(vault, resolved)
  const dims = parseImageDimensions(display)
  if (error) {
    return (
      <span className="swirlread-embed swirlread-embed--broken">
        Couldn&apos;t load <code>{resolved}</code>: {error}
      </span>
    )
  }
  if (!url) {
    return (
      <span className="swirlread-embed swirlread-embed--pending">
        Loading <code>{resolved}</code>…
      </span>
    )
  }
  return (
    <img
      className="swirlread-embed swirlread-embed--image"
      src={url}
      alt={dims.alt ?? fallbackAlt}
      data-target={resolved}
      loading="lazy"
      {...(dims.width !== undefined && { width: dims.width })}
      {...(dims.height !== undefined && { height: dims.height })}
    />
  )
}

function VideoEmbed({
  vault,
  resolved,
}: {
  vault: VaultFileSystem
  resolved: VaultPath
}): ReactNode {
  const { url, error } = useBlobURL(vault, resolved)
  if (error) {
    return (
      <span className="swirlread-embed swirlread-embed--broken">
        Couldn&apos;t load <code>{resolved}</code>: {error}
      </span>
    )
  }
  if (!url) {
    return (
      <span className="swirlread-embed swirlread-embed--pending">
        Loading <code>{resolved}</code>…
      </span>
    )
  }
  return (
    <video
      className="swirlread-embed swirlread-embed--video"
      src={url}
      controls
      preload="metadata"
      data-target={resolved}
    />
  )
}

function AudioEmbed({
  vault,
  resolved,
}: {
  vault: VaultFileSystem
  resolved: VaultPath
}): ReactNode {
  const { url, error } = useBlobURL(vault, resolved)
  if (error) {
    return (
      <span className="swirlread-embed swirlread-embed--broken">
        Couldn&apos;t load <code>{resolved}</code>: {error}
      </span>
    )
  }
  if (!url) {
    return (
      <span className="swirlread-embed swirlread-embed--pending">
        Loading <code>{resolved}</code>…
      </span>
    )
  }
  return (
    <audio
      className="swirlread-embed swirlread-embed--audio"
      src={url}
      controls
      preload="metadata"
      data-target={resolved}
    />
  )
}

function MarkdownEmbed({
  vault,
  resolved,
}: {
  vault: VaultFileSystem
  resolved: VaultPath
}): ReactNode {
  const wikiCtx = useContext(WikilinkContext)
  const embedCtx = useContext(EmbedContext)
  const [content, setContent] = useState<ReactNode>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setContent(null)

    async function load(): Promise<void> {
      try {
        const raw = await vault.readText(resolved)
        if (cancelled) return
        const tree = await renderMarkdown(raw, embedCtx.components)
        if (cancelled) return
        setContent(tree)
      } catch (err: unknown) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [vault, resolved, embedCtx.components])

  if (error) {
    return (
      <aside className="swirlread-embed swirlread-embed--broken">
        Couldn&apos;t embed <code>{resolved}</code>: {error}
      </aside>
    )
  }

  const childContext: typeof embedCtx = {
    components: embedCtx.components,
    stack: [...embedCtx.stack, resolved],
  }

  const innerWikiCtx = wikiCtx ? { ...wikiCtx, currentPath: resolved } : null

  return (
    <aside
      className="swirlread-embed swirlread-embed--markdown"
      data-target={resolved}
    >
      <header className="swirlread-embed__header">
        <span className="swirlread-embed__filename">{resolved}</span>
      </header>
      <div className="swirlread-embed__body swirlread-prose">
        {innerWikiCtx ? (
          <WikilinkContext.Provider value={innerWikiCtx}>
            <EmbedContext.Provider value={childContext}>
              {content ?? (
                <span className="swirlread-embed--pending">Reading…</span>
              )}
            </EmbedContext.Provider>
          </WikilinkContext.Provider>
        ) : (
          <EmbedContext.Provider value={childContext}>
            {content ?? (
              <span className="swirlread-embed--pending">Reading…</span>
            )}
          </EmbedContext.Provider>
        )}
      </div>
    </aside>
  )
}

function FileCardEmbed({
  resolved,
  kind,
}: {
  resolved: VaultPath
  kind: 'pdf' | 'other'
}): ReactNode {
  const label = kind === 'pdf' ? 'PDF' : 'File'
  return (
    <aside
      className="swirlread-embed swirlread-embed--card"
      data-target={resolved}
    >
      <span className="swirlread-embed__kind">{label}</span>
      <code className="swirlread-embed__filename">{resolved}</code>
    </aside>
  )
}
