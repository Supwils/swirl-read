/**
 * Palette group components — each renders one Command.Group inside the
 * palette list. Separated here so CommandPalette.tsx stays under 250 LOC.
 */

import { type ReactNode } from 'react'
import { Command } from 'cmdk'
import { FileText, Hash, Search as SearchIcon } from 'lucide-react'
import { dirname } from '@/core/vault'
import type { VaultFile, VaultId } from '@/core/vault'
import type { DocumentHeading } from '@/core/navigation/headings'
import type { FullTextState, VaultFilesState } from './use-palette-search'

export function HeadingItem({
  heading,
  onSelect,
}: {
  heading: DocumentHeading
  onSelect: (id: string) => void
}): ReactNode {
  return (
    <Command.Item
      value={`heading ${heading.text}`}
      onSelect={() => onSelect(heading.id)}
      className="swilread-cmdk__item"
    >
      <Hash className="swilread-cmdk__item-icon" size={14} aria-hidden="true" />
      <span className="swilread-cmdk__item-primary">
        {heading.text || '(untitled)'}
      </span>
      <span className="swilread-cmdk__item-secondary">H{heading.level}</span>
    </Command.Item>
  )
}

interface PaletteFilesGroupProps {
  vaultFiles: VaultFilesState
  vaultId: VaultId
  vaultName: string | null
  onSelect: (href: string) => void
}

export function PaletteFilesGroup({
  vaultFiles,
  vaultId,
  vaultName,
  onSelect,
}: PaletteFilesGroupProps): ReactNode {
  return (
    <>
      {vaultFiles.status === 'ready' && (
        <Command.Group
          heading={`Files in ${vaultName ?? vaultId}`}
          className="swilread-cmdk__group"
        >
          {vaultFiles.files.map((file: VaultFile) => (
            <Command.Item
              key={`file::${vaultId}::${file.path}`}
              value={`${file.name} ${file.path}`}
              onSelect={() => onSelect(`/app/${vaultId}/${file.path}`)}
              className="swilread-cmdk__item"
            >
              <FileText
                className="swilread-cmdk__item-icon"
                size={14}
                aria-hidden="true"
              />
              <span className="swilread-cmdk__item-primary">{file.name}</span>
              <span className="swilread-cmdk__item-secondary">
                {dirname(file.path) || '/'}
              </span>
            </Command.Item>
          ))}
        </Command.Group>
      )}
      {vaultFiles.status === 'loading' && (
        <p className="swilread-cmdk__status">Walking the vault…</p>
      )}
      {vaultFiles.status === 'error' && (
        <p className="swilread-cmdk__status" role="alert">
          Couldn't walk this vault: {vaultFiles.message}
        </p>
      )}
    </>
  )
}

interface PaletteSearchResultsProps {
  fullText: FullTextState
  vaultId: VaultId
  vaultName: string | null
  onSelect: (href: string) => void
}

export function PaletteSearchResults({
  fullText,
  vaultId,
  vaultName,
  onSelect,
}: PaletteSearchResultsProps): ReactNode {
  return (
    <>
      {fullText.status === 'ready' && fullText.hits.length > 0 && (
        <Command.Group
          heading={`Search results in ${vaultName ?? vaultId}`}
          className="swilread-cmdk__group"
        >
          {fullText.hits.map((hit) => (
            <Command.Item
              key={`search::${vaultId}::${hit.path}`}
              value={`${hit.path}::${String(hit.score)}`}
              onSelect={() => onSelect(`/app/${vaultId}/${hit.path}`)}
              className="swilread-cmdk__item"
            >
              <SearchIcon
                className="swilread-cmdk__item-icon"
                size={14}
                aria-hidden="true"
              />
              <span className="swilread-cmdk__item-primary">{hit.name}</span>
              <span className="swilread-cmdk__item-secondary">
                {hit.snippet || hit.path}
              </span>
            </Command.Item>
          ))}
        </Command.Group>
      )}
      {fullText.status === 'loading' && (
        <p className="swilread-cmdk__status">Indexing vault content…</p>
      )}
      {fullText.status === 'error' && (
        <p className="swilread-cmdk__status" role="alert">
          Couldn't index this vault: {fullText.message}
        </p>
      )}
    </>
  )
}
