import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { isMarkdown, VaultFileNotFoundError } from '@/core/vault'
import type { VaultFileSystem } from '@/core/vault'
import {
  buildWikilinkIndex,
  type WikilinkIndex,
} from '@/core/navigation/wikilink-resolver'
import { renderMarkdown } from '@/core/render/pipeline'
import { getAdapter } from '@/stores/vault-store'
import { Wikilink } from './Wikilink'
import { Callout } from './Callout'
import { WikilinkContext } from './wikilink-context'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'rendered'; content: ReactNode; isMd: boolean; raw: string }
  | { kind: 'missing-vault' }
  | { kind: 'missing-file' }
  | { kind: 'error'; message: string }

const customComponents = {
  // hast-util-to-jsx-runtime accepts custom tag names via lowercase keys.
  // Our remark plugins emit `<wikilink>` / `<callout>` elements; we map
  // them to React components here.
  wikilink: Wikilink,
  callout: Callout,
}

export function DocumentPage() {
  const params = useParams<{ vaultId: string; '*': string }>()
  const vaultId = params.vaultId
  const filePath = params['*'] ?? ''
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  const [wikilinkIndex, setWikilinkIndex] = useState<WikilinkIndex | null>(null)

  // Build the wikilink index once per vault. Cheap walk for typical vaults
  // (M1.2 walk is lazy and streams). Re-runs only when vaultId changes.
  useEffect(() => {
    if (!vaultId) return
    const vault = getAdapter(vaultId)
    if (!vault) {
      setWikilinkIndex(null)
      return
    }
    let cancelled = false
    void buildIndexSafe(vault)
      .then((index) => {
        if (!cancelled) setWikilinkIndex(index)
      })
      .catch(() => {
        // Index build failure is non-fatal — wikilinks render in pending state.
        if (!cancelled) setWikilinkIndex(null)
      })
    return () => {
      cancelled = true
    }
  }, [vaultId])

  // Read + render the current document.
  useEffect(() => {
    if (!vaultId || !filePath) return
    const vault = getAdapter(vaultId)
    if (!vault) {
      setState({ kind: 'missing-vault' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })

    async function loadAndRender(v: typeof vault): Promise<void> {
      if (!v) return
      try {
        const raw = await v.readText(filePath)
        if (cancelled) return
        const md = isMarkdown(filePath)
        const content = md ? await renderMarkdown(raw, customComponents) : null
        if (cancelled) return
        setState({ kind: 'rendered', content, isMd: md, raw })
      } catch (err) {
        if (cancelled) return
        if (err instanceof VaultFileNotFoundError) {
          setState({ kind: 'missing-file' })
          return
        }
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    void loadAndRender(vault)
    return () => {
      cancelled = true
    }
  }, [vaultId, filePath])

  const ctxValue = useMemo(
    () =>
      vaultId
        ? {
            vaultId,
            currentPath: filePath,
            index: wikilinkIndex,
          }
        : null,
    [vaultId, filePath, wikilinkIndex],
  )

  return (
    <article
      className="mx-auto max-w-[720px] px-6 py-12 font-serif text-[18px] leading-[1.7]"
      style={{ color: 'var(--color-text)' }}
    >
      <header className="mb-8">
        <p
          className="font-serif text-xs uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {vaultId}
        </p>
        <h1
          className="mt-2 break-words font-serif text-2xl font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          {filePath || '(no file selected)'}
        </h1>
      </header>

      {state.kind === 'loading' && (
        <p className="italic" style={{ color: 'var(--color-text-muted)' }}>
          Reading…
        </p>
      )}

      {state.kind === 'missing-vault' && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          This vault is not registered in the current session. Open it again
          from the landing page to read.
        </p>
      )}

      {state.kind === 'missing-file' && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          File not found in this vault.
        </p>
      )}

      {state.kind === 'error' && (
        <p role="alert" style={{ color: 'var(--color-text)' }}>
          Couldn&apos;t open this file: {state.message}
        </p>
      )}

      {state.kind === 'rendered' && state.isMd && ctxValue && (
        <WikilinkContext.Provider value={ctxValue}>
          <div className="swilread-prose">{state.content}</div>
        </WikilinkContext.Provider>
      )}

      {state.kind === 'rendered' && !state.isMd && (
        <pre
          className="overflow-auto rounded-md p-4 font-mono text-sm"
          style={{
            backgroundColor: 'var(--color-code-bg)',
            color: 'var(--color-code-text)',
          }}
        >
          {state.raw}
        </pre>
      )}
    </article>
  )
}

async function buildIndexSafe(vault: VaultFileSystem): Promise<WikilinkIndex> {
  return buildWikilinkIndex(vault)
}
