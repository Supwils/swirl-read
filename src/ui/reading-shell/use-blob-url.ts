/**
 * Shared blob-URL hook used by `EmbedNode` (inline media inside markdown)
 * and `MediaRenderer` (page-level media files routed by the dispatcher).
 *
 * Lives in its own file so callers can share it without breaking the
 * react-refresh boundary on either component.
 */

import { useEffect, useState } from 'react'
import type { VaultFileSystem, VaultPath } from '@/core/vault'

export interface BlobURLState {
  url: string | null
  error: string | null
}

export function useBlobURL(
  vault: VaultFileSystem,
  path: VaultPath,
): BlobURLState {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setError(null)
    vault
      .getBlobURL(path)
      .then((u) => {
        if (!cancelled) setUrl(u)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [vault, path])

  return { url, error }
}
