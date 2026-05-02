/**
 * TagsPanel (M3.14) — overlay listing every file tagged with the
 * currently selected tag.
 *
 * Mounted at the vault layout level so it survives across document
 * navigation. Opens automatically when `useTagStore.selectedTag` flips
 * to a non-null value (typically a `<Tag>` click). Selecting a result
 * navigates to that file and closes the overlay.
 *
 * The overlay is intentionally a Radix Dialog rather than an inline
 * panel: tags are referenced from any document in any vault, so the
 * panel needs portal + focus trap + Esc-close infrastructure that
 * Radix already provides.
 */

import { useEffect, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Hash, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { basename } from '@/core/vault'
import type { TagIndex } from '@/core/navigation/tag-index'
import type { VaultFileSystem, VaultId, VaultPath } from '@/core/vault'
import { useTagStore } from '@/stores/tag-store'
import { getAdapter } from '@/stores/vault-store'
import { getTagIndex } from './tag-index-cache'

interface TagsPanelProps {
  vaultId: VaultId
}

type IndexState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; index: TagIndex }
  | { status: 'error'; message: string }

export function TagsPanel({ vaultId }: TagsPanelProps): ReactNode {
  const selectedTag = useTagStore((state) => state.selectedTag)
  const selectTag = useTagStore((state) => state.selectTag)
  const navigate = useNavigate()
  const [state, setState] = useState<IndexState>({ status: 'idle' })

  const open = selectedTag !== null

  // Build the index lazily — only when the panel actually opens.
  useEffect(() => {
    if (!open) {
      setState({ status: 'idle' })
      return
    }
    const adapter = getAdapter(vaultId)
    if (!adapter) {
      setState({
        status: 'error',
        message: 'Vault adapter unavailable.',
      })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    fetchIndex(adapter)
      .then((index) => {
        if (!cancelled) setState({ status: 'ready', index })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, vaultId])

  const handleClose = (): void => {
    selectTag(null)
  }

  const handleNavigate = (path: VaultPath): void => {
    selectTag(null)
    void navigate(`/app/${vaultId}/${path}`)
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="swilread-tags-panel__overlay" />
        <Dialog.Content
          className="swilread-tags-panel"
          aria-label="Tag listing"
        >
          <header className="swilread-tags-panel__header">
            <div className="swilread-tags-panel__heading">
              <Hash size={18} aria-hidden="true" />
              <Dialog.Title className="swilread-tags-panel__title">
                {selectedTag ?? ''}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="swilread-tags-panel__close"
                aria-label="Close tag listing"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            Files in the current vault tagged #{selectedTag ?? ''}.
          </Dialog.Description>
          <div className="swilread-tags-panel__body">
            <PanelBody
              vaultId={vaultId}
              selectedTag={selectedTag}
              state={state}
              onNavigate={handleNavigate}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PanelBody({
  vaultId,
  selectedTag,
  state,
  onNavigate,
}: {
  vaultId: VaultId
  selectedTag: string | null
  state: IndexState
  onNavigate: (path: VaultPath) => void
}): ReactNode {
  if (!selectedTag) return null
  if (state.status === 'loading') {
    return <p className="swilread-tags-panel__status">Building tag index…</p>
  }
  if (state.status === 'error') {
    return (
      <p className="swilread-tags-panel__status" role="alert">
        Couldn’t build the tag index: {state.message}
      </p>
    )
  }
  if (state.status === 'idle') return null

  const files = Array.from(
    state.index.filesByTag.get(selectedTag) ?? new Set<VaultPath>(),
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  if (files.length === 0) {
    return (
      <p className="swilread-tags-panel__status">
        No files in this vault use #{selectedTag}.
      </p>
    )
  }

  return (
    <ul className="swilread-tags-panel__list">
      {files.map((path) => (
        <li key={path} className="swilread-tags-panel__item">
          <Link
            to={`/app/${vaultId}/${path}`}
            className="swilread-tags-panel__link"
            onClick={(event) => {
              event.preventDefault()
              onNavigate(path)
            }}
          >
            <span className="swilread-tags-panel__link-name">
              {basename(path)}
            </span>
            <span className="swilread-tags-panel__link-path">{path}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

async function fetchIndex(adapter: VaultFileSystem): Promise<TagIndex> {
  return getTagIndex(adapter)
}
